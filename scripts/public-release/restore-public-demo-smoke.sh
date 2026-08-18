#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  echo "Usage: $0 --backup /absolute/path --env-file /absolute/path --project-name prv1-restore-NAME --confirm-disposable [--http-port 18080] [--remove-after-smoke]" >&2
  exit 64
}

backup=""
env_file=""
project_name=""
http_port="18080"
confirmed=0
remove_after=0
while (($#)); do
  case "$1" in
    --backup) backup="${2:-}"; shift 2 ;;
    --env-file) env_file="${2:-}"; shift 2 ;;
    --project-name) project_name="${2:-}"; shift 2 ;;
    --http-port) http_port="${2:-}"; shift 2 ;;
    --confirm-disposable) confirmed=1; shift ;;
    --remove-after-smoke) remove_after=1; shift ;;
    *) usage ;;
  esac
done

[[ -n "$backup" && -n "$env_file" && $confirmed -eq 1 ]] || usage
[[ "$project_name" =~ ^prv1-restore-[a-z0-9][a-z0-9-]{2,40}$ ]] || {
  echo "Restore project name must match prv1-restore-* and is always disposable." >&2; exit 65;
}
[[ "$http_port" =~ ^[0-9]{4,5}$ && "$http_port" -le 65535 ]] || { echo "Invalid HTTP port." >&2; exit 65; }
command -v docker >/dev/null || { echo "docker is required" >&2; exit 69; }
command -v sha256sum >/dev/null || { echo "sha256sum is required" >&2; exit 69; }
command -v curl >/dev/null || { echo "curl is required" >&2; exit 69; }

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
compose_file="$root/compose.public-demo.yaml"
backup="$(realpath "$backup")"
env_file="$(realpath "$env_file")"
for file in SHA256SUMS COMPOSE_SHA256 SOURCE_COMMIT postgres.dump mongo.archive.gz redis-data.tar.gz minio-data.tar.gz api-data.tar.gz; do
  [[ -f "$backup/$file" ]] || { echo "Missing backup file: $file" >&2; exit 66; }
done
(cd "$backup" && sha256sum -c SHA256SUMS)
expected_compose_sha="$(tr -d '\r\n' <"$backup/COMPOSE_SHA256")"
actual_compose_sha="$(sha256sum "$compose_file" | awk '{print $1}')"
[[ "$expected_compose_sha" =~ ^[a-fA-F0-9]{64}$ && "$actual_compose_sha" == "$expected_compose_sha" ]] || {
  echo "Backup Compose digest does not match the current release Compose." >&2; exit 66;
}

export PUBLIC_HTTP_BIND=127.0.0.1
export PUBLIC_HTTP_PORT="$http_port"
compose=(docker compose --project-name "$project_name" --env-file "$env_file" -f "$compose_file")
existing_resources="$({
  docker ps -aq --filter "label=com.docker.compose.project=$project_name"
  docker volume ls -q --filter "label=com.docker.compose.project=$project_name"
  docker network ls -q --filter "label=com.docker.compose.project=$project_name"
} | sed '/^[[:space:]]*$/d')"
[[ -z "$existing_resources" ]] || {
  echo "Disposable restore project already exists; refusing to alter it: $project_name" >&2; exit 65;
}
source_commit="$(tr -d '\r\n' <"$backup/SOURCE_COMMIT")"
current_commit="$(git -C "$root" rev-parse HEAD)"
[[ "$source_commit" =~ ^[a-fA-F0-9]{40}$ && "$current_commit" == "$source_commit" ]] || {
  echo "Backup source commit does not match the current checkout." >&2; exit 66;
}
[[ -z "$(git -C "$root" status --porcelain --untracked-files=all)" ]] || {
  echo "Restore smoke requires a completely clean source checkout." >&2; exit 65;
}

"${compose[@]}" up -d --wait postgres mongodb redis minio clamav
"${compose[@]}" exec -T postgres pg_restore -U platform -d platform --clean --if-exists --no-owner <"$backup/postgres.dump"
"${compose[@]}" exec -T mongodb sh -ec \
  'mongorestore --archive --gzip --drop --username "$MONGO_APP_USERNAME" --password "$MONGO_APP_PASSWORD" --authenticationDatabase "$MONGO_INITDB_DATABASE" --db "$MONGO_INITDB_DATABASE"' \
  <"$backup/mongo.archive.gz"

"${compose[@]}" stop redis minio >/dev/null
"${compose[@]}" run --rm --no-deps --entrypoint sh redis -ec \
  'find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; tar -C /data -xzf -' \
  <"$backup/redis-data.tar.gz"
"${compose[@]}" run --rm --no-deps --entrypoint sh minio -ec \
  'find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; tar -C /data -xzf -' \
  <"$backup/minio-data.tar.gz"
"${compose[@]}" up -d web
"${compose[@]}" run --rm --no-deps --entrypoint sh api -ec \
  'find /var/lib/enterprise-social-community-platform -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +; tar -C /var/lib/enterprise-social-community-platform -xzf -' \
  <"$backup/api-data.tar.gz"

"${compose[@]}" up -d --wait
public_host="$(awk -F= '$1=="PUBLIC_HOST" {sub(/^[^=]*=/, ""); print; exit}' "$env_file")"
[[ -n "$public_host" ]] || { echo "PUBLIC_HOST is missing from env file." >&2; exit 65; }
curl --fail --silent --show-error --header "Host: $public_host" "http://127.0.0.1:$http_port/health/ready" >/dev/null
"${compose[@]}" exec -T postgres psql -U platform -d platform -Atc 'select 1' | grep -qx 1
"${compose[@]}" exec -T mongodb sh -ec \
  'mongosh --quiet --username "$MONGO_APP_USERNAME" --password "$MONGO_APP_PASSWORD" --authenticationDatabase "$MONGO_INITDB_DATABASE" "$MONGO_INITDB_DATABASE" --eval "quit(db.adminCommand({ ping: 1 }).ok ? 0 : 2)"'
"${compose[@]}" exec -T minio sh -ec 'test -d /data'
"${compose[@]}" run --rm --no-deps --entrypoint sh api -ec \
  'test -d /var/lib/enterprise-social-community-platform/data-protection-keys'

echo "Disposable restore smoke passed for $project_name on 127.0.0.1:$http_port"
if ((remove_after)); then
  "${compose[@]}" down -v
  echo "Explicitly requested disposable restore project removal completed."
else
  echo "Inspect the disposable project, then rerun with --remove-after-smoke or remove it explicitly with Docker Compose."
fi
