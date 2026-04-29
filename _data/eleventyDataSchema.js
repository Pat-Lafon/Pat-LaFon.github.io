import { z } from "zod";
import { fromZodError } from 'zod-validation-error';

const postSchema = z.object({
	title: z.string().min(1),
	description: z.string().min(1),
	date: z.date(),
	tags: z.array(z.string()),
	draft: z.boolean().optional(),
}).passthrough();

const baseSchema = z.object({
	draft: z.boolean().optional(),
}).passthrough();

function validate(data) {
	const isPost = Array.isArray(data.tags) && data.tags.includes("posts");
	const isDraft = data.draft === true;
	const schema = (isPost && !isDraft) ? postSchema : baseSchema;

	const result = schema.safeParse(data);
	if (!result.success) {
		throw new Error(fromZodError(result.error).message);
	}
}

// Eleventy auto-invokes function exports in data files, so wrap to expose
// the validator itself in the cascade. See TemplateData.js:523.
export default () => validate;
