// Unit tests for the pure SRS module. Run with `node hiragana/srs.test.js`.

import assert from "node:assert/strict";
import {
  BOX_CADENCE,
  MAX_BOX,
  LEARNED_BOX,
  applyGrade,
  isCardDue,
  isValidCard,
  makeFreshCard,
  migrateLegacyCard,
  pickNext,
  rollTodayStats,
} from "./srs.js";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
}

// --- makeFreshCard ---
test("makeFreshCard produces a valid box-1 card", () => {
  const c = makeFreshCard("あ", "a", "vowels");
  assert.equal(c.kana, "あ");
  assert.equal(c.romaji, "a");
  assert.equal(c.rowId, "vowels");
  assert.equal(c.box, 1);
  assert.equal(c.lastReviewedAt, -1);
  assert.ok(isValidCard(c));
});

// --- applyGrade ---
test("applyGrade(0) resets to box 1", () => {
  const c = { kana: "か", romaji: "ka", rowId: "k", box: 4, lastReviewedAt: 10 };
  assert.equal(applyGrade(c, 0, 99).box, 1);
});
test("applyGrade(1) demotes one box, floored at 1", () => {
  assert.equal(applyGrade({ box: 3, lastReviewedAt: 0 }, 1, 5).box, 2);
  assert.equal(applyGrade({ box: 1, lastReviewedAt: 0 }, 1, 5).box, 1);
});
test("applyGrade(2) promotes one box, capped at MAX_BOX", () => {
  assert.equal(applyGrade({ box: 2, lastReviewedAt: 0 }, 2, 5).box, 3);
  assert.equal(applyGrade({ box: MAX_BOX, lastReviewedAt: 0 }, 2, 5).box, MAX_BOX);
});
test("applyGrade(3) promotes two boxes, capped at MAX_BOX", () => {
  assert.equal(applyGrade({ box: 2, lastReviewedAt: 0 }, 3, 5).box, 4);
  assert.equal(applyGrade({ box: MAX_BOX - 1, lastReviewedAt: 0 }, 3, 5).box, MAX_BOX);
});
test("applyGrade records reviewCount on lastReviewedAt", () => {
  assert.equal(applyGrade({ box: 1, lastReviewedAt: -1 }, 2, 42).lastReviewedAt, 42);
});

// --- isCardDue ---
test("isCardDue: gap >= cadence is due", () => {
  // box 1, cadence 1: needs (reviewCount - lastReviewedAt) >= 1.
  assert.equal(isCardDue({ box: 1, lastReviewedAt: 5 }, 6), true);
  assert.equal(isCardDue({ box: 1, lastReviewedAt: 5 }, 5), false);
});
test("isCardDue: higher boxes need longer gaps", () => {
  for (let box = 1; box <= MAX_BOX; box++) {
    const cadence = BOX_CADENCE[box];
    assert.equal(isCardDue({ box, lastReviewedAt: 0 }, cadence), true, `box ${box} at cadence`);
    assert.equal(isCardDue({ box, lastReviewedAt: 0 }, cadence - 1), false, `box ${box} below cadence`);
  }
});

// --- isValidCard ---
test("isValidCard rejects malformed entries", () => {
  assert.equal(!!isValidCard(null), false);
  assert.equal(!!isValidCard({}), false);
  assert.equal(!!isValidCard({ kana: 1, romaji: "a", box: 1, lastReviewedAt: 0 }), false);
  assert.equal(isValidCard({ kana: "あ", romaji: "a", box: 1, lastReviewedAt: 0 }), true);
});

// --- migrateLegacyCard ---
test("migrateLegacyCard leaves new-shape cards alone", () => {
  const c = { kana: "あ", romaji: "a", rowId: "vowels", box: 3, lastReviewedAt: 10 };
  assert.equal(migrateLegacyCard(c), c);
});
test("migrateLegacyCard maps reps→box and clamps to MAX_BOX", () => {
  const legacy = { kana: "あ", romaji: "a", rowId: "vowels", reps: 0 };
  assert.equal(migrateLegacyCard(legacy).box, 1);
  assert.equal(migrateLegacyCard({ ...legacy, reps: 2 }).box, 3);
  assert.equal(migrateLegacyCard({ ...legacy, reps: 99 }).box, MAX_BOX);
});

// --- pickNext ---
test("pickNext returns null when no enabled cards exist", () => {
  const cards = { "あ": makeFreshCard("あ", "a", "vowels") };
  assert.equal(pickNext(cards, 0, ["k"]), null);
  assert.equal(pickNext({}, 0, ["vowels"]), null);
});
test("pickNext respects enabledRows filter", () => {
  const cards = {
    "あ": makeFreshCard("あ", "a", "vowels"),
    "か": makeFreshCard("か", "ka", "k"),
  };
  const picked = pickNext(cards, 5, ["k"]);
  assert.equal(picked.rowId, "k");
});
test("pickNext excludes the previous kana when pool > 1", () => {
  const cards = {
    "あ": makeFreshCard("あ", "a", "vowels"),
    "い": makeFreshCard("い", "i", "vowels"),
  };
  for (let i = 0; i < 20; i++) {
    assert.notEqual(pickNext(cards, 5, ["vowels"], "あ").kana, "あ");
  }
});
test("pickNext returns the only card when pool == 1, even if excluded", () => {
  const cards = { "あ": makeFreshCard("あ", "a", "vowels") };
  assert.equal(pickNext(cards, 5, ["vowels"], "あ").kana, "あ");
});
test("pickNext prefers due cards over non-due", () => {
  // box-1 card seen at review 0; at reviewCount=5 it's due. box-5 card seen
  // at review 0; at reviewCount=5 it's NOT due (cadence 16).
  const cards = {
    "あ": { kana: "あ", romaji: "a", rowId: "vowels", box: 1, lastReviewedAt: 0 },
    "い": { kana: "い", romaji: "i", rowId: "vowels", box: 5, lastReviewedAt: 0 },
  };
  for (let i = 0; i < 20; i++) {
    assert.equal(pickNext(cards, 5, ["vowels"]).kana, "あ");
  }
});

// --- rollTodayStats ---
test("rollTodayStats returns fresh blob for null input", () => {
  const out = rollTodayStats(null, "2026-05-12");
  assert.equal(out.date, "2026-05-12");
  assert.deepEqual(out.today, { reviewed: 0, correct: 0 });
  assert.deepEqual(out.allTime, { reviewed: 0, correct: 0 });
});
test("rollTodayStats returns same object when date unchanged", () => {
  const data = { date: "2026-05-12", today: { reviewed: 3, correct: 2 }, allTime: { reviewed: 100, correct: 80 } };
  assert.equal(rollTodayStats(data, "2026-05-12"), data);
});
test("rollTodayStats rolls today into allTime on date change", () => {
  const data = { date: "2026-05-11", today: { reviewed: 5, correct: 4 }, allTime: { reviewed: 20, correct: 15 } };
  const out = rollTodayStats(data, "2026-05-12");
  assert.equal(out.date, "2026-05-12");
  assert.deepEqual(out.today, { reviewed: 0, correct: 0 });
  assert.deepEqual(out.allTime, { reviewed: 25, correct: 19 });
});

console.log(`PASS: ${passed} SRS tests`);
assert.equal(LEARNED_BOX, 3);
