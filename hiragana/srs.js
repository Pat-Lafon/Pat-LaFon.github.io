// Pure SRS logic — no DOM/React/storage, so it runs in Node tests.
//
// Pure-daily model: the box tracks mastery but no longer schedules across days;
// a card is due every day until answered up into the learned tier.
export const MAX_BOX = 5;
export const LEARNED_BOX = 3;

// quality: 0=forgot, 1=slow, 2=recalled, 3=instant.
export function applyGrade(card, quality, today) {
  let box = card.box;
  if (quality === 0) box = 1;
  else if (quality === 1) box = Math.max(1, box - 1);
  else if (quality === 2) box = Math.min(MAX_BOX, box + 1);
  else if (quality === 3) box = Math.min(MAX_BOX, box + 2);
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
