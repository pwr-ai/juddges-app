# Getting Started with Juddges App

This section contains everything you need to get Juddges App up and running on your machine.

## 📋 Prerequisites

Before you begin, ensure you have:
- Node.js 18+ installed
- Python 3.11+ installed
- Docker & Docker Compose installed
- Supabase account
- OpenAI API key (optional but recommended)

## 📚 Documentation

### [Setup Guide](setup-guide.md)
**Complete step-by-step setup instructions** including:
- Repository setup
- Supabase project creation
- Environment variable configuration
- Database migrations
- Frontend and backend setup
- Docker Compose setup
- Data ingestion

**Start here if**: You're setting up the project for the first time.

### [Quick Start](quick-start.md)
**Rapid migration guide** for getting started quickly:
- Quick repository setup
- Essential configuration
- Fast-track setup steps

**Start here if**: You want to get up and running as quickly as possible.

## 🚀 Quick Start Summary

1. **Clone and setup**:
   ```bash
   cd ~/github/juddges-app
   cp .env.example .env
   # Edit .env with your credentials
   ```

2. **Setup Supabase**:
   - Create project at [supabase.com](https://supabase.com)
   - Copy credentials to `.env`
   - Apply migrations: `cd supabase && npx supabase db push`

3. **Start services**:
   ```bash
   # Development with hot reload
   docker compose -f docker-compose.dev.yml up --build

   # Or run services individually
   cd frontend && npm run dev  # Port 3007
   cd backend && poetry run uvicorn app.server:app --reload --port 8004
   ```

4. **Ingest data** (optional):
   ```bash
   cd scripts
   pip install -r requirements.txt
   python ingest_judgments.py --polish 10 --uk 10
   ```

5. **Access the app**:
   - Frontend: http://localhost:3007
   - Backend API: http://localhost:8004
   - API Docs: http://localhost:8004/docs

## 📖 Next Steps

After getting the app running:
- [Data Ingestion Guide](../guides/data-ingestion.md) - Load more judgment data
- [Architecture Overview](../architecture/overview.md) - Understand the system
- [Frontend Styling Guide](../frontend/styling-guide/) - Learn the UI system
- [API Reference](../api/) - Explore API endpoints

## 🆘 Troubleshooting

**Port conflicts**:
- Frontend uses ports 3007 (dev) and 3006 (prod)
- Backend uses ports 8004 (dev) and 8002 (prod)
- Check if ports are in use: `lsof -i :3007`

**Environment variables**:
- Ensure all required variables in `.env` are set
- Check `.env.example` for the complete list

**Database issues**:
- Verify Supabase credentials are correct
- Check migrations are applied: `npx supabase db pull`

**Docker issues**:
- Clear Docker cache: `docker compose down -v`
- Rebuild images: `docker compose up --build`

For more help, see the detailed [Setup Guide](setup-guide.md).
