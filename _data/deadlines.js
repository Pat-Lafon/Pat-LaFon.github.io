import Fetch from "@11ty/eleventy-fetch";
import { DateTime } from "luxon";
import { z } from "zod";

// Build-time data for /deadlines/. A failed fetch or parse lands in `errors`
// and renders as a note on the page instead of failing the build.

// Every venue the page tracks, by its pl-conferences.com abbreviation. The feed
// is filtered to these, so this is the whole list. ETAPS's deadlines live on
// its member conferences, hence ESOP through iFS.
const VENUES = new Set([
	"POPL", "PLDI", "OOPSLA", "ICFP", "ECOOP", "RV", "SAS", "MWPLS",
	"ETAPS", "ESOP", "FOSSACS", "TACAS", "IFS",
	"CAV", "CADE", "FMCAD", "IJCAR", "LICS", "SAT", "ITP",
]);

// Events the feed doesn't carry, in its shape. Past ones drop off on their own.
const EXTRA_EVENTS = [
	{
		abbreviation: "Bug Bash Europe", year: 2026, url: "https://antithesis.com/bugbash/europe/2026/",
		location: "Copenhagen, Denmark", date: { start: "2026-09-30", end: "2026-09-30" },
	},
];

const FEED_URL = "https://pl-conferences.com/events.json";

// Deadlines are end of day, Anywhere on Earth.
const AOE = "UTC-12";

const Day = z.union([z.literal("TBD"), z.iso.date()]);
const Event = z.object({
	abbreviation: z.string(),
	year: z.number(),
	url: z.url(),
	location: z.string().optional(),
	date: z.object({ start: Day, end: Day }),
	partOf: z.array(z.string()).default([]),
	rounds: z.array(z.object({
		name: z.string().optional(),
		importantDates: z.record(z.string(), Day),
	})).default([]),
});

// The feed writes "TBD" for an unannounced date; a TBD end means a one-day event.
function days({ start, end }) {
	const s = DateTime.fromISO(start, { zone: AOE });
	return [s, end === "TBD" ? s : DateTime.fromISO(end, { zone: AOE })];
}

function dateRange(date) {
	if (date.start === "TBD") {
		return "TBD";
	}
	const [s, e] = days(date);
	if (s.hasSame(e, "day")) {
		return s.toFormat("d LLL yyyy");
	}
	if (s.hasSame(e, "month")) {
		return `${s.toFormat("d")}–${e.toFormat("d LLL yyyy")}`;
	}
	return `${s.toFormat(s.hasSame(e, "year") ? "d LLL" : "d LLL yyyy")} – ${e.toFormat("d LLL yyyy")}`;
}

function deadlineRows(event, now) {
	return event.rounds.flatMap(round => ["abstract", "paper"].flatMap(kind => {
		const day = round.importantDates[kind];
		const deadline = day && day !== "TBD" && DateTime.fromISO(day, { zone: AOE }).endOf("day");
		if (!deadline || deadline < now) {
			return [];
		}
		const what = kind === "abstract" ? "Abstract" : "Paper";
		return [{
			conf: `${event.abbreviation} ${event.year}`,
			url: event.url,
			deadline: deadline.toJSDate(),
			deadlineISO: deadline.toISO(),
			comment: round.name && round.name !== what ? `${round.name}: ${what.toLowerCase()}` : what,
			when: dateRange(event.date),
			place: event.location,
		}];
	}));
}

async function loadFeed(errors) {
	const events = z.array(Event).parse(await Fetch(FEED_URL, {
		type: "json",
		fetchOptions: {
			headers: { "user-agent": "pat-lafon.github.io deadlines page (https://pat-lafon.github.io/)" },
		},
	}));
	const seen = new Set(events.map(e => e.abbreviation.toUpperCase()));
	const missing = [...VENUES].filter(v => !seen.has(v));
	if (missing.length) {
		errors.push({ source: "VENUES", message: `no events for ${missing.join(", ")}; fix the abbreviation or drop it` });
	}
	return events.filter(e => VENUES.has(e.abbreviation.toUpperCase()));
}

export default async function() {
	const now = DateTime.now().setZone(AOE);
	const errors = [];
	const feed = await loadFeed(errors).catch(e => {
		errors.push({ source: "pl-conferences.com", message: e.message });
		return [];
	});
	const events = feed.concat(z.array(Event).parse(EXTRA_EVENTS));

	const conferences = events
		.flatMap(e => deadlineRows(e, now))
		.sort((a, b) => a.deadline - b.deadline);

	// Member conferences share their umbrella's week, so only the umbrella is listed.
	const upcoming = events
		.filter(e => e.date.start !== "TBD" && days(e.date)[1].endOf("day") >= now)
		.filter(e => !e.partOf.some(p => VENUES.has(p.toUpperCase())))
		.sort((a, b) => a.date.start.localeCompare(b.date.start))
		.map(e => ({ conf: `${e.abbreviation} ${e.year}`, url: e.url, when: dateRange(e.date), place: e.location }));

	return { conferences, upcoming, errors, generated: now.toJSDate() };
}
