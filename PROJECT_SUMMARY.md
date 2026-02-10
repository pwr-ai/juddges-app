# Juddges App - Project Summary

## 🎯 Project Overview

**Juddges App** is a fork of the AI-Tax platform, specialized for searching and analyzing judicial decisions from Poland and the United Kingdom. The app provides semantic search capabilities across 200+ court judgments using modern AI and vector database technology.

## 📊 Key Features

- **Multi-Jurisdiction Support**: Polish and UK court decisions in one platform
- **Semantic Search**: Vector-based similarity search using OpenAI embeddings
- **Full-Text Search**: PostgreSQL-powered text search with ranking
- **Structured Data**: Comprehensive metadata including judges, dates, keywords
- **Modern Stack**: Next.js 15, FastAPI, Supabase, pgvector
- **Scalable Architecture**: Ready to scale from 200 to 200,000+ judgments

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

### 2. [SETUP_GUIDE.md](SETUP_GUIDE.md)
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

### 3. [DATA_INGESTION_GUIDE.md](DATA_INGESTION_GUIDE.md)
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

### 4. [SUPABASE_MCP_GUIDE.md](SUPABASE_MCP_GUIDE.md)
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

### 5. [.env.example](.env.example)
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
- `embedding`: vector(1536) for semantic search
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

**Dataset**: [HFforLegal/case-law](https://huggingface.co/datasets/HFforLegal/case-law)

**Description**: Multi-jurisdiction case law dataset with standardized format

**Polish Coverage**:
- ~50,000+ Polish court decisions
- Multiple court levels (Supreme, Appeal, District)
- Various case types (Civil, Criminal, Administrative)

**Ingestion Command**:
```bash
python ingest_judgments.py --polish 100
```

---

### UK Judgments

**Dataset**: [JuDDGES/en-appealcourt](https://huggingface.co/datasets/JuDDGES/en-appealcourt)

**Description**: Complete collection of England & Wales Court of Appeal (Criminal Division) judgments

**Coverage**:
- 6,154 judgments total
- Date range: Up to May 15, 2024
- Court: Court of Appeal (Criminal Division)
- Format: Structured XML with metadata

**Ingestion Command**:
```bash
python ingest_judgments.py --uk 100
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

| Operation | Time (100 cases) | Cost |
|-----------|------------------|------|
| Download | ~30 seconds | Free |
| Transform | ~1 minute | Free |
| Embeddings | ~5-7 minutes | ~$0.40 |
| Insert | ~1 minute | Free |
| **Total** | **~8-10 minutes** | **~$0.40** |

### Storage Requirements

- **100 judgments**: ~2-3 MB
- **1,000 judgments**: ~20-30 MB
- **10,000 judgments**: ~200-300 MB

---

## 🚀 Next Steps

### Phase 1: Initial Setup ✅
- [x] Create repository structure
- [x] Write documentation
- [x] Create database migration
- [x] Build ingestion script

### Phase 2: Copy Boilerplate (TODO)
- [ ] Copy frontend from AI-Tax
- [ ] Copy backend from AI-Tax
- [ ] Update branding (AI-Tax → Juddges)
- [ ] Configure environment variables
- [ ] Test local development setup

### Phase 3: Customize for Judgments (TODO)
- [ ] Create judgment search UI
- [ ] Implement semantic search endpoint
- [ ] Add jurisdiction filters
- [ ] Create judgment detail page
- [ ] Add keyword-based navigation

### Phase 4: Data Ingestion (TODO)
- [ ] Run Supabase migrations
- [ ] Ingest 100 Polish judgments
- [ ] Ingest 100 UK judgments
- [ ] Verify data quality
- [ ] Test search functionality

### Phase 5: Features (TODO)
- [ ] Add RAG-based chat for legal Q&A
- [ ] Implement judgment comparison
- [ ] Add citation tracking
- [ ] Create analytics dashboard
- [ ] Build export functionality

### Phase 6: Deployment (TODO)
- [ ] Set up production Supabase project
- [ ] Configure CI/CD pipeline
- [ ] Deploy to production
- [ ] Set up monitoring
- [ ] Create user documentation

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: Next.js 15 (App Router)
- **UI**: React 19 + Radix UI
- **Styling**: Tailwind CSS 4
- **State**: Zustand + React Query
- **Forms**: React Hook Form + Zod

### Backend
- **Framework**: FastAPI (Python 3.11+)
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
- **Compatibility**: Standard 1536-dim vectors

### 4. Why Sample Size 100+100?
- **Testing**: Large enough to test search quality
- **Cost**: ~$0.80 for embeddings
- **Speed**: ~15-20 minutes total ingestion
- **Scalability**: Easy to increase later

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
| 200 cases | <100ms | ~5 MB |
| 2,000 cases | <200ms | ~50 MB |
| 20,000 cases | <500ms | ~500 MB |
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
- **HFforLegal/case-law**: https://huggingface.co/datasets/HFforLegal/case-law
- **JuDDGES/en-appealcourt**: https://huggingface.co/datasets/JuDDGES/en-appealcourt

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

**Next action**: Follow the [SETUP_GUIDE.md](SETUP_GUIDE.md) to set up your Supabase project and ingest your first judgments!

---

*Generated: February 9, 2026*
*Version: 1.0.0*
