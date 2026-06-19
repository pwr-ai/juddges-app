# Upgrade Meilisearch (dump-based migration)

This runbook covers a cross-version Meilisearch engine upgrade for the
production stack defined in `docker-compose.yml`. The procedure was
exercised on 2026-05-13 when upgrading from `v1.13.3` to `v1.43.0`
against a snapshot of prod-like data (12,307 judgments + 149 topics).

> **When to run:** any time the Meilisearch image tag jumps across
> multiple minor versions, e.g. `v1.13 → v1.43`. Meilisearch does not
> read across that span of on-disk formats, so an in-place tag bump
> without a dump-based migration **will fail to boot** or refuse the
> existing volume.

The procedure is non-destructive when followed end-to-end: the old
volume is preserved as `juddges-meilisearch-data-v<old>-backup`, and
the cross-version dump is also copied off the volume to the host so
rollback paths exist at two levels.

---

## 1. Prerequisites

- `.env` is present and has `MEILI_MASTER_KEY` set.
- The Meilisearch container (`juddges-meilisearch`) is currently
  **healthy** on the *old* image tag.
- You have at least 2× the current Meilisearch data size free on the
  Docker volume host (one copy for the backup volume, one for the
  fresh post-import volume).
- Image tag for the target Meilisearch version is decided. The
  Compose service references
  `getmeili/meilisearch:${MEILISEARCH_IMAGE_TAG:-v1.43.0}`, so either
  set `MEILISEARCH_IMAGE_TAG=v1.X.Y` in `.env` or rely on the default.

Pin the dump filename in a shell variable now so every step that
follows can reference it without copy-paste mistakes:

```bash
KEY=$(grep -E '^MEILI_MASTER_KEY=' .env | head -1 | cut -d= -f2- | tr -d '"')
OLD_TAG=v1.13              # adjust to whatever you are upgrading from
NEW_TAG=v1.43.0            # adjust to target
DUMP_DIR=.context/meili-dumps
mkdir -p "$DUMP_DIR"
```

---

## 2. Create a dump on the running (old) Meili

The dump is the cross-version-portable artifact. Triggering it is a
read-only operation; the running service stays up.

```bash
# Trigger
TASK=$(docker exec juddges-meilisearch sh -c \
  "curl -s -X POST -H 'Authorization: Bearer $KEY' http://localhost:7700/dumps")
TASK_UID=$(echo "$TASK" | python3 -c "import sys,json; print(json.load(sys.stdin)['taskUid'])")
echo "dump taskUid: $TASK_UID"

# Poll until succeeded
until docker exec juddges-meilisearch sh -c \
    "curl -s -H 'Authorization: Bearer $KEY' http://localhost:7700/tasks/$TASK_UID" \
  | python3 -c "import sys,json; t=json.load(sys.stdin); s=t['status']; print('status:',s); sys.exit(0 if s in ('succeeded','failed','canceled') else 1)" 2>/dev/null; do
  sleep 3
done

# Capture the dump filename
DUMP_NAME=$(docker exec juddges-meilisearch sh -c \
  "curl -s -H 'Authorization: Bearer $KEY' http://localhost:7700/tasks/$TASK_UID" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['details']['dumpUid'])")
echo "dump file: ${DUMP_NAME}.dump"
```

Copy the dump out of the volume to the host so it survives any
volume operation:

```bash
docker cp "juddges-meilisearch:/meili_data/dumps/${DUMP_NAME}.dump" "$DUMP_DIR/"
ls -lah "$DUMP_DIR/${DUMP_NAME}.dump"
```

---

## 3. Back up the old volume

Two safety nets are better than one. Even with the dump on disk, copy
the entire `juddges-meilisearch-data` volume into a snapshot volume
named `juddges-meilisearch-data-${OLD_TAG//./-}-backup`.

```bash
BACKUP_VOL="juddges-meilisearch-data-${OLD_TAG//./-}-backup"
docker volume create "$BACKUP_VOL"
docker run --rm \
  -v juddges-meilisearch-data:/from:ro \
  -v "$BACKUP_VOL":/to \
  alpine sh -c "cp -a /from/. /to/ && ls /to | head"
```

Verify the backup volume size matches the source (approximately).

---

## 4. Stop the old Meili and wipe the volume contents

Compose owns `juddges-meilisearch-data` as a named volume, so the
cleanest swap is to **keep the volume name** but wipe its contents.
The new v1.43 server will populate it from the dump.

```bash
docker compose stop meilisearch
docker compose rm -f meilisearch
docker run --rm -v juddges-meilisearch-data:/data alpine sh -c \
  "rm -rf /data/* /data/.[!.]* 2>/dev/null; ls -la /data"
```

> The backend / worker / beat containers will go (briefly) unhealthy
> on their healthchecks. They will recover automatically as soon as
> Meilisearch is back up; no need to touch them.

---

## 5. Update `docker-compose.yml`

Either edit the file to bump the default tag, or set
`MEILISEARCH_IMAGE_TAG` in `.env`. The Compose entry already supports
parameterization:

```yaml
meilisearch:
  image: getmeili/meilisearch:${MEILISEARCH_IMAGE_TAG:-v1.43.0}
```

Recommended: keep the default in code aligned with the target version
of the upgrade so deploys without an `.env` override get the right
image.

---

## 6. Import the dump on a fresh v1.43 container

Meilisearch's `--import-dump` only runs on first boot of a fresh data
directory. Run it as a one-shot container that owns the volume,
watch the logs for the "Import succeeded" / "Server listening"
banner, then stop it.

```bash
docker run -d \
  --name juddges-meilisearch-import \
  -v juddges-meilisearch-data:/meili_data \
  -v "$(pwd)/${DUMP_DIR}:/dumps:ro" \
  -e "MEILI_MASTER_KEY=$KEY" \
  -e MEILI_ENV=production \
  -e MEILI_NO_ANALYTICS=true \
  --ulimit nofile=524288:524288 \
  "getmeili/meilisearch:${NEW_TAG}" \
  meilisearch --import-dump "/dumps/${DUMP_NAME}.dump" --http-addr 0.0.0.0:7700

# Wait until either the server starts or it errors out
until docker logs juddges-meilisearch-import 2>&1 | tail -50 \
    | grep -qE 'Server listening|Aborting|address already'; do
  STATUS=$(docker inspect -f '{{.State.Status}}' juddges-meilisearch-import 2>/dev/null)
  [ "$STATUS" != "running" ] && { docker logs juddges-meilisearch-import | tail -40; exit 1; }
  sleep 4
done
echo "Import complete."
docker logs juddges-meilisearch-import 2>&1 | tail -10

docker stop juddges-meilisearch-import
docker rm   juddges-meilisearch-import
```

Typical import time on a developer laptop for ~12k judgments + 149
topics + a 1024-dim user-provided embedder is **30–60 seconds**.

---

## 7. Bring Meilisearch back up via Compose

```bash
docker compose up -d meilisearch
sleep 8
docker ps --filter name=juddges-meilisearch \
  --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
```

The container should be `healthy` within ~10 seconds.

---

## 8. Verify the upgrade

Run the same set of probes used during the 2026-05-13 v1.13 → v1.43
exercise:

```bash
# Health + version
docker exec juddges-meilisearch curl -s http://localhost:7700/health
docker exec juddges-meilisearch curl -s -H "Authorization: Bearer $KEY" \
  http://localhost:7700/version | python3 -m json.tool

# Index inventory + counts
docker exec juddges-meilisearch curl -s -H "Authorization: Bearer $KEY" \
  http://localhost:7700/indexes | python3 -m json.tool
for IDX in judgments topics; do
  docker exec juddges-meilisearch curl -s -H "Authorization: Bearer $KEY" \
    "http://localhost:7700/indexes/${IDX}/stats" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('${IDX}:', d['numberOfDocuments'])"
done

# Search smoke tests (direct)
docker exec juddges-meilisearch curl -s -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"q":"odszkodowanie","limit":3}' \
  http://localhost:7700/indexes/judgments/search \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('hits:', d.get('estimatedTotalHits'), 'ms:', d.get('processingTimeMs'))"

# Settings sanity — preserved across the upgrade?
docker exec juddges-meilisearch curl -s -H "Authorization: Bearer $KEY" \
  http://localhost:7700/indexes/judgments/settings/embedders | python3 -m json.tool
docker exec juddges-meilisearch curl -s -H "Authorization: Bearer $KEY" \
  http://localhost:7700/indexes/judgments/settings/filterable-attributes \
  | python3 -c "import sys,json; print('filterable count:', len(json.load(sys.stdin)))"

# End-to-end through the FastAPI backend
docker exec juddges-backend bash -c '
python -c "
import os, urllib.request, json
req = urllib.request.Request(
    \"http://localhost:8002/api/search/autocomplete?q=fraud&limit=3\",
    headers={\"X-API-Key\": os.environ[\"BACKEND_API_KEY\"]}
)
print(json.dumps(json.loads(urllib.request.urlopen(req, timeout=5).read()), indent=2)[:600])
"
'
```

**Acceptance criteria**:

- `/version.pkgVersion == NEW_TAG` (e.g. `1.43.0`)
- `judgments.numberOfDocuments` and `topics.numberOfDocuments` match the
  pre-upgrade counts exactly.
- Embedder configuration block (`bge-m3`, `dimensions: 1024`,
  `source: userProvided`) is intact.
- A keyword search returns hits and `processingTimeMs < 50` on a warm
  cache.
- The backend autocomplete endpoint returns `topic_hits` with
  `<mark>` highlighting.

---

## 9. Rollback

If any acceptance check fails, roll back to the old volume in one
step (the dump file is the second safety net if even the backup
volume is suspect):

```bash
# Stop the broken new server
docker compose stop meilisearch
docker compose rm -f meilisearch

# Swap the volume contents back
docker run --rm -v juddges-meilisearch-data:/to \
  -v "$BACKUP_VOL":/from:ro alpine sh -c \
  "rm -rf /to/* /to/.[!.]* 2>/dev/null; cp -a /from/. /to/"

# Pin the old tag and restart
echo "MEILISEARCH_IMAGE_TAG=${OLD_TAG}" >> .env
docker compose up -d meilisearch
```

Then triage the failure offline. Do not combine the rollback with
schema/index changes — that conflates two failure modes.

---

## 10. Clean up

After a successful upgrade and at least 24 hours of stable operation:

```bash
docker volume rm "$BACKUP_VOL"
rm "$DUMP_DIR/${DUMP_NAME}.dump"
```

Keep these around longer if you are reindexing or running other
risky operations in the same window.

---

## Notes

- This runbook covers **Phase 1** of the broader plan tracked in
  `.context/2026-05-12-meilisearch-update-plan.md`. Phases 2 and 3
  (split into `judgments_pl` / `judgments_en`, multi-search query
  path) are deliberately out of scope here — keep engine upgrades
  isolated from schema and product changes.
- The "Meili settings atomic-apply" issue documented in the project
  memory (failed tasks referencing the `bge-m3` embedders block) is
  pre-existing and *not* triggered by the dump-based migration. The
  failed tasks list survives the dump and will repopulate; this is
  expected.

## Related

- `docker-compose.yml` — production Meilisearch service (line ~138).
- `docker-compose.dev.yml` — dev Meilisearch service; same upgrade
  pattern applies, just substitute `juddges-meilisearch-dev` and the
  dev volume name.
- `.context/2026-05-12-meilisearch-update-plan.md` — multi-phase plan
  including index split.
- Meilisearch upstream migration guide:
  `https://www.meilisearch.com/docs/resources/migration/updating`.
