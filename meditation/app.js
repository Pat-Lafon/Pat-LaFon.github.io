(function () {
// Shared helpers
const breatheView = document.getElementById('breathe-view');
const guidedView = document.getElementById('guided-view');

function formatMMSS(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

// Tab navigation
const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
const views = document.querySelectorAll('.view');

function activateTab(btn) {
  tabBtns.forEach(b => {
    const selected = b === btn;
    b.classList.toggle('active', selected);
    b.setAttribute('aria-selected', selected ? 'true' : 'false');
    b.setAttribute('tabindex', selected ? '0' : '-1');
  });
  views.forEach(v => v.classList.remove('active'));
  document.getElementById(btn.dataset.tab + '-view').classList.add('active');
  // Here, not the click handler, so keyboard arrow-nav also inits the guided view.
  if (btn.dataset.tab === 'guided') initGuidedOnce();
}

tabBtns.forEach((btn, i) => {
  btn.addEventListener('click', () => activateTab(btn));
  btn.addEventListener('keydown', (e) => {
    let target;
    switch (e.key) {
      case 'ArrowRight': target = tabBtns[(i + 1) % tabBtns.length]; break;
      case 'ArrowLeft':  target = tabBtns[(i - 1 + tabBtns.length) % tabBtns.length]; break;
      case 'Home':       target = tabBtns[0]; break;
      case 'End':        target = tabBtns[tabBtns.length - 1]; break;
      default: return;
    }
    e.preventDefault();
    activateTab(target);
    target.focus();
  });
});

// Breathe view (box breathing)
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
let endChimeTimers = [];
// Gate writes in the rAF loop — these change ~1/sec, not every frame.
let lastCount = null;
let lastRemainingSec = null;
let lastSoundUpdate = -Infinity;
const SOUND_UPDATE_MS = 66; // ~15Hz; well under the 0.1s setTargetAtTime constant

function clearEndChimeTimers() {
  endChimeTimers.forEach(clearTimeout);
  endChimeTimers = [];
}

const SIDE = 280;
const PHASE_MS = 4000;

const FILTER_LOW = 180;
const FILTER_HIGH = 700;
const MAX_GAIN = 0.55;
const CHIME_DURATION = 0.6;

// Box-breathing phases in order, indexed by phaseIdx. Per row:
// dot(progress)→[x,y] traces the square's perimeter, sound(progress)→[cutoff,
// gain] drives the noise filter.
const PHASES = [
  { name: 'Inhale', chime: 659,
    dot:   p => [p * SIDE, 0],
    sound: p => [FILTER_LOW + (FILTER_HIGH - FILTER_LOW) * p, MAX_GAIN * (0.15 + 0.85 * p)] },
  { name: 'Hold', chime: 523,
    dot:   p => [SIDE, p * SIDE],
    sound: () => [FILTER_HIGH, MAX_GAIN * 0.5] },
  { name: 'Exhale', chime: 392,
    dot:   p => [SIDE - p * SIDE, SIDE],
    sound: p => [FILTER_HIGH - (FILTER_HIGH - FILTER_LOW) * p, MAX_GAIN * (1 - 0.85 * p) * 0.85 + 0.02] },
  { name: 'Hold', chime: 523,
    dot:   p => [0, SIDE - p * SIDE],
    sound: () => [FILTER_LOW, 0.02] },
];

let runState = 'idle'; // 'idle' | 'running' | 'paused'
let rafId = null;
let phaseIdx = 0;
let phaseStart = 0;
let pauseStartedAt = 0;
let audioCtx = null;
let noiseSource = null;
let filterNodes = [];
let gainNode = null;
let wakeLock = null;

// Keep the screen awake during a session so the phone doesn't lock/dim, which
// would suspend rAF and the audio.
async function requestWakeLock() {
  // `wakeLock` doubles as an in-flight guard: the 'pending' sentinel blocks a
  // concurrent request that would leak the first lock, and the post-await
  // runState re-check releases the lock if the session ended mid-acquire.
  if (!('wakeLock' in navigator) || wakeLock) return;
  wakeLock = 'pending';
  // request() rejects if the document is hidden or the OS denies it — non-fatal.
  let lock = null;
  try { lock = await navigator.wakeLock.request('screen'); }
  catch { /* non-fatal */ }
  if (runState !== 'running') { lock?.release().catch(() => {}); wakeLock = null; return; }
  wakeLock = lock;
}

function releaseWakeLock() {
  if (!wakeLock) return;
  // 'pending' sentinel (acquire in flight) is released by requestWakeLock's
  // post-await check, not here.
  if (typeof wakeLock !== 'string') wakeLock.release().catch(() => {});
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  // rAF freezes while hidden but the AudioContext keeps running; on return the
  // phase clock jumps and skipped chimes fire in a burst. Pause freezes both.
  if (document.visibilityState === 'hidden' && runState === 'running') breathPause();
});

function updateControls() {
  const active = runState !== 'idle';
  startBtn.hidden = active;
  pauseBtn.hidden = runState !== 'running';
  resumeBtn.hidden = runState !== 'paused';
  stopBtn.hidden = !active;
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
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
  }
  // Resume unconditionally, not gated on state==='suspended': after
  // pause→resume the suspend() may not have settled, so a gated resume would
  // skip and leave the context suspended. Control messages run in call order,
  // so an unconditional resume always wins.
  audioCtx.resume();
  if (!noiseSource) {
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.0001;
    // Two-pole lowpass cascade for a steeper rolloff.
    filterNodes = [0, 1].map(() => {
      const f = audioCtx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = FILTER_LOW;
      f.Q.value = 0.5;
      return f;
    });
    noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = createNoiseBuffer(audioCtx);
    noiseSource.loop = true;
    const tail = filterNodes.reduce((node, f) => node.connect(f), noiseSource);
    tail.connect(gainNode).connect(audioCtx.destination);
    noiseSource.start();
  }
}

function vibrate(ms) {
  if (!navigator.vibrate) return;
  navigator.vibrate(ms);
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
  const [cutoff, gain] = PHASES[phaseIdx].sound(progress);
  filterNodes.forEach(f => f.frequency.setTargetAtTime(cutoff, t, 0.1));
  gainNode.gain.setTargetAtTime(Math.max(gain, 0.0001), t, 0.1);
}

function positionDot(progress) {
  const [x, y] = PHASES[phaseIdx].dot(progress);
  dot.style.transform = `translate(${x}px, ${y}px)`;
}

function startPhase() {
  phaseStart = performance.now();
  phaseEl.textContent = PHASES[phaseIdx].name;
  playChime(PHASES[phaseIdx].chime);
  phaseEl.style.transition = 'none';
  phaseEl.style.opacity = '0.4';
  phaseEl.style.transform = 'scale(0.95)';
  requestAnimationFrame(() => {
    phaseEl.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    phaseEl.style.opacity = '1';
    phaseEl.style.transform = 'scale(1)';
  });
}

function updateRemaining(now) {
  const unlimited = sessionMinutes === 0;
  const left = unlimited ? 0 : sessionMinutes * 60 * 1000 - (now - sessionStart);
  const secs = unlimited ? Math.ceil((now - sessionStart) / 1000) : Math.ceil(left / 1000);
  // Only the whole-second value drives the label, so skip the formatMMSS/string
  // build until the second changes.
  if (secs !== lastRemainingSec) {
    lastRemainingSec = secs;
    remainingEl.textContent = unlimited ? `Elapsed ${formatMMSS(secs)}` : `${formatMMSS(secs)} remaining`;
  }
  if (!unlimited && left <= 0 && !sessionEndChimePlayed) {
    sessionEndChimePlayed = true;
    playChime(523);
    // Tracked so a Stop/Start within this 1.4s window cancels them — else stray
    // chimes fire and breathStop(true) marks a fresh session "Complete".
    endChimeTimers.push(
      setTimeout(() => playChime(659), 350),
      setTimeout(() => playChime(784), 700),
      setTimeout(() => breathStop(true), 1400),
    );
  }
}

function loop(now) {
  if (runState !== 'running') return;
  const elapsed = now - phaseStart;
  const progress = Math.min(elapsed / PHASE_MS, 1);
  const count = Math.max(1, Math.ceil((PHASE_MS - elapsed) / 1000));
  if (count !== lastCount) { countEl.textContent = count; lastCount = count; }
  positionDot(progress);
  if (now - lastSoundUpdate >= SOUND_UPDATE_MS) { setBreathSound(progress); lastSoundUpdate = now; }
  updateRemaining(now);
  if (elapsed >= PHASE_MS) { phaseIdx = (phaseIdx + 1) % PHASES.length; startPhase(); }
  rafId = requestAnimationFrame(loop);
}

function breathStart() {
  if (runState !== 'idle') return;
  runState = 'running'; phaseIdx = 0;
  sessionStart = performance.now();
  sessionEndChimePlayed = false;
  clearEndChimeTimers();
  lastCount = null; lastRemainingSec = null; lastSoundUpdate = -Infinity;
  ensureAudio(); startPhase();
  requestWakeLock();
  rafId = requestAnimationFrame(loop);
  updateControls();
}

function breathPause() {
  if (runState !== 'running') return;
  pauseStartedAt = performance.now();
  runState = 'paused';
  if (rafId) cancelAnimationFrame(rafId);
  // Freeze the audio graph rather than tear it down; breathResume resumes it.
  if (audioCtx) audioCtx.suspend();
  releaseWakeLock();
  phaseEl.textContent = 'Paused';
  updateControls();
}

function breathResume() {
  if (runState !== 'paused') return;
  runState = 'running';
  // Advance both clocks past the pause gap so elapsed time excludes it.
  const gap = performance.now() - pauseStartedAt;
  phaseStart += gap;
  sessionStart += gap;
  ensureAudio();
  requestWakeLock();
  phaseEl.textContent = PHASES[phaseIdx].name;
  rafId = requestAnimationFrame(loop);
  updateControls();
}

function stopBreathAudio() {
  if (!noiseSource) return;
  // stop() throws InvalidStateError if the source was already stopped; rethrow anything else.
  try { noiseSource.stop(); } catch (e) { if (e.name !== "InvalidStateError") throw e; }
  noiseSource.disconnect(); noiseSource = null;
  filterNodes.forEach(f => f.disconnect()); filterNodes = [];
  gainNode.disconnect(); gainNode = null;
}

function breathStop(completed = false) {
  runState = 'idle';
  if (rafId) cancelAnimationFrame(rafId);
  clearEndChimeTimers();
  stopBreathAudio();
  releaseWakeLock();
  // Close the AudioContext so it doesn't stay warm in background tabs.
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  phaseEl.textContent = completed ? 'Complete' : 'Ready';
  countEl.textContent = '\u2014';
  dot.style.transform = 'translate(0px, 0px)';
  if (!completed) remainingEl.textContent = '';
  updateControls();
}

chips.forEach(chip => {
  chip.addEventListener('click', () => {
    if (runState !== 'idle') return;
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
  if (!breatheView.classList.contains('active')) return;
  if (e.key === 'Enter') {
    if (runState === 'idle') breathStart();
    else if (runState === 'paused') breathResume();
  } else if (e.key === 'Escape') {
    if (runState !== 'idle') breathStop(false);
  } else if (e.key === ' ') {
    e.preventDefault();
    if (runState === 'running') breathPause();
    else if (runState === 'paused') breathResume();
  }
});

// Guided view — session data, player, caching
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
let loadToken = 0;

function spinner(label) {
  const frag = document.createDocumentFragment();
  const span = document.createElement('span');
  span.className = 'spinner';
  span.textContent = '↻';
  frag.append(span, ` ${label}…`);
  return frag;
}

function setPlayIcon(playing) {
  playBtn.textContent = playing ? '❚❚' : '▶';
  playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
}

// --- Session list rendering ---
// renderSessions does async cache I/O and rebuilds the list (on cache-state
// changes only); renderPlaying just moves the `.playing` highlight, cheap per click.
async function renderSessions() {
  const cachedUrls = await getCachedUrls();
  sessionListEl.replaceChildren();
  for (const s of SESSIONS) {
    const item = el('div', { class: 'session-item' + (currentSession?.id === s.id ? ' playing' : '') },
      el('div', { class: 'session-info' },
        el('div', { class: 'session-title', text: s.title }),
        el('div', { class: 'session-meta', text: `${s.source} · ${s.type}` }),
      ),
      el('div', { class: 'session-duration', text: s.duration }),
      cachedUrls.has(s.url) && el('span', { class: 'session-cached', title: 'Available offline', text: '✓' }),
    );
    item.dataset.sessionId = s.id;
    item.addEventListener('click', () => playSession(s));
    sessionListEl.append(item);
  }
}

function renderPlaying() {
  for (const item of sessionListEl.children) {
    item.classList.toggle('playing', item.dataset.sessionId === currentSession?.id);
  }
}

// --- Audio player ---
function playSession(session) {
  currentSession = session;
  const token = ++loadToken;
  audio.src = session.url;
  audio.play().catch((e) => {
    // A superseded load (rapid switch) already started a newer one — its
    // rejection is stale, ignore. Surface only a current load's failure.
    if (token !== loadToken || e.name === "AbortError") return;
    console.error("audio.play() rejected:", e);
    playerStatus.textContent = `Playback failed: ${e.message || e.name}`;
    playerStatus.className = "player-status error";
  });
  playerEl.classList.add('active');
  playerTitle.textContent = `${session.title} — ${session.source}`;
  playerStatus.replaceChildren(spinner('Loading'));
  renderPlaying();
  updateMediaSession(session);
}

playBtn.addEventListener('click', () => {
  if (!audio.src) return;
  if (audio.paused) audio.play(); else audio.pause();
});

audio.addEventListener('loadedmetadata', () => {
  totalTimeEl.textContent = formatMMSS(audio.duration);
});

audio.addEventListener('timeupdate', () => {
  if (seeking || !audio.duration) return;
  progressBar.value = (audio.currentTime / audio.duration) * 1000;
  elapsedEl.textContent = formatMMSS(audio.currentTime);
});

audio.addEventListener('ended', () => {
  // timeupdate stops just shy of duration; snap the bar and label to the end.
  progressBar.value = 1000;
  elapsedEl.textContent = formatMMSS(audio.duration);
});
audio.addEventListener('pause', () => setPlayIcon(false));
audio.addEventListener('play', () => setPlayIcon(true));
audio.addEventListener('playing', () => { playerStatus.textContent = ''; });
audio.addEventListener('waiting', () => { playerStatus.replaceChildren(spinner('Buffering')); playerStatus.className = 'player-status'; });
// canplaythrough implies the SW cached the audio — re-render so the offline
// checkmark appears.
audio.addEventListener('canplaythrough', () => { renderSessions(); updateCacheSize(); });
audio.addEventListener('error', () => {
  // Ignore the abort from src changing mid-load (rapid switch); a newer load
  // already reset the status.
  if (audio.error?.code === MediaError.MEDIA_ERR_ABORTED) return;
  playerStatus.textContent = 'Failed to load audio. The source may be unavailable.';
  playerStatus.className = 'player-status error';
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
  progressBar.value = 0;
  elapsedEl.textContent = '0:00';
  totalTimeEl.textContent = '0:00';
  playerStatus.textContent = '';
  playerStatus.className = 'player-status';
  renderPlaying();
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
});

// --- Media Session API (lock screen / background controls) ---
// Clamp into the seekable range; duration is NaN until metadata loads, so fall
// back to an open upper bound.
function clampTime(t) {
  const upper = isFinite(audio.duration) ? audio.duration : Infinity;
  return Math.min(upper, Math.max(0, t));
}
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => audio.play());
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('seekbackward', () => { audio.currentTime = clampTime(audio.currentTime - 15); });
  navigator.mediaSession.setActionHandler('seekforward', () => { audio.currentTime = clampTime(audio.currentTime + 15); });
  navigator.mediaSession.setActionHandler('seekto', (d) => {
    const t = Number(d.seekTime);
    if (!isFinite(t)) return;
    audio.currentTime = clampTime(t);
  });
  navigator.mediaSession.setActionHandler('stop', () => { playerClose.click(); });
}

function updateMediaSession(session) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: session.title,
    artist: session.source,
    album: 'Guided Meditation',
  });
}

// --- Cache management ---
async function getCachedUrls() {
  const cache = await caches.open(AUDIO_CACHE);
  const keys = await cache.keys();
  return new Set(keys.map(r => r.url));
}

async function clearCache() {
  await caches.delete(AUDIO_CACHE);
  renderSessions();
  updateCacheSize();
}

async function updateCacheSize() {
  // Count, not bytes: opaque cross-origin responses report blob().size === 0,
  // and storage.estimate() counts all origin storage (precache included).
  const cache = await caches.open(AUDIO_CACHE);
  const keys = await cache.keys();
  cacheSizeEl.textContent = `Cached: ${keys.length} session${keys.length !== 1 ? 's' : ''}`;
}

cacheClearBtn.addEventListener('click', clearCache);

// --- Keyboard shortcuts for guided view ---
document.addEventListener('keydown', (e) => {
  if (!guidedView.classList.contains('active')) return;
  if (!audio.src || !currentSession) return;
  if (e.key === ' ') {
    e.preventDefault();
    if (audio.paused) audio.play(); else audio.pause();
  } else if (e.key === 'Escape') {
    playerClose.click();
  }
});

// --- Init guided view on first activation (click or keyboard) ---
let guidedInitialized = false;
function initGuidedOnce() {
  if (guidedInitialized) return;
  guidedInitialized = true;
  renderSessions();
  updateCacheSize();
}

// Service worker
// Only skip-waiting a new SW when it's safe to swap the precache: audio paused
// and no breathing loop running. On controllerchange we reload to run the new
// assets; `hadController` skips that reload on first install, whose
// clients.claim() also fires controllerchange.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', async () => {
    const reg = await navigator.serviceWorker.register('./sw.js').catch(() => null);
    if (!reg) return;
    const isIdle = () => audio.paused && runState === 'idle';
    const maybeSkip = () => {
      if (reg.waiting && isIdle()) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    };
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed') maybeSkip();
      });
    });
    document.addEventListener('visibilitychange', () => {
      // Home-screen launches resume from a frozen snapshot without re-running
      // load, so poll for a new SW whenever the app comes forward.
      if (document.visibilityState === 'visible') reg.update();
      else maybeSkip();
    });
    audio.addEventListener('pause', maybeSkip);
    audio.addEventListener('ended', maybeSkip);
    maybeSkip();
  });
}
})();
