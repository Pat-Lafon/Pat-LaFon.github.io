// =============================================
// Tab navigation
// =============================================
const tabBtns = document.querySelectorAll('.tab-btn');
const views = document.querySelectorAll('.view');
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    views.forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab + '-view').classList.add('active');
  });
});

// =============================================
// Breathe view (box breathing) — unchanged logic
// =============================================
const dot = document.getElementById('dot');
const phaseEl = document.getElementById('phase');
const countEl = document.getElementById('count');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const stopBtn = document.getElementById('stopBtn');
const remainingEl = document.getElementById('remaining');
const chips = document.querySelectorAll('.chip');

let sessionMinutes = 5;
let sessionStart = 0;
let sessionEndChimePlayed = false;

const SIDE = 280;
const PHASE_MS = 4000;
const PHASE_INHALE = 0;
const PHASE_HOLD_FULL = 1;
const PHASE_EXHALE = 2;
const PHASE_HOLD_EMPTY = 3;
const phases = ['Inhale', 'Hold', 'Exhale', 'Hold'];

const FILTER_LOW = 180;
const FILTER_HIGH = 700;
const MAX_GAIN = 0.55;
const CHIME_DURATION = 0.6;

let running = false;
let paused = false;
let rafId = null;
let phaseIdx = 0;
let phaseStart = 0;
let pausedElapsed = 0;
let pausedSessionElapsed = 0;
let audioCtx = null;
let noiseSource = null;
let filterNode = null;
let filterNode2 = null;
let gainNode = null;

function updateControls() {
  const active = running || paused;
  startBtn.style.display = active ? 'none' : '';
  pauseBtn.style.display = running ? '' : 'none';
  resumeBtn.style.display = paused ? '' : 'none';
  stopBtn.style.display = active ? '' : 'none';
  chips.forEach(c => {
    c.style.opacity = active ? '0.4' : '';
    c.style.pointerEvents = active ? 'none' : '';
  });
}

function createNoiseBuffer(ctx) {
  const length = ctx.sampleRate * 3;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.02 * white) / 1.02;
    data[i] = lastOut * 3.5;
  }
  return buffer;
}

function ensureAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!noiseSource) {
      gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.0001;
      filterNode = audioCtx.createBiquadFilter();
      filterNode.type = 'lowpass';
      filterNode.frequency.value = FILTER_LOW;
      filterNode.Q.value = 0.5;
      filterNode2 = audioCtx.createBiquadFilter();
      filterNode2.type = 'lowpass';
      filterNode2.frequency.value = FILTER_LOW;
      filterNode2.Q.value = 0.5;
      noiseSource = audioCtx.createBufferSource();
      noiseSource.buffer = createNoiseBuffer(audioCtx);
      noiseSource.loop = true;
      noiseSource.connect(filterNode).connect(filterNode2).connect(gainNode).connect(audioCtx.destination);
      noiseSource.start();
    }
  } catch (e) { /* Audio unsupported */ }
}

function vibrate(ms) {
  try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {}
}

function playChime(freq) {
  if (!audioCtx) { vibrate(40); return; }
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.1, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + CHIME_DURATION);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + CHIME_DURATION + 0.05);
}

function setBreathSound(progress) {
  if (!gainNode || !audioCtx) return;
  const t = audioCtx.currentTime;
  let cutoff, gain;
  switch (phaseIdx) {
    case PHASE_INHALE: cutoff = FILTER_LOW + (FILTER_HIGH - FILTER_LOW) * progress; gain = MAX_GAIN * (0.15 + 0.85 * progress); break;
    case PHASE_HOLD_FULL: cutoff = FILTER_HIGH; gain = MAX_GAIN * 0.5; break;
    case PHASE_EXHALE: cutoff = FILTER_HIGH - (FILTER_HIGH - FILTER_LOW) * progress; gain = MAX_GAIN * (1 - 0.85 * progress) * 0.85 + 0.02; break;
    case PHASE_HOLD_EMPTY: cutoff = FILTER_LOW; gain = 0.02; break;
  }
  filterNode.frequency.setTargetAtTime(cutoff, t, 0.1);
  filterNode2.frequency.setTargetAtTime(cutoff, t, 0.1);
  gainNode.gain.setTargetAtTime(Math.max(gain, 0.0001), t, 0.1);
}

function positionDot(progress) {
  let x = 0, y = 0;
  switch (phaseIdx) {
    case PHASE_INHALE:     x = progress * SIDE; y = 0; break;
    case PHASE_HOLD_FULL:  x = SIDE; y = progress * SIDE; break;
    case PHASE_EXHALE:     x = SIDE - progress * SIDE; y = SIDE; break;
    case PHASE_HOLD_EMPTY: x = 0; y = SIDE - progress * SIDE; break;
  }
  dot.style.transform = `translate(${x}px, ${y}px)`;
}

function startPhase() {
  phaseStart = performance.now();
  phaseEl.textContent = phases[phaseIdx];
  const chimeFreqs = [659, 523, 392, 523];
  playChime(chimeFreqs[phaseIdx]);
  phaseEl.style.transition = 'none';
  phaseEl.style.opacity = '0.4';
  phaseEl.style.transform = 'scale(0.95)';
  requestAnimationFrame(() => {
    phaseEl.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    phaseEl.style.opacity = '1';
    phaseEl.style.transform = 'scale(1)';
  });
}

function breathFormatTime(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateRemaining(now) {
  if (sessionMinutes === 0) {
    remainingEl.textContent = `Elapsed ${breathFormatTime(now - sessionStart)}`;
    return;
  }
  const totalMs = sessionMinutes * 60 * 1000;
  const left = totalMs - (now - sessionStart);
  remainingEl.textContent = `${breathFormatTime(left)} remaining`;
  if (left <= 0 && !sessionEndChimePlayed) {
    sessionEndChimePlayed = true;
    playChime(523);
    setTimeout(() => playChime(659), 350);
    setTimeout(() => playChime(784), 700);
    setTimeout(() => breathStop(true), 1400);
  }
}

function loop(now) {
  if (!running) return;
  const elapsed = now - phaseStart;
  const progress = Math.min(elapsed / PHASE_MS, 1);
  countEl.textContent = Math.max(1, Math.ceil((PHASE_MS - elapsed) / 1000));
  positionDot(progress);
  setBreathSound(progress);
  updateRemaining(now);
  if (elapsed >= PHASE_MS) { phaseIdx = (phaseIdx + 1) % 4; startPhase(); }
  rafId = requestAnimationFrame(loop);
}

function breathStart() {
  if (running) return;
  running = true; paused = false; phaseIdx = 0;
  sessionStart = performance.now();
  sessionEndChimePlayed = false;
  ensureAudio(); startPhase();
  rafId = requestAnimationFrame(loop);
  updateControls();
}

function breathPause() {
  if (!running) return;
  const now = performance.now();
  pausedElapsed = now - phaseStart;
  pausedSessionElapsed = now - sessionStart;
  running = false; paused = true;
  if (rafId) cancelAnimationFrame(rafId);
  stopBreathAudio();
  phaseEl.textContent = 'Paused';
  updateControls();
}

function breathResume() {
  if (!paused) return;
  paused = false; running = true;
  const now = performance.now();
  phaseStart = now - pausedElapsed;
  sessionStart = now - pausedSessionElapsed;
  ensureAudio();
  phaseEl.textContent = phases[phaseIdx];
  rafId = requestAnimationFrame(loop);
  updateControls();
}

function stopBreathAudio() {
  if (noiseSource) { try { noiseSource.stop(); } catch (e) {} noiseSource.disconnect(); noiseSource = null; }
  if (filterNode) { filterNode.disconnect(); filterNode = null; }
  if (filterNode2) { filterNode2.disconnect(); filterNode2 = null; }
  if (gainNode) { gainNode.disconnect(); gainNode = null; }
}

function breathStop(completed = false) {
  running = false; paused = false;
  if (rafId) cancelAnimationFrame(rafId);
  stopBreathAudio();
  phaseEl.textContent = completed ? 'Complete' : 'Ready';
  countEl.textContent = '\u2014';
  dot.style.transform = 'translate(0px, 0px)';
  if (!completed) remainingEl.textContent = '';
  updateControls();
}

chips.forEach(chip => {
  chip.addEventListener('click', () => {
    if (running || paused) return;
    chips.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    sessionMinutes = parseInt(chip.dataset.minutes, 10);
  });
});

startBtn.addEventListener('click', breathStart);
pauseBtn.addEventListener('click', breathPause);
resumeBtn.addEventListener('click', breathResume);
stopBtn.addEventListener('click', () => breathStop(false));

document.addEventListener('keydown', (e) => {
  // Only handle shortcuts when breathe view is active
  if (!document.getElementById('breathe-view').classList.contains('active')) return;
  if (e.key === 'Enter') {
    if (!running && !paused) breathStart();
    else if (paused) breathResume();
  } else if (e.key === 'Escape') {
    if (running || paused) breathStop(false);
  } else if (e.key === ' ') {
    e.preventDefault();
    if (running) breathPause();
    else if (paused) breathResume();
  }
});

// =============================================
// Guided view — session data, player, caching
// =============================================
const AUDIO_CACHE = 'meditation-audio';

const SESSIONS = [
  // UCLA Mindful (CC BY-NC-ND 4.0)
  { id: 'ucla-body-scan-short', title: 'Short Body Scan', duration: '3 min', source: 'UCLA Mindful', type: 'Body Scan',
    url: 'https://d1cy5zxxhbcbkk.cloudfront.net/guided-meditations/Body-Scan-Meditation.mp3' },
  { id: 'ucla-breathing', title: 'Breathing Meditation', duration: '5 min', source: 'UCLA Mindful', type: 'Breathing',
    url: 'https://d1cy5zxxhbcbkk.cloudfront.net/guided-meditations/01_Breathing_Meditation.mp3' },
  { id: 'ucla-difficulties', title: 'Working with Difficulties', duration: '7 min', source: 'UCLA Mindful', type: 'Mindfulness',
    url: 'https://d1cy5zxxhbcbkk.cloudfront.net/guided-meditations/04_Meditation_for_Working_with_Difficulties.mp3' },
  { id: 'ucla-loving-kindness', title: 'Loving Kindness', duration: '9 min', source: 'UCLA Mindful', type: 'Compassion',
    url: 'https://d1cy5zxxhbcbkk.cloudfront.net/guided-meditations/05_Loving_Kindness_Meditation.mp3' },
  { id: 'ucla-breath-sound-body', title: 'Breath, Sound & Body', duration: '12 min', source: 'UCLA Mindful', type: 'Mindfulness',
    url: 'https://d1cy5zxxhbcbkk.cloudfront.net/guided-meditations/02_Breath_Sound_Body_Meditation.mp3' },
  { id: 'ucla-body-scan-sleep', title: 'Body Scan for Sleep', duration: '13 min', source: 'UCLA Mindful', type: 'Body Scan',
    url: 'https://d1cy5zxxhbcbkk.cloudfront.net/guided-meditations/Body-Scan-for-Sleep.mp3' },
  { id: 'ucla-complete', title: 'Complete Meditation', duration: '19 min', source: 'UCLA Mindful', type: 'Mindfulness',
    url: 'https://d1cy5zxxhbcbkk.cloudfront.net/guided-meditations/03_Complete_Meditation_Instructions.mp3' },

  // DoD Military Meditation Coach (public domain)
  { id: 'dod-body-scan-quick', title: 'Quick Body Scan', duration: '3 min', source: 'DoD', type: 'Body Scan',
    url: 'https://www.dvidshub.net/podcast/download/80871/DOD_109062444.mp3' },
  { id: 'dod-body-scan-brief', title: 'Brief Body Scan', duration: '9 min', source: 'DoD', type: 'Body Scan',
    url: 'https://www.dvidshub.net/podcast/download/80780/DOD_109059189.mp3' },
  { id: 'dod-body-scan-14', title: 'Guided Body Scan', duration: '14 min', source: 'DoD', type: 'Body Scan',
    url: 'https://www.dvidshub.net/podcast/download/80841/DOD_109062138.mp3' },
  { id: 'dod-body-scan-17', title: 'Body Scan Practice', duration: '17 min', source: 'DoD', type: 'Body Scan',
    url: 'https://www.dvidshub.net/podcast/download/80854/DOD_109062382.mp3' },
  { id: 'dod-body-scan-extended', title: 'Extended Body Scan', duration: '28 min', source: 'DoD', type: 'Body Scan',
    url: 'https://www.dvidshub.net/podcast/download/80785/DOD_109059359.mp3' },
  { id: 'dod-pmr', title: 'Progressive Muscle Relaxation', duration: '13 min', source: 'DoD', type: 'Relaxation',
    url: 'https://www.dvidshub.net/podcast/download/80840/DOD_109062143.mp3' },
  { id: 'dod-walk-woods', title: 'A Walk in the Woods', duration: '18 min', source: 'DoD', type: 'Guided Imagery',
    url: 'https://www.dvidshub.net/podcast/download/80805/DOD_109059616.mp3' },
  { id: 'dod-mountain', title: 'Mountain Meditation', duration: '24 min', source: 'DoD', type: 'Guided Imagery',
    url: 'https://www.dvidshub.net/podcast/download/80832/DOD_109062045.mp3' },

  // VA WRIISC
  { id: 'va-body-scan', title: 'Body Scan', duration: '8 min', source: 'VA', type: 'Body Scan',
    url: 'https://www.warrelatedillness.va.gov/WARRELATEDILLNESS/clinical/integrative-health/ca/media/2018-Body-Scan-TimAvery.mp3' },
];

const audio = document.getElementById('audio');
const playerEl = document.getElementById('player');
const playerTitle = document.getElementById('playerTitle');
const playBtn = document.getElementById('playBtn');
const progressBar = document.getElementById('progressBar');
const elapsedEl = document.getElementById('elapsed');
const totalTimeEl = document.getElementById('totalTime');
const playerClose = document.getElementById('playerClose');
const sessionListEl = document.getElementById('sessionList');
const playerStatus = document.getElementById('playerStatus');
const cacheSizeEl = document.getElementById('cacheSize');
const cacheClearBtn = document.getElementById('cacheClear');

let currentSession = null;
let seeking = false;

function guidedFormatTime(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// --- Session list rendering ---
async function renderSessions() {
  const cachedUrls = await getCachedUrls();
  sessionListEl.innerHTML = '';
  for (const s of SESSIONS) {
    const item = document.createElement('div');
    item.className = 'session-item' + (currentSession?.id === s.id ? ' playing' : '');
    const isCached = cachedUrls.has(s.url);
    item.innerHTML = `
      <div class="session-info">
        <div class="session-title">${s.title}</div>
        <div class="session-meta">${s.source} · ${s.type}</div>
      </div>
      <div class="session-duration">${s.duration}</div>
      ${isCached ? '<span class="session-cached" title="Available offline">\u2713</span>' : ''}`;
    item.addEventListener('click', () => playSession(s));
    sessionListEl.appendChild(item);
  }
}

// --- Audio player ---
function playSession(session) {
  currentSession = session;
  audio.src = session.url;
  audio.play().catch(() => {});
  playerEl.classList.add('active');
  playerTitle.textContent = `${session.title} — ${session.source}`;
  playerStatus.textContent = '';
  playerStatus.className = 'player-status';
  playerStatus.innerHTML = '<span class="spinner">\u21BB</span> Loading\u2026';
  playBtn.innerHTML = '\u275A\u275A';
  renderSessions();
  updateMediaSession(session);
  // Auto-cache for offline in the background
  cacheIfNeeded(session.url);
}

async function cacheIfNeeded(url) {
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const existing = await cache.match(url);
    if (existing) return;
    const resp = await fetch(url);
    if (resp.ok) await cache.put(url, resp);
    renderSessions();
    updateCacheSize();
  } catch {}
}

playBtn.addEventListener('click', () => {
  if (!audio.src) return;
  if (audio.paused) { audio.play(); playBtn.innerHTML = '\u275A\u275A'; }
  else { audio.pause(); playBtn.innerHTML = '\u25B6'; }
});

audio.addEventListener('timeupdate', () => {
  if (seeking || !audio.duration) return;
  progressBar.value = (audio.currentTime / audio.duration) * 1000;
  elapsedEl.textContent = guidedFormatTime(audio.currentTime);
  totalTimeEl.textContent = guidedFormatTime(audio.duration);
});

audio.addEventListener('ended', () => {
  playBtn.innerHTML = '\u25B6';
  progressBar.value = 1000;
});

audio.addEventListener('pause', () => { playBtn.innerHTML = '\u25B6'; });
audio.addEventListener('play', () => { playBtn.innerHTML = '\u275A\u275A'; });
audio.addEventListener('playing', () => { playerStatus.textContent = ''; });
audio.addEventListener('waiting', () => { playerStatus.innerHTML = '<span class="spinner">\u21BB</span> Buffering\u2026'; playerStatus.className = 'player-status'; });
audio.addEventListener('error', () => {
  playerStatus.textContent = 'Failed to load audio. The source may be unavailable.';
  playerStatus.className = 'player-status error';
  playBtn.innerHTML = '\u25B6';
});

progressBar.addEventListener('input', () => { seeking = true; });
progressBar.addEventListener('change', () => {
  if (audio.duration) audio.currentTime = (progressBar.value / 1000) * audio.duration;
  seeking = false;
});

playerClose.addEventListener('click', () => {
  audio.pause();
  audio.src = '';
  currentSession = null;
  playerEl.classList.remove('active');
  playBtn.innerHTML = '\u25B6';
  progressBar.value = 0;
  elapsedEl.textContent = '0:00';
  totalTimeEl.textContent = '0:00';
  playerStatus.textContent = '';
  playerStatus.className = 'player-status';
  renderSessions();
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
});

// --- Media Session API (lock screen / background controls) ---
function updateMediaSession(session) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: session.title,
    artist: session.source,
    album: 'Guided Meditation',
  });
  navigator.mediaSession.setActionHandler('play', () => audio.play());
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('seekbackward', () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
  navigator.mediaSession.setActionHandler('seekforward', () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15); });
  navigator.mediaSession.setActionHandler('seekto', (d) => { if (d.seekTime != null) audio.currentTime = d.seekTime; });
  navigator.mediaSession.setActionHandler('stop', () => { playerClose.click(); });
}

// --- Cache management ---
async function getCachedUrls() {
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const keys = await cache.keys();
    return new Set(keys.map(r => r.url));
  } catch { return new Set(); }
}

async function clearCache() {
  try { await caches.delete(AUDIO_CACHE); } catch {}
  renderSessions();
  updateCacheSize();
}

async function updateCacheSize() {
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const est = await navigator.storage.estimate();
      const mb = ((est.usage || 0) / (1024 * 1024)).toFixed(1);
      cacheSizeEl.textContent = `Cached: ~${mb} MB`;
    } else {
      const cache = await caches.open(AUDIO_CACHE);
      const keys = await cache.keys();
      cacheSizeEl.textContent = `Cached: ${keys.length} session${keys.length !== 1 ? 's' : ''}`;
    }
  } catch { cacheSizeEl.textContent = 'Cached: 0 MB'; }
}

cacheClearBtn.addEventListener('click', clearCache);

// --- Keyboard shortcuts for guided view ---
document.addEventListener('keydown', (e) => {
  if (!document.getElementById('guided-view').classList.contains('active')) return;
  if (!audio.src || !currentSession) return;
  if (e.key === ' ') {
    e.preventDefault();
    if (audio.paused) audio.play(); else audio.pause();
  } else if (e.key === 'Escape') {
    playerClose.click();
  }
});

// --- Init guided view on first tab switch ---
let guidedInitialized = false;
document.querySelector('[data-tab="guided"]').addEventListener('click', () => {
  if (!guidedInitialized) {
    guidedInitialized = true;
    renderSessions();
    updateCacheSize();
  }
});

// =============================================
// Service worker
// =============================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
