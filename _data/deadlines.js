import Fetch from "@11ty/eleventy-fetch";
import { load as loadYaml } from "js-yaml";
import { DateTime } from "luxon";

// Build-time data for /deadlines/. A source that fails to fetch or parse lands
// in `errors` and renders as a note on the page instead of failing the build.

// Every venue the page tracks, mapped to its file in
// https://github.com/ccfddl/ccf-deadlines, named by that repo's category
// directory — null where only yeah-tiger carries it. Both sources are filtered
// to these keys, so this is the whole list. Edit it to change what the page
// tracks.
const VENUES = {
	POPL: "SE/popl", PLDI: "SE/pldi", OOPSLA: "SE/oopsla", ICFP: "SE/icfp",
	ECOOP: "SE/ecoop", ETAPS: "SE/etaps", FM: "SE/fm", RV: "SE/rv", SAS: "SE/sas",
	CAV: "CT/cav", CADE: "CT/cade", FMCAD: "CT/fmcad", IJCAR: "CT/ijcar",
	LICS: "CT/lics", SAT: "CT/sat",
	ITP: null,
};

// Fills editions ccfddl lacks, and the venues it has no file for.
const YEAH_TIGER_URL = "https://raw.githubusercontent.com/yeah-tiger/yeah-tiger.github.io/master/_data/conferences.yml";

// Deadlines without an explicit timezone are Anywhere on Earth.
const AOE = "UTC-12";

async function fetchYaml(url) {
	return loadYaml(await Fetch(url, {
		type: "text",
		fetchOptions: {
			headers: { "user-agent": "pat-lafon.github.io deadlines page (https://pat-lafon.github.io/)" },
		},
	}));
}

// Both sources write "2026-07-09 23:59:59", occasionally date-only or TBD;
// ccfddl pairs it with a timezone like "AoE" or "UTC-12".
function parseDeadline(text, timezone) {
	const zone = !timezone || timezone === "AoE" ? AOE : timezone;
	for (const format of ["yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd"]) {
		const dt = DateTime.fromFormat(text, format, { zone });
		if (dt.isValid) {
			return dt;
		}
	}
	return null;
}

function row(conf, deadline, comment, { link, date, place }) {
	return { conf, url: link, deadline: deadline.toJSDate(), deadlineISO: deadline.toISO(), comment, when: date, place };
}

async function loadCcfddl(now) {
	const rows = [];
	await Promise.all(Object.values(VENUES).filter(Boolean).map(async file => {
		for (const series of await fetchYaml(`https://raw.githubusercontent.com/ccfddl/ccf-deadlines/main/conference/${file}.yml`)) {
			for (const conf of series.confs ?? []) {
				for (const item of conf.timeline ?? []) {
					const deadline = parseDeadline(item.deadline ?? "", conf.timezone);
					if (deadline && deadline >= now) {
						rows.push(row(`${series.title} ${conf.year}`, deadline, item.comment ?? "Submission deadline", conf));
					}
				}
			}
		}
	}));
	return rows;
}

async function loadYeahTiger(now) {
	const rows = [];
	for (const entry of await fetchYaml(YEAH_TIGER_URL)) {
		if (!(String(entry.title).toUpperCase() in VENUES)) {
			continue;
		}
		// A conference with submission rounds carries a list of deadlines.
		const rounds = Array.isArray(entry.deadline) ? entry.deadline : [entry.deadline ?? ""];
		rounds.forEach((round, i) => {
			const deadline = parseDeadline(round);
			if (deadline && deadline >= now) {
				const comment = entry.note ?? (rounds.length > 1 ? `Round ${i + 1}` : "Submission deadline");
				rows.push(row(`${entry.title} ${entry.year}`, deadline, comment, entry));
			}
		});
	}
	return rows;
}

export default async function() {
	const now = DateTime.now().setZone(AOE);
	const errors = [];
	const optional = (source, promise) => promise.catch(e => {
		errors.push({ source, message: e.message });
		return [];
	});

	const [ccfddl, yeahTiger] = await Promise.all([
		optional("ccf-deadlines", loadCcfddl(now)),
		optional("yeah-tiger", loadYeahTiger(now)),
	]);

	// ccfddl carries the richer timeline; yeah-tiger only fills editions it lacks.
	const known = new Set(ccfddl.map(r => r.conf.toUpperCase()));
	const conferences = ccfddl
		.concat(yeahTiger.filter(r => !known.has(r.conf.toUpperCase())))
		.sort((a, b) => a.deadline - b.deadline);

	return { conferences, errors, generated: now.toJSDate() };
}
