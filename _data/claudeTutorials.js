import Fetch from "@11ty/eleventy-fetch";

// Build-time data for /feed/claude-tutorials.xml. academy.claude.com publishes no
// feed and dates nothing, so items carry no date: readers track unread by guid.
// Any failure throws, failing the build rather than shipping a short feed.

const SITEMAP_URL = "https://academy.claude.com/sitemap.xml";

// English tutorials only; locale copies live under /<lang>/tutorials/.
const TUTORIAL = /^https:\/\/academy\.claude\.com\/tutorials\/[^/]+$/;

const get = (url) => Fetch(url, {
	type: "text",
	fetchOptions: { headers: { "user-agent": "pat-lafon.github.io tutorials feed (https://pat-lafon.github.io/)" } },
});

// Title and description go into the XML still HTML-escaped, which is only valid
// while the page uses no named entity beyond XML's five.
const NOT_XML = /&(?!amp;|lt;|gt;|quot;|apos;|#)\w+;/;

async function tutorial(url) {
	const html = await get(url);
	const title = html.match(/<title>(.*?)(?: · Claude Academy)?<\/title>/)?.[1];
	if (!title) throw new Error(`${url}: no <title>`);
	const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
	if (NOT_XML.test(title + description)) throw new Error(`${url}: non-XML entity in title or description`);
	return { url, title, description };
}

export default async function() {
	const sitemap = await get(SITEMAP_URL);
	const urls = (sitemap.match(/<loc>[^<]+<\/loc>/g) ?? []).map(l => l.slice(5, -6)).filter(u => TUTORIAL.test(u));
	if (!urls.length) throw new Error(`${SITEMAP_URL}: no URLs match ${TUTORIAL}`);
	return Promise.all(urls.map(tutorial));
}
