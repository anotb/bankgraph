# Security policy

Do not open a public issue for a vulnerability that could expose a secret, modify production data, bypass the private pipeline boundary, execute script in another reader's browser, or reveal a nonpublic report.

Use GitHub's private vulnerability reporting for this repository when it is available under **Security**. Include the affected route or component, the smallest reproducible request, the impact, and any evidence that the issue is exploitable. Remove credentials, account identifiers, and unrelated personal data from the report.

The production data pipeline is a server-to-server surface. `POST /api/v1/pipeline/sync` must require `PIPELINE_SECRET`, reject browser cross-origin access, serialize overlapping runs, and remain absent from WebMCP registration. FDIC and originating-agency content is external data and must be treated as untrusted at display and export boundaries.

There is no promised response window until a maintainer publishes one. Do not test a suspected issue against production in a way that changes data or affects other readers; use a local Worker and synthetic records instead.
