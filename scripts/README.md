# Scripts Directory

This directory contains data processing and analysis scripts for the Juddges App.

## Scripts

### Data Ingestion

#### `ingest_judgments.py`
Ingests court judgment datasets from HuggingFace into Supabase.

**Usage:**
```bash
# Install dependencies
pip install -r requirements.txt

# Full target dataset (6K+ judgments)
python scripts/ingest_judgments.py --polish 3000 --uk 3000

# Development sample
python scripts/ingest_judgments.py --polish 100 --uk 100

# Quick test
python scripts/ingest_judgments.py --polish 10 --uk 10
```

**Environment Variables Required:**
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (for write access)
- `HF_TOKEN`: HuggingFace token for dataset access
- `TRANSFORMERS_INFERENCE_URL` (optional): For embeddings

### Topic Analysis

#### `analyze_uk_topics.py`
Analyzes UK court judgments to identify legal themes using BERTopic and AI-assisted labeling.

**Usage:**
```bash
# Install dependencies (includes ML libraries)
pip install -r requirements.txt

# Run full analysis on all available UK judgments
python scripts/analyze_uk_topics.py

# Test with a smaller sample
python scripts/analyze_uk_topics.py --sample 500
```

**Environment Variables Required:**
- `HF_TOKEN`: HuggingFace token for dataset access
- `OPENAI_API_KEY`: OpenAI API key for topic labeling with GPT-4o-mini

**Outputs:**
- `data/uk_topics_taxonomy.json`: Structured topic hierarchy with labels and descriptions
- `data/uk_topic_assignments.parquet`: Document-to-topic mappings with confidence scores

**Features:**
- Loads data from `JuDDGES/en-appealcourt` and `JuDDGES/en-court-raw-sample`
- Uses BERTopic with `sentence-transformers/all-MiniLM-L6-v2` embeddings
- AI-powered topic labeling with GPT-4o-mini
- Rich console output with progress bars and summary statistics
- Targets 15-30 top-level legal topics
- Filters short documents (< 500 characters)
- Minimum topic size: 20 documents

#### `generate_cross_queries.py`
Generates Polish-language search queries from UK legal topics for cross-jurisdictional legal research.

**Usage:**
```bash
# Generate queries for all UK topics (requires analyze_uk_topics.py output)
python scripts/generate_cross_queries.py

# Test with a smaller sample
python scripts/generate_cross_queries.py --sample 5
```

**Environment Variables Required:**
- `OPENAI_API_KEY`: OpenAI API key for query generation with GPT-4o

**Prerequisites:**
- Run `analyze_uk_topics.py` first to generate `data/uk_topics_taxonomy.json`

**Outputs:**
- `data/cross_jurisdictional_queries.json`: Polish and English search queries with jurisdictional mapping

**Features:**
- Maps UK legal concepts to Polish legal framework
- Generates 4-5 Polish search queries per topic using proper legal terminology
- Includes 2-3 bilingual English queries for cross-reference
- Provides jurisdictional mapping notes and confidence levels
- Lists expected Polish legal sources (codes, statutes)
- AI-powered with GPT-4o for high-quality legal translations
- Automatic retry logic with exponential backoff
- Rich console output with confidence distribution statistics

#### `curate_polish_dataset.py`
Curates ~6K Polish court judgments with balanced topic coverage matching the UK corpus.

**Usage:**
```bash
# Curate 6,000 Polish judgments (default)
python scripts/curate_polish_dataset.py

# Test with smaller sample (faster)
python scripts/curate_polish_dataset.py --sample 100 --target 300

# Custom target count
python scripts/curate_polish_dataset.py --target 3000
```

**Environment Variables Required:**
- `HF_TOKEN`: HuggingFace token for dataset access

**Prerequisites:**
- Run `analyze_uk_topics.py` first to generate `data/uk_topics_taxonomy.json`
- Run `generate_cross_queries.py` first to generate `data/cross_jurisdictional_queries.json`

**Outputs:**
- `data/polish_judgments_6k.parquet`: Curated dataset with topic assignments
- `data/polish_dataset_stats.json`: Coverage statistics and source breakdown

**Features:**
- Query-driven retrieval using Polish legal terminology
- Balanced sampling to match UK topic distribution
- Deduplication by case signatures
- Multi-source loading from JuDDGES datasets (enriched and raw)
- Streaming mode for memory efficiency
- Quality filtering (minimum 500 characters)
- Minimum 50 documents per topic
- Rich progress reporting and summary statistics
- Comprehensive coverage gap analysis

**Data Sources (in priority order):**
- `JuDDGES/pl-court-raw-enriched` (primary, has factual_state/legal_state)
- `JuDDGES/pl-nsa-enriched` (administrative courts)
- `JuDDGES/pl-court-raw` (fallback)
- `JuDDGES/pl-nsa` (fallback)

## Dependencies

Core dependencies are in `requirements.txt`:

### Data Ingestion
- `datasets>=2.14.0`: HuggingFace datasets
- `supabase>=2.0.0`: Supabase Python client
- `openai>=1.0.0`: OpenAI API
- `requests>=2.31.0`: HTTP requests
- `tqdm>=4.65.0`: Progress bars

### Topic Analysis (Additional)
- `bertopic>=0.16.0`: Topic modeling
- `sentence-transformers>=2.2.0`: Text embeddings
- `umap-learn>=0.5.0`: Dimensionality reduction
- `hdbscan>=0.8.0`: Density-based clustering

### Common Tools
- `rich>=13.0.0`: Console output
- `loguru>=0.7.0`: Modern logging
- `python-dotenv>=1.0.0`: Environment variables
- `pandas>=2.0.0`: Data processing
- `numpy>=1.24.0`: Numerical computing

### Performance Testing

#### `benchmark_search.py`
Benchmarks search performance at 6K document scale for latency and relevance testing.

**Usage:**
```bash
# Direct execution
python scripts/benchmark_search.py

# Docker execution (recommended)
scripts/run_benchmark.sh

# Custom configuration
scripts/run_benchmark.sh --backend-url http://localhost:8002 \
  --iterations 5 --output data/benchmark_results.json
```

**Environment Variables Required:**
- `BACKEND_URL`: Backend API URL (default: http://localhost:8004)
- `BACKEND_API_KEY`: API authentication key

**Features:**
- Tests hybrid, keyword, and vector search modes
- 16 representative Polish and English legal queries
- Measures P50/P95/P99 latency percentiles
- Performance targets: keyword<150ms, vector<200ms, hybrid<300ms
- Rich console output with pass/fail assessment
- JSON export for detailed analysis and trending
- Docker containerization for reproducible results
- Custom query file support

## Docker Usage

Scripts can be run in Docker containers for reproducibility:

```bash
# Build a custom image with ML dependencies
cat > Dockerfile.scripts <<EOF
FROM python:3.12-slim

WORKDIR /app
COPY scripts/requirements.txt requirements.txt
RUN pip install -r requirements.txt

COPY scripts/ scripts/
COPY .env .env
COPY data/ data/

CMD ["python", "scripts/analyze_uk_topics.py"]
EOF

# Build and run
docker build -f Dockerfile.scripts -t juddges-analysis .
docker run --rm -v $(pwd)/data:/app/data juddges-analysis
```

## Environment Setup

1. Copy environment template:
   ```bash
   cp .env.example .env
   ```

2. Fill in required variables:
   ```env
   HF_TOKEN=hf_...
   OPENAI_API_KEY=sk-...
   SUPABASE_URL=https://...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

3. Install dependencies:
   ```bash
   cd scripts
   pip install -r requirements.txt
   ```

## Troubleshooting

### Common Issues

**ImportError: Missing dependencies**
- Run `pip install -r scripts/requirements.txt`
- For GPU acceleration: `pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118`

**HuggingFace authentication error**
- Set `HF_TOKEN` environment variable
- Login with `huggingface-hub login`

**OpenAI API errors**
- Check `OPENAI_API_KEY` is set correctly
- Verify API quota and billing
- Rate limiting: Script includes automatic retries

**Memory issues**
- Use `--sample N` flag to limit dataset size
- BERTopic works on CPU but is slower
- Consider running on a machine with 8GB+ RAM for full analysis

### Performance Tips

- **GPU acceleration**: Install CUDA-compatible PyTorch for faster embeddings
- **Memory optimization**: Use sampling for initial testing
- **Parallel processing**: BERTopic automatically uses multiple cores
- **Caching**: Sentence transformer models are cached locally after first download

## Output Files

### `uk_topics_taxonomy.json`
```json
{
  "topics": [
    {
      "topic_id": 0,
      "label": "Criminal Sentencing",
      "description": "Cases involving criminal penalties and sentencing decisions",
      "category": "Criminal Law",
      "keywords": ["sentence", "conviction", "penalty", ...],
      "document_count": 342,
      "representative_docs": ["appeal_123", "raw_456", ...],
      "confidence": 0.85
    }
  ],
  "metadata": {
    "total_documents": 6000,
    "total_topics": 25,
    "outlier_documents": 150,
    "model": "sentence-transformers/all-MiniLM-L6-v2",
    "method": "BERTopic + GPT-4o-mini labeling",
    "created_at": "2026-03-18T...",
    "sample_size": null,
    "min_topic_size": 20
  }
}
```

### `uk_topic_assignments.parquet`
Columns:
- `doc_id`: Document identifier
- `source_dataset`: Source HF dataset name
- `topic_id`: Assigned topic (-1 for outliers)
- `confidence`: Assignment confidence score
- `text_length`: Original document character count
- `processed_text_length`: Cleaned text character count

### `cross_jurisdictional_queries.json`
```json
{
  "queries": [
    {
      "topic_id": 0,
      "uk_topic_label": "Criminal Sentencing",
      "uk_description": "Cases involving the determination of criminal penalties...",
      "uk_category": "Criminal Law",
      "uk_keywords": ["sentence", "sentencing", "penalty", ...],
      "queries_pl": [
        "wymiar kary w prawie karnym",
        "dyrektywy wymiaru kary art. 53 KK",
        "indywidualizacja kary",
        "kara pozbawienia wolności"
      ],
      "queries_en": [
        "criminal sentencing Polish law",
        "penalty guidelines Poland"
      ],
      "jurisdictional_notes": "UK sentencing guidelines map to Polish Art. 53...",
      "coverage_confidence": "high",
      "expected_polish_sources": [
        "Kodeks karny art. 53-63",
        "Kodeks karny wykonawczy"
      ]
    }
  ],
  "metadata": {
    "source_taxonomy": "data/uk_topics_taxonomy.json",
    "total_topics": 25,
    "high_confidence": 20,
    "medium_confidence": 4,
    "low_confidence": 1,
    "created_at": "2026-03-18T...",
    "generator_model": "gpt-4o",
    "generator_version": "1.0.0"
  }
}
```

### `polish_judgments_6k.parquet`
Curated Polish judgment dataset with balanced topic coverage.

Columns:
- `id`: Unique document identifier
- `text`: Full judgment text content
- `court`: Court name/identifier
- `date`: Judgment date
- `topic_primary`: Primary topic label (e.g., "Criminal Sentencing")
- `topic_secondary`: Legal category (e.g., "Criminal Law")
- `topic_id`: Numeric topic ID matching UK taxonomy
- `source_dataset`: Source HuggingFace dataset name
- `query_used`: Polish queries used for retrieval
- `relevance_score`: Document relevance score (0.0-1.0)
- `signature`: Case signature/sygnatura for deduplication

### `polish_dataset_stats.json`
```json
{
  "summary": {
    "total_documents": 5847,
    "target_documents": 6000,
    "coverage_topics": 5,
    "total_topics": 5,
    "created_at": "2026-03-18T...",
    "min_per_topic": 50
  },
  "source_breakdown": {
    "JuDDGES/pl-court-raw-enriched": 3245,
    "JuDDGES/pl-nsa-enriched": 2602
  },
  "topic_statistics": [
    {
      "topic_id": 0,
      "topic_label": "Criminal Sentencing",
      "category": "Criminal Law",
      "uk_count": 156,
      "target_count": 153,
      "actual_count": 153,
      "candidates_found": 892,
      "coverage_ratio": 0.98,
      "selection_rate": 0.17
    }
  ],
  "gaps": []
}
```

## Contributing

When adding new scripts:
1. Follow the existing pattern (Rich console output, Loguru logging)
2. Add dependencies to `requirements.txt`
3. Include comprehensive error handling
4. Add documentation to this README
5. Test with sample data first

## Related Documentation

- [Data Ingestion Guide](../docs/how-to/data-ingestion.md)
- [Topic Analysis Documentation](../docs/reference/topic-analysis.md)
- [API Documentation](../docs/reference/api.md)