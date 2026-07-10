// Combine per-position romaji options into a canonical spelling plus every other
// accepted spelling. optionsPerPart[i] is position i's choices, canonical first;
// the canonical (first at each position) is dropped from the deduped alts.
export function combineRomaji(optionsPerPart) {
  const combos = [];
  (function cartesian(i, acc) {
    if (i === optionsPerPart.length) { combos.push(acc.join("")); return; }
    for (const o of optionsPerPart[i]) { acc.push(o); cartesian(i + 1, acc); acc.pop(); }
  })(0, []);
  const canonical = optionsPerPart.map((opts) => opts[0]).join("");
  const alts = [...new Set(combos)].filter((c) => c !== canonical);
  return { canonical, alts };
}
