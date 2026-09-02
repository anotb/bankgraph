# Security boundaries

`POST /api/v1/pipeline/sync` is a private server-to-server administration route. It requires `PIPELINE_SECRET`, intentionally sends no CORS headers, and must not be registered or advertised as a WebMCP tool.

WebMCP can read public bank data and change the current browser's board. Its mutation tools may update locally persisted questions, filters, takeaways, watchlist intent, theme, chart configuration, and board layout, or create a browser-side share/export artifact. They cannot write to D1, run the pipeline, change production data, or access Cloudflare credentials.

The nightly workflow serializes runs at the GitHub Actions level. The route also claims a short-lived D1 lease before executing a stage, providing a second overlap guard for manual calls and retries.
