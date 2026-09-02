import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Local development against the deployed Worker's public API. Set
// BANKGRAPH_REMOTE_API=https://<worker>.workers.dev to run the UI with live data
// and no local D1. Server-side loads are rewritten in hooks.server.ts; this proxy
// covers fetches made from the browser.
const remoteApi = process.env.BANKGRAPH_REMOTE_API?.replace(/\/$/, '');

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: remoteApi
		? {
			proxy: {
				'/api': { target: remoteApi, changeOrigin: true, secure: true }
			}
		}
		: undefined
});
