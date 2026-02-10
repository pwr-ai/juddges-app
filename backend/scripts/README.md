# Backend Scripts

Collection of utility scripts for the AI-Tax backend.

## Available Scripts

### fix_weaviate_schema.py

Utility script for fixing and managing Weaviate schema configurations.

**Usage:**

```bash
python scripts/fix_weaviate_schema.py
```

### setup_langchain_cache_db.sh

Setup script for creating the LangChain cache database in the Supabase PostgreSQL instance.

**Prerequisites:**

- PostgreSQL container running (docker-compose.shared.yml)
- Supabase PostgreSQL credentials (default: aiTax/fA684jk on port 5432)

**Usage:**

```bash
# Run setup using Docker
docker compose -f docker-compose.shared.yml exec db psql -U aiTax -d aiTax -c 'CREATE DATABASE llm_cache OWNER "aiTax";'
```

**What it does:**

- Creates `llm_cache` database in the same PostgreSQL instance as Supabase
- Uses existing `aiTax` user (no separate user needed)
- Database accessible at `db:5432/llm_cache` (from containers) or `localhost:5432/llm_cache` (from host)

**Manual Setup:**

If you prefer to set up the database manually:

```sql
-- Connect to PostgreSQL container
docker compose -f docker-compose.shared.yml exec db psql -U aiTax -d aiTax

-- Create database (uses existing aiTax user)
CREATE DATABASE llm_cache OWNER "aiTax";

-- Verify
\c llm_cache
\conninfo
```

**Testing the connection:**

```bash
# Test from Docker container
docker compose -f docker-compose.shared.yml exec db psql -U aiTax -d llm_cache -c "SELECT version();"

# Test from backend container (if running)
docker compose exec backend python -c "
import os
from sqlalchemy import create_engine

url = os.getenv('LANGCHAIN_CACHE_DATABASE_URL')
print(f'Testing: {url.split(\"@\")[1]}')
engine = create_engine(url)
with engine.connect() as conn:
    result = conn.execute('SELECT 1')
    print('✓ LangChain cache connection successful')
"
```

**Documentation:**

- Reference: `/docs/reference/langchain-cache.md`

## Health Check Testing

The backend includes comprehensive health check endpoints. Test them with:

### Basic Health Check

```bash
# Test basic health endpoint
curl http://localhost:8002/health

# Test Kubernetes-style health endpoint
curl http://localhost:8002/health/healthz
```

### Detailed Health Status

```bash
# Test detailed status (requires API key)
curl -H "X-API-Key: your-api-key" http://localhost:8002/health/status | jq

# Test dependencies list (requires API key)
curl -H "X-API-Key: your-api-key" http://localhost:8002/health/dependencies | jq

# Invalidate status cache (requires API key)
curl -X POST -H "X-API-Key: your-api-key" http://localhost:8002/health/status/invalidate
```

### Docker Health Check Verification

```bash
# Check backend health status
docker inspect --format='{{.State.Health.Status}}' legal-ai-backend

# Check worker health status
docker inspect --format='{{.State.Health.Status}}' legal-ai-backend-worker

# Watch health check events
docker events --filter 'event=health_status' --filter 'container=legal-ai-backend'

# Test health check command manually
docker exec legal-ai-backend wget -O- http://localhost:8002/health/healthz
```

**Documentation:**

- API Reference: `/docs/reference/health-checks.md`
- How-To Guide: `/docs/how-to/monitoring-health-checks.md`
- Implementation: `/backend/app/health/`

## Common Tasks

### Running Scripts in Docker

All scripts can be run within the Docker container:

```bash
# Run a script
docker compose run --rm backend python scripts/script_name.py
```

### Installing Dependencies

```bash
cd backend
poetry install
```

### Viewing Logs

Scripts output logs to `backend/logs/`:

```bash
# List recent logs
ls -lt logs/

# Follow logs
tail -f logs/*.log
```

## Development

### Adding a New Script

1. Create script in `scripts/` directory
2. Add shebang: `#!/usr/bin/env python3`
3. Use loguru for logging
4. Use rich for CLI (not argparse/click per project guidelines)
5. Make executable: `chmod +x scripts/your_script.py`
6. Update this README
7. Add documentation in `docs/` following Diátaxis framework:
   - Tutorial: Learning-oriented
   - How-to: Task-oriented
   - Reference: Information-oriented
   - Explanation: Understanding-oriented

### Code Style

Follow project conventions:

- Use loguru for logging (not print)
- Use rich for CLI output
- Store logs in `logs/` directory
- Use Docker containers to run scripts
- Add comprehensive docstrings
- Use type hints
- Don't use argparse or click
- Don't use print statements

## Health Check Module

The health check system is implemented in `/backend/app/health/`:

```
backend/app/health/
├── __init__.py          # Module exports
├── models.py            # Pydantic models (149 lines)
├── checks.py            # Service health checks (502 lines)
└── router.py            # FastAPI routes (322 lines)
```

### Monitored Services

**Critical Services** (must be healthy):

- PostgreSQL (conversation state, checkpointing)
- Redis (session management, caching)
- Weaviate (vector search, embeddings)

**Optional Services** (can be degraded):

- Supabase (analytics, feedback)
- Celery (background task processing)
- Langfuse (LLM observability)

### Performance Characteristics

- Basic health check: < 100ms
- Detailed status (cached): < 50ms
- Detailed status (fresh): 500ms - 3 seconds
- Concurrent checks: All services checked in parallel
- Cache TTL: 30 seconds

## Troubleshooting

### Permission Denied

```bash
chmod +x scripts/your_script.py
```

### Import Errors

Make sure you're in the backend directory and dependencies are installed:

```bash
cd backend
poetry install
poetry shell
```

### Log Directory Not Found

The `logs/` directory is created automatically, but if needed:

```bash
mkdir -p backend/logs
```

### Health Checks Failing

1. **Check backend logs:**

   ```bash
   docker logs legal-ai-backend --tail 50
   ```

2. **Verify endpoint accessibility:**

   ```bash
   docker exec legal-ai-backend wget -O- http://localhost:8002/health/healthz
   ```

3. **Check service connectivity:**

   ```bash
   docker exec legal-ai-backend nc -zv db 5432
   docker exec legal-ai-backend nc -zv redis 6379
   ```

## Related Documentation

- [Backend README](../README.md)
- [Health Check API Reference](../../docs/reference/health-checks.md)
- [Monitoring How-To Guide](../../docs/how-to/monitoring-health-checks.md)
- [Project Documentation](../../docs/)
