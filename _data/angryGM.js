import Fetch from "@11ty/eleventy-fetch";

// Build-time data for /feed/angry-gm.xml. theangrygm.com's own feed carries only
// its last 10 posts; the WordPress REST API lists them all.
// Any failure throws, failing the build rather than shipping a short feed.

const API = "https://theangrygm.com/wp-json/wp/v2/posts?per_page=100&_fields=link,title,date_gmt,excerpt";

// The site answers unfamiliar user agents with 406.
const get = (url) => Fetch(url, {
	type: "json",
	fetchOptions: { headers: { "user-agent": "pat-lafon.github.io feed reader (https://pat-lafon.github.io/)" } },
});

// Titles go into the XML still HTML-escaped, which is only valid while they use
// no named entity beyond XML's five.
const NOT_XML = /&(?!amp;|lt;|gt;|quot;|apos;|#)\w+;/;

export default async function() {
	const posts = [];
	for (let page = 1; ; page++) {
		const batch = await get(`${API}&page=${page}`);
		posts.push(...batch);
		if (batch.length < 100) break;
	}
	if (!posts.length) throw new Error(`${API}: no posts`);
	return posts.map(p => {
		if (NOT_XML.test(p.title.rendered)) throw new Error(`${p.link}: non-XML entity in title`);
		return {
			url: p.link,
			title: p.title.rendered,
			date: new Date(p.date_gmt + "Z").toUTCString(),
			excerpt: p.excerpt.rendered.trim(),
		};
	});
}
