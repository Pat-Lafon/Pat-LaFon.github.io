// Behavior tests for storage.js. Intentionally narrow — only the few
// invariants whose silent breakage would lose user data or crash the app.
// Run with `node hiragana/storage.test.js`.

import assert from "node:assert/strict";
import { STORAGE_KEY, loadState } from "./storage.js";

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); process.exitCode = 1; }
}

function makeStorage(init = {}) {
  const map = new Map(Object.entries(init));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, v); },
  };
}

const LOOKUP = {
  "あ": { kana: "あ", romaji: "a", rowId: "vowels", kind: "kana", prompt: null, alts: null },
};

// 1. Returning users with disk data from before the lean refactor must keep their progress.
test("loadState migrates a pre-lean fat-shape localStorage", () => {
  const storage = makeStorage({
    [STORAGE_KEY]: JSON.stringify({
      enabledRows: ["vowels"],
      cards: {
        "あ": { id: "あ", kana: "あ", romaji: "a", rowId: "vowels", kind: "kana", prompt: null, alts: null, box: 4, lastReviewedAt: 20 },
      },
      reviewCount: 100,
    }),
  });
  const loaded = loadState(storage, LOOKUP);
  assert.equal(loaded.cards["あ"].box, 4);
  assert.equal(loaded.cards["あ"].lastReviewedAt, 20);
  assert.equal(loaded.cards["あ"].romaji, "a"); // static field rehydrated from LOOKUP
});

// 2. Even older users (pre-Leitner SM-2 shape) must not lose progress.
test("loadState migrates pre-Leitner SM-2 reps→box", () => {
  const storage = makeStorage({
    [STORAGE_KEY]: JSON.stringify({
      cards: { "あ": { kana: "あ", romaji: "a", rowId: "vowels", reps: 3, ease: 2.5 } },
    }),
  });
  const loaded = loadState(storage, LOOKUP);
  assert.equal(loaded.cards["あ"].box, 4); // min(5, max(1, 3+1))
  assert.equal(loaded.cards["あ"].lastReviewedAt, -1);
});

console.log(`PASS: ${passed} storage tests`);
