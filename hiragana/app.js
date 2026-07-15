import { useState, useEffect, useMemo, useRef } from "react";
import { html } from "./html.js";
import {
  LEARNED_BOX,
  applyGrade,
  isDoneToday,
  resetBoxes,
  pickNext as pickNextPure,
} from "./srs.js";
import { isWordUnlocked, WORDS_ROW_ID } from "./words.js";
import {
  saveState as saveStateToStorage,
  loadStats as loadStatsFromStorage,
  saveStats as saveStatsToStorage,
} from "./storage.js";
import {
  ALWAYS_ON_ROWS,
  todayKey,
  freshCardsFor,
  loadInitialState,
} from "./model.js";
import { checkAnswer } from "./match.js";
import { useAudio } from "./audio.js";
import { PracticeView, SettingsView } from "./views.js";

// Pin the app to the keyboard-visible region: `height` shrinks the container into
// it, `offsetTop` cancels the pan iOS applies when focusing the bottom input (which
// would otherwise push the card off the top). iOS reports that pan as a
// visualViewport `scroll`, not `resize`, so both events are needed.
function useViewport() {
  const [viewport, setViewport] = useState(() => ({
    height: window.visualViewport?.height ?? window.innerHeight,
    offsetTop: window.visualViewport?.offsetTop ?? 0,
  }));
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewport((prev) =>
      prev.height === vv.height && prev.offsetTop === vv.offsetTop
        ? prev
        : { height: vv.height, offsetTop: vv.offsetTop });
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return viewport;
}

export function App() {
  const [initial] = useState(loadInitialState);
  const [today] = useState(todayKey);
  const [enabledRows, setEnabledRows] = useState(initial.enabledRows);
  const [cards, setCards] = useState(initial.cards);
  const [current, setCurrent] = useState(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState(null);
  const revealed = feedback !== null;
  const [stats, setStats] = useState(() => loadStatsFromStorage(localStorage, todayKey()));
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef(null);
  const viewport = useViewport();
  const viewportHeight = viewport.height;
  const speak = useAudio();

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
      for (const [id, card] of Object.entries(freshCardsFor(enabledRows))) {
        if (next[id]) continue;
        next[id] = card;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [enabledRows]);

  // Word cards ride along on top of the user's toggled rows, gated per-card.
  const effectiveRows = useMemo(() => [...enabledRows, ...ALWAYS_ON_ROWS], [enabledRows]);
  const wordAvailable = (cardMap) => (c) => c.rowId !== WORDS_ROW_ID || isWordUnlocked(c, cardMap, effectiveRows);
  const pickNext = (cardMap = cards, exclude = current?.id) =>
    pickNextPure(cardMap, today, effectiveRows, exclude, wordAvailable(cardMap));

  function handleSubmit(e) {
    e?.preventDefault();
    if (!current || revealed) return;
    const { correct, empty } = checkAnswer(input, current);
    if (empty) return;
    setFeedback({ correct, answer: current.answer });
    setStats((s) => ({ ...s, reviewed: s.reviewed + 1, correct: s.correct + (correct ? 1 : 0) }));
    speak(current);
    setCards((prev) => {
      const graded = { ...prev, [current.id]: applyGrade(current, correct, today) };
      // Missing a word knocks its constituent kana back so the weak letters resurface.
      return !correct && current.requiredChars ? resetBoxes(graded, current.requiredChars) : graded;
    });
  }

  function nextCard() {
    setFeedback(null);
    setInput("");
    setCurrent(pickNext(cards));
  }

  useEffect(() => {
    if (current) return;
    const next = pickNextPure(cards, today, effectiveRows, undefined, wordAvailable(cards));
    if (next) setCurrent(next);
  }, [current, cards, today, effectiveRows]);

  // Hold the latest nextCard so the keydown listener needn't re-bind each render.
  const nextCardRef = useRef(nextCard);
  useEffect(() => { nextCardRef.current = nextCard; });

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Enter" && feedback) {
        e.preventDefault();
        nextCardRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [feedback]);

  function toggleRow(id) {
    setEnabledRows((rows) => rows.includes(id) ? rows.filter(r => r !== id) : [...rows, id]);
  }

  function resetProgress() {
    if (!confirm("Reset all SRS progress? Your enabled rows will stay the same.")) return;
    setCards(freshCardsFor(enabledRows));
    setCurrent(null);
    setFeedback(null);
    setInput("");
  }

  // Locked words are excluded so they don't inflate the "to go" and "learned"
  // counts before their kana are learned.
  const enabledCards = useMemo(
    () => Object.values(cards).filter(c =>
      effectiveRows.includes(c.rowId) && wordAvailable(cards)(c)),
    [cards, effectiveRows],
  );
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
    <div class="w-full flex flex-col overflow-hidden" style=${{
      height: `${viewportHeight}px`,
      transform: `translateY(${viewport.offsetTop}px)`,
      willChange: "transform",
      background: "radial-gradient(ellipse at top, #f5efe2 0%, #ebe2cf 60%, #ddd0b3 100%)",
      fontFamily: "'EB Garamond', 'Hiragino Mincho ProN', 'Yu Mincho', serif",
    }}>
      <div class="fixed inset-0 pointer-events-none opacity-30 mix-blend-multiply" style=${{
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.3 0 0 0 0 0.25 0 0 0 0 0.18 0 0 0 0.4 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
      }} />

      <div class="relative max-w-2xl w-full mx-auto px-5 pt-4 pb-3 flex-1 flex flex-col min-h-0">
        <header class="flex items-center justify-between mb-3 flex-shrink-0">
          <h1 class="text-base text-stone-900" style=${{ fontWeight: 500, letterSpacing: "-0.01em" }}>
            <span lang="ja">かな</span> <span class="text-stone-400 mx-0.5">·</span> <span class="italic text-stone-600 text-sm">kana</span>
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
              nextCard=${nextCard}
              speak=${speak}
              inputRef=${inputRef}
              remaining=${remaining}
              learnedCount=${learnedCount}
              totalCount=${enabledCards.length}
              accuracy=${accuracy}
              stats=${stats}
              viewportHeight=${viewportHeight}
            />`
        }
      </div>
    </div>
  `;
}
