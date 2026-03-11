# Troubleshooting Guide

Common issues and their solutions for Juddges Legal Assistant.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Backend Issues](#backend-issues)
- [Frontend Issues](#frontend-issues)
- [Database Issues](#database-issues)
- [Docker Issues](#docker-issues)
- [API Issues](#api-issues)
- [Development Issues](#development-issues)
- [Performance Issues](#performance-issues)
- [Getting Help](#getting-help)

## Installation Issues

### Python Poetry Installation Fails

**Problem:** `curl -sSL https://install.python-poetry.org | python3 -` fails

**Solution:**
```bash
# Try with pip instead
pip install --user poetry

# Or use alternative installation
python3 -m pip install --upgrade pip
pip3 install poetry

# Add Poetry to PATH
export PATH="$HOME/.local/bin:$PATH"
```

### Node.js Version Mismatch

**Problem:** `error: This project requires Node.js 20+`

**Solution:**
```bash
# Install nvm (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install and use Node 20
nvm install 20
nvm use 20
nvm alias default 20

# Verify
node --version  # Should show v20.x.x
```

### Docker Not Running

**Problem:** `Cannot connect to the Docker daemon`

**Solution:**
```bash
# Start Docker
# macOS/Windows: Start Docker Desktop application

# Linux: Start Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group (Linux)
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker ps
```

## Backend Issues

### Module Not Found Errors

**Problem:** `ModuleNotFoundError: No module named 'juddges_search'`

**Solution:**
```bash
cd backend

# Reinstall dependencies
poetry install

# Verify packages are installed
poetry show

# If still failing, try fresh install
rm -rf .venv
poetry install
```

### FastAPI Server Won't Start

**Problem:** Backend crashes on startup

**Check logs:**
```bash
cd backend
poetry run uvicorn app.server:app --reload --port 8004
```

**Common causes:**

1. **Missing environment variables:**
```bash
# Check required vars
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
echo $OPENAI_API_KEY
echo $BACKEND_API_KEY
echo $DATABASE_URL

# Add missing vars to .env.secrets
```

2. **Port already in use:**
```bash
# Find process using port 8004
lsof -ti:8004

# Kill the process
lsof -ti:8004 | xargs kill -9

# Or use a different port
poetry run uvicorn app.server:app --reload --port 8005
```

3. **Database connection fails:**
```bash
# Test Supabase connection
curl https://your-project.supabase.co/rest/v1/ \
  -H "apikey: your-anon-key"

# Should return 401 (unauthorized) - this is expected
# If timeout or connection refused, check Supabase status
```

### Import Errors with Pydantic

**Problem:** `pydantic.errors.PydanticImportError` or version conflicts

**Solution:**
```bash
cd backend

# Check Pydantic version
poetry show pydantic

# Should be < 2.11 per pyproject.toml
# If not, reinstall with constraints
poetry install
```

### OpenAI API Errors

**Problem:** `openai.error.RateLimitError` or `openai.error.AuthenticationError`

**Solutions:**

1. **Invalid API key:**
```bash
# Verify API key is set
echo $OPENAI_API_KEY

# Test API key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

2. **Rate limits:**
```bash
# Reduce concurrency in ingestion script
python ingest_judgments.py --polish 10 --uk 10 --batch-size 5
```

3. **No credits:**
- Check your OpenAI account balance
- Add payment method if needed

## Frontend Issues

### Frontend Won't Start

**Problem:** `npm run dev` fails

**Solutions:**

1. **Module not found:**
```bash
cd frontend

# Clear cache and reinstall
rm -rf node_modules .next
npm install

# If still failing, clear npm cache
npm cache clean --force
npm install
```

2. **Port already in use:**
```bash
# Find process using port 3007
lsof -ti:3007 | xargs kill -9

# Or use different port
npm run dev -- -p 3008
```

3. **TypeScript errors:**
```bash
# Check TypeScript compilation
npm run build

# If build fails, check for type errors
npx tsc --noEmit
```

### Build Fails

**Problem:** `npm run build` fails

**Common causes:**

1. **Type errors:**
```bash
# Check for TypeScript errors
npx tsc --noEmit

# Fix type errors in reported files
```

2. **Missing environment variables:**
```bash
# Check Next.js environment variables
echo $NEXT_PUBLIC_SUPABASE_URL
echo $NEXT_PUBLIC_SUPABASE_ANON_KEY

# Add to .env.secrets with NEXT_PUBLIC_ prefix
```

3. **Memory issues:**
```bash
# Increase Node memory
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

### Hot Reload Not Working

**Problem:** Changes not reflected in browser

**Solutions:**

1. **Clear Next.js cache:**
```bash
rm -rf .next
npm run dev
```

2. **Check file watchers (Linux):**
```bash
# Increase file watch limit
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

3. **Use stable mode:**
```bash
# Disable Turbopack if causing issues
npm run dev:stable
```

## Database Issues

### Cannot Connect to Supabase

**Problem:** Database queries fail

**Solutions:**

1. **Check Supabase credentials:**
```bash
# Test connection
curl https://your-project.supabase.co/rest/v1/judgments?limit=1 \
  -H "apikey: your-anon-key" \
  -H "Authorization: Bearer your-anon-key"
```

2. **Verify project is active:**
- Go to https://supabase.com/dashboard
- Check project status
- Ensure project is not paused

3. **Check network connectivity:**
```bash
# Test DNS resolution
nslookup your-project.supabase.co

# Test HTTPS connection
curl -I https://your-project.supabase.co
```

### Migration Fails

**Problem:** `supabase db push` fails

**Solutions:**

1. **Check migration syntax:**
```bash
# Validate SQL syntax
cd supabase/migrations
cat 20260209000001_create_judgments_table.sql

# Look for syntax errors
```

2. **Check Supabase CLI version:**
```bash
# Update Supabase CLI
npm install -g supabase@latest

# Verify version
supabase --version
```

3. **Manual migration:**
```bash
# Login to Supabase dashboard
# Go to SQL Editor
# Run migration SQL manually
```

### Vector Search Not Working

**Problem:** Semantic search returns no results

**Solutions:**

1. **Check pgvector extension:**
```sql
-- In Supabase SQL Editor
SELECT * FROM pg_extension WHERE extname = 'vector';
-- Should return a row
```

2. **Check embeddings:**
```sql
-- Verify documents have embeddings
SELECT id, case_number, embedding IS NOT NULL as has_embedding
FROM judgments
LIMIT 10;
-- All should have has_embedding = true
```

3. **Reingest data:**
```bash
cd scripts
python ingest_judgments.py --polish 10 --uk 10 --force
```

## Docker Issues

### Docker Compose Fails to Start

**Problem:** Services crash on startup

**Solutions:**

1. **Check logs:**
```bash
docker compose logs backend
docker compose logs frontend
docker compose logs redis
```

2. **Rebuild images:**
```bash
docker compose down
docker compose build --no-cache
docker compose up
```

3. **Check port conflicts:**
```bash
# Check if ports are in use
lsof -i:3007  # Frontend
lsof -i:8004  # Backend
lsof -i:6379  # Redis

# Kill conflicting processes
```

### Permission Denied Errors

**Problem:** Docker permission errors (Linux)

**Solution:**
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Apply group changes
newgrp docker

# Restart Docker service
sudo systemctl restart docker

# Test
docker ps
```

### Volume Mount Issues

**Problem:** Code changes not reflected in container

**Solutions:**

1. **Check volume mounts:**
```yaml
# In docker-compose.dev.yml
volumes:
  - ./backend:/app  # Should be present for hot reload
```

2. **Restart containers:**
```bash
docker compose down
docker compose -f docker-compose.dev.yml up
```

3. **Use bind mount (macOS):**
```yaml
# If using Docker Desktop on macOS
volumes:
  - type: bind
    source: ./backend
    target: /app
```

## API Issues

### 401 Unauthorized

**Problem:** API requests return 401

**Solutions:**

1. **Check API key:**
```bash
# Verify API key in request
curl -X GET "http://localhost:8004/api/v1/documents" \
  -H "X-API-Key: your-api-key"
```

2. **Check JWT token:**
```bash
# For authenticated endpoints
curl -X GET "http://localhost:8004/api/v1/documents" \
  -H "Authorization: Bearer your-jwt-token"
```

3. **Verify environment variables:**
```bash
echo $BACKEND_API_KEY  # Should match X-API-Key header
```

### 429 Rate Limit Exceeded

**Problem:** Too many requests

**Solutions:**

1. **Wait and retry:**
```bash
# Rate limits reset after 1 minute
sleep 60
```

2. **Reduce request rate:**
```python
# Add delays between requests
import time
for item in items:
    process(item)
    time.sleep(0.1)  # 100ms delay
```

3. **Use pagination:**
```bash
# Instead of large requests
curl -X GET "http://localhost:8004/api/v1/documents?limit=100"

# Use pagination
curl -X GET "http://localhost:8004/api/v1/documents?limit=20&offset=0"
curl -X GET "http://localhost:8004/api/v1/documents?limit=20&offset=20"
```

### CORS Errors

**Problem:** Browser blocks requests

**Solutions:**

1. **Check CORS configuration:**
```python
# In backend/app/server.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3007"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

2. **Use proxy in development:**
```typescript
// In frontend next.config.js
module.exports = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8004/api/:path*',
      },
    ];
  },
};
```

## Development Issues

### Tests Failing

**Problem:** pytest or jest tests fail

**Solutions:**

1. **Backend tests:**
```bash
cd backend

# Run only unit tests (fast, no external deps)
poetry run pytest tests/ -v -m unit

# If unit tests pass but integration fails
# Check DB connection, Redis, OpenAI API key
poetry run pytest tests/ -v -m integration
```

2. **Frontend tests:**
```bash
cd frontend

# Clear cache
npm test -- --clearCache

# Run specific test
npm test -- SearchBar.test.tsx

# Update snapshots if needed
npm test -- -u
```

3. **Check test environment:**
```bash
# Ensure test database is set up
# Ensure Redis is running
docker ps | grep redis
```

### Git Conflicts

**Problem:** Merge conflicts when pulling changes

**Solutions:**

1. **Stash your changes:**
```bash
git stash
git pull upstream main
git stash pop

# Resolve conflicts in editor
git add .
git commit -m "chore: resolve merge conflicts"
```

2. **Use merge tool:**
```bash
# Configure merge tool
git config --global merge.tool vscode
git config --global mergetool.vscode.cmd 'code --wait $MERGED'

# Use merge tool
git mergetool
```

### Debugging Issues

**Problem:** Can't figure out why something isn't working

**Solutions:**

1. **Enable verbose logging:**
```bash
# Backend
LOG_LEVEL=debug poetry run uvicorn app.server:app --reload

# Frontend
DEBUG=* npm run dev
```

2. **Use debugger:**

**Backend (Python):**
```python
import pdb; pdb.set_trace()  # Set breakpoint
```

**Frontend (JavaScript):**
```javascript
debugger; // Set breakpoint (open DevTools first)
```

3. **Check logs:**
```bash
# Backend logs
tail -f backend/logs/app.log

# Docker logs
docker compose logs -f backend
```

## Performance Issues

### Slow Search Queries

**Problem:** Search takes >5 seconds

**Solutions:**

1. **Check indexes:**
```sql
-- In Supabase SQL Editor
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename = 'judgments';
-- Should see indexes on jurisdiction, date, embedding
```

2. **Optimize query:**
```python
# Reduce result size
results = await db.search(query, limit=10)  # Instead of 100

# Use filters to narrow search
results = await db.search(query, filters={"jurisdiction": "PL"})
```

3. **Check database performance:**
```sql
-- Check slow queries
SELECT query, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### High Memory Usage

**Problem:** Backend using too much memory

**Solutions:**

1. **Check for memory leaks:**
```bash
# Monitor memory
docker stats backend

# If growing continuously, restart
docker compose restart backend
```

2. **Reduce workers:**
```yaml
# In docker-compose.yml
environment:
  WORKERS: 2  # Reduce from 4
```

3. **Optimize caching:**
```python
# Reduce cache size
from functools import lru_cache

@lru_cache(maxsize=128)  # Reduce from default 256
def expensive_function():
    pass
```

## Getting Help

### Before Asking for Help

1. **Check this troubleshooting guide**
2. **Search existing issues** on GitHub
3. **Check documentation** in docs/ directory
4. **Review error messages** carefully
5. **Try to isolate the problem**

### How to Ask for Help

When opening an issue or asking for help, include:

1. **Clear description** of the problem
2. **Steps to reproduce** the issue
3. **Expected vs actual behavior**
4. **Environment information:**
   ```bash
   # OS
   uname -a

   # Node version
   node --version

   # Python version
   python --version

   # Docker version
   docker --version
   ```
5. **Error messages** (full stack trace)
6. **What you've tried** already

### Where to Get Help

- **GitHub Issues**: Bug reports
- **GitHub Discussions**: Questions and discussions
- **Documentation**: See docs/ directory
- **Code Comments**: Review inline documentation

### Emergency Fixes

If nothing works, try the nuclear option:

```bash
# Stop everything
docker compose down -v

# Clean everything
rm -rf backend/.venv backend/__pycache__
rm -rf frontend/node_modules frontend/.next

# Reinstall
cd backend && poetry install && cd ..
cd frontend && npm install && cd ..

# Restart
docker compose -f docker-compose.dev.yml up --build
```

---

For more information:
- [DEVELOPER_ONBOARDING.md](./DEVELOPER_ONBOARDING.md) - Setup guide
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
