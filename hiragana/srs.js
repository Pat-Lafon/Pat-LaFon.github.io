// Pure SRS logic for the hiragana app. No DOM, React, or localStorage —
// callable from both the React component and Node tests.
//
// Leitner box cadences: a card in box B is due every BOX_CADENCE[B] reviews.
// Box 5 is "mastered" — surfaces only every 16 reviews.
export const BOX_CADENCE = [0, 1, 2, 4, 8, 16];
export const MAX_BOX = 5;
export const LEARNED_BOX = 3;

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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Selects the next card to review from `cardMap`, considering only cards whose
// `rowId` is in `enabledRows`. Optionally excludes a card id (to avoid immediate
// repeats). Strategy: due cards first; among them most-overdue; among those
// lowest box; random within the resulting tier.
export function pickNext(cardMap, reviewCount, enabledRows, excludeId) {
  const enabled = new Set(enabledRows);
  const all = Object.values(cardMap).filter(c => enabled.has(c.rowId));
  const pool = all.length > 1 ? all.filter(c => c.id !== excludeId) : all;
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

