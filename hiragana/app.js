import React, { useState, useEffect, useRef } from "react";
import htm from "./vendor/htm.js";

const html = htm.bind(React.createElement);

// ============================================================
// Hiragana table - rows organized for progressive learning
// ============================================================
const ROWS = [
  { id: "vowels", label: "Vowels",            chars: [["あ","a"],["い","i"],["う","u"],["え","e"],["お","o"]] },
  { id: "k",      label: "K-row",             chars: [["か","ka"],["き","ki"],["く","ku"],["け","ke"],["こ","ko"]] },
  { id: "s",      label: "S-row",             chars: [["さ","sa"],["し","shi"],["す","su"],["せ","se"],["そ","so"]] },
  { id: "t",      label: "T-row",             chars: [["た","ta"],["ち","chi"],["つ","tsu"],["て","te"],["と","to"]] },
  { id: "n",      label: "N-row",             chars: [["な","na"],["に","ni"],["ぬ","nu"],["ね","ne"],["の","no"]] },
  { id: "h",      label: "H-row",             chars: [["は","ha"],["ひ","hi"],["ふ","fu"],["へ","he"],["ほ","ho"]] },
  { id: "m",      label: "M-row",             chars: [["ま","ma"],["み","mi"],["む","mu"],["め","me"],["も","mo"]] },
  { id: "y",      label: "Y-row",             chars: [["や","ya"],["ゆ","yu"],["よ","yo"]] },
  { id: "r",      label: "R-row",             chars: [["ら","ra"],["り","ri"],["る","ru"],["れ","re"],["ろ","ro"]] },
  { id: "w",      label: "W-row + n",         chars: [["わ","wa"],["を","wo"],["ん","n"]] },
  { id: "g",      label: "G-row (dakuten)",   chars: [["が","ga"],["ぎ","gi"],["ぐ","gu"],["げ","ge"],["ご","go"]] },
  { id: "z",      label: "Z-row (dakuten)",   chars: [["ざ","za"],["じ","ji"],["ず","zu"],["ぜ","ze"],["ぞ","zo"]] },
  { id: "d",      label: "D-row (dakuten)",   chars: [["だ","da"],["ぢ","di"],["づ","du"],["で","de"],["ど","do"]] },
  { id: "b",      label: "B-row (dakuten)",   chars: [["ば","ba"],["び","bi"],["ぶ","bu"],["べ","be"],["ぼ","bo"]] },
  { id: "p",      label: "P-row (handakuten)",chars: [["ぱ","pa"],["ぴ","pi"],["ぷ","pu"],["ぺ","pe"],["ぽ","po"]] },
  { id: "ky",     label: "Ky-combo",          chars: [["きゃ","kya"],["きゅ","kyu"],["きょ","kyo"]] },
  { id: "sh",     label: "Sh-combo",          chars: [["しゃ","sha"],["しゅ","shu"],["しょ","sho"]] },
  { id: "ch",     label: "Ch-combo",          chars: [["ちゃ","cha"],["ちゅ","chu"],["ちょ","cho"]] },
  { id: "ny",     label: "Ny-combo",          chars: [["にゃ","nya"],["にゅ","nyu"],["にょ","nyo"]] },
  { id: "hy",     label: "Hy-combo",          chars: [["ひゃ","hya"],["ひゅ","hyu"],["ひょ","hyo"]] },
  { id: "my",     label: "My-combo",          chars: [["みゃ","mya"],["みゅ","myu"],["みょ","myo"]] },
  { id: "ry",     label: "Ry-combo",          chars: [["りゃ","rya"],["りゅ","ryu"],["りょ","ryo"]] },
  { id: "gy",     label: "Gy-combo",          chars: [["ぎゃ","gya"],["ぎゅ","gyu"],["ぎょ","gyo"]] },
  { id: "jy",     label: "J-combo",           chars: [["じゃ","ja"],["じゅ","ju"],["じょ","jo"]] },
  { id: "by",     label: "By-combo",          chars: [["びゃ","bya"],["びゅ","byu"],["びょ","byo"]] },
  { id: "py",     label: "Py-combo",          chars: [["ぴゃ","pya"],["ぴゅ","pyu"],["ぴょ","pyo"]] },
];

const STORAGE_KEY = "hiragana-srs";
const STATS_KEY = "hiragana-stats";

// Migrate from old versioned keys (one-time cleanup)
(function migrateKeys() {
  try {
    const legacyKeys = ["hiragana-srs-v1", "hiragana-stats-v1", "hiragana-stats-v2"];
    for (const old of legacyKeys) {
      const data = localStorage.getItem(old);
      if (!data) continue;
      const newKey = old.startsWith("hiragana-srs") ? STORAGE_KEY : STATS_KEY;
      if (!localStorage.getItem(newKey)) localStorage.setItem(newKey, data);
      localStorage.removeItem(old);
    }
  } catch (e) { /* skip */ }
})();
const DEFAULT_ENABLED = ["vowels", "k"];
const DAY_MS = 24 * 60 * 60 * 1000;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Stats format: { date, today: {reviewed, correct}, allTime: {reviewed, correct} }
// Fixed size — never grows. Today rolls into allTime at midnight.
function loadTodayStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    // If it's a new day, roll today into allTime and reset
    if (data.date !== todayKey()) {
      const allTime = data.allTime || { reviewed: 0, correct: 0 };
      const prev = data.today || { reviewed: 0, correct: 0 };
      allTime.reviewed += prev.reviewed;
      allTime.correct += prev.correct;
      data.date = todayKey();
      data.today = { reviewed: 0, correct: 0 };
      data.allTime = allTime;
      localStorage.setItem(STATS_KEY, JSON.stringify(data));
    }
    const s = data.today;
    if (s && typeof s.reviewed === "number" && typeof s.correct === "number") return s;
    return null;
  } catch (e) { return null; }
}

function saveTodayStats(stats) {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    const data = raw ? JSON.parse(raw) : {};
    data.date = data.date || todayKey();
    data.today = stats;
    data.allTime = data.allTime || { reviewed: 0, correct: 0 };
    localStorage.setItem(STATS_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("saveTodayStats failed:", e);
  }
}

// ============================================================
// SM-2-ish spaced repetition algorithm
// ============================================================
function scheduleCard(card, quality) {
  // quality: 0=again, 1=hard, 2=good, 3=easy
  let { ease = 2.5, interval = 0, reps = 0, lapses = 0 } = card;
  if (quality === 0) {
    reps = 0;
    interval = 0;
    lapses += 1;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    if (quality === 1) ease = Math.max(1.3, ease - 0.15);
    if (quality === 3) ease = ease + 0.15;
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = quality === 1 ? 2 : 3;
    else interval = Math.round(interval * ease * (quality === 1 ? 0.8 : quality === 3 ? 1.3 : 1));
  }
  const due = interval === 0 ? Date.now() + 30 * 1000 : Date.now() + interval * DAY_MS;
  return { ...card, ease, interval, reps, lapses, due, lastReviewed: Date.now() };
}

// Alternate accepted romaji (pronunciation-based aliases for typing variants)
const ALT_ROMAJI = { "ぢ": ["ji"], "づ": ["zu"], "ふ": ["hu"], "を": ["o"] };

// Mnemonic images — shown on wrong answers for base hiragana
const MNEMONICS = {
  "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
  "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
  "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
  "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
  "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
  "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
  "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
  "や": "ya", "ゆ": "yu", "よ": "yo",
  "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
  "わ": "wa", "を": "wo", "ん": "n",
};

function makeFreshCard(kana, romaji, rowId) {
  return { kana, romaji, rowId, ease: 2.5, interval: 0, reps: 0, lapses: 0, due: Date.now(), lastReviewed: 0 };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// localStorage wrappers — actually reliable, unlike artifact storage
// ============================================================
function isValidCard(c) {
  return c && typeof c.kana === "string" && typeof c.romaji === "string"
    && typeof c.ease === "number" && typeof c.interval === "number"
    && typeof c.reps === "number" && typeof c.due === "number";
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.cards && typeof parsed.cards === "object") {
      for (const [k, v] of Object.entries(parsed.cards)) {
        if (!isValidCard(v)) delete parsed.cards[k];
      }
    }
    return parsed;
  } catch (e) {
    console.warn("loadState failed:", e);
    return null;
  }
}

// Max storage budget: 500KB. Actual usage is ~15KB.
// Headroom for katakana, kanji, vocabulary.
// If we exceed this, the data is corrupt — refuse to write garbage.
const MAX_STORAGE_BYTES = 500 * 1024;

function saveState(state) {
  const json = JSON.stringify(state);
  if (json.length > MAX_STORAGE_BYTES) {
    throw new Error(`saveState: data exceeds ${MAX_STORAGE_BYTES} bytes (${json.length}). Data may be corrupt.`);
  }
  localStorage.setItem(STORAGE_KEY, json);
}

// ============================================================
// Main App
// ============================================================
export function App() {
  const [enabledRows, setEnabledRows] = useState(DEFAULT_ENABLED);
  const [cards, setCards] = useState({});
  const [current, setCurrent] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [stats, setStats] = useState(() => loadTodayStats() || { reviewed: 0, correct: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef(null);
  const jaVoiceRef = useRef(null);

  // Preload Japanese voice (voices load asynchronously in some browsers)
  useEffect(() => {
    function findJaVoice() {
      const voices = window.speechSynthesis?.getVoices() || [];
      const v = voices.find(v => v.lang === "ja-JP" || v.lang.startsWith("ja"));
      if (v) jaVoiceRef.current = v;
    }
    findJaVoice();
    window.speechSynthesis?.addEventListener("voiceschanged", findJaVoice);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", findJaVoice);
  }, []);

  // tick clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  // Enter to continue from wrong-answer
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Enter" && revealed && feedback && !feedback.correct) {
        e.preventDefault();
        nextCard();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, feedback]);

  // Load from localStorage on mount (synchronous, simple, reliable)
  useEffect(() => {
    const saved = loadState();
    if (saved) {
      if (Array.isArray(saved.enabledRows) && saved.enabledRows.length > 0) {
        setEnabledRows(saved.enabledRows);
      }
      if (saved.cards && typeof saved.cards === "object") {
        setCards(saved.cards);
      }
    }
    setLoaded(true);
  }, []);

  // Save on any change
  useEffect(() => {
    if (!loaded) return;
    saveState({ enabledRows, cards });
  }, [enabledRows, cards, loaded]);

  // Save stats on change
  useEffect(() => {
    if (!loaded) return;
    saveTodayStats(stats);
  }, [stats, loaded]);

  // Ensure cards exist for every char in enabled rows
  useEffect(() => {
    if (!loaded) return;
    setCards((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const row of ROWS) {
        if (!enabledRows.includes(row.id)) continue;
        for (const [kana, romaji] of row.chars) {
          if (!next[kana]) {
            next[kana] = makeFreshCard(kana, romaji, row.id);
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [enabledRows, loaded]);

  function pickNext(cardMap = cards, exclude = current?.kana) {
    const all = Object.values(cardMap).filter((c) => enabledRows.includes(c.rowId));
    const pool = all.length > 1 ? all.filter((c) => c.kana !== exclude) : all;
    if (pool.length === 0) return null;
    const due = pool.filter((c) => c.due <= Date.now());
    const candidates = due.length ? due : pool;
    const sorted = [...candidates].sort((a, b) => a.due - b.due);
    const top = sorted.slice(0, Math.max(3, Math.ceil(sorted.length * 0.3)));
    return shuffle(top)[0];
  }

  useEffect(() => {
    if (loaded && !current) {
      const next = pickNext();
      if (next) setCurrent(next);
    }
  }, [loaded, cards, enabledRows]);

  function speak(kana) {
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(kana);
      utter.lang = "ja-JP";
      utter.rate = 0.35;
      if (jaVoiceRef.current) utter.voice = jaVoiceRef.current;
      window.speechSynthesis.speak(utter);
    } catch (e) { /* skip */ }
  }

  function handleSubmit(e) {
    e?.preventDefault();
    if (!current || revealed) return;
    const guess = input.trim().toLowerCase();
    if (!guess) return;
    const alts = ALT_ROMAJI[current.kana] || [];
    const correct = guess === current.romaji.toLowerCase() || alts.includes(guess);
    setFeedback({ correct, answer: current.romaji });
    setRevealed(true);
    setStats((s) => ({ reviewed: s.reviewed + 1, correct: s.correct + (correct ? 1 : 0) }));
    speak(current.kana);
    if (!correct) {
      const updated = scheduleCard(current, 0);
      setCards((prev) => ({ ...prev, [current.kana]: updated }));
    }
  }

  function grade(quality, card = current) {
    if (!card) return;
    const updated = scheduleCard(card, quality);
    setCards((prev) => {
      const newCards = { ...prev, [card.kana]: updated };
      setCurrent(pickNext(newCards));
      return newCards;
    });
    setRevealed(false);
    setFeedback(null);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function nextCard() {
    setRevealed(false);
    setFeedback(null);
    setInput("");
    setCurrent(pickNext(cards));
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function toggleRow(id) {
    setEnabledRows((rows) => rows.includes(id) ? rows.filter(r => r !== id) : [...rows, id]);
  }

  function resetProgress() {
    if (!confirm("Reset all SRS progress? Your enabled rows will stay the same.")) return;
    setCards({});
    setCurrent(null);
  }

  const enabledCards = Object.values(cards).filter(c => enabledRows.includes(c.rowId));
  const dueCount = enabledCards.filter(c => c.due <= now).length;
  const learnedCount = enabledCards.filter(c => c.reps >= 2).length;
  const accuracy = stats.reviewed ? Math.round((stats.correct / stats.reviewed) * 100) : null;

  return html`
    <div class="w-full flex flex-col" style=${{
      minHeight: "100svh",
      height: "100svh",
      background: "radial-gradient(ellipse at top, #f5efe2 0%, #ebe2cf 60%, #ddd0b3 100%)",
      fontFamily: "'EB Garamond', 'Hiragino Mincho ProN', 'Yu Mincho', serif",
    }}>
      <div class="fixed inset-0 pointer-events-none opacity-30 mix-blend-multiply" style=${{
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.3 0 0 0 0 0.25 0 0 0 0 0.18 0 0 0 0.4 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
      }} />

      <div class="relative max-w-2xl w-full mx-auto px-5 pt-4 pb-3 flex-1 flex flex-col min-h-0">
        <header class="flex items-center justify-between mb-3 flex-shrink-0">
          <h1 class="text-base text-stone-900" style=${{ fontWeight: 500, letterSpacing: "-0.01em" }}>
            ひらがな <span class="text-stone-400 mx-0.5">·</span> <span class="italic text-stone-600 text-sm">hiragana</span>
          </h1>
          <button
            onClick=${() => setShowSettings(s => !s)}
            class="text-[10px] tracking-[0.2em] uppercase text-stone-600 hover:text-red-700 transition-colors border-b border-stone-400 hover:border-red-700 pb-0.5"
          >
            ${showSettings ? "Practice" : "Rows"}
          </button>
        </header>

        ${showSettings
          ? html`<div class="overflow-y-auto flex-1 min-h-0">
              <${SettingsView}
                enabledRows=${enabledRows}
                toggleRow=${toggleRow}
                cards=${cards}
                onReset=${resetProgress}
                now=${now}
              />
            </div>`
          : html`<${PracticeView}
              current=${current}
              input=${input}
              setInput=${setInput}
              revealed=${revealed}
              feedback=${feedback}
              handleSubmit=${handleSubmit}
              grade=${grade}
              nextCard=${nextCard}
              speak=${speak}
              inputRef=${inputRef}
              dueCount=${dueCount}
              learnedCount=${learnedCount}
              totalCount=${enabledCards.length}
              stats=${stats}
              accuracy=${accuracy}
            />`
        }
      </div>
    </div>
  `;
}

// ============================================================
// Practice view
// ============================================================
function PracticeView({ current, input, setInput, revealed, feedback, handleSubmit, grade, nextCard, speak, inputRef, dueCount, learnedCount, totalCount, accuracy }) {
  if (!current) {
    return html`
      <div class="text-center py-20 flex-1 flex items-center justify-center">
        <div class="text-stone-700 text-lg italic">No characters enabled. Tap "Rows" to begin.</div>
      </div>
    `;
  }

  const accent = "#9c2a1f";
  const isWrong = revealed && feedback && !feedback.correct;
  const isCorrect = revealed && feedback && feedback.correct;

  return html`
    <div class="flex-1 flex flex-col min-h-0">
      <div class="flex justify-between items-center text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-2 flex-shrink-0">
        <span>Due <span class="text-stone-800 font-medium">${dueCount}</span></span>
        <span>Learned <span class="text-stone-800 font-medium">${learnedCount}</span>/${totalCount}</span>
        <span>${accuracy !== null
          ? html`Acc <span class="text-stone-800 font-medium">${accuracy}%</span>`
          : html`<span class="opacity-50">Acc —</span>`}</span>
      </div>

      <div class="relative flex-1 min-h-0 flex flex-col">
        <div class="absolute top-0 left-0 w-5 h-5 border-t border-l border-stone-400"></div>
        <div class="absolute top-0 right-0 w-5 h-5 border-t border-r border-stone-400"></div>
        <div class="absolute bottom-0 left-0 w-5 h-5 border-b border-l border-stone-400"></div>
        <div class="absolute bottom-0 right-0 w-5 h-5 border-b border-r border-stone-400"></div>

        <div class="flex-1 min-h-0 flex flex-col items-center justify-center px-4 relative" style=${{
          background: isWrong ? "rgba(156, 42, 31, 0.06)" : "rgba(255,253,247,0.5)",
          transition: "background 0.3s",
        }}>
          <div
            key=${current.kana}
            onClick=${() => revealed && speak(current.kana)}
            class="text-stone-900 select-none leading-none"
            style=${{
              fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif",
              fontWeight: 400,
              fontSize: revealed ? "min(36vh, 55vw)" : "min(48vh, 70vw)",
              animation: "fadeIn 0.4s ease-out",
              cursor: revealed ? "pointer" : "default",
              transition: "font-size 0.25s ease",
            }}
          >${current.kana}</div>

          ${revealed && feedback && html`
            <div class="text-center mt-3" style=${{ animation: "fadeIn 0.25s ease-out" }}>
              <div class="text-[10px] tracking-[0.3em] uppercase mb-1" style=${{ color: isCorrect ? "#3a5a3a" : accent }}>
                ${isCorrect ? "Correct" : "Answer"}
              </div>
              <div class="flex items-center justify-center gap-3">
                <div class="text-4xl italic" style=${{ color: isCorrect ? "#3a5a3a" : accent, fontWeight: 500 }}>
                  ${feedback.answer}
                </div>
                <button
                  onClick=${() => speak(current.kana)}
                  aria-label="Replay sound"
                  class="w-9 h-9 rounded-full border flex items-center justify-center hover:bg-white/60 transition-colors"
                  style=${{ borderColor: isCorrect ? "#3a5a3a" : accent, color: isCorrect ? "#3a5a3a" : accent }}
                >
                  <${SpeakerIcon} />
                </button>
              </div>
              ${isWrong && html`
                <div class="text-xs italic text-stone-500 mt-2">
                  you typed "${input}"
                </div>
                ${MNEMONICS[current.kana] && html`
                  <img
                    src=${`./mnemonics/${MNEMONICS[current.kana]}.png`}
                    alt=${`Mnemonic for ${current.kana}`}
                    loading="lazy"
                    onError=${(e) => { e.target.style.display = 'none'; }}
                    class="mt-3 rounded-lg shadow-sm"
                    style=${{ maxWidth: "200px", maxHeight: "200px", margin: "12px auto 0" }}
                  />
                `}
              `}
            </div>
          `}
        </div>
      </div>

      <div class="mt-3 flex-shrink-0">
        ${!revealed
          ? html`<form onSubmit=${handleSubmit}>
              <input
                ref=${inputRef}
                autoFocus
                value=${input}
                onChange=${(e) => setInput(e.target.value)}
                placeholder="type romaji…"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck=${false}
                enterKeyHint="go"
                class="w-full text-center text-xl py-3 bg-transparent border-b-2 border-stone-400 focus:border-stone-900 outline-none italic text-stone-900 placeholder:text-stone-400 placeholder:italic transition-colors"
                style=${{ fontFamily: "'EB Garamond', serif" }}
              />
            </form>`
          : isWrong
            ? html`<button
                onClick=${nextCard}
                class="w-full py-3 text-sm tracking-[0.3em] uppercase text-white transition-colors"
                style=${{ backgroundColor: accent, fontFamily: "inherit" }}
              >
                Continue ↵
              </button>`
            : html`<div>
                <div class="text-center text-[9px] tracking-[0.3em] uppercase text-stone-500 mb-2">
                  How well did you know it?
                </div>
                <div class="grid grid-cols-4 gap-2">
                  <${GradeButton} label="Again" sub="<1m" onClick=${() => grade(0)} color="#9c2a1f" />
                  <${GradeButton} label="Hard"  sub="2d"  onClick=${() => grade(1)} color="#7a5a2e" />
                  <${GradeButton} label="Good"  sub="3d"  onClick=${() => grade(2)} color="#3a5a3a" />
                  <${GradeButton} label="Easy"  sub="5d+" onClick=${() => grade(3)} color="#2e4f6e" />
                </div>
              </div>`
        }
      </div>

      <style>${`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  `;
}

function GradeButton({ label, sub, onClick, color }) {
  return html`
    <button
      onClick=${onClick}
      class="py-3 px-2 border border-stone-300 hover:border-stone-700 transition-all bg-white/40 hover:bg-white/70 group"
    >
      <div class="text-sm" style=${{ color, fontWeight: 500 }}>${label}</div>
      <div class="text-[9px] tracking-widest uppercase text-stone-500 mt-0.5">${sub}</div>
    </button>
  `;
}

function SpeakerIcon() {
  return html`
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  `;
}

// ============================================================
// Settings view
// ============================================================
function SettingsView({ enabledRows, toggleRow, cards, onReset, now }) {
  return html`
    <div>
      <div class="text-[10px] tracking-[0.3em] uppercase text-stone-500 mb-4">
        Toggle rows to add to your practice
      </div>
      <div class="space-y-1">
        ${ROWS.map((row) => {
          const enabled = enabledRows.includes(row.id);
          const rowCards = row.chars.map(([k]) => cards[k]).filter(Boolean);
          const learned = rowCards.filter(c => c.reps >= 2).length;
          const due = rowCards.filter(c => c.due <= now).length;
          return html`
            <button
              key=${row.id}
              onClick=${() => toggleRow(row.id)}
              class=${`w-full text-left flex items-center justify-between py-3 px-4 transition-all border ${
                enabled ? "border-stone-800 bg-stone-900/5" : "border-stone-300 hover:border-stone-500 bg-white/30"
              }`}
            >
              <div class="flex items-center gap-4">
                <div
                  class="w-3 h-3 rounded-full border"
                  style=${enabled ? { backgroundColor: "#9c2a1f", borderColor: "#9c2a1f" } : { borderColor: "#a8a29e" }}
                />
                <div>
                  <div class="text-stone-900" style=${{ fontWeight: 500 }}>${row.label}</div>
                  <div class="text-2xl mt-1 text-stone-700 tracking-wider" style=${{ fontFamily: "'Hiragino Mincho ProN', serif" }}>
                    ${row.chars.map(([k]) => k).join(" ")}
                  </div>
                </div>
              </div>
              ${enabled && html`
                <div class="text-right text-[10px] tracking-widest uppercase text-stone-500">
                  <div>${learned}/${row.chars.length} learned</div>
                  ${due > 0 && html`<div class="mt-0.5" style=${{ color: "#9c2a1f" }}>${due} due</div>`}
                </div>
              `}
            </button>
          `;
        })}
      </div>

      <div class="mt-10 pt-6 border-t border-stone-300">
        <button
          onClick=${onReset}
          class="text-xs tracking-[0.25em] uppercase text-stone-500 hover:text-red-800 transition-colors block"
        >
          Reset all progress
        </button>
      </div>
    </div>
  `;
}
