# AI-Tax Backend

FastAPI-based backend for the AI-Tax platform providing legal document search, AI-powered chat, and document extraction.

## Quick Start

```bash
# Using Docker Compose (recommended)
docker compose up backend

# The API will be available at:
# - http://localhost:8000
# - Swagger UI: http://localhost:8000/docs
# - ReDoc: http://localhost:8000/redoc
```

## Project Structure

```
backend/
├── app/                    # Main application code
│   ├── server.py          # FastAPI application
│   ├── documents.py       # Document management
│   ├── extraction.py      # PDF extraction
│   ├── analytics.py       # Analytics endpoints
│   ├── collections.py     # Collection management
│   ├── dashboard.py       # Dashboard metrics
│   ├── feedback.py        # User feedback system
│   └── ...
├── packages/              # Reusable packages
│   ├── ai_tax_search/    # RAG search implementation
│   └── schema_generator_agent/
├── tests/                 # Test suite
├── scripts/               # Utility scripts
└── pyproject.toml        # Poetry dependencies
```

## API Documentation

Once the backend is running, visit:
- **Swagger UI:** http://localhost:8000/docs (interactive API testing)
- **ReDoc:** http://localhost:8000/redoc (API reference)
- **Health Check:** http://localhost:8000/api/v1/health

## Development

### Prerequisites

- Python 3.11+
- Poetry (dependency management)
- Docker & Docker Compose

### Setup

1. **Copy environment variables:**
   ```bash
   cp .env.sample .env
   # Edit .env with your credentials
   ```

2. **Install dependencies:**
   ```bash
   poetry install
   ```

3. **Run locally (without Docker):**
   ```bash
   poetry run uvicorn app.server:app --reload --port 8000
   ```

### Running Tests

```bash
# Run all tests
poetry run pytest

# Run with coverage
poetry run pytest --cov=app

# Run specific test file
poetry run pytest tests/app/test_documents.py
```

### Code Quality

```bash
# Format code
poetry run ruff format .

# Lint code
poetry run ruff check .

# Type checking
poetry run mypy app/
```

## Environment Variables

See `.env.sample` for required configuration variables:

- **Database:** PostgreSQL connection string
- **Vector Database:** Weaviate host, URL, ports, and API key
- **AI Services:** OpenAI API key, LLM configuration
- **Monitoring:** Langfuse configuration (optional)
- **Task Queue:** Celery with Redis broker
- **Authentication:** Supabase URL and keys
- **API Security:** Backend API key

## Key Features

- **Document Search:** Full-text and vector search with Weaviate
- **AI Chat:** RAG-based chat using LangChain and OpenAI
- **Document Extraction:** PDF processing and metadata extraction
- **Schema Generation:** AI-powered legal schema creation
- **Analytics:** Document statistics and search intelligence
- **Collections:** Document organization and management
- **Feedback System:** User feedback collection and analysis
- **Guest Sessions:** Anonymous user session management

## Architecture

- **Framework:** FastAPI with async/await
- **Database:** PostgreSQL (metadata), Weaviate (vectors)
- **Caching:** Redis
- **Task Queue:** Celery for background jobs
- **AI/ML:** LangChain, OpenAI, Langfuse (monitoring)
- **Authentication:** Supabase Auth

## API Rate Limits

- Default: 100 requests/minute, 1000 requests/hour
- Search: 20 requests/minute
- Chat: 30 requests/minute
- Document upload: 10 requests/minute

## Troubleshooting

### Backend won't start
- Check if all services are running: `docker compose ps`
- Check logs: `docker compose logs backend`
- Verify environment variables in `.env`

### Database connection errors
- Ensure PostgreSQL is running: `docker compose ps db`
- Check database credentials in `.env`
- Wait for database initialization (can take 30s on first start)

### Weaviate errors
- Check Weaviate health: `curl http://localhost:8080/v1/.well-known/ready`
- Restart Weaviate: `docker compose restart weaviate`
- Verify Weaviate API key in `.env`

### Redis/Celery issues
- Check Redis connection: `docker compose ps redis`
- Verify Celery workers are running: `docker compose logs celery`
- Check broker URL configuration

## Contributing

1. Create a feature branch from `main`
2. Write tests for new functionality
3. Ensure all tests pass: `poetry run pytest`
4. Format code: `poetry run ruff format .`
5. Run linting: `poetry run ruff check .`
6. Submit pull request

## License

Proprietary - All rights reserved