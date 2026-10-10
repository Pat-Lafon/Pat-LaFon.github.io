import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import Fetch from "@11ty/eleventy-fetch";
import { DateTime } from "luxon";
import { z } from "zod";

// Build-time data for /concerts/. A failed fetch or parse lands in `errors`
// and renders as a note on the page instead of failing the build.
// `node _data/concerts.js` prints the result.

// Ticketmaster attraction ids, not names: its "Linkin Park" search ranks
// tribute acts above the band.
const ARTISTS = [
	{ name: "twenty one pilots", ticketmaster: "K8vZ917ukw7" },
	{ name: "Linkin Park", ticketmaster: "K8vZ9171if7" },
	{ name: "Hozier", ticketmaster: "K8vZ917o-E7" },
	{ name: "Yousuke Yukimatsu", ticketmaster: "K8vZ917rdx0" },
	{ name: "Imagine Dragons", ticketmaster: "K8vZ917GSz7" },
	{ name: "Green Day", ticketmaster: "K8vZ9171o-f" },
	{ name: "Paramore", ticketmaster: "K8vZ9175DY0" },
	{ name: "Billie Eilish", ticketmaster: "K8vZ9174Za7" },
	{ name: "Florence + the Machine", ticketmaster: "K8vZ917GCvf" },
];

// Ticketmaster shows are kept if they're in one of these states or are a festival.
const NEAR_STATES = new Set(["IL", "IN"]);

// Hand-picked shows Ticketmaster doesn't sell, listed whatever their location.
// Past ones drop off on their own.
const EXTRA_SHOWS = [
	{
		artist: "Yousuke Yukimatsu", start: "2026-10-16", end: "2026-10-17", venue: "III Points",
		place: "Miami, FL", url: "https://iiipoints.com/",
	},
];

const KEY_FILE = join(homedir(), ".config", "ticketmaster-key");

const Show = z.object({
	artist: z.string(),
	start: z.iso.date(),
	end: z.iso.date().optional(),
	venue: z.string().optional(),
	place: z.string(),
	url: z.url(),
	onSale: z.iso.datetime().optional(),
});

const TicketmasterEvents = z.object({
	_embedded: z.object({
		events: z.array(z.object({
			url: z.url(),
			dates: z.object({ start: z.object({ localDate: z.iso.date() }) }),
			sales: z.object({ public: z.object({ startDateTime: z.iso.datetime().optional() }) }).optional(),
			classifications: z.array(z.object({ subType: z.object({ name: z.string() }).optional() })).default([]),
			_embedded: z.object({
				venues: z.array(z.object({
					name: z.string().optional(),
					city: z.object({ name: z.string() }).optional(),
					state: z.object({ stateCode: z.string() }).optional(),
					country: z.object({ name: z.string(), countryCode: z.string() }).optional(),
				})),
			}),
		})),
	}).optional(),
});

async function ticketmaster(artist, key) {
	const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
	url.search = new URLSearchParams({ attractionId: artist.ticketmaster, size: "200", sort: "date,asc", apikey: key });
	const body = TicketmasterEvents.parse(await Fetch(url.href, { type: "json" }));
	return (body._embedded?.events ?? [])
		.map(e => ({ e, v: e._embedded.venues[0] }))
		// A "- Redirect" venue is a mislocated duplicate of a real listing.
		.filter(({ v }) => !v.name?.endsWith(" - Redirect"))
		.filter(({ e, v }) => NEAR_STATES.has(v.state?.stateCode) || e.classifications.some(c => c.subType?.name === "Festival"))
		.map(({ e, v }) => ({
			artist: artist.name,
			start: e.dates.start.localDate,
			venue: v.name,
			place: [v.city?.name, v.state && v.country?.countryCode === "US" ? v.state.stateCode : v.country?.name].filter(Boolean).join(", "),
			url: e.url,
			onSale: e.sales?.public.startDateTime,
		}));
}

// Ticketmaster lists each ticket type as its own event, and a festival's
// passes carry its first day, so one artist's listings at one venue within
// two days are one show. Expects `shows` sorted by start.
function merge(shows) {
	const merged = [];
	for (const s of shows) {
		const prev = merged.findLast(m => m.artist === s.artist && m.venue === s.venue && m.place === s.place);
		if (prev && DateTime.fromISO(s.start).diff(DateTime.fromISO(prev.end ?? prev.start), "days").days <= 2) {
			prev.end = s.start > (prev.end ?? prev.start) ? s.start : prev.end;
		} else {
			merged.push({ ...s });
		}
	}
	return merged;
}

function dateRange(start, end = start) {
	const s = DateTime.fromISO(start);
	const e = DateTime.fromISO(end);
	if (s.hasSame(e, "day")) {
		return s.toFormat("d LLL yyyy");
	}
	if (s.hasSame(e, "month")) {
		return `${s.toFormat("d")}–${e.toFormat("d LLL yyyy")}`;
	}
	return `${s.toFormat("d LLL")} – ${e.toFormat("d LLL yyyy")}`;
}

export default async function concerts() {
	const today = DateTime.now().toISODate();
	const now = new Date().toISOString();
	const errors = [];

	let key;
	try {
		key = process.env.TICKETMASTER_KEY || readFileSync(KEY_FILE, "utf8").trim();
	} catch (e) {
		errors.push({ source: "Ticketmaster", message: `no key in TICKETMASTER_KEY or ${KEY_FILE}: ${e.message}` });
	}

	// Ticketmaster 429s parallel requests, so they go one at a time.
	const fetched = [];
	for (const a of key ? ARTISTS : []) {
		fetched.push(...await ticketmaster(a, key).catch(e => {
			errors.push({ source: `Ticketmaster (${a.name})`, message: e.message });
			return [];
		}));
		await new Promise(resolve => setTimeout(resolve, 250));
	}

	const all = z.array(Show).parse([...fetched, ...EXTRA_SHOWS]).sort((a, b) => a.start.localeCompare(b.start));
	const shows = merge(all)
		.filter(s => (s.end ?? s.start) >= today)
		.map(s => ({
			...s,
			when: dateRange(s.start, s.end),
			// Only a sale that hasn't opened yet is worth showing.
			onSale: s.onSale > now ? DateTime.fromISO(s.onSale).toFormat("d LLL") : undefined,
		}));

	return { shows, errors, generated: new Date() };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const { shows, errors } = await concerts();
	for (const s of shows) {
		console.log([s.when, s.artist, s.venue, s.place, s.onSale && `on sale ${s.onSale}`].filter(Boolean).join(" | "));
	}
	for (const e of errors) {
		console.error(`${e.source}: ${e.message}`);
	}
}
