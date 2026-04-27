// Storage budget test — run with `node hiragana/storage-budget.test.js`
// Constructs worst-case localStorage state and asserts it's under budget.
// Automatically extracts character count, card fields, and budget from app.js.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "app.js"), "utf-8");

// --- Extract from app.js automatically ---

// Character count: count ["x","y"] pairs in ROWS
const charPairs = source.match(/\["[^"]+","[^"]+"\]/g);
const CHAR_COUNT = charPairs ? charPairs.length : 0;

// Budget: extract MAX_STORAGE_BYTES value
const budgetMatch = source.match(/MAX_STORAGE_BYTES\s*=\s*(\d+)\s*\*\s*(\d+)/);
if (!budgetMatch) { console.error("FAIL: Could not find MAX_STORAGE_BYTES in app.js"); process.exit(1); }
const MAX_STORAGE_BYTES = parseInt(budgetMatch[1]) * parseInt(budgetMatch[2]);

// Card fields: extract field names from makeFreshCard return
const cardMatch = source.match(/function makeFreshCard\([^)]*\)\s*\{[^}]*return\s*\{([^}]+)\}/);
if (!cardMatch) { console.error("FAIL: Could not find makeFreshCard in app.js"); process.exit(1); }
const CARD_FIELDS = cardMatch[1].split(",").map(f => f.split(":")[0].trim());

// --- Build worst-case data ---

// Inflate every card field to a large plausible value
const WORST_VALUES = {
  kana: "あ".repeat(3),
  romaji: "sha",
  rowId: "handakuten",
};
const NUM_WORST = 9999999999999;

function worstCaseCard() {
  const card = {};
  for (const field of CARD_FIELDS) {
    card[field] = WORST_VALUES[field] || NUM_WORST;
  }
  return card;
}

// Stats are fixed-size: { date, today, allTime }
function worstCaseStats() {
  return {
    date: "2026-04-27",
    today: { reviewed: 99999, correct: 99999 },
    allTime: { reviewed: 9999999, correct: 9999999 },
  };
}

// Build worst-case SRS state
const cards = {};
for (let i = 0; i < CHAR_COUNT; i++) {
  cards[`card_${i}`] = worstCaseCard();
}
const enabledRows = Array.from({ length: 30 }, (_, i) => `row_${i}_handakuten`);

const srsState = JSON.stringify({ enabledRows, cards });
const statsState = JSON.stringify(worstCaseStats());
const totalBytes = srsState.length + statsState.length;

// --- Report ---
console.log(`Characters in ROWS:  ${CHAR_COUNT}`);
console.log(`Card fields:         ${CARD_FIELDS.join(", ")}`);
console.log(`SRS state size:      ${(srsState.length / 1024).toFixed(1)} KB`);
console.log(`Stats state size:    ${(statsState.length / 1024).toFixed(1)} KB (fixed — never grows)`);
console.log(`Total worst-case:    ${(totalBytes / 1024).toFixed(1)} KB`);
console.log(`Budget:              ${(MAX_STORAGE_BYTES / 1024).toFixed(1)} KB`);
console.log(`Headroom:            ${((1 - totalBytes / MAX_STORAGE_BYTES) * 100).toFixed(0)}%`);

if (totalBytes > MAX_STORAGE_BYTES) {
  console.error(`\nFAIL: Worst-case storage (${(totalBytes / 1024).toFixed(1)} KB) exceeds budget (${(MAX_STORAGE_BYTES / 1024).toFixed(1)} KB)`);
  process.exit(1);
} else {
  console.log(`\nPASS: Well within budget.`);
}
