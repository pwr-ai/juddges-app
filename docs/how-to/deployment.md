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

The release flow is handled by `scripts/build_and_push_prod.sh`. It performs version bumping, file sync, Docker build + push, and git tagging in a single interactive script.

### Usage

```bash
./scripts/build_and_push_prod.sh              # Auto-increment patch (0.0.2 -> 0.0.3)
./scripts/build_and_push_prod.sh patch         # Same as above
./scripts/build_and_push_prod.sh minor         # Increment minor (0.0.3 -> 0.1.0)
./scripts/build_and_push_prod.sh major         # Increment major (0.1.0 -> 1.0.0)
./scripts/build_and_push_prod.sh 2.1.0         # Use explicit version
```

### What the script does

1. Reads the latest `v*` git tag to determine current version
2. Calculates the next version based on bump type
3. Confirms with the user before proceeding
4. **Syncs version** across all project files (see table below)
5. Loads `.env` for Docker Hub credentials and frontend build args
6. Logs into Docker Hub
7. Builds and pushes two Docker images (tagged with version + `latest`):
   - `<username>/juddges-frontend:<version>`
   - `<username>/juddges-backend:<version>`
8. Commits the version-synced files with message `release: v<version>`
9. Creates an annotated git tag `v<version>`
10. Optionally pushes the commit and tag to origin

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
