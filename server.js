const http = require("node:http");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const USER_AGENT = "RedditReaderPrototype/0.1 by rapid-user";
const REDDIT_FEEDS = [
  { subreddit: "AskReddit", category: "thoughtful", sort: "top", time: "week" },
  { subreddit: "todayilearned", category: "educational", sort: "top", time: "week" },
  { subreddit: "explainlikeimfive", category: "educational", sort: "top", time: "week" },
  { subreddit: "NoStupidQuestions", category: "thoughtful", sort: "top", time: "week" },
  { subreddit: "BestofRedditorUpdates", category: "mysterious", sort: "top", time: "month" },
  { subreddit: "WritingPrompts", category: "thoughtful", sort: "top", time: "week" }
];
const MIN_REDDIT_STORY_CHARS = 320;
const MAX_REDDIT_STORY_CHARS = 7000;
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};
let redditAccessToken = null;
let redditAccessTokenExpiresAt = 0;

function loadLocalEnv() {
  [".env.local", ".env"].forEach(fileName => {
    const filePath = path.join(ROOT, fileName);
    if (!fsSync.existsSync(filePath)) return;

    const lines = fsSync.readFileSync(filePath, "utf8").split(/\r?\n/);
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) return;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    });
  });
}

loadLocalEnv();

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function formatScore(score) {
  if (!Number.isFinite(score)) return "";
  if (score >= 1000) return `${(score / 1000).toFixed(score >= 10000 ? 0 : 1)}k`;
  return String(score);
}

function redditUrlForFeed(feed, useOAuth = false) {
  const sortPath = feed.sort === "hot" ? "hot" : "top";
  const params = new URLSearchParams({
    limit: "18",
    raw_json: "1"
  });
  if (sortPath === "top") params.set("t", feed.time || "week");
  const host = useOAuth ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const suffix = useOAuth ? "" : ".json";
  return `${host}/r/${feed.subreddit}/${sortPath}${suffix}?${params.toString()}`;
}

function isUsableRedditPost(post) {
  const data = post && post.data;
  if (!data) return false;
  const text = (data.selftext || "").trim();
  if (!data.is_self || data.over_18 || data.stickied || data.pinned) return false;
  if (!text || text === "[removed]" || text === "[deleted]") return false;
  if (text.length < MIN_REDDIT_STORY_CHARS || text.length > MAX_REDDIT_STORY_CHARS) return false;
  return true;
}

function paragraphsFromRedditText(text) {
  return text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map(paragraph => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 10);
}

function normalizeRedditPost(post, feed) {
  const data = post.data;
  const permalink = data.permalink ? `https://www.reddit.com${data.permalink}` : `https://www.reddit.com/r/${feed.subreddit}`;
  const paragraphs = paragraphsFromRedditText(data.selftext);
  return {
    id: `reddit-${data.name || data.id}`,
    redditId: data.name || data.id,
    title: data.title,
    subreddit: `r/${feed.subreddit}`,
    author: data.author || "reddit_user",
    score: formatScore(data.score),
    category: feed.category,
    source: "reddit",
    sourceUrl: permalink,
    createdUtc: data.created_utc,
    content: [
      {
        speaker: "Author",
        text: data.title
      },
      ...paragraphs.map(text => ({
        speaker: "Narrator",
        text
      }))
    ]
  };
}

async function fetchFeedStories(feed) {
  const token = await getRedditAccessToken();
  const useOAuth = Boolean(token);
  const headers = {
    Accept: "application/json",
    "User-Agent": USER_AGENT
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(redditUrlForFeed(feed, useOAuth), {
    headers
  });

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("application/json")) {
    throw new Error(`r/${feed.subreddit} returned ${response.status} ${contentType}`);
  }

  const payload = await response.json();
  return (payload?.data?.children || [])
    .filter(isUsableRedditPost)
    .map(post => normalizeRedditPost(post, feed));
}

async function getRedditAccessToken() {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (redditAccessToken && Date.now() < redditAccessTokenExpiresAt) {
    return redditAccessToken;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT
    },
    body: "grant_type=client_credentials"
  });

  if (!response.ok) {
    throw new Error(`Reddit OAuth returned ${response.status}`);
  }

  const payload = await response.json();
  redditAccessToken = payload.access_token;
  redditAccessTokenExpiresAt = Date.now() + Math.max(30, (payload.expires_in || 3600) - 60) * 1000;
  return redditAccessToken;
}

async function handleRedditApi(response) {
  const results = await Promise.allSettled(REDDIT_FEEDS.map(fetchFeedStories));
  const stories = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
  const errors = results
    .filter(result => result.status === "rejected")
    .map(result => result.reason.message);

  sendJson(response, 200, {
    stories,
    errors,
    authMode: process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET ? "oauth" : "anonymous",
    scannedFeeds: REDDIT_FEEDS.map(feed => `r/${feed.subreddit}`)
  });
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const resolvedPath = path.resolve(ROOT, `.${decodeURIComponent(pathname)}`);

  if (!resolvedPath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(resolvedPath);
    const ext = path.extname(resolvedPath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream"
    });
    response.end(file);
  } catch (error) {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8"
    });
    response.end("Not found");
  }
}

const server = http.createServer((request, response) => {
  if (request.url.startsWith("/api/reddit")) {
    handleRedditApi(response).catch(error => {
      sendJson(response, 500, {
        stories: [],
        errors: [error.message]
      });
    });
    return;
  }

  serveStatic(request, response);
});

server.listen(PORT, () => {
  console.log(`RedditReader running at http://localhost:${PORT}`);
});
