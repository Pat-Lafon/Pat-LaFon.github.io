// Unit tests for the pure SRS module. Run with `node hiragana/srs.test.js`.

import assert from "node:assert/strict";
import {
  MAX_BOX,
  LEARNED_BOX,
  applyGrade,
  isDoneToday,
  pickNext,
} from "./srs.js";

const TODAY = "2026-07-08";
const YESTERDAY = "2026-07-07";

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
function card({ id, rowId = "vowels", box = 1, lastDay = null }) {
  return { id, rowId, box, lastDay };
}

// --- applyGrade ---
test("applyGrade(wrong) resets to box 1", () => {
  assert.equal(applyGrade(card({ id: "か", rowId: "k", box: 4, lastDay: YESTERDAY }), false, TODAY).box, 1);
});
test("applyGrade(correct) promotes one box, capped at MAX_BOX", () => {
  assert.equal(applyGrade({ box: 2 }, true, TODAY).box, 3);
  assert.equal(applyGrade({ box: MAX_BOX }, true, TODAY).box, MAX_BOX);
});
test("applyGrade stamps today on lastDay", () => {
  assert.equal(applyGrade({ box: 1, lastDay: null }, true, TODAY).lastDay, TODAY);
});

// --- isDoneToday ---
test("isDoneToday: learned tier reached today is done", () => {
  assert.equal(isDoneToday(card({ id: "あ", box: LEARNED_BOX, lastDay: TODAY }), TODAY), true);
});
test("isDoneToday: learned on an earlier day owes a review today", () => {
  assert.equal(isDoneToday(card({ id: "あ", box: 5, lastDay: YESTERDAY }), TODAY), false);
});
test("isDoneToday: below the learned tier is never done, even answered today", () => {
  assert.equal(isDoneToday(card({ id: "あ", box: LEARNED_BOX - 1, lastDay: TODAY }), TODAY), false);
});

// --- pickNext ---
test("pickNext returns null when no enabled cards exist", () => {
  assert.equal(pickNext({ "あ": card({ id: "あ" }) }, TODAY, ["k"]), null);
  assert.equal(pickNext({}, TODAY, ["vowels"]), null);
});
test("pickNext returns null once every enabled card is done today", () => {
  const cards = {
    "あ": card({ id: "あ", box: LEARNED_BOX, lastDay: TODAY }),
    "い": card({ id: "い", box: 4, lastDay: TODAY }),
  };
  assert.equal(pickNext(cards, TODAY, ["vowels"]), null);
});
test("pickNext skips cards already done today", () => {
  const cards = {
    "あ": card({ id: "あ", box: LEARNED_BOX, lastDay: TODAY }), // done
    "い": card({ id: "い", box: 1, lastDay: null }),            // pending
  };
  for (let i = 0; i < 20; i++) {
    assert.equal(pickNext(cards, TODAY, ["vowels"]).id, "い");
  }
});
test("pickNext respects enabledRows filter", () => {
  const cards = {
    "あ": card({ id: "あ", rowId: "vowels" }),
    "か": card({ id: "か", rowId: "k" }),
  };
  assert.equal(pickNext(cards, TODAY, ["k"]).rowId, "k");
});
test("pickNext excludes the previous id when pool > 1", () => {
  const cards = {
    "あ": card({ id: "あ" }),
    "い": card({ id: "い" }),
  };
  for (let i = 0; i < 20; i++) {
    assert.notEqual(pickNext(cards, TODAY, ["vowels"], "あ").id, "あ");
  }
});
test("pickNext returns the only pending card when pool == 1, even if excluded", () => {
  const cards = { "あ": card({ id: "あ" }) };
  assert.equal(pickNext(cards, TODAY, ["vowels"], "あ").id, "あ");
});
test("pickNext prefers the lowest box (least-known / just-flubbed) first", () => {
  const cards = {
    "あ": card({ id: "あ", box: 1 }),
    "い": card({ id: "い", box: 2 }),
  };
  for (let i = 0; i < 20; i++) {
    assert.equal(pickNext(cards, TODAY, ["vowels"]).id, "あ");
  }
});

console.log(`PASS: ${passed} SRS tests`);
assert.equal(LEARNED_BOX, 3);
