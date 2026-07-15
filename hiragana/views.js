import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { html } from "./html.js";
import { LEARNED_BOX } from "./srs.js";
import { composeNumber } from "./numbers.js";
import { SECTIONS } from "./model.js";

// Reveal-phase buttons use this on mousedown: a tap otherwise blurs the practice
// input, which on iOS dismisses the keyboard, shrinking visualViewport and
// lurching the card.
const preventBlur = (e) => e.preventDefault();

export function PracticeView({ current, input, setInput, revealed, feedback, handleSubmit, nextCard, speak, inputRef, remaining, learnedCount, totalCount, accuracy, stats, viewportHeight }) {
  const [mnemonicFailed, setMnemonicFailed] = useState(false);

  useEffect(() => {
    setMnemonicFailed(false);
  }, [current?.id]);

  // Keep the input focused across reveals — a blur triggers the iOS keyboard
  // dismissal noted on preventBlur above.
  useEffect(() => {
    inputRef.current?.focus();
  }, [current?.id, revealed, inputRef]);

  // Scale the glyph to fit by measuring its real rendered width (scrollWidth at
  // nowrap), not by assuming ~1em per glyph — correct for any length or glyph mix
  // (small kana, kanji, Latin) with no per-glyph budget. useLayoutEffect so the
  // scale lands before paint, with no overflow flash.
  const glyphRef = useRef(null);
  const [glyphScale, setGlyphScale] = useState(1);
  useLayoutEffect(() => {
    const el = glyphRef.current;
    if (!el) return;
    const box = el.parentElement;
    const pad = getComputedStyle(box);
    const avail = box.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
    const natural = el.scrollWidth;
    setGlyphScale(natural > avail ? avail / natural : 1);
  }, [current?.id, revealed, viewportHeight]);

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
  const statusColor = isCorrect ? "#3a5a3a" : accent;

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

        <div class=${`flex-1 min-h-0 flex flex-col items-center px-4 relative ${revealed ? "justify-center pb-[6vh]" : "justify-start pt-[3vh]"}`} style=${{
          background: isWrong ? "rgba(156, 42, 31, 0.06)" : "rgba(255,253,247,0.5)",
          transition: "background 0.3s",
        }}>
          <div
            key=${current.id}
            ref=${glyphRef}
            lang="ja"
            onClick=${() => revealed && speak(current)}
            class="text-stone-900 select-none leading-none"
            style=${{
              fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif",
              fontWeight: 400,
              fontSize: revealed ? "min(36vh, 55vw)" : "min(30vh, 52vw)",
              whiteSpace: "nowrap",
              transform: `scale(${glyphScale})`,
              transformOrigin: revealed ? "center" : "center top",
              animation: "fadeIn 0.4s ease-out",
              cursor: revealed ? "pointer" : "default",
              transition: "font-size 0.25s ease, transform 0.2s ease",
            }}
          >${current.front}</div>

          ${revealed && feedback && html`
            <div class="text-center mt-3" role="status" aria-live="polite" style=${{ animation: "fadeIn 0.25s ease-out" }}>
              <div class="text-[10px] tracking-[0.3em] uppercase mb-1" style=${{ color: statusColor }}>
                ${isCorrect ? "Correct" : "Answer"}
              </div>
              <div class="flex items-center justify-center gap-3">
                <div class="text-4xl italic" style=${{ color: statusColor, fontWeight: 500 }}>
                  ${feedback.answer}
                </div>
                <button
                  onClick=${() => speak(current)}
                  aria-label="Replay sound"
                  class="w-9 h-9 rounded-full border flex items-center justify-center hover:bg-white/60 transition-colors"
                  style=${{ borderColor: statusColor, color: statusColor }}
                >
                  <${SpeakerIcon} />
                </button>
              </div>
              ${current.reading && current.reading !== current.front && html`
                <div lang="ja" class="text-sm italic text-stone-600 mt-1" style=${{ fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', serif" }}>
                  ${current.reading}
                </div>
              `}
              ${current.gloss && html`
                <div class="text-sm text-stone-600 mt-1">${current.gloss}</div>
              `}
              ${isWrong && html`
                <div class="text-xs italic text-stone-500 mt-2">
                  you typed "${input}"
                </div>
                ${current.hasMnemonic && !mnemonicFailed && html`
                  <img
                    src=${`./mnemonics/${current.answer}.png`}
                    alt=${`Mnemonic for ${current.front}`}
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

      <div class="mt-3 flex-shrink-0 relative">
        ${revealed && html`<button
            onClick=${nextCard}
            onMouseDown=${preventBlur}
            class="w-full py-3 text-sm tracking-[0.3em] uppercase text-white transition-colors"
            style=${{ backgroundColor: statusColor, fontFamily: "inherit" }}
          >
            Continue ↵
          </button>`}
        <form
          onSubmit=${handleSubmit}
          aria-hidden=${revealed}
          class=${revealed ? "absolute inset-0 opacity-0 pointer-events-none" : ""}
        >
          <input
            ref=${inputRef}
            autoFocus
            type="text"
            inputMode="text"
            aria-label="Type the romaji reading"
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
        </form>
      </div>
    </div>
  `;
}

function DoneView({ reviewed, accuracy, learnedCount, totalCount }) {
  return html`
    <div class="flex-1 flex flex-col items-center justify-center text-center px-6" style=${{ animation: "fadeIn 0.4s ease-out" }}>
      <div lang="ja" class="text-stone-900 leading-none mb-6" style=${{
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
    </div>
  `;
}

function SpeakerIcon() {
  return html`
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  `;
}

function rowPreview(row) {
  return row.entries.map(e => e.front).join(" ");
}

export function SettingsView({ enabledRows, toggleRow, cards, onReset, learnedCount, totalCount }) {
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
                      <div lang="ja" class="text-2xl mt-1 text-stone-700 tracking-wider" style=${{ fontFamily: "'Hiragino Mincho ProN', serif" }}>
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

const NUMBER_ROWS = Array.from({ length: 99 }, (_, i) => ({ n: i + 1, ...composeNumber(i + 1) }));

function NumberReference() {
  const [open, setOpen] = useState(false);
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
          Read the pattern, then close. <strong class="not-italic text-stone-700">tens</strong> + <strong lang="ja" class="not-italic text-stone-700">じゅう</strong> + <strong class="not-italic text-stone-700">ones</strong>.
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 mt-2 text-sm">
          ${NUMBER_ROWS.map(r => html`
            <div key=${r.n} class="flex items-baseline gap-2 py-0.5 border-b border-stone-200/60">
              <span class="text-stone-500 tabular-nums w-6 text-right">${r.n}</span>
              <span lang="ja" class="text-stone-900" style=${{ fontFamily: "'Hiragino Mincho ProN', serif" }}>${r.kana}</span>
              <span class="text-stone-500 italic text-xs ml-auto">${r.romaji}</span>
            </div>
          `)}
        </div>
      `}
    </div>
  `;
}
