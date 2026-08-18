# Coolify deployment handoff

This is the beginner-safe deployment map for **Enterprise Social & Community
Platform**. It prepares a deployment; the repository never performs one.

Use a sanitized, single-commit publication repository created by
`scripts/public-release/new-publication-repository.ps1`. Never connect the
original repository history to a public host.

## Create the Coolify resource

1. In Coolify, create one Docker Compose application from the cleaned Git
   repository and select `compose.public-demo.yaml`.
2. Build/deploy only this project while first validating it. Do not build
   multiple portfolio projects concurrently on the 2-OCPU host.
3. Enter every variable from the matrix below in Coolify. Mark secret rows as
   secret/sensitive. Never paste them into Git, Compose, build arguments, or a
   frontend variable.
4. Assign one HTTPS domain to service `web`, container port `8080`. Assign no
   domain to `api`, `postgres`, `mongodb`, `redis`, `minio`, `clamav`, or
   `configuration-gate`.
5. Do not add host-port mappings for internal services and do not add a custom
   Docker network. Coolify/Compose owns the per-project default network.
6. Deploy. Wait for PostgreSQL, MongoDB, Redis, MinIO and ClamAV health before
   API readiness; nginx/web is the only ingress.

The API intentionally shares the web container's network namespace, listens on
`127.0.0.1:8081`, and trusts only that loopback nginx hop. This is why `api`
must not receive a domain or port.

## Environment matrix

Generate every secret independently. Example shapes are documentation only and
must never be used as values.

| Variable | Class | Owner/use | Required value and example shape | Restart |
|---|---|---|---|---|
| `PUBLIC_HOST` | Public | nginx/API host boundary | Hidden Coolify origin hostname only, e.g. `origin.example.net` | Redeploy web + API |
| `PUBLIC_ORIGIN` | Public | CORS and absolute identity links | Exact HTTPS browser origin, no trailing slash, e.g. `https://demo.example.net` | Redeploy API |
| `PUBLIC_HTTP_BIND` | Public/operator | Portable host binding | Keep `127.0.0.1` | Redeploy web |
| `PUBLIC_HTTP_PORT` | Public/operator | Portable local port | Keep `8080`; Coolify domain targets container `8080` | Redeploy web |
| `POSTGRES_PASSWORD` | Secret | PostgreSQL application role | Unique random 32+ characters | Recreate only on planned credential rotation |
| `MONGO_ROOT_PASSWORD` | Secret | Mongo initialization/operator | Unique random 32+ characters; different from app password | Recreate only on planned credential rotation |
| `MONGO_APP_PASSWORD` | Secret | Mongo `platform` read/write role | Unique URL-safe random 32+ characters | Redeploy Mongo + API after coordinated rotation |
| `REDIS_PASSWORD` | Secret | Redis authentication | Unique random 32+ characters | Redeploy Redis + API after coordinated rotation |
| `JWT_SIGNING_KEY` | Secret | API token signing | Base64 of at least 32 random bytes | Redeploy API; rotation signs out existing sessions |
| `MINIO_ROOT_USER` | Secret | Object-store credential/user | Unique URL-safe random identifier, e.g. 24 alphanumerics | Redeploy MinIO + API after coordinated rotation |
| `MINIO_ROOT_PASSWORD` | Secret | Object-store credential | Unique random 32+ characters | Redeploy MinIO + API after coordinated rotation |

Example generation on the operator machine (copy output directly to Coolify;
do not redirect it into the repository):

```powershell
# Repeat for each password. Generate a fresh value every time.
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
# URL-safe user identifier.
([Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(16))).ToLowerInvariant()
```

Start with the direct Coolify URL: set `PUBLIC_HOST` to its hostname and
`PUBLIC_ORIGIN` to its full HTTPS origin. If the optional Worker is later used,
leave `PUBLIC_HOST` on the hidden origin and change only `PUBLIC_ORIGIN` to the
workers.dev origin, as documented in `deploy/cloudflare-worker/README.md`.

Before deployment, create a local placeholder file only for validation and run:

```powershell
Copy-Item .env.public-demo.example .env.public-demo
# Replace every placeholder locally; never commit this file.
docker compose --env-file .env.public-demo -f compose.public-demo.yaml config --quiet
```

## First-deploy acceptance

In Coolify, check that only `web` has a public domain and that all required
volumes exist: `postgres-data`, `mongo-data`, `redis-data`, `minio-data`,
`clamav-data`, and `api-data`. Then verify, in order:

1. web and API readiness are healthy; `/health/ready` returns success through
   the HTTPS domain;
2. seed the deterministic demo from the trusted operator checkout. In Coolify,
   copy the `postgres` container name. On the operator's Windows PowerShell,
   point Docker at the server over SSH and run the exact command below;
3. sign in with the documented demo identity and confirm refresh/reload/logout;
4. exercise feed, profile, graph, Q&A, community, message/realtime, notification,
   Story, administration, upload/download and permission-denied paths;
5. confirm browser redirects and identity links use `PUBLIC_ORIGIN`, with no
   localhost or hidden internal service name;
6. record `docker stats`, image/volume size and log growth; keep the evidence
   outside the public repository;
7. run a backup to operator-controlled storage, then restore into a new
   disposable `prv1-restore-*` project before calling recovery proven.

```powershell
$previousContext = docker context show
$contexts = @(docker context ls --format '{{.Name}}')
if ($contexts -notcontains 'escp-public') {
  docker context create escp-public --docker "host=ssh://ubuntu@REPLACE_WITH_OCI_IP"
}
$passwordPointer = [IntPtr]::Zero
try {
  docker context use escp-public
  $securePassword = Read-Host -AsSecureString "Public demo fixture password"
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $env:ESCP_DEMO_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  & scripts\seed-demo.ps1 `
    -ApiBaseUrl 'https://REPLACE_WITH_HIDDEN_COOLIFY_ORIGIN' `
    -PostgresContainer 'REPLACE_WITH_COOLIFY_POSTGRES_CONTAINER' `
    -PostgresUser 'platform' `
    -PostgresDatabase 'platform'
}
finally {
  Remove-Item Env:\ESCP_DEMO_PASSWORD -ErrorAction SilentlyContinue
  if ($passwordPointer -and $passwordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  docker context use $previousContext
}
```

The seed remains idempotent, uses the real API for media-rich fixtures, and
does not delete unrelated product data. Do not type the password into shell
history or a repository file. If the command fails, switch the Docker context
back to `default`, inspect the error, and do not reset or remove volumes.

The current local workstation could validate Compose syntax but had no running
Docker engine. ARM64 image startup, fresh-volume seed, proxy/WSS/browser smoke,
resource soak and restore therefore remain hard pre-publication gates.

## Redeploy and rollback

Before any change, create and verify a backup with
`scripts/public-release/backup-public-demo.sh`. In Coolify, use **Redeploy** for
the exact reviewed commit. Never choose an option that removes persistent
volumes.

For an application regression:

1. select the last known-good immutable commit in the Coolify source settings;
2. redeploy the same Compose project without changing volume names;
3. verify health, login, media download and realtime;
4. restore data only when a proved data migration problem requires it, and only
   through `restore-public-demo-smoke.sh` into a new disposable project first.

Do not use `docker compose down -v`, delete a Coolify application, delete named
volumes, or restore over the live project as a rollback shortcut.

## Human-only boundary

Creating the OCI VM/account, installing Coolify, connecting the cleaned Git
repository, entering real secrets, assigning DNS/domains, deploying the Worker,
running engine-backed acceptance, and publishing the URL/repository are human
actions. Stop if any internal service is reachable publicly or any required
gate is red.

## Provider references

- [Coolify Docker Compose](https://coolify.io/docs/knowledge-base/docker/compose)
- [Coolify Docker Compose networking](https://coolify.io/docs/applications/build-packs/docker-compose)
- [Coolify domains](https://coolify.io/docs/knowledge-base/domains)
