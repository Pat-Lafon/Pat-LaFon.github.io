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

// A pass shows every pending card once before any of them repeats: a card not yet
// answered today outranks one that has been, so a just-missed card waits out the
// rest of the queue instead of coming straight back. Within a pass it's lowest box
// first, so the least-known come soonest. Once everything pending carries today's
// stamp the pass is over and the next begins — by then the pending set is just the
// cards below LEARNED_BOX, the misses, which repeat until corrected. Null when
// nothing's left today. isAvailable gates cards whose eligibility depends on other
// cards' state.
export function pickNext(cardMap, today, enabledRows, excludeId, isAvailable = () => true) {
  const enabled = new Set(enabledRows);
  const pending = Object.values(cardMap)
    .filter(c => enabled.has(c.rowId) && !isDoneToday(c, today) && isAvailable(c));
  if (pending.length === 0) return null;
  const pool = pending.length > 1 ? pending.filter(c => c.id !== excludeId) : pending;
  const unseen = pool.filter(c => c.lastDay !== today);
  const pass = unseen.length > 0 ? unseen : pool;
  const minBox = Math.min(...pass.map(c => c.box));
  const tier = pass.filter(c => c.box === minBox);
  return shuffle(tier)[0];
}
