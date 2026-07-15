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

// Knock the given ids back to box 1 so they resurface today (box 1 < LEARNED_BOX is
// never done). lastDay is left alone — it only matters at the learned tier. Used
// when a word is missed to bring its weak letters back into rotation. Ids absent
// from the map are skipped.
export function resetBoxes(cardMap, ids) {
  const next = { ...cardMap };
  for (const id of ids) {
    if (next[id]) next[id] = { ...next[id], box: 1 };
  }
  return next;
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
