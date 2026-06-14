// Reddit Lullaby - State Management, SpeechSynthesis, and Ambient Soundscapes

// --- AUDIO SYNTHESIS ENGINE (Web Audio API) ---
class AmbientSoundEngine {
  constructor() {
    this.audioCtx = null;
    this.sources = {
      rain: null,
      waves: null,
      campfire: null,
      brown: null
    };
    this.gains = {
      rain: null,
      waves: null,
      campfire: null,
      brown: null
    };
    this.buffers = {
      rain: null,
      campfire: null,
      brown: null
    };
    this.masterVolume = null;
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    
    // Create AudioContext
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioContextClass();
    
    // Create master gain node
    this.masterVolume = this.audioCtx.createGain();
    this.masterVolume.gain.value = 1.0;
    this.masterVolume.connect(this.audioCtx.destination);

    // Pre-generate noise buffers
    this.generateNoiseBuffers();

    // Create gain nodes for each channel
    Object.keys(this.sources).forEach(type => {
      this.gains[type] = this.audioCtx.createGain();
      this.gains[type].gain.value = 0.0; // Starts muted
      this.gains[type].connect(this.masterVolume);
    });

    this.isInitialized = true;
  }

  // Generates offline sound textures using procedural algorithms
  generateNoiseBuffers() {
    const sampleRate = this.audioCtx.sampleRate;
    
    // 1. Generate Brown Noise (10 seconds)
    const brownLen = 10 * sampleRate;
    this.buffers.brown = this.audioCtx.createBuffer(1, brownLen, sampleRate);
    const brownData = this.buffers.brown.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < brownLen; i++) {
      const white = Math.random() * 2 - 1;
      brownData[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = brownData[i];
      brownData[i] *= 3.5; // Compensate amplitude
    }

    // 2. Generate Rain Buffer with drops (5 seconds)
    const rainLen = 5 * sampleRate;
    this.buffers.rain = this.audioCtx.createBuffer(1, rainLen, sampleRate);
    const rainData = this.buffers.rain.getChannelData(0);
    lastOut = 0.0;
    for (let i = 0; i < rainLen; i++) {
      const white = Math.random() * 2 - 1;
      const brown = (lastOut + (0.02 * white)) / 1.02;
      lastOut = brown;
      
      // Add random high-freq raindrop patters
      let drop = 0;
      if (Math.random() < 0.0012) {
        drop = (Math.random() * 2 - 1) * 0.25;
      }
      rainData[i] = brown * 1.3 + drop;
    }

    // 3. Generate Campfire Buffer with crackles (6 seconds)
    const fireLen = 6 * sampleRate;
    this.buffers.campfire = this.audioCtx.createBuffer(1, fireLen, sampleRate);
    const fireData = this.buffers.campfire.getChannelData(0);
    lastOut = 0.0;
    for (let i = 0; i < fireLen; i++) {
      const white = Math.random() * 2 - 1;
      // Soft crackle low rumbling fire
      const brown = (lastOut + (0.012 * white)) / 1.02;
      lastOut = brown;
      
      // Frequent crackles (wood popping)
      let crackle = 0;
      const randVal = Math.random();
      if (randVal < 0.0004) {
        crackle = (Math.random() * 2 - 1) * 0.6; // Loud snaps
      } else if (randVal < 0.004) {
        crackle = (Math.random() * 2 - 1) * 0.06; // Minor pops
      }
      fireData[i] = brown * 1.1 + crackle;
    }
  }

  // Set individual ambient channel volume
  setVolume(type, volume) {
    if (!this.isInitialized) this.init();
    
    // Resume context if suspended (browser security)
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    const gainNode = this.gains[type];
    if (!gainNode) return;

    // Linear ramp for smooth volume changes without click pops
    gainNode.gain.linearRampToValueAtTime(volume, this.audioCtx.currentTime + 0.15);

    // If volume > 0 and node not currently running, start it
    if (volume > 0 && !this.sources[type]) {
      this.startSound(type);
    }
  }

  // Get current volume
  getVolume(type) {
    return this.gains[type] ? this.gains[type].gain.value : 0;
  }

  startSound(type) {
    if (this.sources[type]) return; // Already running

    const source = this.audioCtx.createBufferSource();
    
    if (type === 'waves') {
      // Waves are synthesized by modulating Brown Noise with a Low Frequency Oscillator (LFO)
      source.buffer = this.buffers.brown;
      source.loop = true;

      // Filter to make waves sound deep and underwater
      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 350;

      // Wave modulator gain
      const waveGain = this.audioCtx.createGain();
      waveGain.gain.value = 0.25; // Constant baseline volume

      // LFO for wave motion (breathing effect)
      const lfo = this.audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.07; // 14 seconds wave cycle (breath-like)

      const lfoGain = this.audioCtx.createGain();
      lfoGain.gain.value = 0.2; // Modulate depth

      lfo.connect(lfoGain);
      lfoGain.connect(waveGain.gain);
      
      source.connect(filter);
      filter.connect(waveGain);
      waveGain.connect(this.gains.waves);

      lfo.start();
      source.start();
      
      this.sources.waves = { source, lfo };
    } else {
      // Standard static procedural loops
      source.buffer = this.buffers[type] || this.buffers.brown;
      source.loop = true;

      // Apply a subtle lowpass filter to rain & brown noise to make them warmer
      if (type === 'rain' || type === 'brown') {
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = (type === 'rain') ? 1200 : 400;
        source.connect(filter);
        filter.connect(this.gains[type]);
      } else {
        source.connect(this.gains[type]);
      }
      
      source.start();
      this.sources[type] = source;
    }
  }

  stopSound(type) {
    const active = this.sources[type];
    if (!active) return;

    if (type === 'waves') {
      try {
        active.source.stop();
        active.lfo.stop();
      } catch (e) {}
    } else {
      try {
        active.stop();
      } catch (e) {}
    }
    this.sources[type] = null;
  }

  stopAll() {
    Object.keys(this.sources).forEach(type => {
      this.stopSound(type);
      if (this.gains[type]) {
        this.gains[type].gain.value = 0;
      }
    });
  }
}

// Create ambient sound instance
const ambientMixer = new AmbientSoundEngine();

// --- STATE MANAGEMENT ---
const AppState = {
  stories: [],
  selectedStory: null,
  activeCategory: "all",
  activeSubreddit: null,
  
  // TTS State
  isPlaying: false,
  isPaused: false,
  sentences: [],
  currentSentenceIdx: 0,
  speechVolume: 0.8,
  speechRate: 0.9,
  speechPitch: 1.0,
  selectedVoiceName: "",
  
  // Timer State
  timerDuration: 0, // In minutes
  timerRemaining: 0, // In seconds
  timerInterval: null,
  isFading: false,
  savedAmbientVolumes: {}
};

// --- DOM ELEMENTS ---
const DOM = {
  storiesList: document.getElementById("stories-list"),
  filterButtons: document.querySelectorAll(".filter-btn"),
  playerSubreddit: document.getElementById("player-subreddit"),
  playerTitle: document.getElementById("player-title"),
  playerMeta: document.getElementById("player-meta"),
  readerViewport: document.getElementById("reader-viewport"),
  
  // Player Controls
  playBtn: document.getElementById("play-btn"),
  playIcon: document.getElementById("play-icon"),
  stopBtn: document.getElementById("stop-btn"),
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
  
  // Timer Elements
  timerCountdown: document.getElementById("timer-countdown"),
  timerProgressBar: document.getElementById("timer-progress-bar"),
  presetButtons: document.querySelectorAll(".preset-btn"),
  customTimerBtn: document.getElementById("custom-timer-btn"),
  
  // Settings Drawer Elements
  settingsToggleBtn: document.getElementById("settings-toggle-btn"),
  settingsDrawer: document.getElementById("settings-drawer"),
  closeDrawerBtn: document.getElementById("close-drawer-btn"),
  voiceSelect: document.getElementById("voice-select"),
  rateSlider: document.getElementById("rate-slider"),
  rateValue: document.getElementById("rate-value"),
  pitchSlider: document.getElementById("pitch-slider"),
  pitchValue: document.getElementById("pitch-value"),
  volumeSlider: document.getElementById("voice-volume-slider"),
  volumeValue: document.getElementById("voice-volume-value"),
  
  // Ambient Sound Sliders
  ambientSliders: {
    rain: document.getElementById("ambient-rain"),
    waves: document.getElementById("ambient-waves"),
    campfire: document.getElementById("ambient-campfire"),
    brown: document.getElementById("ambient-brown")
  },
  ambientValues: {
    rain: document.getElementById("val-rain"),
    waves: document.getElementById("val-waves"),
    campfire: document.getElementById("val-campfire"),
    brown: document.getElementById("val-brown")
  },

  // Modals
  importBtn: document.getElementById("import-btn"),
  importModal: document.getElementById("import-modal"),
  closeModalBtn: document.getElementById("close-modal-btn"),
  cancelImportBtn: document.getElementById("cancel-import-btn"),
  saveImportBtn: document.getElementById("save-import-btn"),
  importTitle: document.getElementById("import-title"),
  importSubreddit: document.getElementById("import-subreddit"),
  importAuthor: document.getElementById("import-author"),
  importText: document.getElementById("import-text"),
  
  customTimerModal: document.getElementById("custom-timer-modal"),
  closeTimerModalBtn: document.getElementById("close-timer-modal-btn"),
  cancelTimerBtn: document.getElementById("cancel-timer-btn"),
  saveTimerBtn: document.getElementById("save-timer-btn"),
  customTimerMinutes: document.getElementById("custom-timer-minutes")
};

// --- INITIALIZE SPEECH SYNTHESIS ---
let synthVoices = [];

function loadVoices() {
  if (typeof speechSynthesis === 'undefined') return;
  
  synthVoices = speechSynthesis.getVoices();
  DOM.voiceSelect.innerHTML = "";
  
  // Filter for clean, pleasant sounding English voices first, then others
  const englishVoices = synthVoices.filter(v => v.lang.includes("en-") || v.lang.includes("en_"));
  const otherVoices = synthVoices.filter(v => !v.lang.includes("en-") && !v.lang.includes("en_"));
  
  const voicesToShow = [...englishVoices, ...otherVoices];
  
  voicesToShow.forEach(voice => {
    const option = document.createElement("option");
    option.value = voice.name;
    // Highlight local natural sounding voices if possible
    const isNatural = voice.name.toLowerCase().includes("natural") || voice.name.toLowerCase().includes("google");
    option.textContent = `${voice.name} (${voice.lang})${isNatural ? ' ✨' : ''}`;
    DOM.voiceSelect.appendChild(option);
  });

  // Try to select a default premium voice
  let defaultVoice = synthVoices.find(v => v.name.includes("Google UK English Female")) || 
                     synthVoices.find(v => v.name.includes("Natural")) ||
                     synthVoices.find(v => v.lang.startsWith("en"));
                     
  if (defaultVoice) {
    DOM.voiceSelect.value = defaultVoice.name;
    AppState.selectedVoiceName = defaultVoice.name;
  }
}

// Chrome loads voices asynchronously
if (typeof speechSynthesis !== 'undefined') {
  loadVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
  }
}

// --- UTILITY FUNCTIONS ---

// Splits paragraphs into readable sentences with punctuation preserved
function splitParagraphIntoSentences(text) {
  if (!text) return [];
  // Split at periods, question marks, and exclamation marks, preserving them
  const regex = /[^.!?]+[.!?]+(?:\s|$)|[^.!?]+(?:\s|$)/g;
  const matches = text.match(regex);
  if (!matches) return [text.trim()];
  return matches.map(s => s.trim()).filter(s => s.length > 0);
}

// Formats seconds into MM:SS
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Render the stories list based on filters
function renderStoriesList() {
  DOM.storiesList.innerHTML = "";
  
  const filtered = storiesDatabase.filter(story => {
    const matchesCategory = AppState.activeCategory === "all" || story.category === AppState.activeCategory;
    const matchesSubreddit = !AppState.activeSubreddit || story.subreddit === AppState.activeSubreddit;
    return matchesCategory && matchesSubreddit;
  });

  if (filtered.length === 0) {
    DOM.storiesList.innerHTML = `<div class="reader-placeholder">No stories found in this category.</div>`;
    return;
  }

  filtered.forEach(story => {
    const card = document.createElement("div");
    card.className = `story-card ${AppState.selectedStory?.id === story.id ? 'active' : ''}`;
    
    // Estimate reading time (roughly 150 words per minute)
    let totalWords = 0;
    story.content.forEach(p => totalWords += p.text.split(" ").length);
    const readTime = Math.ceil(totalWords / 150);

    card.innerHTML = `
      <span class="story-card-subreddit">${story.subreddit}</span>
      <h3 class="story-card-title">${story.title}</h3>
      <div class="story-card-meta">
        <span>u/${story.author}</span>
        <span>~${readTime} min read</span>
      </div>
    `;

    card.addEventListener("click", () => selectStory(story));
    DOM.storiesList.appendChild(card);
  });
}

// Select a story and load it into the player viewport
function selectStory(story) {
  stopTTS();
  
  AppState.selectedStory = story;
  
  // Highlight active card
  document.querySelectorAll(".story-card").forEach(card => card.classList.remove("active"));
  renderStoriesList(); // Redraws to toggle active visual card
  
  DOM.playerSubreddit.textContent = story.subreddit;
  DOM.playerTitle.textContent = story.title;
  
  let totalWords = 0;
  story.content.forEach(p => totalWords += p.text.split(" ").length);
  const readTime = Math.ceil(totalWords / 150);
  DOM.playerMeta.textContent = `By u/${story.author} • ${readTime} min read`;

  // Parse paragraphs into sentences
  AppState.sentences = [];
  story.content.forEach((item, pIdx) => {
    const sentences = splitParagraphIntoSentences(item.text);
    sentences.forEach((text, sIdx) => {
      AppState.sentences.push({
        text: text,
        speaker: item.speaker,
        paragraphIndex: pIdx,
        sentenceIndex: sIdx
      });
    });
  });

  AppState.currentSentenceIdx = 0;
  
  // Render sentences in the viewport
  DOM.readerViewport.innerHTML = "";
  AppState.sentences.forEach((sentence, index) => {
    const span = document.createElement("span");
    span.className = "reader-sentence";
    span.id = `sentence-${index}`;
    // Add space after sentence
    span.textContent = sentence.text + " ";
    span.addEventListener("click", () => {
      jumpToSentence(index);
    });
    DOM.readerViewport.appendChild(span);
  });

  // Enable controls
  DOM.playBtn.disabled = false;
  DOM.stopBtn.disabled = false;
  DOM.prevBtn.disabled = false;
  DOM.nextBtn.disabled = false;
}

// Jump to a specific sentence in the story
function jumpToSentence(index) {
  if (index < 0 || index >= AppState.sentences.length) return;
  
  const wasPlaying = AppState.isPlaying;
  stopTTS();
  
  AppState.currentSentenceIdx = index;
  highlightSentence(index);
  
  if (wasPlaying) {
    playTTS();
  }
}

// Highlights the active sentence and dims others
function highlightSentence(index) {
  document.querySelectorAll(".reader-sentence").forEach(span => {
    span.classList.remove("highlight");
  });
  
  const activeSpan = document.getElementById(`sentence-${index}`);
  if (activeSpan) {
    activeSpan.classList.add("highlight");
    // Scroll viewport to active sentence smoothly
    activeSpan.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// --- TEXT-TO-SPEECH PLAYER LOGIC ---
let activeUtterance = null;
let visualizerTimer = null;

function playTTS() {
  if (AppState.sentences.length === 0) return;
  
  // Initialize audio context if not done (due to user gesture)
  ambientMixer.init();

  if (AppState.isPaused) {
    speechSynthesis.resume();
    AppState.isPlaying = true;
    AppState.isPaused = false;
    updatePlayerUI();
    startVisualizer();
    return;
  }

  stopTTS(false); // Clean up current speech but keep indices

  const sentence = AppState.sentences[AppState.currentSentenceIdx];
  if (!sentence) {
    // End of story reached
    stopTTS();
    return;
  }

  highlightSentence(AppState.currentSentenceIdx);

  activeUtterance = new SpeechSynthesisUtterance(sentence.text);
  
  // Configure voice details
  if (AppState.selectedVoiceName) {
    const voice = synthVoices.find(v => v.name === AppState.selectedVoiceName);
    if (voice) activeUtterance.voice = voice;
  }
  
  // Use fading volume or base user setting
  activeUtterance.volume = AppState.isFading ? 0 : AppState.speechVolume;
  activeUtterance.rate = AppState.speechRate;
  activeUtterance.pitch = AppState.speechPitch;

  activeUtterance.onend = () => {
    activeUtterance = null;
    if (AppState.isPlaying) {
      AppState.currentSentenceIdx++;
      if (AppState.currentSentenceIdx < AppState.sentences.length) {
        playTTS();
      } else {
        stopTTS();
      }
    }
  };

  activeUtterance.onerror = (event) => {
    // Avoid re-triggering on manual stops
    if (event.error !== 'interrupted') {
      console.error("SpeechSynthesis error:", event);
      stopTTS();
    }
  };

  AppState.isPlaying = true;
  AppState.isPaused = false;
  
  speechSynthesis.speak(activeUtterance);
  updatePlayerUI();
  startVisualizer();
}

function pauseTTS() {
  if (AppState.isPlaying) {
    speechSynthesis.pause();
    AppState.isPlaying = false;
    AppState.isPaused = true;
    updatePlayerUI();
    stopVisualizer();
  }
}

function stopTTS(resetIndex = true) {
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel();
  }
  
  activeUtterance = null;
  AppState.isPlaying = false;
  AppState.isPaused = false;
  
  if (resetIndex) {
    AppState.currentSentenceIdx = 0;
    // Remove all highlights
    document.querySelectorAll(".reader-sentence").forEach(span => {
      span.classList.remove("highlight");
    });
  }
  
  updatePlayerUI();
  stopVisualizer();
}

// Visual Waveform Animation Sync
function startVisualizer() {
  stopVisualizer();
  
  // Add animation class
  document.querySelectorAll(".wave-bar").forEach(bar => {
    bar.classList.add("speaking");
  });

  // Dynamically wiggle heights using a small interval loop
  visualizerTimer = setInterval(() => {
    document.querySelectorAll(".wave-bar").forEach(bar => {
      // Create organic bouncing heights
      const h = Math.floor(Math.random() * 40) + 8;
      bar.style.height = `${h}px`;
    });
  }, 100);
}

function stopVisualizer() {
  if (visualizerTimer) {
    clearInterval(visualizerTimer);
    visualizerTimer = null;
  }
  // Remove animation and reset to tiny bars
  document.querySelectorAll(".wave-bar").forEach(bar => {
    bar.classList.remove("speaking");
    bar.style.height = "4px";
  });
}

// Updates play/pause button state in UI
function updatePlayerUI() {
  if (AppState.isPlaying) {
    DOM.playBtn.classList.add("playing");
    DOM.playIcon.innerHTML = `
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
    `;
    DOM.playBtn.title = "Pause";
  } else {
    DOM.playBtn.classList.remove("playing");
    DOM.playIcon.innerHTML = `
      <polygon points="5 3 19 12 5 21 5 3"/>
    `;
    DOM.playBtn.title = "Play";
  }
}

// --- SLEEP TIMER ENGINE ---
const TIMER_DASHARRAY = 213.628; // 2 * PI * r (r=34)

function setSleepTimer(minutes) {
  // Clear any existing timer
  if (AppState.timerInterval) {
    clearInterval(AppState.timerInterval);
    AppState.timerInterval = null;
  }

  // Handle turning timer off
  if (minutes === 0) {
    AppState.timerDuration = 0;
    AppState.timerRemaining = 0;
    AppState.isFading = false;
    DOM.timerCountdown.textContent = "Off";
    setTimerProgress(1.0);
    return;
  }

  // Set new timer state
  AppState.timerDuration = minutes;
  AppState.timerRemaining = minutes * 60; // Convert to seconds
  AppState.isFading = false;
  
  updateTimerUI();

  // Initialize audio mixer if timer was set
  ambientMixer.init();

  AppState.timerInterval = setInterval(() => {
    AppState.timerRemaining--;
    
    // Check if we should start the smart fade-out (in the final 60 seconds)
    if (AppState.timerRemaining <= 60 && AppState.timerRemaining > 0 && !AppState.isFading) {
      startSmartFadeout();
    }

    if (AppState.timerRemaining <= 0) {
      completeTimer();
    } else {
      updateTimerUI();
    }
  }, 1000);
}

// Smoothly scale the circular ring based on progress
function setTimerProgress(percent) {
  const offset = TIMER_DASHARRAY - (percent * TIMER_DASHARRAY);
  DOM.timerProgressBar.style.strokeDashoffset = offset;
}

function updateTimerUI() {
  DOM.timerCountdown.textContent = formatTime(AppState.timerRemaining);
  const totalSeconds = AppState.timerDuration * 60;
  const progressFraction = AppState.timerRemaining / totalSeconds;
  setTimerProgress(progressFraction);
}

// Starts the gradual volume reduction to prevent waking the sleeping user
function startSmartFadeout() {
  AppState.isFading = true;
  
  // Store user's original volume levels to restore later
  AppState.savedAmbientVolumes = {
    speech: AppState.speechVolume,
    rain: parseFloat(DOM.ambientSliders.rain.value),
    waves: parseFloat(DOM.ambientSliders.waves.value),
    campfire: parseFloat(DOM.ambientSliders.campfire.value),
    brown: parseFloat(DOM.ambientSliders.brown.value)
  };

  // We fade volumes linearly over 60 seconds
  const fadeSteps = 60;
  let currentStep = 0;

  const fadeTimer = setInterval(() => {
    if (AppState.timerRemaining <= 0 || !AppState.isFading) {
      clearInterval(fadeTimer);
      return;
    }

    currentStep++;
    const factor = 1 - (currentStep / fadeSteps); // Goes from 1.0 down to 0.0

    // Fade TTS Voice (directly on active speech utterance if active)
    if (activeUtterance) {
      activeUtterance.volume = AppState.savedAmbientVolumes.speech * factor;
    }

    // Fade Ambient Sounds
    Object.keys(DOM.ambientSliders).forEach(type => {
      const startVol = AppState.savedAmbientVolumes[type];
      if (startVol > 0) {
        const targetVol = startVol * factor;
        ambientMixer.setVolume(type, targetVol);
      }
    });
  }, 1000);
}

function completeTimer() {
  clearInterval(AppState.timerInterval);
  AppState.timerInterval = null;
  
  // Stop all active playbacks
  stopTTS();
  ambientMixer.stopAll();

  // Restore sliders & state to normal levels so next sessions start fine
  if (AppState.isFading) {
    AppState.isFading = false;
    // Restore browser audio synthesis volumes
    Object.keys(DOM.ambientSliders).forEach(type => {
      const origVol = AppState.savedAmbientVolumes[type] || 0;
      ambientMixer.setVolume(type, origVol);
    });
  }

  // Reset preset button selections
  DOM.presetButtons.forEach(btn => btn.classList.remove("active"));
  const offBtn = Array.from(DOM.presetButtons).find(btn => btn.getAttribute("data-time") === "0");
  if (offBtn) offBtn.classList.add("active");

  DOM.timerCountdown.textContent = "Off";
  setTimerProgress(1.0);
  
  alert("Sleep timer ended. Sleep well!");
}

// --- EVENT HANDLERS & BINDINGS ---

function setupEventListeners() {
  
  // 1. Play / Pause Control
  DOM.playBtn.addEventListener("click", () => {
    if (AppState.isPlaying) {
      pauseTTS();
    } else {
      playTTS();
    }
  });

  // 2. Stop Control
  DOM.stopBtn.addEventListener("click", () => {
    stopTTS();
  });

  // 3. Skip Sentence Forward / Backward
  DOM.prevBtn.addEventListener("click", () => {
    if (AppState.currentSentenceIdx > 0) {
      jumpToSentence(AppState.currentSentenceIdx - 1);
    }
  });

  DOM.nextBtn.addEventListener("click", () => {
    if (AppState.currentSentenceIdx < AppState.sentences.length - 1) {
      jumpToSentence(AppState.currentSentenceIdx + 1);
    }
  });

  // 4. Timer Preset Selection
  DOM.presetButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("custom-preset-trigger")) return; // Opens dialog instead
      
      DOM.presetButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      const time = parseInt(btn.getAttribute("data-time"), 10);
      setSleepTimer(time);
    });
  });

  // 5. Custom Sleep Timer modal triggers
  DOM.customTimerBtn.addEventListener("click", () => {
    DOM.customTimerModal.classList.remove("hidden");
  });

  DOM.closeTimerModalBtn.addEventListener("click", () => {
    DOM.customTimerModal.classList.add("hidden");
  });
  DOM.cancelTimerBtn.addEventListener("click", () => {
    DOM.customTimerModal.classList.add("hidden");
  });

  DOM.saveTimerBtn.addEventListener("click", () => {
    const mins = parseInt(DOM.customTimerMinutes.value, 10);
    if (mins > 0) {
      DOM.presetButtons.forEach(b => b.classList.remove("active"));
      DOM.customTimerBtn.classList.add("active");
      
      setSleepTimer(mins);
      DOM.customTimerModal.classList.add("hidden");
    }
  });

  // 6. Settings Drawer Panels Toggle
  DOM.settingsToggleBtn.addEventListener("click", () => {
    DOM.settingsDrawer.classList.toggle("collapsed");
  });

  DOM.closeDrawerBtn.addEventListener("click", () => {
    DOM.settingsDrawer.classList.add("collapsed");
  });

  // 7. TTS Settings Bindings
  DOM.voiceSelect.addEventListener("change", (e) => {
    AppState.selectedVoiceName = e.target.value;
    if (AppState.isPlaying) {
      // Restart with new voice
      playTTS();
    }
  });

  DOM.rateSlider.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    AppState.speechRate = val;
    DOM.rateValue.textContent = `${val.toFixed(1)}x`;
  });

  DOM.pitchSlider.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    AppState.speechPitch = val;
    DOM.pitchValue.textContent = val.toFixed(1);
  });

  DOM.volumeSlider.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    AppState.speechVolume = val;
    DOM.volumeValue.textContent = `${Math.round(val * 100)}%`;
  });

  // 8. Ambient Sound Mixers Bindings
  Object.keys(DOM.ambientSliders).forEach(type => {
    DOM.ambientSliders[type].addEventListener("input", (e) => {
      const vol = parseFloat(e.target.value);
      DOM.ambientValues[type].textContent = `${Math.round(vol * 100)}%`;
      
      // Update synthesizer volume
      ambientMixer.setVolume(type, vol);
    });
  });

  // 9. Story Category Filter Buttons
  DOM.filterButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      DOM.filterButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      const cat = btn.getAttribute("data-category");
      const sub = btn.getAttribute("data-subreddit");
      
      AppState.activeCategory = cat || "all";
      AppState.activeSubreddit = sub || null;
      
      renderStoriesList();
    });
  });

  // 10. Custom Story Import Modals Triggers
  DOM.importBtn.addEventListener("click", () => {
    DOM.importModal.classList.remove("hidden");
  });

  DOM.closeModalBtn.addEventListener("click", () => {
    DOM.importModal.classList.add("hidden");
  });
  DOM.cancelImportBtn.addEventListener("click", () => {
    DOM.importModal.classList.add("hidden");
  });

  DOM.saveImportBtn.addEventListener("click", () => {
    const title = DOM.importTitle.value.trim();
    const sub = DOM.importSubreddit.value.trim() || "r/custom";
    const author = DOM.importAuthor.value.trim() || "myself";
    const text = DOM.importText.value.trim();

    if (!title || !text) {
      alert("Please provide a story title and text content.");
      return;
    }

    // Process imported text paragraphs into structured object representation
    const paragraphs = text.split("\n\n").map(p => p.trim()).filter(p => p.length > 0);
    const content = paragraphs.map(pText => {
      return {
        speaker: "Narrator",
        text: pText
      };
    });

    const newStory = {
      id: `custom-${Date.now()}`,
      title: title,
      subreddit: sub,
      author: author,
      score: "1.0k",
      category: "calming",
      content: content
    };

    // Add to local database
    storiesDatabase.unshift(newStory);
    
    // Close modal and refresh list
    DOM.importModal.classList.add("hidden");
    DOM.importTitle.value = "";
    DOM.importText.value = "";
    
    renderStoriesList();
    selectStory(newStory); // Auto-load the newly imported story
  });
}

// --- INITIAL BUILD SETUP ---
function initApp() {
  // Disable media player buttons until a story is selected
  DOM.playBtn.disabled = true;
  DOM.stopBtn.disabled = true;
  DOM.prevBtn.disabled = true;
  DOM.nextBtn.disabled = true;

  // Build UI Listeners
  setupEventListeners();

  // Populate first render stories
  renderStoriesList();

  // Automatically select the first story in the database by default
  if (storiesDatabase.length > 0) {
    selectStory(storiesDatabase[0]);
  }
}

// Start app on DOM loaded
document.addEventListener("DOMContentLoaded", initApp);
