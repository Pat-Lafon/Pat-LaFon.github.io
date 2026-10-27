// "5 Mar 2026", "5–7 Mar 2026", "30 Mar – 2 Apr 2026", or "30 Dec 2026 – 2 Jan 2027".
export function dayRange(s, e) {
	if (s.hasSame(e, "day")) {
		return s.toFormat("d LLL yyyy");
	}
	if (s.hasSame(e, "month")) {
		return `${s.toFormat("d")}–${e.toFormat("d LLL yyyy")}`;
	}
	return `${s.toFormat(s.hasSame(e, "year") ? "d LLL" : "d LLL yyyy")} – ${e.toFormat("d LLL yyyy")}`;
}
