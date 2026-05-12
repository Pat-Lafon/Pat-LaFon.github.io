// Pure SRS logic for the hiragana app. No DOM, React, or localStorage —
// callable from both the React component and Node tests.
//
// Leitner box cadences: a card in box B is due every BOX_CADENCE[B] reviews.
// Box 5 is "mastered" — surfaces only every 16 reviews.
export const BOX_CADENCE = [0, 1, 2, 4, 8, 16];
export const MAX_BOX = 5;
export const LEARNED_BOX = 3;

export function makeFreshCard(kana, romaji, rowId) {
  return { kana, romaji, rowId, box: 1, lastReviewedAt: -1 };
}

// quality: 0=forgot, 1=slow, 2=recalled, 3=instant
export function applyGrade(card, quality, reviewCount) {
  let box = card.box;
  if (quality === 0) box = 1;
  else if (quality === 1) box = Math.max(1, box - 1);
  else if (quality === 2) box = Math.min(MAX_BOX, box + 1);
  else if (quality === 3) box = Math.min(MAX_BOX, box + 2);
  return { ...card, box, lastReviewedAt: reviewCount };
}

export function isCardDue(card, reviewCount) {
  return (reviewCount - card.lastReviewedAt) >= BOX_CADENCE[card.box];
}

export function isValidCard(c) {
  return c && typeof c.kana === "string" && typeof c.romaji === "string"
    && typeof c.box === "number" && typeof c.lastReviewedAt === "number";
}

// Convert legacy SM-2 cards (ease/interval/reps/lapses/due) to Leitner shape.
// Maps reps to box so users keep some progress through the migration.
export function migrateLegacyCard(c) {
  if (typeof c.box === "number") return c;
  const reps = typeof c.reps === "number" ? c.reps : 0;
  const box = Math.min(MAX_BOX, Math.max(1, reps + 1));
  return { kana: c.kana, romaji: c.romaji, rowId: c.rowId, box, lastReviewedAt: -1 };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Selects the next card to review from `cardMap`, considering only cards whose
// `rowId` is in `enabledRows`. Optionally excludes a kana (to avoid immediate
// repeats). Strategy: due cards first; among them most-overdue; among those
// lowest box; random within the resulting tier.
export function pickNext(cardMap, reviewCount, enabledRows, excludeKana) {
  const enabled = new Set(enabledRows);
  const all = Object.values(cardMap).filter(c => enabled.has(c.rowId));
  const pool = all.length > 1 ? all.filter(c => c.kana !== excludeKana) : all;
  if (pool.length === 0) return null;
  const due = pool.filter(c => isCardDue(c, reviewCount));
  const candidates = due.length ? due : pool;
  const dueAt = (c) => c.lastReviewedAt + BOX_CADENCE[c.box];
  const minDueAt = Math.min(...candidates.map(dueAt));
  const mostOverdue = candidates.filter(c => dueAt(c) === minDueAt);
  const minBox = Math.min(...mostOverdue.map(c => c.box));
  const tier = mostOverdue.filter(c => c.box === minBox);
  return shuffle(tier)[0];
}

// Roll yesterday's `today` counts into `allTime` when the date changes.
// Pure: takes the parsed stats blob and "today" key, returns a new blob.
// Caller handles localStorage IO.
export function rollTodayStats(data, today) {
  if (!data || typeof data !== "object") {
    return { date: today, today: { reviewed: 0, correct: 0 }, allTime: { reviewed: 0, correct: 0 } };
  }
  if (data.date === today) return data;
  const allTime = data.allTime || { reviewed: 0, correct: 0 };
  const prev = data.today || { reviewed: 0, correct: 0 };
  return {
    date: today,
    today: { reviewed: 0, correct: 0 },
    allTime: { reviewed: allTime.reviewed + prev.reviewed, correct: allTime.correct + prev.correct },
  };
}
