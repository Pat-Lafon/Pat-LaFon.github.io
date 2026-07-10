// Answer grading for a practice card. Pure (no DOM/React) so it's unit-tested
// away from the component that used to inline it.
//
// The guess is normalized — lowercased and stripped of whitespace — so
// "ni juu ichi" matches "nijuuichi". Echoing the prompt itself (typing "21" on
// the 21 card) is a bypass: it skips recall, so it never counts as correct. Alts
// are lowercased at match time too, so an uppercase override alt still matches.
export function checkAnswer(input, card) {
  const guess = (input || "").toLowerCase().replace(/\s+/g, "");
  if (!guess) return { correct: false, bypass: false, empty: true };
  const bypass = guess === card.front.toLowerCase().replace(/\s+/g, "");
  const correct = !bypass && (
    guess === card.answer.toLowerCase() ||
    (card.alts || []).some((a) => a.toLowerCase() === guess)
  );
  return { correct, bypass, empty: false };
}
