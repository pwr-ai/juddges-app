# How to Benchmark Search Performance

This guide shows how to measure and analyze search performance in the Juddges App using the automated benchmark tool.

## Prerequisites

- Backend API running (development port 8004 or production port 8002)
- Valid API key configured in environment or passed as argument
- Docker (recommended) or Python 3.12+ with required dependencies

## Quick Start

### Using Docker (Recommended)

```bash
# Run with default queries and settings
scripts/run_benchmark.sh

# Run with custom backend URL
scripts/run_benchmark.sh --backend-url http://localhost:8002

# Run with more iterations for precise results
scripts/run_benchmark.sh --iterations 5 --output data/benchmark_results.json
```

### Using Python Directly

```bash
# Install dependencies (only needed once)
pip install -r scripts/requirements.txt

# Run benchmark with default settings
python scripts/benchmark_search.py

# Run with custom configuration
python scripts/benchmark_search.py --backend-url http://localhost:8002 \
  --iterations 5 --output data/benchmark_results.json
```

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `--backend-url` | `http://localhost:8004` | Backend API base URL |
| `--api-key` | `$BACKEND_API_KEY` | API authentication key |
| `--iterations` | `3` | Number of test runs per query |
| `--warmup` | `2` | Warmup queries to prime cache |
| `--queries-file` | Built-in queries | Custom JSON query file |
| `--output` | Console only | Save detailed JSON results |

## Custom Queries

Create a JSON file with custom test queries:

### Detailed Format
```json
[
  {
    "query": "umowa o pracę rozwiązanie",
    "category": "labor",
    "language": "pl"
  },
  {
    "query": "contract termination notice",
    "category": "labor",
    "language": "en"
  }
]
```

### Simple Format
```json
["contract law", "prawo umów", "podatek dochodowy"]
```

Then run:
```bash
python scripts/benchmark_search.py --queries-file custom_queries.json
```

## Understanding Results

### Performance Metrics

- **P50**: Median response time (50% of requests faster)
- **P95**: 95th percentile (95% of requests faster)
- **P99**: 99th percentile (99% of requests faster)
- **Results**: Average number of documents returned

### Search Types Tested

1. **Hybrid** (thinking mode, α=0.5): AI-enhanced hybrid search
2. **Keyword** (rabbit mode, α=0.0): Pure BM25/text search
3. **Vector** (rabbit mode, α=1.0): Pure semantic/embedding search

### Performance Targets

| Search Type | P95 Target | Purpose |
|-------------|------------|---------|
| Keyword | < 150ms | Fast text matching |
| Vector | < 200ms | Semantic similarity |
| Hybrid | < 300ms | Best relevance with AI enhancement |

### Sample Output

```
                Search Performance Benchmark Results
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━┳━━━━━━━┳━━━━━━━┳━━━━━━━┳━━━━━━━━━┳━━━━━━━━┓
┃ Query                      ┃ Type     ┃   P50 ┃   P95 ┃   P99 ┃ Results ┃ Status ┃
┡━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━╇━━━━━━━╇━━━━━━━╇━━━━━━━╇━━━━━━━━━╇━━━━━━━━┩
│ kredyty frankowe           │ hybrid   │ 120ms │ 145ms │ 160ms │    10.0 │ ✓ PASS │
│ kredyty frankowe           │ keyword  │  85ms │  95ms │ 110ms │    10.0 │ ✓ PASS │
│ kredyty frankowe           │ vector   │ 105ms │ 125ms │ 140ms │    10.0 │ ✓ PASS │
└────────────────────────────┴──────────┴───────┴───────┴───────┴─────────┴────────┘

Performance Summary
╭─ HYBRID (300ms target): P95=145ms, 8/8 queries passed - PASS
├─ KEYWORD (150ms target): P95=95ms, 8/8 queries passed - PASS
├─ VECTOR (200ms target): P95=125ms, 8/8 queries passed - PASS
│
└─ ✓ BENCHMARK PASSED
```

## Troubleshooting

### Backend Connection Issues

```bash
# Check if backend is running
curl -f http://localhost:8004/health

# Check Docker containers
docker compose ps

# Start development environment
docker compose -f docker-compose.dev.yml up backend
```

### Authentication Errors

```bash
# Check API key is set
echo $BACKEND_API_KEY

# Test API key manually
curl -H "X-API-Key: $BACKEND_API_KEY" http://localhost:8004/health/status
```

### Performance Issues

1. **Slow queries**: Check database indexes and vector search configuration
2. **High latency**: Verify backend resources and embedding provider response times
3. **Inconsistent results**: Increase `--iterations` for more stable measurements

### Custom Query Validation

```bash
# Validate JSON format
python -m json.tool custom_queries.json

# Test single query
python scripts/benchmark_search.py \
  --queries-file custom_queries.json \
  --iterations 1 \
  --backend-url http://localhost:8004
```

## Best Practices

1. **Baseline establishment**: Run benchmarks on a known-good system first
2. **Environment consistency**: Use the same backend configuration for comparable results
3. **Load isolation**: Run benchmarks when backend is not under other load
4. **Multiple iterations**: Use `--iterations 5` or higher for production validation
5. **Result archival**: Save results with `--output` for trend analysis
6. **Query diversity**: Include both Polish and English queries representing real usage

## Production Benchmarking

For production environment testing:

```bash
# Connect to production backend
scripts/run_benchmark.sh \
  --backend-url https://your-production-api.com \
  --api-key $PROD_API_KEY \
  --iterations 5 \
  --output data/prod_benchmark_$(date +%Y%m%d_%H%M%S).json
```

Monitor results over time to detect performance regressions or improvements.