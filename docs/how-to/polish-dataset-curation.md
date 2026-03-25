# Polish Judgment Dataset Curation

This script (`curate_polish_dataset.py`) implements the dataset curation pipeline for GitHub Issue #12 - curating ~6K Polish court judgments with topic coverage matching the UK corpus.

## Prerequisites

Before running this script, ensure you have completed Issues #10 and #11:

1. **Issue #10**: UK topic taxonomy must exist at `data/uk_topics_taxonomy.json`
2. **Issue #11**: Cross-jurisdictional queries must exist at `data/cross_jurisdictional_queries.json`

## Setup

1. Install dependencies:
```bash
pip install -r scripts/requirements.txt
```

2. Set your HuggingFace token:
```bash
export HF_TOKEN=your_huggingface_token_here
```

## Usage

### Basic Usage
```bash
# Curate 6,000 Polish judgments (default)
python scripts/curate_polish_dataset.py
```

### Testing
```bash
# Test with smaller sample (faster, good for development)
python scripts/curate_polish_dataset.py --sample 100 --target 300
```

### Custom Target
```bash
# Curate different number of documents
python scripts/curate_polish_dataset.py --target 3000
```

## Outputs

The script creates two main files in the `data/` directory:

### 1. `polish_judgments_6k.parquet`
Curated dataset with columns:
- `id`: Unique document identifier
- `text`: Full judgment text
- `court`: Court name
- `date`: Judgment date
- `topic_primary`: Primary topic label (e.g., "Criminal Sentencing")
- `topic_secondary`: Legal category (e.g., "Criminal Law")
- `topic_id`: Numeric topic ID matching UK taxonomy
- `source_dataset`: Source HuggingFace dataset
- `query_used`: Polish queries used for retrieval
- `relevance_score`: Document relevance score (0.0-1.0)
- `signature`: Case signature/sygnatura for deduplication

### 2. `polish_dataset_stats.json`
Curation statistics including:
- Topic distribution (UK vs Polish counts)
- Source dataset breakdown
- Coverage gaps and shortfalls
- Per-topic statistics

## Data Sources

The script attempts to load from multiple HuggingFace datasets in priority order:

1. **Primary**: `JuDDGES/pl-court-raw-enriched` (has `factual_state` and `legal_state` fields)
2. **Secondary**: `JuDDGES/pl-nsa-enriched` (administrative courts)
3. **Fallback**: `JuDDGES/pl-court-raw`, `JuDDGES/pl-nsa`

## Algorithm

1. **Query-driven retrieval**: Use Polish legal queries from Issue #11 to score documents for topic relevance
2. **Balanced sampling**: Allocate documents proportionally to match UK topic distribution
3. **Deduplication**: Remove duplicates based on case signatures
4. **Quality filtering**: Filter out very short judgments (< 500 characters)

## Performance Notes

- Uses streaming mode to handle large datasets without memory issues
- Processes documents in batches for efficient memory usage
- Text preprocessing includes normalization for better Polish text matching

## Troubleshooting

### Missing Prerequisites
```
Error: UK topic taxonomy not found at data/uk_topics_taxonomy.json
```
Run the Issue #10 script first to generate the UK topic taxonomy.

### Missing HF Token
```
Error: HF_TOKEN environment variable required
```
Set your HuggingFace token in the environment.

### Low Coverage for Specific Topics
Check `polish_dataset_stats.json` for gaps. Some specialized topics may have limited Polish coverage in the available datasets.

## Example Output

```
🏛️ Polish Judgment Curation
┌─ Polish Dataset Curation Summary ─┐
│                                   │
│ 📊 Dataset Overview               │
│    • Total curated documents: 5,847│
│    • Target document count: 6,000  │
│    • Topics with coverage: 5/5     │
│    • Minimum per topic: 50         │
│                                   │
│ 📈 Source Distribution            │
│    • pl-court-raw-enriched: 3,245 │
│    • pl-nsa-enriched: 2,602       │
│                                   │
│ 🎯 Coverage Quality               │
│    • Avg coverage ratio: 0.97      │
│    • Topics with gaps: 1           │
└───────────────────────────────────┘
```

This indicates successful curation with good coverage across all topics.