import Fetch from "@11ty/eleventy-fetch";
import { load as loadYaml } from "js-yaml";
import { DateTime } from "luxon";

// Build-time data for /deadlines/. Three sources, each optional: a fetch or
// parse failure lands in `errors` and renders as a visible note on the page
// instead of failing the whole site build.

// Curated conference files from https://github.com/ccfddl/ccf-deadlines,
// grouped by that repo's category directories. Edit these lists to change
// which conferences the page tracks.
const CCFDDL = {
	SE: ["popl", "pldi", "oopsla", "icfp", "ecoop", "aplas", "etaps", "fm", "atva", "rv", "icfem", "lctes"],
	CT: ["cav", "cade", "concur", "fmcad", "ijcar", "lics", "sat"],
};

// Fills ccfddl gaps (ITP, FLOPS, ESOP as its own entry) and round notes.
const YEAH_TIGER_URL = "https://raw.githubusercontent.com/yeah-tiger/yeah-tiger.github.io/master/_data/conferences.yml";

// Broader categories ("software engineering") are dominated by predatory
// journals and junk conferences — vet a category's page before adding it.
const WIKICFP_CATEGORIES = ["programming languages", "formal methods", "programming", "compilers"];
const WIKICFP_MAX_PAGES = 5;

// Deadlines without an explicit timezone are treated as Anywhere on Earth.
const AOE = "UTC-12";

function fetchText(url) {
	return Fetch(url, {
		duration: "1d",
		type: "text",
		fetchOptions: {
			headers: { "user-agent": "pat-lafon.github.io deadlines page (https://pat-lafon.github.io/)" },
		},
	});
}

function decodeEntities(s) {
	return s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, "\"")
		.replace(/&#39;/g, "'");
}

// ccfddl writes "2026-07-09 23:59:59" (occasionally date-only or TBD) with a
// timezone field like "AoE" or "UTC-12".
function parseCcfddlDeadline(text, timezone) {
	const zone = !timezone || timezone === "AoE" ? AOE : timezone;
	for (const format of ["yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd"]) {
		const dt = DateTime.fromFormat(text, format, { zone });
		if (dt.isValid) {
			return dt;
		}
	}
	return null;
}

async function loadCcfddl(now) {
	const rows = [];
	const files = Object.entries(CCFDDL).flatMap(([dir, names]) => names.map(name => `${dir}/${name}.yml`));
	await Promise.all(files.map(async file => {
		const text = await fetchText(`https://raw.githubusercontent.com/ccfddl/ccf-deadlines/main/conference/${file}`);
		for (const series of loadYaml(text)) {
			for (const conf of series.confs ?? []) {
				for (const item of conf.timeline ?? []) {
					const deadline = parseCcfddlDeadline(item.deadline ?? "", conf.timezone);
					if (deadline && deadline >= now) {
						rows.push({
							conf: `${series.title} ${conf.year}`,
							title: series.title,
							year: conf.year,
							url: conf.link,
							deadline: deadline.toJSDate(),
							deadlineISO: deadline.toISO(),
							comment: item.comment ?? "Submission deadline",
							when: conf.date,
							place: conf.place,
						});
					}
				}
			}
		}
	}));
	return rows;
}

async function loadYeahTiger(now) {
	const rows = [];
	const text = await fetchText(YEAH_TIGER_URL);
	for (const entry of loadYaml(text)) {
		const deadline = parseCcfddlDeadline(entry.deadline ?? "", "AoE");
		if (deadline && deadline >= now) {
			rows.push({
				conf: `${entry.title} ${entry.year}`,
				title: entry.title,
				year: entry.year,
				url: entry.link,
				deadline: deadline.toJSDate(),
				deadlineISO: deadline.toISO(),
				comment: entry.note ?? "Submission deadline",
				when: entry.date,
				place: entry.place,
			});
		}
	}
	return rows;
}

// WikiCFP category pages list active CFPs first (paired <tr>s: event/name,
// then when/where/deadline), then an "Expired CFPs" separator row. Deadlines
// look like "Jun 15, 2026" or "Jun 15, 2026 (Jun 8, 2026)" where the
// parenthesized date is the abstract deadline.
const WIKICFP_ROW = /<td rowspan="2" align="left"><a href="([^"]+)">([^<]+)<\/a><\/td>\s*<td align="left" colspan="3">([^<]*)</g;
const WIKICFP_DETAIL = /<td align="left">([^<]*)<\/td>\s*<td align="left">([^<]*)<\/td>\s*<td align="left">([^<]*)<\/td>/g;

function parseWikicfpPage(html, category, now, events) {
	if (!html.includes("Deadline")) {
		throw new Error(`unrecognized page markup for category "${category}"`);
	}
	const expiredAt = html.indexOf("Expired CFPs");
	const active = expiredAt === -1 ? html : html.slice(0, expiredAt);

	const heads = [...active.matchAll(WIKICFP_ROW)];
	const details = [...active.matchAll(WIKICFP_DETAIL)];
	for (let i = 0; i < Math.min(heads.length, details.length); i++) {
		const [, href, name, fullName] = heads[i];
		const [, when, where, deadlineText] = details[i];
		const [, main, abstract] = deadlineText.match(/^([^(]*)(?:\((.*)\))?/) ?? [];
		const deadline = DateTime.fromFormat((main ?? "").trim(), "LLL d, yyyy", { zone: AOE }).endOf("day");
		// The upper bound sheds typo years ("Apr 21, 2107") that WikiCFP
		// itself sorts as active.
		if (!deadline.isValid || deadline < now || deadline > now.plus({ years: 5 })) {
			continue;
		}
		// Journal and book-chapter CFPs (mostly predatory) have no event dates.
		if (when.trim() === "N/A") {
			continue;
		}
		const id = href.match(/eventid=(\d+)/)?.[1] ?? href;
		if (events.has(id)) {
			events.get(id).categories.push(category);
			continue;
		}
		events.set(id, {
			name: decodeEntities(name.trim()),
			fullName: decodeEntities(fullName.trim()),
			url: `http://www.wikicfp.com${decodeEntities(href)}`,
			deadline: deadline.toJSDate(),
			deadlineISO: deadline.toISO(),
			abstractDeadline: abstract?.trim() || null,
			when: when.trim(),
			where: where.trim(),
			categories: [category],
		});
	}
	// More active CFPs may follow on the next page only if this one had no
	// expired section yet.
	return expiredAt === -1;
}

async function loadWikicfp(category, now, events) {
	for (let page = 1; page <= WIKICFP_MAX_PAGES; page++) {
		const url = `http://www.wikicfp.com/cfp/call?conference=${encodeURIComponent(category)}&page=${page}`;
		const hasMore = parseWikicfpPage(await fetchText(url), category, now, events);
		if (!hasMore) {
			break;
		}
	}
}

export default async function() {
	const now = DateTime.now().setZone(AOE);
	const errors = [];

	const [ccfddl, yeahTiger] = await Promise.all([
		loadCcfddl(now).catch(e => {
			errors.push({ source: "ccf-deadlines", message: e.message });
			return [];
		}),
		loadYeahTiger(now).catch(e => {
			errors.push({ source: "yeah-tiger", message: e.message });
			return [];
		}),
	]);

	// ccfddl carries the richer timeline; yeah-tiger only fills conference
	// editions ccfddl doesn't know about.
	const known = new Set(ccfddl.map(r => `${r.title.toUpperCase()} ${r.year}`));
	const conferences = ccfddl.concat(
		yeahTiger.filter(r => !known.has(`${r.title.toUpperCase()} ${r.year}`))
	).sort((a, b) => a.deadline - b.deadline);

	const events = new Map();
	await Promise.all(WIKICFP_CATEGORIES.map(category =>
		loadWikicfp(category, now, events).catch(e => {
			errors.push({ source: `WikiCFP "${category}"`, message: e.message });
		})
	));
	// Drop WikiCFP entries the curated list already covers.
	const curated = new Set(conferences.map(r => r.conf.toUpperCase()));
	const wikicfp = [...events.values()]
		.filter(e => !curated.has(e.name.toUpperCase()))
		.sort((a, b) => a.deadline - b.deadline);

	return { conferences, wikicfp, errors, generated: now.toJSDate() };
}
