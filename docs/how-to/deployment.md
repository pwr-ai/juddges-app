# Deployment Guide

Complete guide for setting up, developing, building, releasing, and deploying Juddges App using Docker.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Initial Setup](#2-initial-setup)
3. [Development (Local with Hot Reload)](#3-development-local-with-hot-reload)
4. [Local Build & Deploy](#4-local-build--deploy)
5. [Versioned Releases (SemVer)](#5-versioned-releases-semver)
6. [Production Deployment (Registry Images)](#6-production-deployment-registry-images)
7. [Rollback](#7-rollback)
8. [Monitoring & Troubleshooting](#8-monitoring--troubleshooting)
9. [Script Reference](#9-script-reference)

---

## 1. Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Docker | 24+ | `docker --version` |
| Docker Compose | v2+ | `docker compose version` |
| Git | 2.30+ | `git --version` |
| Docker Hub account | — | `docker login` |

Server requirements for production:
- 8 GB RAM minimum (16 GB recommended — backend alone reserves 12 GB)
- 4 CPU cores minimum (backend reserves 4)
- 30 GB disk space

---

## 2. Initial Setup

### Clone and configure

```bash
git clone <repository-url>
cd juddges-app

# Create environment file from template
cp .env.example .env
```

### Edit `.env` with your credentials

At minimum, set:

```bash
# Supabase (database + auth + vector search)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# LLM
OPENAI_API_KEY=sk-...

# Backend auth
BACKEND_API_KEY=your-backend-api-key

# Docker Hub (for build & deploy scripts)
DOCKER_USERNAME=your-dockerhub-username
DOCKER_TOKEN=your-dockerhub-access-token
```

### Verify Docker is working

```bash
docker compose config --quiet && echo "Config OK"
```

---

## 3. Development (Local with Hot Reload)

Use the dev helper script with `docker-compose.dev.yml`.

```bash
# Start dev environment
./docker-dev.sh start
```

### Dev ports

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3007 |
| Backend API | http://localhost:8004 |
| API Docs (Swagger) | http://localhost:8004/docs |

### Common dev commands

```bash
./docker-dev.sh stop       # Stop all services
./docker-dev.sh restart    # Restart all services
./docker-dev.sh logs-f     # Follow logs
./docker-dev.sh status     # Show container status
./docker-dev.sh rebuild    # Rebuild images from scratch
./docker-dev.sh shell-be   # Shell into backend container
./docker-dev.sh shell-fe   # Shell into frontend container
./docker-dev.sh test-be    # Run backend tests (pytest)
./docker-dev.sh test-fe    # Run frontend tests (jest)
./docker-dev.sh clean      # Remove containers and volumes
```

### Hot reload behavior

- **Backend**: Python source mounted at `/app`, Uvicorn runs with auto-reload
- **Frontend**: `frontend/` mounted at `/app`, Next.js dev server handles HMR
- **Worker**: Celery worker shares the backend volume mount
- Dependency or Dockerfile changes require `./docker-dev.sh rebuild`

---

## 4. Local Build & Deploy

For a production-like local build without version bumps or registry pushes:

```bash
docker compose up -d --build
```

### Local production ports

| Service | Port | Notes |
|---------|------|-------|
| Frontend | 3006 (exposed internally) | Accessed via nginx-proxy or `docker compose exec` |
| Backend API | 8002 (exposed internally) | Same |
| Backend Worker | — | No port (Celery process) |

> **Note**: Production compose uses `expose` instead of `ports` because services sit behind nginx-proxy. For direct access during local testing, temporarily switch `expose` to `ports` or use `docker compose exec`.

---

## 5. Versioned Releases (SemVer)

> **Important**: Releases are cut from `main` only. Before running this script, the work to be released must already be merged from `develop` into `main` via a release PR (`release: vX.Y.Z`). See [Section 13 — CI/CD Pipeline](#13-cicd-pipeline) for the full branching flow.

The release flow is handled by `scripts/build_and_push_prod.sh`. It performs version bumping, file sync, Docker build + push, and git tagging in a single interactive script.

### Usage

```bash
git checkout main && git pull                  # always run from clean main
./scripts/build_and_push_prod.sh              # Auto-increment patch (0.0.2 -> 0.0.3)
./scripts/build_and_push_prod.sh patch         # Same as above
./scripts/build_and_push_prod.sh minor         # Increment minor (0.0.3 -> 0.1.0)
./scripts/build_and_push_prod.sh major         # Increment major (0.1.0 -> 1.0.0)
./scripts/build_and_push_prod.sh 2.1.0         # Use explicit version
```

### What the script does

1. Reads the latest `prod-v*` git tag to determine current version (legacy `v*` fallback)
2. Calculates the next version based on bump type
3. Confirms with the user before proceeding
4. **Syncs version** across all project files (see table below)
5. Loads `.env` for Docker Hub credentials and frontend build args
6. Logs into Docker Hub
7. Builds and pushes two Docker images (tagged with version + `latest`):
   - `<username>/juddges-frontend:<version>`
   - `<username>/juddges-backend:<version>`
8. Commits the version-synced files with message `release: v<version>`
9. Creates an annotated git tag `prod-v<version>`
10. Optionally pushes the commit and tag to origin (the tag push triggers the `deploy-prod` CI job)

### Version files kept in sync

| File | Field | Example |
|------|-------|---------|
| `VERSION` | Plain text | `1.2.3` |
| `backend/pyproject.toml` | `version = "..."` | `version = "1.2.3"` |
| `frontend/package.json` | `"version": "..."` | `"version": "1.2.3"` |
| `.env.example` | `JUDDGES_IMAGE_TAG` comment | `# JUDDGES_IMAGE_TAG=1.2.3` |

### Docker images

The backend image is shared by two services:
- `backend` — runs the FastAPI API server
- `backend-worker` — runs `celery -A app.workers worker` (same image, different command)

---

## 6. Production Deployment (Registry Images)

After a versioned release, deploy on any server by pulling images from Docker Hub.

### First-time server setup

```bash
git clone <repository-url>
cd juddges-app
cp .env.example .env
# Edit .env with production credentials
```

### Deploy with the deploy script

```bash
./scripts/deploy_prod.sh              # Deploy :latest
./scripts/deploy_prod.sh 0.2.0        # Deploy specific version
./scripts/deploy_prod.sh --status     # Show running containers
```

### What the deploy script does

1. Loads `.env` for `DOCKER_USERNAME`
2. Pulls both images at the specified tag
3. Stops existing containers gracefully (30s timeout)
4. Starts services with `JUDDGES_IMAGE_TAG` set to the target version
5. Waits up to 120s for health checks (3+ containers running, none unhealthy)
6. Logs the deployment to `.deploy-history`

### Manual deployment (without the script)

```bash
export JUDDGES_IMAGE_TAG=1.2.3
docker compose pull
docker compose up -d
```

### Deploy with SSL (nginx-proxy)

For HTTPS with automatic Let's Encrypt certificates, set in `.env`:

```bash
VIRTUAL_HOST_FRONTEND=app.yourdomain.com
VIRTUAL_PORT_FRONTEND=3006
VIRTUAL_HOST_BACKEND=api.yourdomain.com
VIRTUAL_PORT_BACKEND=8002
LETSENCRYPT_EMAIL=you@example.com
```

The production `docker-compose.yml` already includes `VIRTUAL_HOST`, `VIRTUAL_PORT`, and `LETSENCRYPT_*` environment variables. Requires the `nginx-router_proxy-tier` external Docker network from [nginx-proxy](https://github.com/nginx-proxy/nginx-proxy).

### Verify deployment

```bash
# Service status
docker compose ps

# Health checks
curl http://localhost:8002/health/healthz
docker compose exec frontend node -e "require('http').get('http://127.0.0.1:3006/', (r) => { console.log(r.statusCode); process.exit(r.statusCode === 200 ? 0 : 1) })"
```

---

## 7. Rollback

### Using the deploy script

```bash
./scripts/deploy_prod.sh --rollback
```

This reads `.deploy-history` to find the previous version and redeploys it (with confirmation).

### Manual rollback to a specific version

```bash
./scripts/deploy_prod.sh 1.2.2
```

### Roll back from a broken local build

```bash
docker compose down
docker compose up -d --build
```

### Revert a git release

```bash
# Revert the release commit
git revert HEAD

# Delete the tag locally and remotely
git tag -d v1.2.3
git push origin :refs/tags/v1.2.3
```

---

## 8. Monitoring & Troubleshooting

### View logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f backend-worker

# Last 100 lines
docker compose logs --tail=100 backend
```

### Restart services

```bash
# All
docker compose restart

# Single service
docker compose restart backend
```

### Check resource usage

```bash
docker stats --no-stream
```

### Common issues

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| Service won't start | `docker compose logs <service>` | Check `.env` vars, rebuild |
| Health check failing | `curl localhost:8002/health/healthz` | Wait for `start_period` (40-60s), check dependencies |
| Out of disk space | `docker system df` | `docker system prune -f` |
| Image pull fails | `docker login` | Re-authenticate with Docker Hub |
| Port conflict | `lsof -i :8004` | Change port in `.env` or stop conflicting process |
| Frontend can't reach backend | Check `NEXT_PUBLIC_API_BASE_URL` | Ensure it points to the correct backend URL |
| Celery worker not processing | `docker compose logs backend-worker` | Check Redis connection, restart worker |

### Docker cleanup

```bash
# Remove stopped containers
docker container prune -f

# Remove unused images
docker image prune -f

# Remove unused volumes (careful — deletes data!)
docker volume prune -f

# Remove everything unused
docker system prune -f --volumes
```

---

## 9. Script Reference

| Script | Purpose | When to use |
|--------|---------|-------------|
| `./docker-dev.sh` | Development environment with hot reload | Day-to-day development |
| `./scripts/build_and_push_prod.sh` | SemVer release: version sync, Docker build + push, git tag | Releasing a new version |
| `./scripts/deploy_prod.sh` | Pull from Docker Hub and deploy on production host | Deploying to production |

### Release decision tree

```
Need to release a new version?
  |
  +--> Yes --> ./scripts/build_and_push_prod.sh
  |             |
  |             +--> Syncs version files
  |             +--> Builds + pushes Docker images
  |             +--> Creates git tag
  |             +--> Then deploy: ./scripts/deploy_prod.sh <version>
  |
  +--> No, just test production build locally --> docker compose up -d --build
  |
  +--> No, just developing --> ./docker-dev.sh start
```

### Environment overview

| Environment | Compose file | Images from | Frontend | Backend | Worker |
|-------------|-------------|-------------|----------|---------|--------|
| Development | `docker-compose.dev.yml` | Local build + hot reload | :3007 | :8004 | (no port) |
| Production (local build) | `docker-compose.yml` | Local `docker compose build` | :3006* | :8002* | (no port) |
| Production (registry) | `docker-compose.yml` | Docker Hub | :3006* | :8002* | (no port) |

\* Production ports are `expose`d internally (behind nginx-proxy), not mapped to the host by default.

---

## 10. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    Production Host                        │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Frontend   │  │   Backend    │  │  Meilisearch  │  │
│  │  (Next.js)   │  │  (FastAPI)   │  │   (Search)    │  │
│  │  Port: 3006  │  │  Port: 8002  │  │  Port: 7700   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘  │
│         │                  │                             │
│         │          ┌───────┴───────┐                     │
│         │          │               │                     │
│         │   ┌──────▼──────┐ ┌─────▼──────┐             │
│         │   │   Worker    │ │   Beat     │             │
│         │   │  (Celery)   │ │ (Scheduler)│             │
│         │   └─────────────┘ └────────────┘             │
│         │                                               │
│  ┌──────▼───────────────────────────────────────────┐  │
│  │              Docker Network (app-network)         │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  External Services:                                      │
│  - Supabase (PostgreSQL + Auth + pgvector)              │
│  - Redis (Celery broker)                                │
│  - OpenAI API (embeddings + LLM)                        │
│  - Cohere API (reranking, optional)                     │
│  - Langfuse (observability, optional)                   │
└──────────────────────────────────────────────────────────┘
```

### Service Summary

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `frontend` | `juddges-frontend` | 3006 | Next.js standalone server |
| `backend` | `juddges-backend` | 8002 | FastAPI with 12 Gunicorn workers |
| `backend-worker` | `juddges-backend` (shared) | — | Celery async task worker |
| `backend-beat` | `juddges-backend` (shared) | — | Celery periodic task scheduler |
| `meilisearch` | `getmeili/meilisearch:v1.13` | 7700 | Autocomplete search engine |

---

## 11. Health Checks

All production services include health checks:

| Service | Check | Interval | Timeout | Retries | Start Period |
|---------|-------|----------|---------|---------|--------------|
| Frontend | HTTP GET `127.0.0.1:3006` | 30s | 10s | 3 | 40s |
| Backend | HTTP GET `/health/healthz` | 30s | 10s | 3 | 40s |
| Worker | `celery inspect ping` | 60s | 30s | 3 | 60s |
| Meilisearch | HTTP GET `/health` | 30s | 5s | 3 | — |

```bash
# All services
docker compose ps

# Specific service health
docker inspect --format='{{.State.Health.Status}}' juddges-app-backend-1

# Health check logs
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' juddges-app-backend-1
```

### Backend Health Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /health/healthz` | None | Basic liveness (used by Docker) |
| `GET /health/status` | API Key | Detailed status with service checks |

---

## 12. Resource Limits

### Production Defaults

| Service | CPU Limit | Memory Limit | CPU Reserved | Memory Reserved |
|---------|-----------|--------------|-------------|-----------------|
| Frontend | 1 | 2 GB | 0.5 | 1 GB |
| Backend | 8 | 16 GB | 4 | 12 GB |
| Worker | 2 | 4 GB | 1 | 2 GB |
| Beat | 0.5 | 512 MB | 0.25 | 256 MB |

### Backend Worker Configuration

```
Workers:           12 uvicorn workers
Timeout:           120 seconds
Graceful timeout:  30 seconds
Keep-alive:        5 seconds
Max requests:      1000 per worker (with 50 jitter)
```

---

## 13. CI/CD Pipeline

### GitHub Actions Workflow

**File:** `.github/workflows/ci.yml`

```
Push to develop/main or PR
          │
          ├─── backend-lint (Ruff format + lint)
          ├─── backend-test (pytest -m unit)
          ├─── frontend-lint (ESLint)
          ├─── frontend-test (Jest)
          └─── docker-build (validate production build)
                    │
                    │ All pass
                    ▼
          ┌─────────────────┐
          │  Push to develop │──→ deploy-dev (tag: dev-latest)
          └─────────────────┘
          ┌─────────────────┐
          │  Push prod-v* tag│──→ deploy-prod (tag: version + latest)
          └─────────────────┘
```

### Branching Model

Two long-lived branches:

- **`main`** — production. Only release PRs (from `develop`) and `hotfix/*` PRs land here. Production images are built **only** when a `prod-v*` tag is pushed (and tags should always be cut from `main`).
- **`develop`** — integration. All in-progress feature work lands here. A push to `develop` triggers `deploy-dev`, which publishes `dev-latest` images to Docker Hub (no production impact).

Short-lived branches:

- `feature/<name>`, `fix/<name>` — branch from `develop`, PR back into `develop`.
- `hotfix/<name>` — branch from `main`, PR back into `main`. After release, back-merge `main` → `develop` so the fix isn't lost on the next release.

> **Never open a feature PR directly against `main`.** Branch protection on `main` should be configured to enforce this; see the project root README for the canonical flow.

### Release Flow

```bash
# 1. Open a PR from develop → main titled "release: vX.Y.Z" and merge it via GitHub.
#    All feature/fix work that should ship in this release must already be in develop.

# 2. Build, tag, and push from a clean main:
git checkout main && git pull
./scripts/build_and_push_prod.sh                # creates prod-vX.Y.Z tag

# 3. Pushing the prod-v* tag (the script offers to do this) triggers
#    the deploy-prod CI job, which builds versioned + :latest images.
git push origin prod-vX.Y.Z                     # if you didn't push from the script

# 4. On the production host:
./scripts/deploy_prod.sh                        # pulls :latest and restarts containers
```

### Hotfix Flow

```bash
# 1. Branch from main:
git checkout main && git pull
git checkout -b hotfix/<short-name>

# 2. Fix, commit, open a PR into main, merge.

# 3. Cut a patch release exactly as in the Release Flow above
#    (./scripts/build_and_push_prod.sh, deploy_prod.sh on the host).

# 4. Back-merge main → develop so the hotfix is included in the next release:
git checkout develop && git pull
git merge main && git push
```

---

## 14. Observability

### Langfuse Integration (Optional)

LLM call observability via Langfuse:

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com
ENABLE_LANGFUSE=true
```

Tracks: LLM query analysis, embedding generation, chat chain invocations, query enhancement.

### Watchtower Labels

Services are labeled for Watchtower auto-update support:

```yaml
labels:
  - "com.centurylinklabs.watchtower.enable=true"
  - "com.juddges.service=application"
```

---

## Related Documentation

- [Architecture Overview](../architecture/ARCHITECTURE.md)
- [Search Architecture](../architecture/SEARCH_ARCHITECTURE.md)
- [Developer Onboarding](../getting-started/DEVELOPER_ONBOARDING.md)
- [API Reference](../api/API_REFERENCE.md)
