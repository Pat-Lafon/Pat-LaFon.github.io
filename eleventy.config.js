import { IdAttributePlugin, InputPathToUrlTransformPlugin, HtmlBasePlugin } from "@11ty/eleventy";
import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import pluginSyntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import pluginNavigation from "@11ty/eleventy-navigation";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";

import pluginFilters from "./_config/filters.js";
import { buildServiceWorkers } from "./_config/build-sw.js";
import { buildTailwind } from "./_config/build-tailwind.js";

// Path suffixes inside the PWA dirs that are build-time/CI-only and must not ship to _site.
const PWA_BUILD_ONLY = [
	"TODO.md",
	"vendor/update.js",
	"vendor/check-updates.js",
	"vendor/versions.json",
	"audio/build.js",
	"audio/sources.json",
];

const pwaPassthroughFilter = (path) =>
	!path.endsWith(".test.js") && !PWA_BUILD_ONLY.some((suffix) => path.endsWith(suffix));

/** @param {import("@11ty/eleventy").UserConfig} eleventyConfig */
export default async function(eleventyConfig) {
	// Drafts, see also _data/eleventyDataSchema.js
	eleventyConfig.addPreprocessor("drafts", "*", (data, _content) => {
		if(data.draft && process.env.ELEVENTY_RUN_MODE === "build") {
			return false;
		}
	});

	eleventyConfig
		.addPassthroughCopy({
			"./public/": "/"
		})
		.addPassthroughCopy("./content/feed/pretty-atom-feed.xsl")
		.addPassthroughCopy("./content/papers")
		.addPassthroughCopy("./content/presentations")
		.addPassthroughCopy({ "./content/photo.jpeg": "/img/photo.jpeg" })
		.addPassthroughCopy("./hiragana",   { filter: pwaPassthroughFilter })
		.addPassthroughCopy("./meditation", { filter: pwaPassthroughFilter });

	eleventyConfig.addWatchTarget("content/**/*.{svg,webp,png,jpg,jpeg,gif}");

	// Per-page bundles, see https://github.com/11ty/eleventy-plugin-bundle
	// Adds the {% css %} paired shortcode
	eleventyConfig.addBundle("css", {
		toFileDirectory: "dist",
	});
	// Adds the {% js %} paired shortcode
	eleventyConfig.addBundle("js", {
		toFileDirectory: "dist",
	});

	eleventyConfig.addPlugin(pluginSyntaxHighlight, {
		preAttributes: { tabindex: 0 }
	});
	eleventyConfig.addPlugin(pluginNavigation);
	eleventyConfig.addPlugin(HtmlBasePlugin);
	eleventyConfig.addPlugin(InputPathToUrlTransformPlugin);

	eleventyConfig.addPlugin(feedPlugin, {
		type: "atom", // or "rss", "json"
		outputPath: "/feed/feed.xml",
		stylesheet: "pretty-atom-feed.xsl",
		templateData: {
			eleventyNavigation: {
				key: "Feed",
				order: 4
			}
		},
		collection: {
			name: "posts",
			limit: 1000,
		},
		metadata: {
			language: "en",
			title: "Patrick LaFontaine's Blog",
			subtitle: "Precipitously Produced; Powered by Prolonged Procrastination",
			base: "https://pat-lafon.github.io/",
			author: {
				name: "Patrick LaFontaine",
			}
		}
	});

	// Image optimization: https://www.11ty.dev/docs/plugins/image/#eleventy-transform
	eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
		formats: ["avif", "webp", "auto"],

		failOnError: true,
		htmlOptions: {
			imgAttributes: {
				// e.g. <img loading decoding> assigned on the HTML tag will override these values.
				loading: "lazy",
				decoding: "async",
			}
		},

		sharpOptions: {
			animated: true,
		},
	});

	// Filters
	eleventyConfig.addPlugin(pluginFilters);

	eleventyConfig.addPlugin(IdAttributePlugin);

	eleventyConfig.addShortcode("currentBuildDate", () => {
		return (new Date()).toISOString();
	});

	// After Eleventy writes _site/: build the hiragana Tailwind bundle, then the
	// PWA service workers (so the generated CSS is included in each precache
	// manifest). See _config/build-tailwind.js, _config/build-sw.js.
	eleventyConfig.on("eleventy.after", async () => {
		await buildTailwind();
		await buildServiceWorkers();
	});
};

export const config = {
	templateFormats: [
		"md",
		"njk",
		"html",
		"liquid",
		"11ty.js",
	],
	markdownTemplateEngine: "njk",
	htmlTemplateEngine: "njk",
	dir: {
		input: "content",
		includes: "../_includes",
		data: "../_data",
		output: "_site"
	},
};
