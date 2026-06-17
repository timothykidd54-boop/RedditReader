# RedditReader

RedditReader is a relaxation reader for interesting Reddit-style stories. The app is aimed at people who want something low-friction to listen to while winding down, trying to sleep, or taking a mental break.

## Current prototype

- Static HTML/CSS/JS app deployable on GitHub Pages.
- Local Node dev server with `/api/reddit` for live Reddit ingestion.
- Browser text-to-speech narration with voice, rate, pitch, and volume controls.
- Procedural ambient soundscapes: rain, waves, campfire, and brown noise.
- Sleep timer with fade-out.
- Story filters, custom story import, and local listening memory.
- "For You" and "Unheard" discovery modes based on saved listening history and topic interest.
- Live Reddit scan that fetches readable text posts from starter subreddits and falls back to the local story library if Reddit cannot be reached from the browser.

## Product direction

The current live scan uses the local `/api/reddit` backend route first, then falls back to browser-side Reddit JSON requests if the backend is not available. For production, keep Reddit access behind a backend so the app can use OAuth, better ranking, rate-limit handling, and safer content filtering.

## Local Reddit API

Run the app with:

```bash
npm run dev
```

Then open `http://localhost:3000`.

For reliable Reddit fetching, create `.env.local` from `.env.example` and add credentials from a Reddit developer app:

```bash
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
```

Without those keys, the dev server attempts anonymous Reddit JSON requests, but Reddit may block them with network security.

Likely first backend milestones:

1. Add Reddit OAuth/API integration.
2. Store users, heard post IDs, subreddit affinities, and imported stories.
3. Rank posts by user interests, novelty, length, tone, and sleep-friendliness.
4. Add a queue so users can start listening without browsing.
