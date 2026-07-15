// Whole-word reading cards, layered on top of the single-kana deck. Pure module
// (no DOM/React/storage) so it runs in Node tests; the deck is injected as
// `cardIds` + `lookup` rather than imported, since it lives in deck.json/app.js.
// The word list itself is data — hiragana/words.json.
//
// A word entry is { kana, gloss }. romaji/alts/requiredChars are DERIVED from the
// deck by scanning the kana into its card glyphs (greedy longest-match, so a combo
// like しゃ resolves to the しゃ card, not し+ゃ) and combining each token's own
// romaji/alts via combineRomaji (romaji.js, shared with numbers). This is why the
// list can't drift out of sync with the deck: there is no hand-authored romaji to
// fall stale. A word may still carry an explicit { romaji, alts } override for the
// rare spelling derivation can't reach (e.g. a particle は read "wa").
//
// Two marks that aren't cards are handled inline rather than rejected:
//   ー (chōonpu) lengthens the preceding vowel — コーヒー → koohii
//   っ / ッ (sokuon) doubles the following consonant — サッカー → sakkaa
// Neither is a requiredChar (there's no card to learn), so a word unlocks on its
// real kana alone. Moraic ん before a b/p/m sound also grows a Hepburn `m` alt
// (しんぶん → shimbun) so the textbook spelling matches while `n` stays canonical.

import { LEARNED_BOX } from "./srs.js";
import { combineRomaji } from "./romaji.js";

export const WORDS_ROW_ID = "words";

const SOKUON = new Set(["っ", "ッ"]);
const LONG_VOWEL = new Set(["ー"]);
const MORAIC_N = new Set(["ん", "ン"]);

// Scan a kana string into an ordered sequence of kana-card / sokuon / long marks.
// Throws on any run that matches no card and isn't a known mark — the loud signal
// that a word needs a glyph the deck doesn't teach (a small kana standing alone, a
// typo).
export function scanKana(kana, cardIds) {
  let maxLen = 1;
  for (const id of cardIds) if (id.length > maxLen) maxLen = id.length;

  const seq = [];
  let i = 0;
  while (i < kana.length) {
    const ch = kana[i];
    if (SOKUON.has(ch)) { seq.push({ kind: "sokuon" }); i++; continue; }
    if (LONG_VOWEL.has(ch)) { seq.push({ kind: "long" }); i++; continue; }

    let matched = null;
    for (let len = Math.min(maxLen, kana.length - i); len >= 1; len--) {
      const slice = kana.slice(i, i + len);
      if (cardIds.has(slice)) { matched = slice; break; }
    }
    if (matched === null) {
      throw new Error(`scanKana: no card for "${ch}" in "${kana}"`);
    }
    seq.push({ kind: "kana", id: matched });
    i += matched.length;
  }
  return seq;
}

// Hepburn sokuon doubling: ち→tchi, つ→ttsu, し→sshi, か→kka. ch is the only
// consonant that doubles to a different letter (t), not by repeating its head.
function geminate(romaji) {
  if (romaji.startsWith("ch")) return "t" + romaji;
  return romaji[0] + romaji;
}

// { requiredChars, romaji, alts } for a kana word. requiredChars (real kana only,
// deduped) drives the unlock gate; romaji is the canonical answer; alts is every
// other spelling the matcher should accept. Each kana contributes its answer + its
// own alts; a sokuon doubles the next token's options, a long vowel lengthens the
// previous token's — both keep the plain form as an accepted alt, so a learner who
// omits the gemination/lengthening still matches. An explicit override.romaji, when
// present, replaces the derived answer (override.alts or none), but requiredChars is
// always derived so the unlock gate stays honest.
export function composeWord(kana, cardIds, lookup, override) {
  const seq = scanKana(kana, cardIds);
  const requiredChars = [...new Set(seq.filter((s) => s.kind === "kana").map((s) => s.id))];

  // Each segment carries its romaji options, canonical first.
  const segments = [];
  let pendingSokuon = false;
  for (const s of seq) {
    if (s.kind === "sokuon") { pendingSokuon = true; continue; }
    if (s.kind === "long") {
      if (segments.length === 0) throw new Error(`composeWord: ー with no preceding kana in "${kana}"`);
      const seg = segments[segments.length - 1];
      seg.options = seg.options.flatMap((o) => [o + o[o.length - 1], o]);
      continue;
    }
    const base = lookup[s.id];
    let options = [base.answer, ...(base.alts || [])];
    if (pendingSokuon) {
      options = options.flatMap((o) => [geminate(o), o]);
      pendingSokuon = false;
    }
    segments.push({ options, moraicN: MORAIC_N.has(s.id) });
  }
  if (pendingSokuon) throw new Error(`composeWord: trailing sokuon in "${kana}"`);

  // ん before a b/p/m sound: add the Hepburn `m` spelling as an alt. `n` is the
  // first option so it stays canonical; the alt just lets the textbook form match.
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i].moraicN && /^[bpm]/.test(segments[i + 1].options[0])) {
      segments[i].options = [...segments[i].options, "m"];
    }
  }

  const { canonical, alts: derivedAlts } = combineRomaji(segments.map((s) => s.options));
  const romaji = override?.romaji ?? canonical;
  const alts = override?.romaji ? (override.alts ?? []) : derivedAlts;

  return { requiredChars, romaji, alts };
}

// Static card fields for a word. reading null (the kana word is its own prompt,
// like a bare kana); audioKey null (no recording); hasMnemonic false (no per-word
// mnemonic image). requiredChars + gloss ride through ROWS_BY_ID and rehydrate onto
// the card.
export function wordEntry(word, cardIds, lookup) {
  const { requiredChars, romaji, alts } = composeWord(word.kana, cardIds, lookup, word);
  return {
    id: `word-${word.kana}`,
    front: word.kana,
    answer: romaji,
    alts,
    reading: null,
    audioKey: null,
    hasMnemonic: false,
    gloss: word.gloss,
    requiredChars,
    rowId: WORDS_ROW_ID,
  };
}

// A word is available for practice once every kana it's built from is both learned
// AND still in an enabled row — disabling a row hides its words too, not just its
// kana. A missing card (its row never enabled) reads as box 0 → locked.
export function isWordUnlocked(card, cardMap, enabledRows) {
  const enabled = new Set(enabledRows);
  return card.requiredChars.every((id) => {
    const c = cardMap[id];
    return c && enabled.has(c.rowId) && c.box >= LEARNED_BOX;
  });
}
