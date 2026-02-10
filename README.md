# Juddges App

AI-powered judicial decision search and analysis platform for Polish and UK court judgments.

## Overview

Juddges App is a specialized legal AI application focused on court judgments and judicial decisions from Poland and the United Kingdom. Built on modern web technologies with semantic search capabilities.

## Features

- 🔍 **Semantic Search**: Vector-based search across 200+ judgments (100 Polish + 100 UK)
- 🇵🇱 **Polish Judgments**: Polish court decisions with full-text search
- 🇬🇧 **UK Judgments**: England & Wales Court of Appeal decisions
- 🤖 **AI-Powered Analysis**: RAG-based chat for legal research
- 📊 **Analytics Dashboard**: Judgment statistics and insights
- 🔐 **Secure Authentication**: Supabase-powered user management

## Technology Stack

### Frontend
- **Framework**: Next.js 15 (App Router)
- **UI Library**: React 19 with Radix UI components
- **Styling**: Tailwind CSS 4
- **State Management**: Zustand + React Query
- **Rich Text**: TipTap editor for document annotations

### Backend
- **API Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL with pgvector extension
- **Vector Search**: Semantic search with embeddings
- **Authentication**: Supabase Auth
- **Monitoring**: Langfuse (optional)

### Data Sources
- Polish judgments from [HFforLegal/case-law](https://huggingface.co/datasets/HFforLegal/case-law)
- UK judgments from [JuDDGES/en-appealcourt](https://huggingface.co/datasets/JuDDGES/en-appealcourt)

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+
- Python 3.11+
- Supabase account

### Environment Setup

1. **Copy environment files**:
   ```bash
   cp .env.example .env
   ```

2. **Configure Supabase**:
   - Create a new Supabase project at https://supabase.com
   - Copy your project URL and anon key to `.env`

3. **Run database migrations**:
   ```bash
   cd supabase
   npx supabase db push
   ```

### Development

Start all services with Docker Compose:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Services will be available at:
- Frontend: http://localhost:3007
- Backend API: http://localhost:8004
- API Docs: http://localhost:8004/docs

### Data Ingestion

Load sample judgments into the database:

```bash
cd scripts
python ingest_judgments.py --polish 100 --uk 100
```

## Project Structure

```
juddges-app/
├── frontend/              # Next.js application
│   ├── app/              # App router pages
│   ├── components/       # React components
│   ├── lib/              # Utilities and hooks
│   └── supabase/         # Supabase client config
├── backend/              # FastAPI application
│   ├── app/              # API endpoints
│   ├── packages/         # Reusable packages
│   └── tests/            # Backend tests
├── supabase/             # Database configuration
│   ├── migrations/       # SQL migration files
│   └── config.toml       # Supabase config
├── scripts/              # Data ingestion scripts
│   ├── ingest_judgments.py
│   └── requirements.txt
└── docs/                 # Documentation
```

## Database Schema

The main `judgments` table structure:

```sql
CREATE TABLE judgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,  -- 'PL' or 'UK'
  court_name TEXT,
  decision_date DATE,
  title TEXT,
  summary TEXT,
  full_text TEXT,
  judges JSONB,
  keywords TEXT[],
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API Endpoints

### Search
- `GET /api/v1/search/judgments` - Search judgments by query
- `POST /api/v1/search/semantic` - Semantic vector search

### Judgments
- `GET /api/v1/judgments` - List judgments with pagination
- `GET /api/v1/judgments/{id}` - Get judgment details
- `POST /api/v1/judgments` - Create new judgment (admin)

### Analytics
- `GET /api/v1/analytics/stats` - Judgment statistics
- `GET /api/v1/analytics/trends` - Decision trends over time

## Development

### Run Tests

```bash
# Frontend tests
cd frontend
npm run test

# Backend tests
cd backend
poetry run pytest
```

### Code Quality

```bash
# Frontend linting
cd frontend
npm run lint

# Backend formatting
cd backend
poetry run ruff format .
poetry run ruff check .
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

MIT License - See LICENSE file for details

## Acknowledgments

- Data sourced from HuggingFace legal datasets
- Built on the foundation of the AI-Tax platform
- Powered by Supabase and Next.js

## Contact

For questions or support, please open an issue on GitHub.
