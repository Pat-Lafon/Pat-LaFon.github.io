import Fetch from "@11ty/eleventy-fetch";

// Build-time data for /feed/<slug>.xml: full-archive feeds of WordPress blogs
// whose own feeds carry only their latest posts, built from the REST API.
// Any failure throws, failing the build rather than shipping a short feed.

const SITES = [
	{ slug: "angry-gm", title: "The Angry GM", origin: "https://theangrygm.com" },
	{ slug: "regehr", title: "Embedded in Academia", origin: "https://blog.regehr.org" },
	{ slug: "alexandrian", title: "The Alexandrian", origin: "https://thealexandrian.net" },
];

const FIELDS = "per_page=100&_fields=link,title,date_gmt,excerpt";

// theangrygm.com answers unfamiliar user agents with 406.
const get = (url) => Fetch(url, {
	type: "json",
	fetchOptions: { headers: { "user-agent": "pat-lafon.github.io feed reader (https://pat-lafon.github.io/)" } },
});

// WordPress titles are HTML, escaped inconsistently (a raw "<" gets through), so
// decode them to text for the template to escape. Any named entity beyond the
// five below is unexpected and throws rather than reaching readers undecoded.
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decode(html, url) {
	return html.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
		if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
		if (e in NAMED) return NAMED[e];
		throw new Error(`${url}: unexpected entity ${m} in title`);
	});
}

async function archive({ slug, title, origin }) {
	const api = `${origin}/wp-json/wp/v2/posts?${FIELDS}`;
	const posts = [];
	for (let page = 1; ; page++) {
		const batch = await get(`${api}&page=${page}`);
		posts.push(...batch);
		if (batch.length < 100) break;
	}
	if (!posts.length) throw new Error(`${api}: no posts`);
	return {
		slug, title, origin,
		posts: posts.map(p => ({
			url: p.link,
			title: decode(p.title.rendered, p.link),
			date: new Date(p.date_gmt + "Z").toUTCString(),
			excerpt: p.excerpt.rendered.trim(),
		})),
	};
}

export default () => Promise.all(SITES.map(archive));
