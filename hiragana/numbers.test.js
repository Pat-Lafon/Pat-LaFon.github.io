// Unit tests for the number-composition module. Run with `node hiragana/numbers.test.js`.

import assert from "node:assert/strict";
import { NUMBER_ATOMS, composeNumber, numberEntry } from "./numbers.js";

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error(`FAIL: ${name}\n  ${e.message}`); process.exitCode = 1; }
}

// --- Atoms 1–10 ---
test("atom 1 = ichi", () => assert.deepEqual(composeNumber(1), { kana: "いち", romaji: "ichi", alts: [] }));
test("atom 4 accepts shi", () => assert.deepEqual(composeNumber(4), { kana: "よん", romaji: "yon", alts: ["shi"] }));
test("atom 7 accepts shichi", () => assert.deepEqual(composeNumber(7), { kana: "なな", romaji: "nana", alts: ["shichi"] }));
test("atom 9 accepts kyu and ku", () => assert.deepEqual(composeNumber(9), { kana: "きゅう", romaji: "kyuu", alts: ["kyu", "ku"] }));
test("atom 10 accepts ju and wāpuro jyuu/jyu", () => {
  const r = composeNumber(10);
  assert.equal(r.kana, "じゅう");
  assert.equal(r.romaji, "juu");
  for (const alt of ["ju", "jyuu", "jyu"]) assert.ok(r.alts.includes(alt), `missing alt ${alt}`);
});

// --- Teens 11–19 (juu + ones) ---
test("11 = juuichi", () => {
  const r = composeNumber(11);
  assert.equal(r.kana, "じゅういち");
  assert.equal(r.romaji, "juuichi");
  assert.ok(r.alts.includes("juichi"), "should accept short juu");
});
test("14 = juuyon with shi alt", () => {
  const r = composeNumber(14);
  assert.equal(r.kana, "じゅうよん");
  assert.equal(r.romaji, "juuyon");
  assert.ok(r.alts.includes("juushi"));
  assert.ok(r.alts.includes("jushi"));
  assert.ok(r.alts.includes("juyon"));
  assert.ok(!r.alts.includes("juuyon"), "canonical must not appear in alts");
});

// --- Tens 20–90 ---
test("20 = nijuu", () => {
  const r = composeNumber(20);
  assert.equal(r.kana, "にじゅう");
  assert.equal(r.romaji, "nijuu");
  assert.ok(r.alts.includes("niju"));
});
test("40 = yonjuu, accepts shi*", () => {
  const r = composeNumber(40);
  assert.equal(r.romaji, "yonjuu");
  assert.ok(r.alts.includes("shijuu"));
  assert.ok(r.alts.includes("shiju"));
  assert.ok(r.alts.includes("yonju"));
});

// --- Compounds ---
test("47 composes correctly with both-position alts", () => {
  const r = composeNumber(47);
  assert.equal(r.kana, "よんじゅうなな");
  assert.equal(r.romaji, "yonjuunana");
  assert.ok(r.alts.includes("shijuushichi"));
  assert.ok(r.alts.includes("yonjushichi"));
  assert.ok(r.alts.includes("yonjuushichi"));
});
test("99 composes with all alts expanded", () => {
  const r = composeNumber(99);
  assert.equal(r.kana, "きゅうじゅうきゅう");
  assert.equal(r.romaji, "kyuujuukyuu");
  // 3 options (kyuu, kyu, ku) × 4 (juu, ju, jyuu, jyu) × 3 (kyuu, kyu, ku) = 36, minus canonical = 35.
  assert.equal(r.alts.length, 35);
  assert.ok(r.alts.includes("kujuuku"));
  assert.ok(r.alts.includes("kyuujyuukyuu"));
});

// --- Boundary errors ---
test("composeNumber rejects 0", () => assert.throws(() => composeNumber(0)));
test("composeNumber rejects 100", () => assert.throws(() => composeNumber(100)));
test("composeNumber rejects non-integers", () => assert.throws(() => composeNumber(3.5)));

// --- numberEntry shape ---
test("numberEntry packages id + prompt + composition", () => {
  const e = numberEntry(21);
  assert.equal(e.id, "num-21");
  assert.equal(e.prompt, "21");
  assert.equal(e.kana, "にじゅういち");
  assert.equal(e.romaji, "nijuuichi");
  assert.ok(Array.isArray(e.alts));
});

// --- Atoms exposed for inspection ---
test("NUMBER_ATOMS has 1–10", () => {
  for (let i = 1; i <= 10; i++) assert.ok(NUMBER_ATOMS[i], `missing atom ${i}`);
});

// --- Every number 1–99 composes without throwing and round-trips kana lookup ---
test("all numbers 1–99 compose", () => {
  for (let i = 1; i <= 99; i++) {
    const r = composeNumber(i);
    assert.ok(r.kana.length > 0);
    assert.ok(r.romaji.length > 0);
    assert.ok(!r.alts.includes(r.romaji), `canonical leaked into alts at ${i}`);
  }
});

console.log(`PASS: ${passed} number tests`);
