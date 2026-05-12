import React, { useState, useEffect, useMemo, useRef } from "react";
import htm from "./vendor/htm.js";
import {
  LEARNED_BOX,
  applyGrade,
  isCardDue,
  isValidCard,
  makeFreshCard,
  migrateLegacyCard,
  pickNext as pickNextPure,
  rollTodayStats,
} from "./srs.js";

const html = htm.bind(React.createElement);

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

const KANA_TO_ROMAJI = Object.fromEntries(ROWS.flatMap((r) => r.chars));

const DEFAULT_ENABLED = ["vowels", "k"];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Stats format: { date, today: {reviewed, correct}, allTime: {reviewed, correct} }
// Fixed size — never grows. Today rolls into allTime at midnight.
function loadTodayStats() {
  const raw = localStorage.getItem(STATS_KEY);
  if (!raw) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  const rolled = rollTodayStats(parsed, todayKey());
  if (rolled !== parsed) localStorage.setItem(STATS_KEY, JSON.stringify(rolled));
  const s = rolled.today;
  if (s && typeof s.reviewed === "number" && typeof s.correct === "number") return s;
  return null;
}

function saveTodayStats(stats) {
  const raw = localStorage.getItem(STATS_KEY);
  const data = raw ? JSON.parse(raw) : {};
  data.date = data.date || todayKey();
  data.today = stats;
  data.allTime = data.allTime || { reviewed: 0, correct: 0 };
  localStorage.setItem(STATS_KEY, JSON.stringify(data));
}

const ALT_ROMAJI = { "ぢ": ["ji"], "づ": ["zu"], "ふ": ["hu"], "を": ["o"] };

const HAS_MNEMONIC = new Set([
  "あ", "い", "う", "え", "お",
  "か", "き", "く", "け", "こ",
  "さ", "し", "す", "せ", "そ",
  "た", "ち", "つ", "て", "と",
  "な", "に", "ぬ", "ね", "の",
  "は", "ひ", "ふ", "へ", "ほ",
  "ま", "み", "む", "め", "も",
  "や", "ゆ", "よ",
  "ら", "り", "る", "れ", "ろ",
  "わ", "を", "ん",
]);

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!parsed.cards || typeof parsed.cards !== "object") parsed.cards = {};
  for (const [k, v] of Object.entries(parsed.cards)) {
    const migrated = migrateLegacyCard(v);
    if (isValidCard(migrated)) parsed.cards[k] = migrated;
    else delete parsed.cards[k];
  }
  return parsed;
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

function loadInitialState() {
  const saved = loadState() || {};
  return {
    enabledRows: Array.isArray(saved.enabledRows) && saved.enabledRows.length > 0
      ? saved.enabledRows
      : DEFAULT_ENABLED,
    cards: saved.cards ?? {},
    reviewCount: typeof saved.reviewCount === "number" ? saved.reviewCount : 0,
  };
}

export function App() {
  const [initial] = useState(loadInitialState);
  const [enabledRows, setEnabledRows] = useState(initial.enabledRows);
  const [cards, setCards] = useState(initial.cards);
  const [reviewCount, setReviewCount] = useState(initial.reviewCount);
  const [current, setCurrent] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [stats, setStats] = useState(() => loadTodayStats() || { reviewed: 0, correct: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef(null);
  const jaVoiceRef = useRef(null);

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

  useEffect(() => {
    saveState({ enabledRows, cards, reviewCount });
  }, [enabledRows, cards, reviewCount]);

  useEffect(() => {
    saveTodayStats(stats);
  }, [stats]);

  useEffect(() => {
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
  }, [enabledRows]);

  const pickNext = (cardMap = cards, count = reviewCount, exclude = current?.kana) =>
    pickNextPure(cardMap, count, enabledRows, exclude);

  const audioPool = useRef(new Map());
  function speak(kana) {
    const romaji = KANA_TO_ROMAJI[kana];
    if (!romaji) { speakViaTTS(kana); return; }
    let audio = audioPool.current.get(romaji);
    if (!audio) {
      audio = new Audio(`./audio/${romaji}.m4a`);
      audioPool.current.set(romaji, audio);
    }
    audio.currentTime = 0;
    audio.play().catch(() => speakViaTTS(kana));
  }

  function speakViaTTS(kana) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(kana);
    utter.lang = "ja-JP";
    utter.rate = 0.35;
    if (jaVoiceRef.current) utter.voice = jaVoiceRef.current;
    window.speechSynthesis.speak(utter);
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
      const updated = applyGrade(current, 0, reviewCount);
      setCards((prev) => ({ ...prev, [current.kana]: updated }));
      setReviewCount((n) => n + 1);
    }
  }

  function grade(quality, card = current) {
    if (!card) return;
    const updated = applyGrade(card, quality, reviewCount);
    const nextCount = reviewCount + 1;
    const newCards = { ...cards, [card.kana]: updated };
    setCards(newCards);
    setCurrent(pickNext(newCards, nextCount));
    setReviewCount(nextCount);
    setRevealed(false);
    setFeedback(null);
    setInput("");
  }

  function nextCard() {
    setRevealed(false);
    setFeedback(null);
    setInput("");
    setCurrent(pickNext(cards));
  }

  useEffect(() => {
    if (current) return;
    const next = pickNextPure(cards, reviewCount, enabledRows, undefined);
    if (next) setCurrent(next);
  }, [current, cards, reviewCount, enabledRows]);

  // Keep a ref pointing at the latest nextCard closure so the keydown handler
  // can call it without re-binding on every state change (and without the
  // stale-closure trap the old eslint-disable was masking).
  const nextCardRef = useRef(nextCard);
  useEffect(() => { nextCardRef.current = nextCard; });

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Enter" && revealed && feedback && !feedback.correct) {
        e.preventDefault();
        nextCardRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, feedback]);

  function toggleRow(id) {
    setEnabledRows((rows) => rows.includes(id) ? rows.filter(r => r !== id) : [...rows, id]);
  }

  function resetProgress() {
    if (!confirm("Reset all SRS progress? Your enabled rows will stay the same.")) return;
    setCards({});
    setReviewCount(0);
    setCurrent(null);
  }

  const enabledCards = useMemo(
    () => Object.values(cards).filter(c => enabledRows.includes(c.rowId)),
    [cards, enabledRows],
  );
  const dueCount = useMemo(
    () => enabledCards.filter(c => isCardDue(c, reviewCount)).length,
    [enabledCards, reviewCount],
  );
  const learnedCount = useMemo(
    () => enabledCards.filter(c => c.box >= LEARNED_BOX).length,
    [enabledCards],
  );
  const accuracy = useMemo(
    () => stats.reviewed ? Math.round((stats.correct / stats.reviewed) * 100) : null,
    [stats],
  );

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
                reviewCount=${reviewCount}
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
              accuracy=${accuracy}
            />`
        }
      </div>
    </div>
  `;
}

function PracticeView({ current, input, setInput, revealed, feedback, handleSubmit, grade, nextCard, speak, inputRef, dueCount, learnedCount, totalCount, accuracy }) {
  const [mnemonicFailed, setMnemonicFailed] = useState(false);

  useEffect(() => {
    setMnemonicFailed(false);
    if (!revealed) inputRef.current?.focus();
  }, [current?.kana, revealed, inputRef]);

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
                ${HAS_MNEMONIC.has(current.kana) && !mnemonicFailed && html`
                  <img
                    src=${`./mnemonics/${KANA_TO_ROMAJI[current.kana]}.png`}
                    alt=${`Mnemonic for ${current.kana}`}
                    loading="lazy"
                    onError=${() => setMnemonicFailed(true)}
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
                  <${GradeButton} label="Forgot"   sub="box 1" onClick=${() => grade(0)} color="#9c2a1f" />
                  <${GradeButton} label="Slow"     sub="−1"    onClick=${() => grade(1)} color="#7a5a2e" />
                  <${GradeButton} label="Recalled" sub="+1"    onClick=${() => grade(2)} color="#3a5a3a" />
                  <${GradeButton} label="Instant"  sub="+2"    onClick=${() => grade(3)} color="#2e4f6e" />
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
      aria-label=${`${label}, ${sub}`}
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

function SettingsView({ enabledRows, toggleRow, cards, onReset, reviewCount }) {
  return html`
    <div>
      <div class="text-[10px] tracking-[0.3em] uppercase text-stone-500 mb-4">
        Toggle rows to add to your practice
      </div>
      <div class="space-y-1">
        ${ROWS.map((row) => {
          const enabled = enabledRows.includes(row.id);
          const rowCards = row.chars.map(([k]) => cards[k]).filter(Boolean);
          const learned = rowCards.filter(c => c.box >= LEARNED_BOX).length;
          const due = rowCards.filter(c => isCardDue(c, reviewCount)).length;
          return html`
            <button
              key=${row.id}
              onClick=${() => toggleRow(row.id)}
              aria-pressed=${enabled}
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
