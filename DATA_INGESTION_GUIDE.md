# Data Ingestion Guide for Juddges App

This guide explains how judgment data from HuggingFace is ingested into your Supabase database.

## 📊 Data Sources

### 1. Polish Judgments

**Dataset**: [HFforLegal/case-law](https://huggingface.co/datasets/HFforLegal/case-law)

**Description**: Multi-jurisdiction legal case law dataset in standardized format. Contains Polish court decisions along with cases from other European jurisdictions.

**Sample Structure**:
```json
{
  "id": "12345",
  "case_id": "I ACa 123/21",
  "jurisdiction": "PL",
  "court": "Sąd Apelacyjny w Warszawie",
  "court_level": "Appeal",
  "date": "2024-03-15",
  "title": "Appeal regarding tax liability",
  "text": "Full judgment text...",
  "judges": ["Sędzia A. Kowalski", "Sędzia B. Nowak"],
  "case_type": "Civil",
  "keywords": ["tax", "liability", "appeal"],
  "summary": "Brief summary of the case..."
}
```

**Estimated Size**:
- ~50,000+ Polish cases available
- Sample ingestion: 100 cases
- Average case size: 5-15 KB

### 2. UK Judgments

**Dataset**: [JuDDGES/en-appealcourt](https://huggingface.co/datasets/JuDDGES/en-appealcourt)

**Description**: Complete collection of England & Wales Court of Appeal (Criminal Division) judgments. Contains 6,154 judgments with structured metadata.

**Sample Structure**:
```json
{
  "id": "54321",
  "neutral_citation": "[2024] EWCA Crim 123",
  "case_number": "202400123",
  "case_name": "R v Smith",
  "judgment_date": "2024-03-15",
  "judgment_text": "Full judgment text...",
  "judges": ["Lord Justice Smith", "Mr Justice Jones"],
  "decision_type": "Judgment",
  "outcome": "Appeal dismissed",
  "summary": "Brief summary...",
  "uri": "https://caselaw.nationalarchives.gov.uk/..."
}
```

**Dataset Statistics**:
- Total cases: 6,154 judgments
- Date range: Up to May 15, 2024
- Court: England & Wales Court of Appeal (Criminal Division)
- Format: XML and cleaned structured data
- Average case size: 8-25 KB

## 🔄 Ingestion Pipeline

### Architecture Overview

```
┌─────────────────────┐
│  HuggingFace Hub    │
│  - case-law (PL)    │
│  - en-appealcourt   │
└──────────┬──────────┘
           │ Download via datasets library
           ▼
┌─────────────────────┐
│  Python Ingestion   │
│  Script             │
│  - Transform data   │
│  - Generate embed.  │
└──────────┬──────────┘
           │ Insert via Supabase client
           ▼
┌─────────────────────┐
│  Supabase DB        │
│  (PostgreSQL)       │
│  - judgments table  │
│  - pgvector search  │
└─────────────────────┘
```

### Data Transformation

The ingestion script transforms raw HuggingFace data into our unified schema:

**Schema Mapping**:

| Supabase Field | Polish Source | UK Source |
|----------------|---------------|-----------|
| `case_number` | `case_id` | `neutral_citation` |
| `jurisdiction` | `'PL'` (hardcoded) | `'UK'` (hardcoded) |
| `court_name` | `court` | `'Court of Appeal (Criminal Division)'` |
| `decision_date` | `date` | `judgment_date` |
| `title` | `title` | `case_name` |
| `full_text` | `text` | `judgment_text` |
| `judges` | `judges` array | `judges` array |
| `summary` | `summary` | `summary` |
| `keywords` | `keywords` | `keywords` |

### Embedding Generation

For each judgment, we generate a 1536-dimensional vector embedding using OpenAI's `text-embedding-ada-002` model:

```python
# Example embedding generation
embedding = openai.embeddings.create(
    model="text-embedding-ada-002",
    input=full_text[:32000]  # Truncate to ~8k tokens
)
```

**Why Embeddings?**
- Enable semantic search: "Find similar cases about tax liability"
- Better than keyword matching for legal concepts
- ~$0.0001 per 1K tokens (100 judgments ≈ $0.50)

## 🚀 Running the Ingestion

### Basic Usage

```bash
# Install dependencies
cd scripts
pip install -r requirements.txt

# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export OPENAI_API_KEY="sk-your-key"  # Optional

# Ingest Polish and UK judgments
python ingest_judgments.py --polish 100 --uk 100
```

### Command-Line Options

```bash
# Ingest only Polish judgments
python ingest_judgments.py --polish 100 --skip-uk

# Ingest only UK judgments
python ingest_judgments.py --uk 100 --skip-polish

# Small test sample
python ingest_judgments.py --polish 10 --uk 10

# Skip embeddings to save API costs
python ingest_judgments.py --polish 100 --uk 100 --no-embeddings
```

### Using .env File

Create a `.env` file in the scripts directory:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=sk-your-openai-key
```

Then run:
```bash
python ingest_judgments.py --polish 100 --uk 100
```

## 📈 Performance & Costs

### Ingestion Time

| Judgments | Without Embeddings | With Embeddings |
|-----------|-------------------|-----------------|
| 10 cases | ~30 seconds | ~1 minute |
| 100 cases | ~3 minutes | ~8-10 minutes |
| 1000 cases | ~30 minutes | ~80-100 minutes |

**Bottleneck**: OpenAI API calls for embedding generation (rate limits: 3000 req/min)

### Storage Requirements

| Data Type | Size per 100 cases | Size per 1000 cases |
|-----------|-------------------|---------------------|
| Text data | ~1-2 MB | ~10-20 MB |
| Embeddings | ~600 KB | ~6 MB |
| Metadata | ~100 KB | ~1 MB |
| **Total** | **~2-3 MB** | **~17-27 MB** |

### API Costs (OpenAI)

- **Embedding model**: text-embedding-ada-002
- **Cost**: $0.0001 per 1K tokens
- **Average judgment**: 2K-5K tokens
- **100 judgments**: ~$0.30-$0.50
- **1000 judgments**: ~$3-$5

## 🔍 Data Quality Checks

After ingestion, verify data quality:

### SQL Queries

```sql
-- Count judgments by jurisdiction
SELECT jurisdiction, COUNT(*)
FROM judgments
GROUP BY jurisdiction;

-- Check for missing embeddings
SELECT COUNT(*)
FROM judgments
WHERE embedding IS NULL;

-- Sample recent judgments
SELECT case_number, title, decision_date
FROM judgments
ORDER BY created_at DESC
LIMIT 10;

-- Check average text length
SELECT
  jurisdiction,
  AVG(LENGTH(full_text)) as avg_text_length,
  MIN(LENGTH(full_text)) as min_text_length,
  MAX(LENGTH(full_text)) as max_text_length
FROM judgments
GROUP BY jurisdiction;
```

### Python Verification Script

```python
from supabase import create_client

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Check total count
response = supabase.table('judgments').select('id', count='exact').execute()
print(f"Total judgments: {response.count}")

# Check by jurisdiction
pl_count = supabase.table('judgments')\
    .select('id', count='exact')\
    .eq('jurisdiction', 'PL')\
    .execute()
print(f"Polish judgments: {pl_count.count}")

uk_count = supabase.table('judgments')\
    .select('id', count='exact')\
    .eq('jurisdiction', 'UK')\
    .execute()
print(f"UK judgments: {uk_count.count}")
```

## 🛠️ Troubleshooting

### Common Issues

**1. HuggingFace Dataset Load Fails**
```
Error: ConnectionError or TimeoutError
```
**Solution**:
- Check internet connection
- Try again (HF can have temporary issues)
- Use `streaming=True` for large datasets

**2. OpenAI Rate Limit**
```
Error: Rate limit exceeded
```
**Solution**:
- Add delays between API calls
- Reduce batch size
- Upgrade OpenAI tier

**3. Supabase Insert Fails**
```
Error: duplicate key value violates unique constraint
```
**Solution**:
- Check if data already exists
- Use upsert instead of insert
- Clear table and re-run

**4. Out of Memory**
```
Error: MemoryError
```
**Solution**:
- Use streaming dataset loading
- Process in smaller batches
- Increase system RAM

### Debug Mode

Enable verbose logging:

```python
import logging
logging.basicConfig(level=logging.DEBUG)

python ingest_judgments.py --polish 10 --uk 10
```

## 📚 Advanced Usage

### Custom Data Transformations

Modify `_transform_polish_judgment()` or `_transform_uk_judgment()` to:
- Extract additional metadata
- Apply custom text cleaning
- Add domain-specific annotations

### Incremental Updates

To add new judgments without re-ingesting:

```python
# Check last ingested date
last_date = supabase.table('judgments')\
    .select('decision_date')\
    .order('decision_date', desc=True)\
    .limit(1)\
    .execute()

# Only ingest newer judgments
# (implement date filtering in transform functions)
```

### Parallel Processing

For faster ingestion of large datasets:

```python
from multiprocessing import Pool

def process_batch(cases):
    # Process each batch in parallel
    pass

with Pool(processes=4) as pool:
    pool.map(process_batch, batches)
```

## 🎯 Next Steps

1. **Validate ingested data** using SQL queries above
2. **Test search functionality** in your application
3. **Monitor usage** in Supabase dashboard
4. **Optimize queries** based on search patterns
5. **Scale up** ingestion for full datasets when ready

## 📊 Dataset Statistics

After ingestion, you can query statistics:

```sql
-- Judgments by year
SELECT
  EXTRACT(YEAR FROM decision_date) as year,
  jurisdiction,
  COUNT(*) as count
FROM judgments
WHERE decision_date IS NOT NULL
GROUP BY year, jurisdiction
ORDER BY year DESC, jurisdiction;

-- Most common courts
SELECT
  court_name,
  COUNT(*) as count
FROM judgments
GROUP BY court_name
ORDER BY count DESC
LIMIT 10;

-- Average judgment length by jurisdiction
SELECT
  jurisdiction,
  AVG(LENGTH(full_text)) / 1000 as avg_kb
FROM judgments
GROUP BY jurisdiction;
```

---

**Need help?** Check the main [README](README.md) or [SETUP_GUIDE](SETUP_GUIDE.md) for more information.
