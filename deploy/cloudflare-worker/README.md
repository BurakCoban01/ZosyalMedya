# Optional Cloudflare Worker front door

This template gives the demo a stable `workers.dev` URL while keeping the full
application on the Coolify host. It is a thin streaming reverse proxy: it does
not parse or buffer uploads/responses, terminate application authentication, or
replace application authorization and rate limits.

No origin secret is implemented. The hidden Coolify URL must therefore be
treated as a fully public attack surface. Its only exposed service remains
`web`; API and data services must never receive a Coolify domain or host port.

## Before deploying

1. Complete and verify the direct Coolify deployment first.
2. Copy `wrangler.example.toml` to an untracked `wrangler.toml`.
3. Replace `PUBLIC_HOST` with the exact allocated workers.dev hostname, without
   `https://` or `/`.
4. Replace `ORIGIN_URL` with the hidden Coolify HTTPS origin. It must contain no
   credentials, path, query, or fragment and must not equal the Worker URL.
5. Keep the example file unchanged and never commit `wrangler.toml`, tokens, or
   account identifiers.

From this directory, authenticate and deploy only during the human external
gate:

```powershell
npx wrangler@4.123.0 deploy
```

The repository-local type check, which does not authenticate or deploy, is:

```powershell
& ..\..\scripts\with-project-node.ps1 npx tsc -p tsconfig.json
& ..\..\scripts\with-project-node.ps1 node --test tests/index.test.mjs
```

The Worker preserves method, path, query, request body stream, response stream,
and the `Upgrade: websocket` header. It removes caller-supplied forwarding
headers before the request enters the trusted Coolify/nginx path. It contains
no request/body/token logging.

## Connect the application to the stable URL

After the Worker URL responds through the hidden origin:

1. Leave Coolify `PUBLIC_HOST` set to the hidden origin hostname. Fetch sets the
   upstream Host to that hostname, which nginx validates.
2. Change Coolify `PUBLIC_ORIGIN` to the exact Worker origin, for example
   `https://enterprise-social-community.example-account.workers.dev`.
3. Redeploy once. Absolute identity links and allowed browser origin now use the
   public URL while the upstream Host boundary remains the hidden origin.
4. Re-run login/refresh/logout, a 25 MB upload boundary, download, SignalR WSS,
   redirects, cookies, and failed-network/console checks through the Worker.

Do not add an `Access-Control-Allow-Origin: *` header in the Worker. Do not
cache `/api/`, `/hubs/`, `/health`, authenticated HTML, or media responses.
The application upload ceiling is 25 MiB; re-check the active Cloudflare plan's
request and daily-use limits immediately before publication.

## Failure and fallback

If Worker quota, routing, or WebSocket behavior fails, temporarily use the
verified Coolify HTTPS origin as the public URL: set both `PUBLIC_HOST` and
`PUBLIC_ORIGIN` to that origin, redeploy, and repeat the direct-origin smoke.
This changes the presentation URL; it does not require an application rewrite.

Rollback the Worker itself from Cloudflare's deployment history or disable its
workers.dev route. Do not delete the Coolify application or its volumes.

## Provider references

- [Cloudflare Request API](https://developers.cloudflare.com/workers/runtime-apis/request/)
- [Cloudflare WebSocket API](https://developers.cloudflare.com/workers/runtime-apis/websockets/)
- [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/)
