import type { APIRoute } from "astro";
import { url } from "@utils/url-utils";

export const GET: APIRoute = ({ site }) => {
	const siteRoot = site ?? new URL("https://zh19990906.github.io");
	const sitemap = new URL(url("/sitemap-index.xml"), siteRoot).toString();
	return new Response(`User-agent: *\nAllow: /\nSitemap: ${sitemap}\n`, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
};
