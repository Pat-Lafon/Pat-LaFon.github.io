// Unit tests for the word module. Run with `node hiragana/words.test.js`.
//
// The validity test builds the REAL kana deck from deck.json (the same file the
// app imports) rather than a fixture, so a word that references a glyph the deck
// doesn't teach fails here, not in the browser. Words may be hiragana or katakana,
// so the deck set is all kana sections combined.

import assert from "node:assert/strict";
import { scanKana, composeWord, wordEntry, isWordUnlocked, coveredKanaIds } from "./words.js";
import { LEARNED_BOX } from "./srs.js";
import DECK from "./deck.json" with { type: "json" };
import WORDS from "./words.json" with { type: "json" };

const KANA_LOOKUP = {};
for (const section of DECK) {
  for (const row of section.rows) {
    for (const [kana, romaji, alts] of row.entries) {
      KANA_LOOKUP[kana] = { answer: romaji, alts: alts ?? [] };
    }
  }
}
const KANA_IDS = new Set(Object.keys(KANA_LOOKUP));

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); process.exitCode = 1; }
}

// Guard the loader: an empty deck would make every downstream test vacuously pass.
test("loaded the kana deck from deck.json", () => {
  assert.ok(KANA_IDS.size >= 200, `only loaded ${KANA_IDS.size} kana from deck.json`);
  assert.deepEqual(KANA_LOOKUP["ふ"], { answer: "fu", alts: ["hu"] });
  assert.deepEqual(KANA_LOOKUP["コ"], { answer: "ko", alts: [] });
});

// --- scanKana ---
test("scanKana greedily matches combos over their base kana", () => {
  assert.deepEqual(scanKana("でんしゃ", KANA_IDS).map(s => s.id ?? s.kind), ["で", "ん", "しゃ"]);
  assert.deepEqual(scanKana("きょう", KANA_IDS).map(s => s.id ?? s.kind), ["きょ", "う"]);
});
test("scanKana yields sokuon and long marks, not throws", () => {
  assert.deepEqual(scanKana("がっこう", KANA_IDS).map(s => s.id ?? s.kind), ["が", "sokuon", "こ", "う"]);
  assert.deepEqual(scanKana("コーヒー", KANA_IDS).map(s => s.id ?? s.kind), ["コ", "long", "ヒ", "long"]);
});
test("scanKana throws on a glyph that is neither a card nor a known mark", () => {
  assert.throws(() => scanKana("ねX", KANA_IDS), /no card/);
});

// --- composeWord: derivation ---
test("composeWord derives romaji, alts, and requiredChars", () => {
  const r = composeWord("ふゆ", KANA_IDS, KANA_LOOKUP);
  assert.equal(r.romaji, "fuyu");
  assert.ok(r.alts.includes("huyu"), "should accept ふ=hu alt");
  assert.ok(!r.alts.includes("fuyu"), "canonical must not appear in alts");
  assert.deepEqual(r.requiredChars, ["ふ", "ゆ"]);
});
test("composeWord dedupes repeated kana in requiredChars", () => {
  const r = composeWord("ちち", KANA_IDS, KANA_LOOKUP);
  assert.deepEqual(r.requiredChars, ["ち"]);
  assert.equal(r.romaji, "chichi");
});

// --- composeWord: sokuon (っ/ッ) doubles the next consonant ---
test("composeWord geminates the next consonant after a sokuon", () => {
  assert.equal(composeWord("がっこう", KANA_IDS, KANA_LOOKUP).romaji, "gakkou");
  assert.equal(composeWord("ざっし", KANA_IDS, KANA_LOOKUP).romaji, "zasshi");
  assert.equal(composeWord("スイッチ", KANA_IDS, KANA_LOOKUP).romaji, "suitchi"); // ch → tchi
  assert.deepEqual(composeWord("がっこう", KANA_IDS, KANA_LOOKUP).requiredChars, ["が", "こ", "う"]); // no ッ card
});
test("composeWord accepts the un-doubled spelling as an alt", () => {
  const r = composeWord("がっこう", KANA_IDS, KANA_LOOKUP);
  assert.ok(r.alts.includes("gakou"), "learner omitting gemination should still match");
});

// --- composeWord: long vowel (ー) lengthens the previous vowel ---
test("composeWord lengthens the previous vowel on ー", () => {
  assert.equal(composeWord("コーヒー", KANA_IDS, KANA_LOOKUP).romaji, "koohii");
  assert.equal(composeWord("サッカー", KANA_IDS, KANA_LOOKUP).romaji, "sakkaa");
  const r = composeWord("コーヒー", KANA_IDS, KANA_LOOKUP);
  assert.ok(r.alts.includes("kohi"), "collapsed vowels should still match");
  assert.deepEqual(r.requiredChars, ["コ", "ヒ"]); // no ー card
});

// --- composeWord: moraic ん before b/p/m grows a Hepburn m-form alt ---
test("composeWord accepts the Hepburn m-form of ん before b/p/m", () => {
  const shinbun = composeWord("しんぶん", KANA_IDS, KANA_LOOKUP);
  assert.equal(shinbun.romaji, "shinbun", "n stays canonical");
  assert.ok(shinbun.alts.includes("shimbun"), "textbook shimbun should match");
  assert.ok(composeWord("さんぽ", KANA_IDS, KANA_LOOKUP).alts.includes("sampo"));
  assert.ok(composeWord("せんぱい", KANA_IDS, KANA_LOOKUP).alts.includes("sempai"));
  assert.ok(composeWord("ハンバーガー", KANA_IDS, KANA_LOOKUP).alts.includes("hambaagaa"));
  // ん before a non-labial keeps only n — no spurious m-form.
  const konnyaku = composeWord("こんにゃく", KANA_IDS, KANA_LOOKUP);
  assert.equal(konnyaku.romaji, "konnyaku");
  assert.ok(!konnyaku.alts.some((a) => a.includes("m")), "no m-form before に");
});

// --- composeWord: explicit override ---
test("composeWord override replaces the derived romaji but keeps derived requiredChars", () => {
  const r = composeWord("こんばんは", KANA_IDS, KANA_LOOKUP, { romaji: "konbanwa", alts: ["konbanha"] });
  assert.equal(r.romaji, "konbanwa");
  assert.deepEqual(r.alts, ["konbanha"]);
  assert.deepEqual(r.requiredChars, ["こ", "ん", "ば", "は"]);
});

// --- The dataset itself ---
test("every WORD decomposes against the real kana deck", () => {
  for (const w of WORDS) {
    const r = composeWord(w.kana, KANA_IDS, KANA_LOOKUP, w); // throws on any orphan glyph
    assert.ok(r.romaji.length > 0, `empty romaji for ${w.kana}`);
    assert.ok(!r.alts.includes(r.romaji), `canonical leaked into alts for ${w.kana}`);
    assert.ok(w.gloss && w.gloss.length > 0, `missing gloss for ${w.kana}`);
  }
});
test("WORDS reaches the 200+ target and has unique ids", () => {
  assert.ok(WORDS.length >= 200, `only ${WORDS.length} words`);
  const ids = WORDS.map(w => `word-${w.kana}`);
  assert.equal(new Set(ids).size, ids.length, "duplicate word kana");
});

// --- wordEntry shape ---
test("wordEntry: kana front, derived romaji answer, TTS + no mnemonic", () => {
  const e = wordEntry({ kana: "ねこ", gloss: "cat" }, KANA_IDS, KANA_LOOKUP);
  assert.equal(e.id, "word-ねこ");
  assert.equal(e.front, "ねこ");
  assert.equal(e.answer, "neko");
  assert.equal(e.reading, null);
  assert.equal(e.audioKey, null);
  assert.equal(e.hasMnemonic, false);
  assert.equal(e.gloss, "cat");
  assert.equal(e.rowId, "words");
  assert.deepEqual(e.requiredChars, ["ね", "こ"]);
});

// --- isWordUnlocked ---
test("isWordUnlocked gates on requiredChars: learned AND their row enabled", () => {
  const e = wordEntry({ kana: "ねこ", gloss: "cat" }, KANA_IDS, KANA_LOOKUP); // ね→n, こ→k
  const rows = ["n", "k"];
  const learned = { "ね": { box: LEARNED_BOX, rowId: "n" }, "こ": { box: LEARNED_BOX, rowId: "k" } };
  assert.equal(isWordUnlocked(e, learned, rows), true);
  assert.equal(isWordUnlocked(e, { "ね": { box: LEARNED_BOX, rowId: "n" }, "こ": { box: LEARNED_BOX - 1, rowId: "k" } }, rows), false);
  assert.equal(isWordUnlocked(e, {}, rows), false, "missing kana card → locked");
  assert.equal(isWordUnlocked(e, learned, ["n"]), false, "row disabled → locked even though learned");
});

// --- coveredKanaIds (kana retirement) ---
test("coveredKanaIds is the union of unlocked words' requiredChars", () => {
  const neko = { ...wordEntry({ kana: "ねこ", gloss: "cat" }, KANA_IDS, KANA_LOOKUP), box: 1 };
  const inu = { ...wordEntry({ kana: "いぬ", gloss: "dog" }, KANA_IDS, KANA_LOOKUP), box: 1 };
  const cardMap = {
    "ね": { id: "ね", box: LEARNED_BOX, rowId: "n" },
    "こ": { id: "こ", box: LEARNED_BOX, rowId: "k" },
    "い": { id: "い", box: LEARNED_BOX, rowId: "vowels" },
    "ぬ": { id: "ぬ", box: LEARNED_BOX - 1, rowId: "n" }, // いぬ stays locked
    [neko.id]: neko,
    [inu.id]: inu,
  };
  const covered = coveredKanaIds(cardMap, ["n", "k", "vowels", "words"]);
  assert.deepEqual([...covered].sort(), ["こ", "ね"]);
});
test("coveredKanaIds un-covers when a constituent kana drops below learned", () => {
  const neko = { ...wordEntry({ kana: "ねこ", gloss: "cat" }, KANA_IDS, KANA_LOOKUP), box: 4 };
  const cardMap = {
    "ね": { id: "ね", box: 1, rowId: "n" }, // knocked back by a missed word
    "こ": { id: "こ", box: LEARNED_BOX, rowId: "k" },
    [neko.id]: neko,
  };
  assert.equal(coveredKanaIds(cardMap, ["n", "k", "words"]).size, 0);
});

// Retirement rests on word coverage, so pin the residue: a kana earns a word only
// if a genuinely useful one (everyday vocab, N5-level) contains it. These combos
// have none — their only candidates are proper nouns (ミャンマー, ピョンヤン,
// モーツァルト), dated spellings (ラヂオ), or obscura (ビャクダン) — so they carry
// no word and keep drilling daily as bare kana instead. A new deck kana without a
// covering word fails here — author a useful word or add it to this list
// deliberately.
test("every deck kana except the known wordless residue appears in ≥1 word", () => {
  const covered = new Set();
  for (const w of WORDS) {
    for (const s of scanKana(w.kana, KANA_IDS)) if (s.kind === "kana") covered.add(s.id);
  }
  const uncovered = [...KANA_IDS].filter(k => !covered.has(k)).sort();
  const residue = [
    "みゅ",
    "ヂ", "ヅ", "ヒャ", "ミャ", "ビャ", "ビョ", "ピャ", "ピョ", "リョ",
    "ヴェ", "ドゥ", "ツァ", "ツィ", "ツェ", "ツォ", "イェ",
  ];
  assert.deepEqual(uncovered, residue.sort());
});

console.log(`PASS: ${passed} word tests`);
