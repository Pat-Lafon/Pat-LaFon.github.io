import React, { useState, useEffect, useMemo, useRef } from "react";
import htm from "./vendor/htm.js";
import {
  LEARNED_BOX,
  applyGrade,
  isDoneToday,
  pickNext as pickNextPure,
} from "./srs.js";
import { numberEntry, composeNumber } from "./numbers.js";
import {
  hydrateCard,
  loadState as loadStateFromStorage,
  saveState as saveStateToStorage,
  loadStats as loadStatsFromStorage,
  saveStats as saveStatsToStorage,
} from "./storage.js";

const html = htm.bind(React.createElement);

function kanaEntry(kana, romaji) {
  return { id: kana, kana, romaji, prompt: null, alts: null };
}

const COMPOUND_SAMPLER = [11, 14, 17, 19, 25, 34, 47, 56, 63, 79, 88, 99];

// Single source of truth. Each section has a kind (which drives behavior:
// audio playback, mnemonic lookup, anti-cheat). Each row inside a section
// has a unified `entries` shape: { id, kana, romaji, prompt, alts }.
const SECTIONS = [
  {
    name: "Hiragana", kind: "kana",
    rows: [
      { id: "vowels", label: "Vowels",             entries: [kanaEntry("あ","a"),kanaEntry("い","i"),kanaEntry("う","u"),kanaEntry("え","e"),kanaEntry("お","o")] },
      { id: "k",      label: "K-row",              entries: [kanaEntry("か","ka"),kanaEntry("き","ki"),kanaEntry("く","ku"),kanaEntry("け","ke"),kanaEntry("こ","ko")] },
      { id: "s",      label: "S-row",              entries: [kanaEntry("さ","sa"),kanaEntry("し","shi"),kanaEntry("す","su"),kanaEntry("せ","se"),kanaEntry("そ","so")] },
      { id: "t",      label: "T-row",              entries: [kanaEntry("た","ta"),kanaEntry("ち","chi"),kanaEntry("つ","tsu"),kanaEntry("て","te"),kanaEntry("と","to")] },
      { id: "n",      label: "N-row",              entries: [kanaEntry("な","na"),kanaEntry("に","ni"),kanaEntry("ぬ","nu"),kanaEntry("ね","ne"),kanaEntry("の","no")] },
      { id: "h",      label: "H-row",              entries: [kanaEntry("は","ha"),kanaEntry("ひ","hi"),kanaEntry("ふ","fu"),kanaEntry("へ","he"),kanaEntry("ほ","ho")] },
      { id: "m",      label: "M-row",              entries: [kanaEntry("ま","ma"),kanaEntry("み","mi"),kanaEntry("む","mu"),kanaEntry("め","me"),kanaEntry("も","mo")] },
      { id: "y",      label: "Y-row",              entries: [kanaEntry("や","ya"),kanaEntry("ゆ","yu"),kanaEntry("よ","yo")] },
      { id: "r",      label: "R-row",              entries: [kanaEntry("ら","ra"),kanaEntry("り","ri"),kanaEntry("る","ru"),kanaEntry("れ","re"),kanaEntry("ろ","ro")] },
      { id: "w",      label: "W-row + n",          entries: [kanaEntry("わ","wa"),kanaEntry("を","wo"),kanaEntry("ん","n")] },
      { id: "g",      label: "G-row (dakuten)",    entries: [kanaEntry("が","ga"),kanaEntry("ぎ","gi"),kanaEntry("ぐ","gu"),kanaEntry("げ","ge"),kanaEntry("ご","go")] },
      { id: "z",      label: "Z-row (dakuten)",    entries: [kanaEntry("ざ","za"),kanaEntry("じ","ji"),kanaEntry("ず","zu"),kanaEntry("ぜ","ze"),kanaEntry("ぞ","zo")] },
      { id: "d",      label: "D-row (dakuten)",    entries: [kanaEntry("だ","da"),kanaEntry("ぢ","di"),kanaEntry("づ","du"),kanaEntry("で","de"),kanaEntry("ど","do")] },
      { id: "b",      label: "B-row (dakuten)",    entries: [kanaEntry("ば","ba"),kanaEntry("び","bi"),kanaEntry("ぶ","bu"),kanaEntry("べ","be"),kanaEntry("ぼ","bo")] },
      { id: "p",      label: "P-row (handakuten)", entries: [kanaEntry("ぱ","pa"),kanaEntry("ぴ","pi"),kanaEntry("ぷ","pu"),kanaEntry("ぺ","pe"),kanaEntry("ぽ","po")] },
      { id: "ky",     label: "Ky-combo",           entries: [kanaEntry("きゃ","kya"),kanaEntry("きゅ","kyu"),kanaEntry("きょ","kyo")] },
      { id: "sh",     label: "Sh-combo",           entries: [kanaEntry("しゃ","sha"),kanaEntry("しゅ","shu"),kanaEntry("しょ","sho")] },
      { id: "ch",     label: "Ch-combo",           entries: [kanaEntry("ちゃ","cha"),kanaEntry("ちゅ","chu"),kanaEntry("ちょ","cho")] },
      { id: "ny",     label: "Ny-combo",           entries: [kanaEntry("にゃ","nya"),kanaEntry("にゅ","nyu"),kanaEntry("にょ","nyo")] },
      { id: "hy",     label: "Hy-combo",           entries: [kanaEntry("ひゃ","hya"),kanaEntry("ひゅ","hyu"),kanaEntry("ひょ","hyo")] },
      { id: "my",     label: "My-combo",           entries: [kanaEntry("みゃ","mya"),kanaEntry("みゅ","myu"),kanaEntry("みょ","myo")] },
      { id: "ry",     label: "Ry-combo",           entries: [kanaEntry("りゃ","rya"),kanaEntry("りゅ","ryu"),kanaEntry("りょ","ryo")] },
      { id: "gy",     label: "Gy-combo",           entries: [kanaEntry("ぎゃ","gya"),kanaEntry("ぎゅ","gyu"),kanaEntry("ぎょ","gyo")] },
      { id: "jy",     label: "J-combo",            entries: [kanaEntry("じゃ","ja"),kanaEntry("じゅ","ju"),kanaEntry("じょ","jo")] },
      { id: "by",     label: "By-combo",           entries: [kanaEntry("びゃ","bya"),kanaEntry("びゅ","byu"),kanaEntry("びょ","byo")] },
      { id: "py",     label: "Py-combo",           entries: [kanaEntry("ぴゃ","pya"),kanaEntry("ぴゅ","pyu"),kanaEntry("ぴょ","pyo")] },
    ],
  },
  {
    name: "Numbers", kind: "number",
    rows: [
      { id: "num-1-10",     label: "Numbers 1–10",                entries: Array.from({ length: 10 }, (_, i) => numberEntry(i + 1)) },
      { id: "num-tens",     label: "Tens (20–90)",                entries: [20,30,40,50,60,70,80,90].map(numberEntry) },
      { id: "num-compound", label: "Compound numbers (sampler)",  entries: COMPOUND_SAMPLER.map(numberEntry) },
    ],
  },
];

// Flat row list (with section/kind injected) for places that don't care about grouping.
const ROWS = SECTIONS.flatMap(s =>
  s.rows.map(r => ({ ...r, section: s.name, kind: s.kind }))
);

// id → static fields for hydrating lean cards from storage and seeding fresh ones.
export const ROWS_BY_ID = Object.fromEntries(
  ROWS.flatMap(row => row.entries.map(e => [e.id, {
    kana: e.kana, romaji: e.romaji, rowId: row.id,
    kind: row.kind, prompt: e.prompt, alts: e.alts,
  }]))
);

const KANA_TO_ROMAJI = Object.fromEntries(
  Object.values(ROWS_BY_ID).filter(f => f.kind === "kana").map(f => [f.kana, f.romaji]),
);

const DEFAULT_ENABLED = ["vowels", "k"];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
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

function loadInitialState() {
  const saved = loadStateFromStorage(localStorage, ROWS_BY_ID) || {};
  return {
    enabledRows: Array.isArray(saved.enabledRows) && saved.enabledRows.length > 0
      ? saved.enabledRows
      : DEFAULT_ENABLED,
    cards: saved.cards ?? {},
  };
}

export function App() {
  const [initial] = useState(loadInitialState);
  const [today] = useState(todayKey);
  const [enabledRows, setEnabledRows] = useState(initial.enabledRows);
  const [cards, setCards] = useState(initial.cards);
  const [current, setCurrent] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [stats, setStats] = useState(() => loadStatsFromStorage(localStorage, todayKey()));
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
    saveStateToStorage(localStorage, { enabledRows, cards });
  }, [enabledRows, cards]);

  useEffect(() => {
    saveStatsToStorage(localStorage, stats);
  }, [stats]);

  useEffect(() => {
    setCards((prev) => {
      const next = { ...prev };
      let changed = false;
      const freshLean = { box: 1, lastDay: null };
      const enabled = new Set(enabledRows);
      for (const [id, fields] of Object.entries(ROWS_BY_ID)) {
        if (!enabled.has(fields.rowId) || next[id]) continue;
        next[id] = hydrateCard(id, freshLean, ROWS_BY_ID);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [enabledRows]);

  const pickNext = (cardMap = cards, exclude = current?.id) =>
    pickNextPure(cardMap, today, enabledRows, exclude);

  const audioPool = useRef(new Map());
  function speak(card) {
    // Accepts a card object; for number cards we route to TTS with the kana reading
    // (no per-syllable audio file for things like "にじゅういち").
    if (!card) return;
    if (card.kind === "number") { speakViaTTS(card.kana); return; }
    const romaji = KANA_TO_ROMAJI[card.kana];
    if (!romaji) { speakViaTTS(card.kana); return; }
    let audio = audioPool.current.get(romaji);
    if (!audio) {
      audio = new Audio(`./audio/${romaji}.m4a`);
      audioPool.current.set(romaji, audio);
    }
    audio.currentTime = 0;
    audio.play().catch(() => speakViaTTS(card.kana));
  }

  function speakViaTTS(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ja-JP";
    utter.rate = 0.35;
    if (jaVoiceRef.current) utter.voice = jaVoiceRef.current;
    window.speechSynthesis.speak(utter);
  }

  function handleSubmit(e) {
    e?.preventDefault();
    if (!current || revealed) return;
    // Normalize: lowercase + strip all whitespace so "ni juu ichi" === "nijuuichi".
    const guess = input.toLowerCase().replace(/\s+/g, "");
    if (!guess) return;
    // Anti-cheat for number cards: refuse pure-digit input (would bypass recall).
    const digitBypass = current.kind === "number" && /^\d+$/.test(guess);
    const altsForKana = ALT_ROMAJI[current.kana] || [];
    const cardAlts = current.alts || [];
    const correct = !digitBypass && (
      guess === current.romaji.toLowerCase()
      || altsForKana.includes(guess)
      || cardAlts.includes(guess)
    );
    setFeedback({ correct, answer: current.romaji });
    setRevealed(true);
    setStats((s) => ({ ...s, reviewed: s.reviewed + 1, correct: s.correct + (correct ? 1 : 0) }));
    speak(current);
    if (!correct) {
      const updated = applyGrade(current, 0, today);
      setCards((prev) => ({ ...prev, [current.id]: updated }));
    }
  }

  function grade(quality, card = current) {
    if (!card) return;
    const updated = applyGrade(card, quality, today);
    const newCards = { ...cards, [card.id]: updated };
    setCards((prev) => ({ ...prev, [card.id]: updated }));
    setCurrent(pickNext(newCards));
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
    const next = pickNextPure(cards, today, enabledRows, undefined);
    if (next) setCurrent(next);
  }, [current, cards, today, enabledRows]);

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
    setCurrent(null);
  }

  const enabledCards = useMemo(
    () => Object.values(cards).filter(c => enabledRows.includes(c.rowId)),
    [cards, enabledRows],
  );
  // pickNext never re-serves a done card, so this count only falls — safe as a countdown.
  const remaining = useMemo(
    () => enabledCards.filter(c => !isDoneToday(c, today)).length,
    [enabledCards, today],
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
                learnedCount=${learnedCount}
                totalCount=${enabledCards.length}
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
              remaining=${remaining}
              learnedCount=${learnedCount}
              totalCount=${enabledCards.length}
              accuracy=${accuracy}
              stats=${stats}
            />`
        }
      </div>
    </div>
  `;
}

function PracticeView({ current, input, setInput, revealed, feedback, handleSubmit, grade, nextCard, speak, inputRef, remaining, learnedCount, totalCount, accuracy, stats }) {
  const [mnemonicFailed, setMnemonicFailed] = useState(false);

  useEffect(() => {
    setMnemonicFailed(false);
    if (!revealed) inputRef.current?.focus();
  }, [current?.id, revealed, inputRef]);

  if (!current) {
    if (totalCount === 0) {
      return html`
        <div class="text-center py-20 flex-1 flex items-center justify-center">
          <div class="text-stone-700 text-lg italic">No characters enabled. Tap "Rows" to begin.</div>
        </div>
      `;
    }
    return html`<${DoneView} reviewed=${stats.reviewed} accuracy=${accuracy} learnedCount=${learnedCount} totalCount=${totalCount} />`;
  }

  const accent = "#9c2a1f";
  const isWrong = revealed && feedback && !feedback.correct;
  const isCorrect = revealed && feedback && feedback.correct;

  return html`
    <div class="flex-1 flex flex-col min-h-0">
      <div class="flex justify-between items-center text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-2 flex-shrink-0">
        <span><span class="text-stone-800 font-medium">${remaining}</span> to go</span>
        <span>${accuracy !== null
          ? html`Acc <span class="text-stone-800 font-medium">${accuracy}%</span>`
          : html`<span class="opacity-50">Acc —</span>`}</span>
      </div>

      <div class="relative flex-1 min-h-0 flex flex-col">
        <div class="absolute top-0 left-0 w-5 h-5 border-t border-l border-stone-400"></div>
        <div class="absolute top-0 right-0 w-5 h-5 border-t border-r border-stone-400"></div>
        <div class="absolute bottom-0 left-0 w-5 h-5 border-b border-l border-stone-400"></div>
        <div class="absolute bottom-0 right-0 w-5 h-5 border-b border-r border-stone-400"></div>

        <div class=${`flex-1 min-h-0 flex flex-col items-center px-4 relative ${revealed ? "justify-center" : "justify-start pt-[3vh]"}`} style=${{
          background: isWrong ? "rgba(156, 42, 31, 0.06)" : "rgba(255,253,247,0.5)",
          transition: "background 0.3s",
        }}>
          <div
            key=${current.id}
            onClick=${() => revealed && speak(current)}
            class="text-stone-900 select-none leading-none"
            style=${{
              fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif",
              fontWeight: 400,
              fontSize: revealed ? "min(36vh, 55vw)" : "min(30vh, 52vw)",
              animation: "fadeIn 0.4s ease-out",
              cursor: revealed ? "pointer" : "default",
              transition: "font-size 0.25s ease",
            }}
          >${current.prompt ?? current.kana}</div>

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
                  onClick=${() => speak(current)}
                  aria-label="Replay sound"
                  class="w-9 h-9 rounded-full border flex items-center justify-center hover:bg-white/60 transition-colors"
                  style=${{ borderColor: isCorrect ? "#3a5a3a" : accent, color: isCorrect ? "#3a5a3a" : accent }}
                >
                  <${SpeakerIcon} />
                </button>
              </div>
              ${current.kind === "number" && html`
                <div class="text-sm italic text-stone-600 mt-1" style=${{ fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', serif" }}>
                  ${current.kana}
                </div>
              `}
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
                type="text"
                inputMode="text"
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

function DoneView({ reviewed, accuracy, learnedCount, totalCount }) {
  return html`
    <div class="flex-1 flex flex-col items-center justify-center text-center px-6" style=${{ animation: "fadeIn 0.4s ease-out" }}>
      <div class="text-stone-900 leading-none mb-6" style=${{
        fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif",
        fontSize: "min(20vh, 30vw)",
      }}>済</div>
      <div class="text-[10px] tracking-[0.3em] uppercase text-stone-500 mb-2">Caught up for today</div>
      <div class="text-stone-700 text-lg italic mb-8">Come back tomorrow.</div>
      <div class="flex items-stretch divide-x divide-stone-300 text-center">
        <div class="px-5">
          <div class="text-2xl text-stone-900" style=${{ fontWeight: 500 }}>${reviewed}</div>
          <div class="text-[9px] tracking-[0.2em] uppercase text-stone-500 mt-1">Reviewed</div>
        </div>
        <div class="px-5">
          <div class="text-2xl text-stone-900" style=${{ fontWeight: 500 }}>${accuracy !== null ? `${accuracy}%` : "—"}</div>
          <div class="text-[9px] tracking-[0.2em] uppercase text-stone-500 mt-1">Accuracy</div>
        </div>
        <div class="px-5">
          <div class="text-2xl text-stone-900" style=${{ fontWeight: 500 }}>${learnedCount}<span class="text-stone-400 text-lg">/${totalCount}</span></div>
          <div class="text-[9px] tracking-[0.2em] uppercase text-stone-500 mt-1">Learned</div>
        </div>
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

function rowPreview(row) {
  // Unified entry shape: kana cards have prompt: null, numbers have prompt: "21".
  // Show prompt if set, else show the kana characters.
  return row.entries.map(e => e.prompt ?? e.kana).join(" ");
}

function SettingsView({ enabledRows, toggleRow, cards, onReset, learnedCount, totalCount }) {
  return html`
    <div>
      <div class="flex items-baseline justify-between mb-4">
        <div class="text-[10px] tracking-[0.3em] uppercase text-stone-500">
          Toggle rows to add to your practice
        </div>
        <div class="text-[10px] tracking-[0.2em] uppercase text-stone-500">
          <span class="text-stone-800 font-medium">${learnedCount}</span>/${totalCount} learned
        </div>
      </div>
      ${SECTIONS.map(section => html`
        <div key=${section.name} class="mb-6">
          <div class="text-[10px] tracking-[0.3em] uppercase text-stone-700 mb-2 pb-1 border-b border-stone-300" style=${{ fontWeight: 600 }}>
            ${section.name}
          </div>
          <div class="space-y-1">
            ${section.rows.map((row) => {
              const enabled = enabledRows.includes(row.id);
              const total = row.entries.length;
              const rowCards = row.entries.map(e => cards[e.id]).filter(Boolean);
              const learned = rowCards.filter(c => c.box >= LEARNED_BOX).length;
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
                        ${rowPreview(row)}
                      </div>
                    </div>
                  </div>
                  ${enabled && html`
                    <div class="text-right text-[10px] tracking-widest uppercase text-stone-500">
                      <div>${learned}/${total} learned</div>
                    </div>
                  `}
                </button>
              `;
            })}
          </div>
        </div>
      `)}

      <${NumberReference} />

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

function NumberReference() {
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => {
    const out = [];
    for (let i = 1; i <= 99; i++) out.push({ n: i, ...composeNumber(i) });
    return out;
  }, []);
  return html`
    <div class="mt-8 pt-6 border-t border-stone-300">
      <button
        onClick=${() => setOpen(o => !o)}
        aria-expanded=${open}
        class="text-[10px] tracking-[0.3em] uppercase text-stone-700 hover:text-red-800 transition-colors flex items-center gap-2"
        style=${{ fontWeight: 600 }}
      >
        Numbers reference (1–99) <span class="text-stone-400">${open ? "−" : "+"}</span>
      </button>
      ${open && html`
        <div class="mt-3 text-xs text-stone-500 italic mb-3">
          Read the pattern, then close. <strong class="not-italic text-stone-700">tens</strong> + <strong class="not-italic text-stone-700">じゅう</strong> + <strong class="not-italic text-stone-700">ones</strong>.
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 mt-2 text-sm">
          ${rows.map(r => html`
            <div key=${r.n} class="flex items-baseline gap-2 py-0.5 border-b border-stone-200/60">
              <span class="text-stone-500 tabular-nums w-6 text-right">${r.n}</span>
              <span class="text-stone-900" style=${{ fontFamily: "'Hiragino Mincho ProN', serif" }}>${r.kana}</span>
              <span class="text-stone-500 italic text-xs ml-auto">${r.romaji}</span>
            </div>
          `)}
        </div>
      `}
    </div>
  `;
}
