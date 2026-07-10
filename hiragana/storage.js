// Cards on disk are lean — {box, lastDay} keyed by id; static fields (front,
// answer, etc.) live in code and are re-attached on load via hydrateCard.
//
// IO errors (quota, disabled storage) are intentionally uncaught — a crash is
// the right signal when persistence breaks.

export const STORAGE_KEY = "hiragana-srs";
export const STATS_KEY = "hiragana-stats";

// Null when `id` isn't in the lookup — the row was renamed/removed; drop it.
export function hydrateCard(id, lean, lookup) {
  const staticFields = lookup[id];
  if (!staticFields) return null;
  return { id, ...staticFields, box: lean.box, lastDay: lean.lastDay };
}

// --- SRS state ---

export function loadState(storage, lookup) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;
  const cards = {};
  for (const [id, v] of Object.entries(parsed.cards ?? {})) {
    if (!v || typeof v !== "object" || typeof v.box !== "number") continue;
    const lean = { box: v.box, lastDay: typeof v.lastDay === "string" ? v.lastDay : null };
    const hydrated = hydrateCard(id, lean, lookup);
    if (hydrated) cards[id] = hydrated;
  }
  return {
    enabledRows: Array.isArray(parsed.enabledRows) ? parsed.enabledRows : null,
    cards,
  };
}

export function saveState(storage, state) {
  const leanCards = {};
  for (const [id, card] of Object.entries(state.cards ?? {})) {
    leanCards[id] = { box: card.box, lastDay: card.lastDay };
  }
  storage.setItem(STORAGE_KEY, JSON.stringify({
    enabledRows: state.enabledRows,
    cards: leanCards,
  }));
}

// --- Stats blob: { date, reviewed, correct } ---
// Reset when the date changes; we don't track all-time.

export function loadStats(storage, todayKey) {
  const raw = storage.getItem(STATS_KEY);
  if (raw) {
    try {
      const p = JSON.parse(raw);
      if (p && p.date === todayKey && typeof p.reviewed === "number" && typeof p.correct === "number") return p;
    } catch { /* fall through to fresh blob */ }
  }
  return { date: todayKey, reviewed: 0, correct: 0 };
}

export function saveStats(storage, blob) {
  storage.setItem(STATS_KEY, JSON.stringify(blob));
}
