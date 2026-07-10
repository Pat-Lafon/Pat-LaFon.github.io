// Unit tests for answer grading. Run with `node hiragana/match.test.js`.

import assert from "node:assert/strict";
import { checkAnswer } from "./match.js";

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); process.exitCode = 1; }
}

const card = { front: "21", answer: "nijuuichi", alts: ["nijuichi"] };

test("exact answer is correct", () => {
  assert.equal(checkAnswer("nijuuichi", card).correct, true);
});
test("matching is case-insensitive", () => {
  assert.equal(checkAnswer("NiJuuIchi", card).correct, true);
});
test("whitespace is ignored", () => {
  assert.equal(checkAnswer("  ni juu ichi ", card).correct, true);
});
test("a listed alt is accepted", () => {
  assert.equal(checkAnswer("nijuichi", card).correct, true);
});
test("an uppercase alt still matches (lowercased at match time)", () => {
  // Override alts pass through verbatim, so a capitalized one must not slip past.
  const overridden = { front: "は", answer: "wa", alts: ["HA"] };
  assert.equal(checkAnswer("ha", overridden).correct, true);
});
test("typing the prompt itself is a bypass, not correct", () => {
  const r = checkAnswer("21", card);
  assert.equal(r.correct, false);
  assert.equal(r.bypass, true);
});
test("empty input is flagged and never correct", () => {
  const r = checkAnswer("   ", card);
  assert.equal(r.empty, true);
  assert.equal(r.correct, false);
});
test("a wrong guess is incorrect without bypass", () => {
  const r = checkAnswer("nijuuni", card);
  assert.equal(r.correct, false);
  assert.equal(r.bypass, false);
  assert.equal(r.empty, false);
});

console.log(`PASS: ${passed} match tests`);
