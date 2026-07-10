// The card catalog and its persistence glue. Pure (no React) so app.js and the
// view modules build from one source, and so it's testable in Node.
//
// Kana rows are data (deck.json); numbers are generated (composeNumber, no static
// table); word cards derive from the kana deck (words.js). SECTIONS drives the
// Settings toggles; ROWS_BY_ID maps id → static card fields for storage rehydration.

import { numberEntry } from "./numbers.js";
import { wordEntry, WORDS_ROW_ID } from "./words.js";
import deckData from "./deck.json" with { type: "json" };
import WORDS from "./words.json" with { type: "json" };
import { hydrateCard, loadState as loadStateFromStorage } from "./storage.js";

// Card kinds differ only in derived fields: hiragana cards claim a mnemonic (the
// mnemonics/ pngs teach the hiragana shape) and name their audio by romaji
// (audio/ka.m4a); katakana shares that same recording but not the shape; extended
// "foreign" rows (ファ, ヴ, チェ …) have no recording, so audioKey null makes
// speak() fall back to on-device TTS. reading is null throughout — the glyph is its
// own prompt. The offline test keys audio coverage off this same kind → foreign
// distinction, so those cards demand no nonexistent audio/{romaji}.m4a.
const ENTRY_BY_KIND = {
  hiragana: (kana, romaji, alts = []) => ({ id: kana, front: kana, answer: romaji, alts, reading: null, audioKey: romaji, hasMnemonic: true }),
  katakana: (kana, romaji, alts = []) => ({ id: kana, front: kana, answer: romaji, alts, reading: null, audioKey: romaji, hasMnemonic: false }),
  foreign:  (kana, romaji, alts = []) => ({ id: kana, front: kana, answer: romaji, alts, reading: null, audioKey: null, hasMnemonic: false }),
};

// Kana sections are data (deck.json), imported so the Node tests read the same
// source of truth. Each entry tuple is [kana, romaji, alts?].
const KANA_SECTIONS = deckData.map((s) => ({
  name: s.name,
  rows: s.rows.map((row) => ({
    id: row.id,
    label: row.label,
    entries: row.entries.map(([kana, romaji, alts]) => ENTRY_BY_KIND[s.kind](kana, romaji, alts)),
  })),
}));

const COMPOUND_SAMPLER = [11, 14, 17, 19, 25, 34, 47, 56, 63, 79, 88, 99];

// Numbers are generated (composeNumber), not a static table, so they stay in code.
const NUMBERS_SECTION = {
  name: "Numbers",
  rows: [
    { id: "num-1-10",     label: "Numbers 1–10",               entries: Array.from({ length: 10 }, (_, i) => numberEntry(i + 1)) },
    { id: "num-tens",     label: "Tens (20–90)",               entries: [20, 30, 40, 50, 60, 70, 80, 90].map(numberEntry) },
    { id: "num-compound", label: "Compound numbers (sampler)", entries: COMPOUND_SAMPLER.map(numberEntry) },
  ],
};

export const SECTIONS = [...KANA_SECTIONS, NUMBERS_SECTION];

// Word cards derive their romaji/alts/required-chars from the kana deck, so build
// them from every kana section's own entries — the single source of kana truth. A
// hiragana word's required chars are hiragana ids and a katakana word's are
// katakana ids, so each unlocks when its own script's rows are learned. Words are
// not a SECTION (no Settings toggle); they're always-on and gated per-card by
// isWordUnlocked instead.
const KANA_ENTRIES = KANA_SECTIONS.flatMap(s => s.rows).flatMap(row => row.entries);
const KANA_IDS = new Set(KANA_ENTRIES.map(e => e.id));
const KANA_LOOKUP = Object.fromEntries(KANA_ENTRIES.map(e => [e.id, { answer: e.answer, alts: e.alts }]));
const WORD_CARDS = WORDS.map(w => wordEntry(w, KANA_IDS, KANA_LOOKUP));

// id → static card fields; hydrateCard rebuilds full cards from these. Word cards
// carry two extra fields (gloss, requiredChars) that ride through hydration.
const ROWS_BY_ID = Object.fromEntries([
  ...SECTIONS.flatMap(s => s.rows).flatMap(row => row.entries.map(e => [e.id, {
    front: e.front, answer: e.answer, alts: e.alts,
    reading: e.reading, audioKey: e.audioKey, hasMnemonic: e.hasMnemonic, rowId: row.id,
  }])),
  ...WORD_CARDS.map(e => [e.id, {
    front: e.front, answer: e.answer, alts: e.alts,
    reading: e.reading, audioKey: e.audioKey, hasMnemonic: e.hasMnemonic, rowId: e.rowId,
    gloss: e.gloss, requiredChars: e.requiredChars,
  }]),
]);

// The words "row" is always in the pool; individual words stay hidden until
// isWordUnlocked passes, so this never floods the deck before any kana are learned.
export const ALWAYS_ON_ROWS = [WORDS_ROW_ID];

const DEFAULT_ENABLED = ["vowels", "k"];

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function loadInitialState() {
  const saved = loadStateFromStorage(localStorage, ROWS_BY_ID) || {};
  return {
    enabledRows: Array.isArray(saved.enabledRows) && saved.enabledRows.length > 0
      ? saved.enabledRows
      : DEFAULT_ENABLED,
    cards: saved.cards ?? {},
  };
}

export function freshCardsFor(enabledRows) {
  const freshLean = { box: 1, lastDay: null };
  const enabled = new Set([...enabledRows, ...ALWAYS_ON_ROWS]);
  const out = {};
  for (const [id, fields] of Object.entries(ROWS_BY_ID)) {
    if (enabled.has(fields.rowId)) out[id] = hydrateCard(id, freshLean, ROWS_BY_ID);
  }
  return out;
}
