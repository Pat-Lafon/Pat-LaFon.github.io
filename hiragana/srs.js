// Pure SRS logic — no DOM/React/storage, so it runs in Node tests.
//
// Pure-daily model: the box tracks mastery but no longer schedules across days;
// a card is due every day until answered up into the learned tier.
export const MAX_BOX = 5;
export const LEARNED_BOX = 3;

// The typed answer is the grade: correct climbs one box, wrong resets to 1.
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
// resurface soonest. Null when nothing is left to do today.
export function pickNext(cardMap, today, enabledRows, excludeId) {
  const enabled = new Set(enabledRows);
  const pending = Object.values(cardMap)
    .filter(c => enabled.has(c.rowId) && !isDoneToday(c, today));
  if (pending.length === 0) return null;
  const pool = pending.length > 1 ? pending.filter(c => c.id !== excludeId) : pending;
  const minBox = Math.min(...pool.map(c => c.box));
  const tier = pool.filter(c => c.box === minBox);
  return shuffle(tier)[0];
}
