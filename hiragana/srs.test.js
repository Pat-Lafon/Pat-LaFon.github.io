// Unit tests for the pure SRS module. Run with `node hiragana/srs.test.js`.

import assert from "node:assert/strict";
import {
  BOX_CADENCE,
  MAX_BOX,
  LEARNED_BOX,
  applyGrade,
  isCardDue,
  pickNext,
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

// Card factory for tests only — production cards are built via storage.hydrateCard.
function card({ id, rowId = "vowels", box = 1, lastReviewedAt = -1 }) {
  return { id, rowId, box, lastReviewedAt };
}

// --- applyGrade ---
test("applyGrade(0) resets to box 1", () => {
  assert.equal(applyGrade(card({ id: "か", rowId: "k", box: 4, lastReviewedAt: 10 }), 0, 99).box, 1);
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

// --- pickNext ---
test("pickNext returns null when no enabled cards exist", () => {
  assert.equal(pickNext({ "あ": card({ id: "あ" }) }, 0, ["k"]), null);
  assert.equal(pickNext({}, 0, ["vowels"]), null);
});
test("pickNext respects enabledRows filter", () => {
  const cards = {
    "あ": card({ id: "あ", rowId: "vowels" }),
    "か": card({ id: "か", rowId: "k" }),
  };
  assert.equal(pickNext(cards, 5, ["k"]).rowId, "k");
});
test("pickNext excludes the previous id when pool > 1", () => {
  const cards = {
    "あ": card({ id: "あ" }),
    "い": card({ id: "い" }),
  };
  for (let i = 0; i < 20; i++) {
    assert.notEqual(pickNext(cards, 5, ["vowels"], "あ").id, "あ");
  }
});
test("pickNext returns the only card when pool == 1, even if excluded", () => {
  const cards = { "あ": card({ id: "あ" }) };
  assert.equal(pickNext(cards, 5, ["vowels"], "あ").id, "あ");
});
test("pickNext excludes by id for non-kana (number) cards", () => {
  const cards = {
    "num-1": card({ id: "num-1", rowId: "num-1-10" }),
    "num-2": card({ id: "num-2", rowId: "num-1-10" }),
  };
  for (let i = 0; i < 20; i++) {
    assert.notEqual(pickNext(cards, 5, ["num-1-10"], "num-1").id, "num-1");
  }
});
test("pickNext prefers due cards over non-due", () => {
  // box-1 card seen at review 0; at reviewCount=5 it's due. box-5 card seen
  // at review 0; at reviewCount=5 it's NOT due (cadence 16).
  const cards = {
    "あ": card({ id: "あ", box: 1, lastReviewedAt: 0 }),
    "い": card({ id: "い", box: 5, lastReviewedAt: 0 }),
  };
  for (let i = 0; i < 20; i++) {
    assert.equal(pickNext(cards, 5, ["vowels"]).id, "あ");
  }
});

console.log(`PASS: ${passed} SRS tests`);
assert.equal(LEARNED_BOX, 3);
