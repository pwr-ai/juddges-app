# Juddges App

AI-powered judicial decision search and analysis platform for Polish and England & Wales court judgments.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg)](https://www.python.org/)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)

## What this is

Juddges App is the web application companion to the [JuDDGES research project](https://github.com/pwr-ai/JuDDGES) — a research initiative on legal NLP and human-in-the-loop machine learning for Polish and England & Wales judicial decisions. The app provides semantic and full-text search, retrieval-augmented chat, structured information extraction, and analytics over court judgments, making the research datasets and models accessible through an interactive interface.

This repository is a separate, independently deployable codebase from the JuDDGES research repo; both projects are released under Apache 2.0 and are developed in parallel.

## Features

- **Semantic search** over Polish and England & Wales judgments via Supabase pgvector and Meilisearch hybrid retrieval
- **RAG-based chat** for legal research, grounded in retrieved judgments
- **Structured extraction** of judgment metadata via LLM-driven schema generation
- **Analytics dashboard** for jurisdiction, court, and decision-trend insights
- **Document annotation** workflow with rich-text editing
- **Supabase authentication** for user management and access control

## Architecture

| Layer            | Technology                                                                    |
| ---------------- | ----------------------------------------------------------------------------- |
| Frontend         | Next.js 15 (App Router), React 19, Tailwind CSS 4, Zustand, TanStack Query    |
| Backend API      | FastAPI on Python 3.12+, LangChain, LangServe, LiteLLM, Strawberry GraphQL    |
| Primary database | PostgreSQL via Supabase, with `pgvector` for embeddings                       |
| Search           | Meilisearch (full-text) + pgvector (semantic), combined for hybrid retrieval  |
| Async tasks      | Celery with Redis (worker + beat scheduler)                                   |
| Auth             | Supabase Auth                                                                 |
| LLM observability | Langfuse (optional)                                                          |
| Packaging        | Poetry (backend), npm (frontend), Docker Compose for local + production       |

The backend is organized as a monorepo with reusable Poetry packages: `juddges_search` (RAG, vector retrieval, chains), `schema_generator_agent` (LangGraph agent for schema extraction), and `research_agent`.

## Quick start

### Prerequisites

- Docker with the `docker compose` plugin
- Node.js 18+ (only needed if running the frontend outside Docker)
- Python 3.12+ (only needed if running the backend outside Docker)
- A Supabase project (URL and anon key)
- An OpenAI API key (for embeddings and chat)

### Local development with Docker

```bash
# 1. Clone and enter the repo
git clone https://github.com/pwr-ai/juddges-app.git
cd juddges-app

# 2. Configure environment
cp .env.example .env
# Edit .env to fill in SUPABASE_URL, SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, and other required keys.

# 3. Apply database migrations to your Supabase project
cd supabase
npx supabase db push
cd ..

# 4. Start all services with hot reload
docker compose -f docker-compose.dev.yml up --build
```

Once running, services are available at:

- Frontend: <http://localhost:3026>
- Backend API: <http://localhost:8004>
- Backend API docs (Swagger UI): <http://localhost:8004/docs>
- Backend API docs (ReDoc): <http://localhost:8004/redoc>

### Loading sample data

The data ingestion script pulls Polish and England & Wales judgments from public Hugging Face datasets and writes them to your Supabase instance:

```bash
cd scripts
pip install -r requirements.txt

# Quick smoke test (20 judgments total)
python ingest_judgments.py --polish 10 --uk 10

# Full sample dataset (~6,000 judgments)
python ingest_judgments.py --polish 3000 --uk 3000
```

### Running services individually

If you prefer to run services natively (outside Docker), see the per-package READMEs and the [development how-to guides](docs/how-to/).

```bash
# Backend
cd backend
poetry install
poetry run uvicorn app.server:app --reload --port 8004

# Frontend
cd frontend
npm install
npm run dev
```

## Project structure

```text
juddges-app/
├── frontend/              # Next.js 15 application (App Router)
├── backend/               # FastAPI application
│   ├── app/               # API routers, schemas, workers
│   └── packages/          # Reusable Poetry packages
│       ├── juddges_search/          # RAG, retrieval, chains
│       ├── schema_generator_agent/  # LangGraph schema-extraction agent
│       └── research_agent/          # Research agent
├── supabase/              # Database migrations and Supabase config
├── scripts/               # Data ingestion, deployment, evaluation
├── docs/                  # Documentation (Diataxis-organized)
├── docker-compose.yml     # Production stack
└── docker-compose.dev.yml # Development stack with hot reload
```

## Documentation

Documentation lives in [`docs/`](docs/) and follows the [Diataxis](https://diataxis.fr/) framework:

- [`docs/tutorials/`](docs/tutorials/) — Learning-oriented walkthroughs
- [`docs/how-to/`](docs/how-to/) — Task-oriented guides
- [`docs/reference/`](docs/reference/) — API and configuration reference
- [`docs/explanation/`](docs/explanation/) — Architecture and concept deep-dives
- [`docs/getting-started/`](docs/getting-started/) — Setup and onboarding
- [`docs/architecture/`](docs/architecture/) — System design notes
- [`docs/features/`](docs/features/) — Feature-specific documentation

For internal contributor guidelines, see [`CLAUDE.md`](CLAUDE.md) (development conventions for AI-assisted contributions).

## Related projects

- [pwr-ai/JuDDGES](https://github.com/pwr-ai/JuDDGES) — the parent research project: datasets, NLP pipelines, and human-in-the-loop ML experiments for Polish and England & Wales judicial decisions.

## Contributing

Contributions are welcome. Please open an issue to discuss substantial changes before submitting a pull request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Run the test and lint suites locally:
   - Backend: `poetry run poe check-all`
   - Frontend: `npm run validate && npm run test`
4. Commit your changes and open a pull request against `main`

## License

Juddges App is licensed under the [Apache License 2.0](LICENSE). The frontend (`frontend/package.json`) and backend (`backend/pyproject.toml`) are both released under the same license.

## Acknowledgments

- Polish judgments dataset: [HFforLegal/case-law](https://huggingface.co/datasets/HFforLegal/case-law)
- England & Wales judgments dataset: [JuDDGES/en-appealcourt](https://huggingface.co/datasets/JuDDGES/en-appealcourt)
- Built on the foundations of the [JuDDGES research project](https://github.com/pwr-ai/JuDDGES)
