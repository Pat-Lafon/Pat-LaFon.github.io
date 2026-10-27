import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import Fetch from "@11ty/eleventy-fetch";
import { DateTime } from "luxon";
import { z } from "zod";
import { dayRange } from "../_config/dayRange.js";

// Build-time data for /concerts/; `node _data/concerts.js` prints it. A failed
// fetch or parse becomes a note on the page, not a failed build.

// Ticketmaster attraction id → shown name. Ids, since its "Linkin Park" search
// ranks tribute acts first.
const ARTISTS = new Map([
	["K8vZ917ukw7", "twenty one pilots"],
	["K8vZ9171if7", "Linkin Park"],
	["K8vZ917o-E7", "Hozier"],
	["K8vZ917rdx0", "Yousuke Yukimatsu"],
	["K8vZ917GSz7", "Imagine Dragons"],
	["K8vZ9171o-f", "Green Day"],
	["K8vZ9175DY0", "Paramore"],
	["K8vZ9174Za7", "Billie Eilish"],
	["K8vZ917GCvf", "Florence + the Machine"],
]);

// Ticketmaster venue ids; every show there is listed under its headliner.
const VENUES = [
	"KovZ917ARfH", // Turntable, Indianapolis
];

// Headliners at VENUES to drop, by name: one act has an id per ticketing system.
const MUTED = new Set([]);

// Shows are kept only in these `<country>-<state>` regions, which the page
// description names.
const NEAR_REGIONS = new Set(["US-IL", "US-IN"]);

const TicketmasterEvents = z.object({
	_embedded: z.object({
		events: z.array(z.object({
			name: z.string(),
			url: z.url(),
			dates: z.object({ start: z.object({ localDate: z.iso.date() }) }),
			sales: z.object({ public: z.object({ startDateTime: z.iso.datetime().optional() }) }).optional(),
			_embedded: z.object({
				attractions: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
				venues: z.array(z.object({
					name: z.string().optional(),
					city: z.object({ name: z.string() }).optional(),
					state: z.object({ stateCode: z.string() }).optional(),
					country: z.object({ name: z.string(), countryCode: z.string() }).optional(),
				})),
			}),
		})),
	}).optional(),
	page: z.object({ totalElements: z.number() }),
});

// Events matching `params` in NEAR_REGIONS.
async function ticketmaster(params) {
	const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
	url.search = new URLSearchParams({
		...params,
		size: "200",
		apikey: process.env.TICKETMASTER_KEY || readFileSync(`${homedir()}/.config/ticketmaster-key`, "utf8").trim(),
	});
	const body = TicketmasterEvents.parse(await Fetch(url.href, { type: "json" }));
	const events = body._embedded?.events ?? [];
	if (events.length < body.page.totalElements) {
		throw new Error(`${body.page.totalElements} events overflow one page of ${events.length}; page through them`);
	}
	return events.filter(e => {
		const v = e._embedded.venues[0];
		// A "- Redirect" venue is a mislocated duplicate of a real listing.
		return !v.name?.endsWith(" - Redirect") && NEAR_REGIONS.has(`${v.country?.countryCode}-${v.state?.stateCode}`);
	});
}

function show(e, artist) {
	const v = e._embedded.venues[0];
	return {
		artist,
		start: e.dates.start.localDate,
		venue: v.name,
		place: [v.city?.name, v.state && v.country?.countryCode === "US" ? v.state.stateCode : v.country?.name].filter(Boolean).join(", "),
		url: e.url,
		onSale: e.sales?.public.startDateTime,
	};
}

const followed = e => e._embedded.attractions.filter(a => ARTISTS.has(a.id));

// Ticketmaster lists each ticket type, and a festival pass on its first day, as
// its own event: one artist at one venue within two days is one show.
function merge(shows) {
	const merged = [];
	for (const s of shows.sort((a, b) => a.start.localeCompare(b.start))) {
		const prev = merged.findLast(m => m.artist === s.artist && m.venue === s.venue && m.place === s.place);
		if (prev && DateTime.fromISO(s.start).diff(DateTime.fromISO(prev.end), "days").days <= 2) {
			prev.end = s.start;
		} else {
			merged.push({ ...s, end: s.start });
		}
	}
	return merged;
}

export default async function concerts() {
	const now = new Date();
	const errors = [];
	// One request per kind, in turn: Ticketmaster 429s parallel requests.
	const query = (kind, params) => ticketmaster(params).catch(e => {
		errors.push({ source: `Ticketmaster ${kind}`, message: e.message });
		return [];
	});
	const byArtist = (await query("artists", { attractionId: [...ARTISTS.keys()].join(",") }))
		.flatMap(e => followed(e).map(a => show(e, ARTISTS.get(a.id))));
	const atVenues = (await query("venues", { venueId: VENUES.join(",") }))
		// A followed artist's show is already in byArtist.
		.filter(e => !followed(e).length)
		.map(e => show(e, e._embedded.attractions[0]?.name ?? e.name))
		.filter(s => !MUTED.has(s.artist));
	const shows = merge([...byArtist, ...atVenues]).map(s => ({
		...s,
		when: dayRange(DateTime.fromISO(s.start), DateTime.fromISO(s.end)),
		onSale: s.onSale > now.toISOString() ? DateTime.fromISO(s.onSale).toFormat("d LLL") : undefined,
	}));
	return { shows, errors, generated: now };
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
