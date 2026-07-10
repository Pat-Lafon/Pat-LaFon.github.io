// Pure SRS logic — no DOM/React/storage, so it runs in Node tests.
//
// The box tracks mastery, not scheduling: cards are due daily, a learned-tier card
// only until it's been answered today (isDoneToday).
export const MAX_BOX = 5;
export const LEARNED_BOX = 3;

// The typed answer is the grade — there's no separate self-rating step.
export function applyGrade(card, correct, today) {
  const box = correct ? Math.min(MAX_BOX, card.box + 1) : 1;
  return { ...card, box, lastDay: today };
}

export function isDoneToday(card, today) {
  return card.box >= LEARNED_BOX && card.lastDay === today;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Lowest box first, so the least-known — and anything just flubbed to box 1 —
// resurfaces soonest; null when nothing's left today. isAvailable gates cards whose
// eligibility depends on other cards' state.
export function pickNext(cardMap, today, enabledRows, excludeId, isAvailable = () => true) {
  const enabled = new Set(enabledRows);
  const pending = Object.values(cardMap)
    .filter(c => enabled.has(c.rowId) && !isDoneToday(c, today) && isAvailable(c));
  if (pending.length === 0) return null;
  const pool = pending.length > 1 ? pending.filter(c => c.id !== excludeId) : pending;
  const minBox = Math.min(...pool.map(c => c.box));
  const tier = pool.filter(c => c.box === minBox);
  return shuffle(tier)[0];
}
