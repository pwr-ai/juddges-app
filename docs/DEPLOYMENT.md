# Deployment Guide

Complete guide for building, deploying, and operating Juddges App in production.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Docker Image Strategy](#docker-image-strategy)
- [Building for Production](#building-for-production)
- [Deploying](#deploying)
- [Health Checks](#health-checks)
- [Rollback](#rollback)
- [Monitoring & Observability](#monitoring--observability)
- [Resource Limits](#resource-limits)
- [CI/CD Pipeline](#cicd-pipeline)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

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

## Prerequisites

- Docker Engine 24+
- Docker Compose v2+
- Docker Hub account (for image registry)
- `.env` file with production credentials

### Required Environment Variables

```bash
# Docker Hub
DOCKER_USERNAME=your-dockerhub-username
DOCKER_TOKEN=your-dockerhub-token

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
OPENAI_API_KEY=sk-...

# Backend
BACKEND_API_KEY=your-backend-api-key
LANGGRAPH_POSTGRES_URL=postgresql://...

# Frontend build args (baked into Docker image)
NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Meilisearch
MEILI_MASTER_KEY=your-meilisearch-master-key

# Redis (for Celery)
REDIS_URL=redis://redis:6379/0
```

---

## Docker Image Strategy

### Naming Convention

```
${DOCKER_USERNAME}/juddges-frontend:${version}
${DOCKER_USERNAME}/juddges-backend:${version}
```

### Tags

- **`latest`** — Most recent production build
- **`0.1.0`, `0.2.0`, ...** — Semantic version tags
- **`dev-latest`** — Most recent development build (CI only)
- **`dev-0.1.0-abc1234`** — Development with commit SHA

### Image Reuse

The `backend-worker` and `backend-beat` services reuse the `juddges-backend` image with different commands. No separate worker image is needed.

---

## Building for Production

### Using the Build Script

```bash
# Auto-increment patch version (0.1.0 → 0.1.1)
./scripts/build_and_push_prod.sh

# Increment minor version (0.1.0 → 0.2.0)
./scripts/build_and_push_prod.sh minor

# Increment major version (0.1.0 → 1.0.0)
./scripts/build_and_push_prod.sh major

# Use an explicit version
./scripts/build_and_push_prod.sh 2.1.0
```

### What the Script Does

1. Reads the latest version from git tags (`prod-v*`)
2. Increments or applies the specified version
3. Syncs version to `VERSION`, `pyproject.toml`, `package.json`
4. Loads frontend build args from `.env`
5. Builds both images with `--target production`
6. Tags each image with version and `latest`
7. Pushes to Docker Hub
8. Creates a git commit and annotated tag (`prod-v0.1.1`)

### Using Make

```bash
make release-patch    # Patch bump + build + push
make release-minor    # Minor bump + build + push
make release-major    # Major bump + build + push
```

### Manual Build (without pushing)

```bash
# Build frontend
docker build -t juddges-frontend:local \
  --target production \
  --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:8002 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://your.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key \
  frontend/

# Build backend
docker build -t juddges-backend:local \
  --target production \
  backend/
```

---

## Deploying

### Using the Deploy Script

```bash
# Deploy the latest version
./scripts/deploy_prod.sh

# Deploy a specific version
./scripts/deploy_prod.sh 0.2.0

# Check status
./scripts/deploy_prod.sh --status
```

### Using Make

```bash
make deploy           # Deploy latest
make deploy-status    # Show running containers
make deploy-rollback  # Rollback to previous version
```

### What the Deploy Script Does

1. Loads `DOCKER_USERNAME` from `.env`
2. Pulls images from Docker Hub
3. Sets `JUDDGES_IMAGE_TAG` environment variable
4. Stops existing containers (30s graceful timeout)
5. Starts all services with `docker compose up -d`
6. Waits for health checks (max 120 seconds)
7. Logs deployment to `.deploy-history`

### Manual Deployment

```bash
# Pull images
export JUDDGES_IMAGE_TAG=0.1.0
docker compose pull

# Deploy
docker compose up -d

# Verify
docker compose ps
docker compose logs -f --tail=50
```

---

## Health Checks

All production services include health checks:

| Service | Check | Interval | Timeout | Retries | Start Period |
|---------|-------|----------|---------|---------|--------------|
| Frontend | HTTP GET `127.0.0.1:3006` | 30s | 10s | 3 | 40s |
| Backend | HTTP GET `/health/healthz` | 30s | 10s | 3 | 40s |
| Worker | `celery inspect ping` | 60s | 30s | 3 | 60s |
| Meilisearch | HTTP GET `/health` | 30s | 5s | 3 | — |

### Checking Health

```bash
# All services
docker compose ps

# Specific service health
docker inspect --format='{{.State.Health.Status}}' juddges-app-backend-1

# Health check logs
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' juddges-app-backend-1
```

---

## Rollback

### Using the Deploy Script

```bash
# Rollback to previous deployment
./scripts/deploy_prod.sh --rollback
```

The script reads `.deploy-history` to find the previous version and re-deploys it.

### Manual Rollback

```bash
# Check deployment history
cat .deploy-history

# Deploy the previous version
export JUDDGES_IMAGE_TAG=0.1.0
docker compose pull
docker compose up -d
```

### Deployment History Format

Each deployment is logged as:

```
2026-03-08T14:30:00Z deployed 0.2.0 from hostname
2026-03-07T10:00:00Z deployed 0.1.0 from hostname
```

---

## Monitoring & Observability

### Logging

Production containers use JSON-file logging with rotation:

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

```bash
# Tail logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f backend-worker

# All services
docker compose logs -f --tail=100
```

### Langfuse Integration (Optional)

LLM call observability via Langfuse:

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com
ENABLE_LANGFUSE=true
```

Tracks:
- LLM query analysis calls
- Embedding generation
- Chat chain invocations
- Query enhancement

### Backend Health Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /health/healthz` | None | Basic liveness (used by Docker) |
| `GET /health/status` | API Key | Detailed status with service checks |

### Watchtower Labels

Services are labeled for Watchtower auto-update support:

```yaml
labels:
  - "com.centurylinklabs.watchtower.enable=true"
  - "com.juddges.service=application"
```

---

## Resource Limits

### Production Defaults

| Service | CPU Limit | Memory Limit | CPU Reserved | Memory Reserved |
|---------|-----------|--------------|-------------|-----------------|
| Frontend | 1 | 2 GB | 0.5 | 1 GB |
| Backend | 8 | 16 GB | 4 | 12 GB |
| Worker | 2 | 4 GB | 1 | 2 GB |
| Beat | 0.5 | 512 MB | 0.25 | 256 MB |
| Meilisearch | — | — | — | — |

### Backend Worker Configuration

Gunicorn serves the backend with:

```
Workers:           12 uvicorn workers
Timeout:           120 seconds
Graceful timeout:  30 seconds
Keep-alive:        5 seconds
Max requests:      1000 per worker (with 50 jitter)
```

---

## CI/CD Pipeline

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

### Release Flow

```bash
# 1. Develop features on feature branches
git checkout -b feature/my-feature develop

# 2. Merge to develop (triggers dev deployment)
git checkout develop && git merge feature/my-feature

# 3. When ready for production, build and tag
./scripts/build_and_push_prod.sh

# 4. Push the tag (triggers prod deployment via CI)
git push origin prod-v0.2.0
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs for the specific service
docker compose logs backend --tail=50

# Check if ports are in use
lsof -i :3006
lsof -i :8002

# Rebuild from scratch
docker compose down
docker compose up --build
```

### Health Check Failing

```bash
# Backend health check endpoint
curl http://localhost:8002/health/healthz

# Frontend health check
curl http://localhost:3006

# Check container health logs
docker inspect juddges-app-backend-1 | jq '.[0].State.Health'
```

### Worker Not Processing Tasks

```bash
# Check worker logs
docker compose logs backend-worker --tail=100

# Verify Redis connectivity
docker compose exec backend-worker python -c "import redis; r = redis.from_url('$REDIS_URL'); print(r.ping())"

# Check Celery status
docker compose exec backend-worker celery -A app.workers inspect active
```

### Meilisearch Sync Issues

```bash
# Check sync logs
docker compose logs backend-worker | grep meilisearch

# Manual full sync trigger
docker compose exec backend-worker celery -A app.workers call app.tasks.meilisearch_sync.full_sync_judgments_to_meilisearch

# Check Meilisearch health
curl http://localhost:7700/health
```

### Out of Memory

```bash
# Check container memory usage
docker stats --no-stream

# Reduce Gunicorn workers (edit docker-compose.yml)
# Change: --workers 12 → --workers 4
```

---

## Related Documentation

- [Architecture Overview](architecture/ARCHITECTURE.md)
- [Search Architecture](architecture/SEARCH_ARCHITECTURE.md)
- [Developer Onboarding](getting-started/DEVELOPER_ONBOARDING.md)
- [API Reference](api/API_REFERENCE.md)
