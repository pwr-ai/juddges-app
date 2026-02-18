# Performance Testing Quick Reference

## Quick Start

```bash
# Run all tests (automated script)
./scripts/run_performance_tests.sh

# Quick test (faster)
./scripts/run_performance_tests.sh --quick

# With load testing
./scripts/run_performance_tests.sh --load

# Everything
./scripts/run_performance_tests.sh --all
```

## Individual Tests

### Backend Performance Tests

```bash
cd backend

# All performance tests
poetry run pytest tests/performance/ --performance -v

# Specific test
poetry run pytest tests/performance/test_search_performance.py::TestSearchPerformance::test_semantic_search_latency --performance -v
```

### Load Testing

```bash
cd backend/tests/performance

# Install dependencies (first time only)
pip install -r requirements.txt

# Interactive mode (web UI at http://localhost:8089)
locust -f locustfile.py --host=http://localhost:8004

# Headless mode
locust -f locustfile.py --host=http://localhost:8004 --users 50 --spawn-rate 5 --run-time 5m --headless --html=report.html
```

### Performance Monitor

```bash
# Quick benchmark
python scripts/performance_monitor.py

# Save results
python scripts/performance_monitor.py --output results.json
```

### Frontend Analysis

```bash
cd frontend
node scripts/analyze-bundle.js
```

## Performance Targets

| Metric | Target | Acceptable |
|--------|--------|------------|
| Health Check p95 | 50ms | 100ms |
| Search p95 | 2s | 3s |
| Vector Search p95 | 500ms | 1s |
| Search Throughput | 10 req/s | 5 req/s |
| Success Rate | >99% | >95% |

## Common Commands

```bash
# Backend server (required for tests)
cd backend
poetry run uvicorn app.server:app --port 8004

# Run quick performance check
./scripts/run_performance_tests.sh --quick --monitor

# Run full suite
./scripts/run_performance_tests.sh --all

# Load test - light
locust -f backend/tests/performance/locustfile.py --host=http://localhost:8004 --users 10 --spawn-rate 2 --run-time 2m --headless

# Load test - heavy
locust -f backend/tests/performance/locustfile.py --host=http://localhost:8004 --users 200 --spawn-rate 10 --run-time 10m --headless
```

## Interpreting Results

### Latency Metrics
- **p50**: Median (50% faster)
- **p95**: 95th percentile ⭐ KEY METRIC
- **p99**: 99th percentile (worst case)

### Success Metrics
- **Success Rate**: % of requests that succeed
- **Throughput**: Requests per second
- **Error Rate**: % of failed requests

## Troubleshooting

```bash
# Tests skipped?
# → Add --performance flag
poetry run pytest tests/performance/ --performance

# Backend not running?
# → Start backend server
cd backend && poetry run uvicorn app.server:app --port 8004

# Locust not installed?
# → Install dependencies
cd backend/tests/performance && pip install -r requirements.txt

# Import errors?
# → Check PYTHONPATH and install packages
cd backend && poetry install
```

## Files

- Tests: `backend/tests/performance/`
- Scripts: `scripts/performance_monitor.py`
- Docs: `docs/PERFORMANCE_TESTING.md`
- Summary: `PERFORMANCE_SUMMARY.md`
