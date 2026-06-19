# Juddges App - Project Summary

## 🎯 Project Overview

**Juddges App** is a fork of the JuDDGES platform, specialized for searching and analyzing judicial decisions from Poland and the United Kingdom. The app provides semantic search capabilities across 6,000+ sampled court judgments using modern AI and vector database technology.

## 📊 Key Features

- **Multi-Jurisdiction Support**: Polish and UK court decisions in one platform
- **Semantic Search**: Vector-based similarity search using OpenAI embeddings
- **Full-Text Search**: PostgreSQL-powered text search with ranking
- **Structured Data**: Comprehensive metadata including judges, dates, keywords
- **Modern Stack**: Next.js 15, FastAPI, Supabase, pgvector
- **Scalable Architecture**: Ready to scale from 6,000 to 200,000+ judgments

## 🗂️ Repository Structure

```
juddges-app/
├── README.md                    # Main project documentation
├── SETUP_GUIDE.md               # Step-by-step setup instructions
├── DATA_INGESTION_GUIDE.md      # Data ingestion documentation
├── SUPABASE_MCP_GUIDE.md        # Supabase MCP tools reference
├── PROJECT_SUMMARY.md           # This file
├── .env.example                 # Environment variable template
├── .gitignore                   # Git ignore rules
│
├── supabase/                    # Supabase database configuration
│   └── migrations/
│       └── 20260209000001_create_judgments_table.sql
│
└── scripts/                     # Data ingestion scripts
    ├── ingest_judgments.py      # Main ingestion pipeline
    └── requirements.txt         # Python dependencies
```

## 📚 Documentation Files

### 1. [README.md](README.md)
**Purpose**: Main project documentation and quick start guide

**Contents**:
- Project overview and features
- Technology stack details
- Quick start instructions
- API endpoint documentation
- Development commands

**Target Audience**: Developers getting started with the project

---

### 2. [SETUP_GUIDE.md](../getting-started/setup-guide.md)
**Purpose**: Complete step-by-step setup instructions

**Contents**:
- Prerequisites checklist
- Supabase project creation
- Environment configuration
- Database migration steps
- Data ingestion walkthrough
- Troubleshooting guide

**Target Audience**: First-time users setting up the project

**Key Sections**:
- ✅ 5-minute quick start
- 🔧 Detailed setup steps
- 🐛 Troubleshooting
- 📝 Setup completion checklist

---

### 3. [DATA_INGESTION_GUIDE.md](../how-to/data-ingestion.md)
**Purpose**: Comprehensive guide to data ingestion process

**Contents**:
- Data source descriptions (HuggingFace datasets)
- Ingestion pipeline architecture
- Performance metrics and costs
- Data quality checks
- Advanced usage patterns

**Target Audience**: Developers managing data ingestion

**Key Sections**:
- 📊 Dataset statistics and structure
- 🔄 Pipeline architecture
- 📈 Performance benchmarks
- 💰 Cost estimates (OpenAI API)
- 🛠️ Troubleshooting common issues

---

### 4. [SUPABASE_MCP_GUIDE.md](../how-to/supabase-mcp.md)
**Purpose**: Guide for using Supabase MCP tools in Claude Code

**Contents**:
- Available MCP tools reference
- Common query examples
- Security and access control
- Performance monitoring
- Development workflow (branches)

**Target Audience**: Developers using Claude Code with Supabase

**Key Sections**:
- 🔧 MCP tool catalog
- 📝 SQL query examples
- 🔐 Security configuration
- 📊 Monitoring and analytics
- 🚀 Advanced queries

---

### 5. [.env.example](https://github.com/pwr-ai/juddges-app/blob/main/.env.example)
**Purpose**: Environment variable template

**Contents**:
- Supabase credentials
- OpenAI API keys
- Backend configuration
- Feature flags
- Service URLs

**Usage**: Copy to `.env` and fill in actual values

---

## 🗄️ Database Schema

### Main Table: `judgments`

**Purpose**: Store all court judgments from Poland and UK

**Key Columns**:
- `id`: UUID primary key
- `case_number`: Unique case identifier
- `jurisdiction`: 'PL' or 'UK'
- `court_name`: Name of the court
- `decision_date`: Date of judgment
- `title`: Case title
- `summary`: Brief summary
- `full_text`: Complete judgment text
- `judges`: JSONB array of judges
- `keywords`: Text array for filtering
- `embedding`: vector(768) for semantic search
- `metadata`: JSONB for flexible data

**Indexes**:
- B-tree: jurisdiction, decision_date, case_number
- GIN: full-text search, keywords, JSONB
- HNSW: vector similarity (cosine distance)

**Search Functions**:
1. `search_judgments_by_embedding()`: Semantic search with vectors
2. `search_judgments_by_text()`: Full-text search with ranking

---

## 📦 Data Sources

### Polish Judgments

**Dataset**: [JuDDGES/pl-appealcourt-criminal](https://huggingface.co/datasets/JuDDGES/pl-appealcourt-criminal)

**DOI**: [10.57967/hf/8772](https://doi.org/10.57967/hf/8772)

**Description**: Multi-jurisdiction case law dataset with standardized format

**Polish Coverage**:
- ~50,000+ Polish court decisions
- Multiple court levels (Supreme, Appeal, District)
- Various case types (Civil, Criminal, Administrative)

**Ingestion Command**:
```bash
python ingest_judgments.py --polish 3000
```

---

### UK Judgments

**Dataset**: [JuDDGES/en-appealcourt](https://huggingface.co/datasets/JuDDGES/en-appealcourt)

**DOI**: [10.57967/hf/8773](https://doi.org/10.57967/hf/8773)

**Description**: Complete collection of England & Wales Court of Appeal (Criminal Division) judgments

**Coverage**:
- 6,154 judgments total
- Date range: Up to May 15, 2024
- Court: Court of Appeal (Criminal Division)
- Format: Structured XML with metadata

**Ingestion Command**:
```bash
python ingest_judgments.py --uk 3000
```

---

## 🔄 Data Ingestion Pipeline

### Pipeline Flow

```
1. Download from HuggingFace
   ↓
2. Transform to unified schema
   ↓
3. Generate embeddings (OpenAI)
   ↓
4. Insert into Supabase
   ↓
5. Verify data quality
```

### Performance Metrics

| Operation | Time (100 cases) | Time (3000 cases) | Cost (3000) |
|-----------|------------------|--------------------|-------------|
| Download | ~30 seconds | ~5 minutes | Free |
| Transform | ~1 minute | ~15 minutes | Free |
| Embeddings | ~5-7 minutes | ~2-3 hours | ~$12 |
| Insert | ~1 minute | ~10 minutes | Free |
| **Total** | **~8-10 minutes** | **~3-4 hours** | **~$12** |

### Storage Requirements

- **100 judgments**: ~2-3 MB
- **1,000 judgments**: ~20-30 MB
- **6,000 judgments**: ~120-180 MB (current target)
- **10,000 judgments**: ~200-300 MB

---

## 🚀 Next Steps

### Phase 1: Initial Setup ✅
- [x] Create repository structure
- [x] Write documentation
- [x] Create database migration
- [x] Build ingestion script

### Phase 2: Copy Boilerplate ✅
- [x] Copy frontend from JuDDGES
- [x] Copy backend from JuDDGES
- [x] Update branding (JuDDGES → Juddges)
- [x] Configure environment variables
- [x] Test local development setup

### Phase 3: Customize for Judgments ✅
- [x] Create judgment search UI
- [x] Implement semantic search endpoint
- [x] Add jurisdiction filters
- [x] Create judgment detail page
- [x] Add keyword-based navigation

### Phase 4: Data Ingestion ✅
- [x] Run Supabase migrations
- [x] Ingest Polish judgments
- [x] Ingest UK judgments
- [x] Verify data quality
- [x] Test search functionality

### Phase 5: Features (In Progress)
- [x] Add RAG-based chat for legal Q&A
- [x] Create analytics dashboard
- [ ] Implement judgment comparison
- [ ] Add citation tracking
- [ ] Build export functionality

### Phase 6: Deployment ✅
- [x] Set up production Supabase project
- [x] Configure CI/CD pipeline
- [x] Deploy to production (Docker Hub + deploy scripts)
- [x] Set up monitoring (Langfuse)
- [x] Create user documentation

### Phase 7: Search Quality & Data Scale (In Progress)
- [ ] Curate 6K+ Polish judgment dataset with topic coverage (issue #12)
- [ ] Topic analysis of 6K UK judgments (issue #10)
- [ ] Cross-jurisdictional search query generation (issue #11)
- [ ] Search quality evaluation framework (issue #13)
- [ ] Query classification and alpha routing
- [x] Cross-encoder reranking with Cohere API
- [x] Polish text search with unaccent + per-document language detection

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: Next.js 15 (App Router)
- **UI**: React 19 + Radix UI
- **Styling**: Tailwind CSS 4
- **State**: Zustand + React Query
- **Forms**: React Hook Form + Zod

### Backend
- **Framework**: FastAPI (Python 3.12+)
- **Database**: PostgreSQL (via Supabase)
- **Vector DB**: pgvector extension
- **Auth**: Supabase Auth
- **AI**: OpenAI API (embeddings + chat)

### Infrastructure
- **Hosting**: Supabase (database + auth)
- **Deployment**: Docker + Docker Compose
- **Monitoring**: Langfuse (optional)
- **CI/CD**: GitHub Actions

---

## 💡 Key Design Decisions

### 1. Why Supabase?
- **Managed PostgreSQL**: No server management
- **Built-in Auth**: Reduces development time
- **Vector Support**: pgvector for semantic search
- **Real-time**: WebSocket support for live updates
- **Free Tier**: Generous limits for development

### 2. Why pgvector over Weaviate?
- **Simplicity**: Single database for all data
- **Cost**: No separate vector DB instance
- **Performance**: Good enough for <1M vectors
- **Integration**: Native PostgreSQL features

### 3. Why OpenAI embeddings?
- **Quality**: State-of-the-art semantic understanding
- **Stability**: Production-ready API
- **Cost**: Reasonable at ~$0.0001 per 1K tokens
- **Compatibility**: Standard 768-dim vectors

### 4. Why Target 6K+ Documents?
- **Search quality**: Sufficient corpus for meaningful semantic search evaluation
- **Coverage**: ~3K Polish + ~3K UK ensures balanced cross-jurisdictional coverage
- **Topic diversity**: Enables representative topic analysis across legal domains
- **Cost**: ~$24 for embeddings (manageable one-time cost)
- **Scalability**: Architecture supports 200K+ with HNSW indexes

---

## 📊 Expected Performance

### Search Performance

| Search Type | Latency | Quality |
|-------------|---------|---------|
| Exact Match | <50ms | Exact |
| Full-Text | <100ms | Good |
| Semantic | <200ms | Excellent |
| Hybrid | <250ms | Best |

### Scalability Targets

| Dataset Size | Search Time | Storage |
|--------------|-------------|---------|
| 6,000 cases | <150ms | ~120 MB |
| 20,000 cases | <300ms | ~500 MB |
| 50,000 cases | <500ms | ~1.5 GB |
| 200,000 cases | <1s | ~5 GB |

---

## 🔐 Security Considerations

1. **API Keys**: Never commit `.env` file
2. **Service Role**: Only use server-side
3. **Row Level Security**: Enable for production
4. **Rate Limiting**: Protect API endpoints
5. **Input Validation**: Sanitize user queries

---

## 📞 Support & Resources

### Documentation
- **Project Docs**: See README.md and guides
- **Supabase Docs**: https://supabase.com/docs
- **Next.js Docs**: https://nextjs.org/docs
- **FastAPI Docs**: https://fastapi.tiangolo.com

### Data Sources
- **JuDDGES/pl-appealcourt-criminal** (Polish): https://huggingface.co/datasets/JuDDGES/pl-appealcourt-criminal — DOI: [10.57967/hf/8772](https://doi.org/10.57967/hf/8772)
- **JuDDGES/en-appealcourt** (UK): https://huggingface.co/datasets/JuDDGES/en-appealcourt — DOI: [10.57967/hf/8773](https://doi.org/10.57967/hf/8773)

### Community
- **Issues**: GitHub Issues (when repo is created)
- **Discussions**: GitHub Discussions
- **Email**: [Your contact email]

---

## 📝 License

MIT License - See LICENSE file for details

---

## 🎉 Conclusion

The Juddges App foundation is now complete! You have:

✅ **Database schema** ready for Polish and UK judgments
✅ **Ingestion pipeline** to load data from HuggingFace
✅ **Comprehensive documentation** for setup and usage
✅ **MCP tools guide** for database management
✅ **Scalable architecture** ready for growth

**Next action**: Follow the [SETUP_GUIDE.md](../getting-started/setup-guide.md) to set up your Supabase project and ingest your first judgments!

---

*Last updated: March 9, 2026*
*Version: 2.0.0*
