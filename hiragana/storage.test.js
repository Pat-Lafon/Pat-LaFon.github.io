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
  "あ": { front: "あ", answer: "a", alts: [], reading: null, audioKey: "a", rowId: "vowels" },
};

// 1. Returning users on the current lean shape keep box + last-answered day.
test("loadState reads the current {box, lastDay} shape", () => {
  const storage = makeStorage({
    [STORAGE_KEY]: JSON.stringify({
      enabledRows: ["vowels"],
      cards: { "あ": { box: 4, lastDay: "2026-07-07" } },
    }),
  });
  const loaded = loadState(storage, LOOKUP);
  assert.equal(loaded.cards["あ"].box, 4);
  assert.equal(loaded.cards["あ"].lastDay, "2026-07-07");
  assert.equal(loaded.cards["あ"].answer, "a"); // static field rehydrated from LOOKUP
});

// 2. A card with a box but no lastDay (e.g. reset day) loads with lastDay null.
test("loadState defaults a missing lastDay to null", () => {
  const storage = makeStorage({
    [STORAGE_KEY]: JSON.stringify({
      enabledRows: ["vowels"],
      cards: { "あ": { box: 4 } },
    }),
  });
  const loaded = loadState(storage, LOOKUP);
  assert.equal(loaded.cards["あ"].box, 4);
  assert.equal(loaded.cards["あ"].lastDay, null);
});

console.log(`PASS: ${passed} storage tests`);
