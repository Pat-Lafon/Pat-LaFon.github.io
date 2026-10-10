import Fetch from "@11ty/eleventy-fetch";

// Build-time data for /feed/claude-tutorials.xml. academy.claude.com publishes no
// feed and dates nothing, so items carry no date: readers track unread by guid.
// Any failure throws, failing the build rather than shipping a short feed.

const SITEMAP_URL = "https://academy.claude.com/sitemap.xml";

// English tutorials only; locale copies live under /<lang>/tutorials/.
const TUTORIAL = /^https:\/\/academy\.claude\.com\/tutorials\/[^/]+$/;

const get = (url) => Fetch(url, {
	type: "text",
	duration: "1d",
	fetchOptions: { headers: { "user-agent": "pat-lafon.github.io tutorials feed (https://pat-lafon.github.io/)" } },
});

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// Undo HTML entities so the template can re-escape for XML.
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
	e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
	: NAMED[e.toLowerCase()] ?? m);

async function tutorial(url) {
	const html = await get(url);
	const title = html.match(/<title>(.*?)(?: · Claude Academy)?<\/title>/)?.[1];
	if (!title) throw new Error(`${url}: no <title>`);
	const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
	return { url, title: decode(title), description: description && decode(description) };
}

export default async function() {
	const sitemap = await get(SITEMAP_URL);
	const urls = [...new Set(sitemap.match(/<loc>[^<]+<\/loc>/g)?.map(l => l.slice(5, -6).trim()))]
		.filter(u => TUTORIAL.test(u));
	if (!urls.length) throw new Error(`${SITEMAP_URL}: no URLs match ${TUTORIAL}`);
	return Promise.all(urls.map(tutorial));
}
