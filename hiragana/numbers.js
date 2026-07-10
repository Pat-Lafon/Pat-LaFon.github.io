// Number composition for 1–99. Pure module — no DOM, React, or storage.
// Atom readings are the modern counting forms; `alts` lists classical/short
// alternatives the matcher should also accept.

import { combineRomaji } from "./romaji.js";

export const NUMBER_ATOMS = {
  1:  { kana: "いち",   romaji: "ichi",  alts: [] },
  2:  { kana: "に",     romaji: "ni",    alts: [] },
  3:  { kana: "さん",   romaji: "san",   alts: [] },
  4:  { kana: "よん",   romaji: "yon",   alts: ["shi"] },
  5:  { kana: "ご",     romaji: "go",    alts: [] },
  6:  { kana: "ろく",   romaji: "roku",  alts: [] },
  7:  { kana: "なな",   romaji: "nana",  alts: ["shichi"] },
  8:  { kana: "はち",   romaji: "hachi", alts: [] },
  9:  { kana: "きゅう", romaji: "kyuu",  alts: ["kyu", "ku"] },
  // jyuu/jyu are wāpuro romaji (what IMEs accept for じゅ); learners trained
  // on a Japanese keyboard reach for them.
  10: { kana: "じゅう", romaji: "juu",   alts: ["ju", "jyuu", "jyu"] },
};

export function composeNumber(n) {
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    throw new Error(`composeNumber: ${n} out of range (1–99)`);
  }
  if (n <= 10) {
    const a = NUMBER_ATOMS[n];
    return { kana: a.kana, romaji: a.romaji, alts: [...a.alts] };
  }
  const tensDigit = Math.floor(n / 10);
  const onesDigit = n % 10;
  const juu = NUMBER_ATOMS[10];
  const parts = n < 20
    ? [juu, NUMBER_ATOMS[n - 10]]
    : onesDigit === 0
      ? [NUMBER_ATOMS[tensDigit], juu]
      : [NUMBER_ATOMS[tensDigit], juu, NUMBER_ATOMS[onesDigit]];
  const kana = parts.map(p => p.kana).join("");
  const { canonical, alts } = combineRomaji(parts.map(p => [p.romaji, ...p.alts]));
  return { kana, romaji: canonical, alts };
}

export function numberEntry(n) {
  const { kana, romaji, alts } = composeNumber(n);
  // reading carries the kana so it can be spoken (TTS) and shown on reveal; the
  // digit string is the prompt the learner reads from.
  return { id: `num-${n}`, front: String(n), answer: romaji, alts, reading: kana, audioKey: null };
}
