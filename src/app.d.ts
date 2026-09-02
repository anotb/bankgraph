/// <reference types="@sveltejs/kit" />
/// <reference path="../worker-configuration.d.ts" />

declare global {
	interface Document {
		/** Experimental imperative WebMCP API; absent in unsupported or non-secure browsers. */
		readonly modelContext?: import('$lib/webmcp/types.js').ModelContextLike;
	}

	namespace App {
		interface Locals {
			liveDataRelease?: string;
			liveDataGeneration?: string;
		}

		interface Platform {
			env: Cloudflare.Env;
		}
	}
}

export {};
