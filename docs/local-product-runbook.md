# ZosyalMedya local product runbook

This guide keeps the product local. Do not expose Docker ports through a public
tunnel, deploy the generated bundles, or commit local credentials.

## First-time setup

Prerequisites:

- Docker Desktop with Compose;
- PowerShell;
- .NET SDK 9 for host-side backend development;
- repository dependencies installed with the project Node 24.18.0 wrapper.

Create the local environment file and replace its placeholder signing key with
a private random value of at least 32 characters:

```powershell
Copy-Item .env.example .env
notepad .env
```

Keep `.env` out of source control. The normal media provider is the local
filesystem; MinIO and ClamAV are optional profiles, not required for the
critical-path demo.

Install frontend dependencies without changing the global Node selection:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\with-project-node.ps1 npm install
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\with-project-node.ps1 node -v
```

Only regenerate the TypeScript client after an intentional OpenAPI contract
change:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\with-project-node.ps1 npm run api:generate
```

Migrations run during API startup. After Postgres and API are healthy, load the
complete Turkish demo dataset through the idempotent orchestrator. Keep the
local demo password in the current process, not in a tracked file:

```powershell
$env:ZOSYAL_DEMO_PASSWORD = Read-Host 'Yerel demo parolası'
& scripts\seed-demo.ps1
```

The orchestrator applies the three SQL parts with byte-preserving `docker cp`
plus in-container `psql -f`, then uploads the small repository fixtures through
the real Media API. It is safe to rerun: fixed SQL identities upsert or skip,
existing media references are retained, and partial API uploads are rolled
back. Windows PowerShell 5 can corrupt Turkish content when `Get-Content` is
piped to `psql`, so do not replace this path with an inline text pipeline.

## Normal local start

Load the signing key into the current PowerShell process without printing it,
then start the project services:

```powershell
$env:JWT_SIGNING_KEY = ((Get-Content .env | Where-Object { $_ -match '^JWT_SIGNING_KEY=' } | Select-Object -First 1) -replace '^JWT_SIGNING_KEY=', '')
& scripts\dev-up.ps1 -WithApplication
```

For a first demo start, set `ZOSYAL_DEMO_PASSWORD` in the same process and use
`& scripts\dev-up.ps1 -WithApplication -SeedDemoData` to build/start and seed
in one bounded command.

Wait for the API and inspect project service status:

```powershell
Invoke-WebRequest http://localhost:58080/health/ready -UseBasicParsing
docker compose --profile core --profile app ps
```

The containerized product is available at:

- web: `http://localhost:58081`;
- API health: `http://localhost:58080/health/ready`;
- Swagger: `http://localhost:58080/swagger`.

For source-level web work, start the Angular server in a separate PowerShell
window:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\with-project-node.ps1 npx ng serve web-angular --host 127.0.0.1 --port 4200
```

Optional Ionic/PWA server, in another window:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\with-project-node.ps1 npx ng serve mobile-ionic --host 127.0.0.1 --port 8100
```

Use `http://127.0.0.1:4200` for web source QA and
`http://127.0.0.1:8100` for Ionic source QA. The primary populated identity is
`emrekaraca`; the seed grants its current `Member,Administrator` roles. The
other populated perspectives are `ayseyilmaz`, `mehmetdemir`, `zeynepkaya`,
`canozturk`, `elifsahin`, `burakaydin`, `denizcelik` and `mervearslan`. They
use the same local password supplied through `ZOSYAL_DEMO_PASSWORD`; do not
store that value in tracked documentation. Newly registered accounts must open
the verification link written to `src/Host/Api/.local/email-pickup` before
their first login.

## Demonstrable critical journey

After the browser backend is available, validate this sequence against the real
local API:

1. Sign in at `/giris`; separately open the verify-email and reset-password
   routes and confirm their honest pending/error states.
2. On `/akis`, switch Following/Discovery; view/create a real Story, create an
   original post, a poll, a repost, and a quote; exercise reaction, threaded
   comment, save, vote and authorized image/video actions.
3. On `/kesfet`, search real profiles/content, inspect trends and communities.
4. On `/profil` and `/profil/:handle`, inspect avatar/cover, timeline/media and
   follower/following/request surfaces; update only the signed-in profile.
5. On `/mesajlar`, select a real profile, start a direct conversation and
   exercise reply/media/edit/delete where ownership allows it.
6. On `/bildirimler` and `/kaydedilenler`, inspect and act on real records.
7. On `/baglantilar`, inspect real graph lists and pending private requests,
   then exercise only a reversible permitted relationship action.
8. On `/sorular`, select a real profile, send a question and open an answered
   public question detail.
9. On `/ayarlar`, inspect sessions/privacy and change only supported settings.
10. Open `/yonetim` as both a Member and an Administrator; Member access must
    remain permission-safe.

Repeat the web journey in light and dark themes at 1440x900 and 390x844. At
390px confirm bottom navigation, overlays, text wrapping, and absence of
horizontal overflow. Review the browser console and failed requests after each
route. On Ionic, smoke `/akis`, `/kesfet`, `/mesajlar`, `/bildirimler`, and the
remaining routes reachable from the primary tabs/menu. In `/akis`, verify
Discovery, repost, quote, source context, view count, and exact save removal.
In `/mesajlar`, `/baglantilar`, and `/sorular`, select a real profile by name
and complete the permitted primary action without entering an identifier.

## Verified and safe to demonstrate

The current source/build/API evidence supports:

- registration, local email verification, login, logout, and tab-scoped session reload;
- real Following/Discovery feed contracts;
- original, repost, and quote creation semantics;
- poll, reaction, reply/comment, save, and real view metadata wiring;
- real profile search/selection for messaging, relationships, and questions;
- direct-conversation participant identity and read/unread state;
- profile, trends, communities, saves, notifications, sessions, and
  permission-safe administration APIs;
- production compilation of both web and Ionic applications;
- current browser acceptance at 1440x900 and 390x844, with adaptive checks at
  768x1024 and 360x800;
- current Ionic acceptance at 390x844/430 widths, including real Stories,
  authorized media, deep routes, messaging, Q&A and social graph behavior.

## Known limitations

- Product/API contract: discovery reporting retains its existing subject-id
  input because the backend has no universal friendly entity-picker contract
  for all report subject types.
- Product/API contract: Stories is implemented as a truthful, server-expiring
  authorized web/Ionic slice. A dedicated Reels surface is deliberately
  deferred until the server owns reliable video metadata and bounded
  video-only discovery; existing post and Story video remain demonstrable.
- Test tooling: Windows PowerShell 5 can corrupt inline non-ASCII JSON. Use a
  UTF-8 file/body or a byte-preserving request path; this is not an API defect.

## Safe stop

Stop the web and Ionic dev-server terminals with `Ctrl+C`. Stop only this
project's services and preserve all data volumes:

```powershell
docker compose --profile core --profile app stop
docker compose --profile core --profile app ps
Get-NetTCPConnection -LocalPort 4200,8100,58080,58081 -ErrorAction SilentlyContinue
```

Never use `docker compose down -v`, `docker volume rm`, or Docker prune for a
normal stop.

## Emergency recovery

Start from the smallest safe inspection:

```powershell
git status --porcelain
git diff --stat
git log -4 --oneline
docker compose --profile core --profile app ps
Get-NetTCPConnection -LocalPort 4200,8100,58080,58081 -ErrorAction SilentlyContinue
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\with-project-node.ps1 node -v
```

Confirm the newest durable checkpoint with `git log -4 --oneline` before
continuing after an interruption.

Preserve partial and unknown work. Delete only a generated cache after proving
that cache is the failure source; do not reset, clean, stash, or overwrite
unrelated changes.
