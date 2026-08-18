#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  echo "Usage: $0 --output /absolute/path --env-file /absolute/path [--project-name name]" >&2
  exit 64
}

output=""
env_file=""
project_name="enterprise-social-community-platform"
while (($#)); do
  case "$1" in
    --output) output="${2:-}"; shift 2 ;;
    --env-file) env_file="${2:-}"; shift 2 ;;
    --project-name) project_name="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done

[[ -n "$output" && -n "$env_file" ]] || usage
command -v docker >/dev/null || { echo "docker is required" >&2; exit 69; }
command -v sha256sum >/dev/null || { echo "sha256sum is required" >&2; exit 69; }

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
compose_file="$root/compose.public-demo.yaml"
[[ -z "$(git -C "$root" status --porcelain --untracked-files=all)" ]] || {
  echo "Backup requires a completely clean source checkout." >&2; exit 65;
}
env_file="$(realpath "$env_file")"
output="$(realpath -m "$output")"
case "$output/" in "$root/"*) echo "Backup output must be outside the repository." >&2; exit 65 ;; esac
[[ ! -e "$output" ]] || { echo "Backup output already exists: $output" >&2; exit 65; }
mkdir -m 700 -p "$output"

compose=(docker compose --project-name "$project_name" --env-file "$env_file" -f "$compose_file")
for service in postgres mongodb redis minio api web; do
  [[ -n "$("${compose[@]}" ps -q "$service")" ]] || { echo "Service is not created: $service" >&2; exit 69; }
done

resume_stack=0
resume() {
  if ((resume_stack)); then
    "${compose[@]}" up -d --wait redis minio api web >/dev/null
  fi
}
trap resume EXIT

"${compose[@]}" stop api >/dev/null
resume_stack=1

"${compose[@]}" exec -T postgres pg_dump -U platform -d platform --format=custom >"$output/postgres.dump"
"${compose[@]}" exec -T mongodb sh -ec \
  'mongodump --archive --gzip --username "$MONGO_APP_USERNAME" --password "$MONGO_APP_PASSWORD" --authenticationDatabase "$MONGO_INITDB_DATABASE" --db "$MONGO_INITDB_DATABASE"' \
  >"$output/mongo.archive.gz"
"${compose[@]}" exec -T redis sh -ec 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning save >/dev/null'
"${compose[@]}" stop redis minio >/dev/null
"${compose[@]}" run --rm --no-deps --entrypoint sh redis -ec 'tar -C /data -czf - .' \
  >"$output/redis-data.tar.gz"
"${compose[@]}" run --rm --no-deps --entrypoint sh minio -ec 'tar -C /data -czf - .' \
  >"$output/minio-data.tar.gz"
"${compose[@]}" run --rm --no-deps --entrypoint sh api -ec \
  'tar -C /var/lib/enterprise-social-community-platform -czf - .' \
  >"$output/api-data.tar.gz"

(
  cd "$output"
  sha256sum postgres.dump mongo.archive.gz redis-data.tar.gz minio-data.tar.gz api-data.tar.gz >SHA256SUMS
  chmod 600 postgres.dump mongo.archive.gz redis-data.tar.gz minio-data.tar.gz api-data.tar.gz SHA256SUMS
)
git -C "$root" rev-parse HEAD >"$output/SOURCE_COMMIT"
date -u +%Y-%m-%dT%H:%M:%SZ >"$output/CREATED_UTC"
sha256sum "$compose_file" | awk '{print $1}' >"$output/COMPOSE_SHA256"
chmod 600 "$output/SOURCE_COMMIT" "$output/CREATED_UTC" "$output/COMPOSE_SHA256"

"${compose[@]}" up -d --wait redis minio api web >/dev/null
resume_stack=0
trap - EXIT
echo "Encrypted-at-rest handling is operator-owned; backup created at $output"
