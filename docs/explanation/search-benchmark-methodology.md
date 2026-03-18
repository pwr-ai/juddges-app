# Search Benchmark Methodology

This document explains the approach and rationale behind the Juddges search performance benchmark.

## Background

The Juddges App serves as a legal research platform handling 6,000+ court judgments from Polish and UK jurisdictions. Search performance directly impacts user experience and system scalability. The benchmark provides:

1. **Performance validation** against defined latency targets
2. **Regression detection** when changes affect search speed
3. **Capacity planning** data for scaling decisions
4. **Quality assurance** for search relevance and reliability

## Search Architecture Overview

### Search Variants Tested

The benchmark tests three core search configurations representing different user scenarios:

#### 1. Hybrid Search (thinking mode, α=0.5)
- **Use case**: Best relevance for complex legal queries
- **Implementation**: AI query enhancement + vector/keyword fusion
- **Target**: < 300ms P95 (allows for LLM query processing)
- **Alpha parameter**: 0.5 balances semantic and keyword matching

#### 2. Keyword Search (rabbit mode, α=0.0)
- **Use case**: Fast exact-term matching, known legal phrases
- **Implementation**: Pure BM25 full-text search on PostgreSQL
- **Target**: < 150ms P95 (database-only, fastest option)
- **Alpha parameter**: 0.0 disables vector search completely

#### 3. Vector Search (rabbit mode, α=1.0)
- **Use case**: Semantic similarity, conceptual legal research
- **Implementation**: Pure embedding similarity with pgvector
- **Target**: < 200ms P95 (vector operations + database retrieval)
- **Alpha parameter**: 1.0 disables keyword search completely

### Search Modes

**Rabbit Mode**: Fast path with minimal processing
- Direct query-to-search pipeline
- No AI query enhancement
- Optimized for latency

**Thinking Mode**: Enhanced quality with AI processing
- LLM-powered query analysis and expansion
- Intelligent term extraction and rewriting
- Optimized for relevance over pure speed

## Query Selection Methodology

### Representative Query Set

The benchmark uses 16 carefully selected queries representing real legal research patterns:

#### Polish Legal Queries (8 queries)
- **Financial law**: "kredyty frankowe" (Swiss franc loans)
- **Criminal law**: "wymiar kary" (sentencing)
- **Labor law**: "prawo pracy zwolnienie" (employment termination)
- **Civil law**: "odszkodowanie za wypadek" (accident compensation)
- **Administrative**: "zamówienia publiczne" (public procurement)
- **Tax law**: "podatek dochodowy odliczenia" (income tax deductions)
- **Property**: "umowa dzierżawy rozwiązanie" (lease termination)
- **Criminal**: "kara pozbawienia wolności" (imprisonment)

#### English Legal Queries (8 queries)
- **IP law**: "intellectual property infringement"
- **Administrative**: "judicial review administrative decision"
- **Employment**: "employment discrimination"
- **Contract**: "contract breach damages"
- **Criminal**: "criminal sentencing guidelines"
- **Commercial**: "corporate liability negligence"
- **Constitutional**: "human rights violation"
- **Family**: "family law custody"

### Query Characteristics

**Language diversity**: Balanced Polish/English split reflects user base
**Legal domain coverage**: Spans major areas of law (criminal, civil, commercial, etc.)
**Query complexity**: Mix of simple terms and complex legal phrases
**Real-world relevance**: Based on actual user search patterns and legal concepts

## Performance Measurement

### Metrics Collected

#### Latency Percentiles
- **P50 (median)**: Typical user experience
- **P95**: Service level target (95% of users see this performance or better)
- **P99**: Outlier detection (helps identify system stress)

#### Additional Metrics
- **Min/max latency**: Range analysis
- **Mean latency**: Overall system performance
- **Result counts**: Search effectiveness (documents returned)
- **Error rates**: System reliability

### Statistical Approach

#### Multiple Iterations
- Default: 3 iterations per query/variant combination
- Production: 5+ iterations recommended for stable measurements
- Eliminates single-request outliers and caching effects

#### Warmup Phase
- 2 warmup queries before measurement
- Primes database query cache and connection pools
- Ensures steady-state performance measurement

#### Percentile-Based Targets
- P95 latency used for pass/fail criteria
- More realistic than mean (not skewed by outliers)
- Industry standard for web service SLAs

## Target Justification

### Performance Targets Rationale

#### Keyword Search: < 150ms P95
- **Basis**: Database-only operation using PostgreSQL GIN indexes
- **Expectation**: Users expect instant text search response
- **Technical**: Full-text search with minimal computational overhead

#### Vector Search: < 200ms P95
- **Basis**: Vector similarity computation + database retrieval
- **Expectation**: Slight delay acceptable for semantic understanding
- **Technical**: pgvector HNSW index + embedding lookup overhead

#### Hybrid Search: < 300ms P95
- **Basis**: AI query enhancement + dual search + result fusion
- **Expectation**: Enhanced quality justifies moderate latency increase
- **Technical**: LLM API call + parallel search + RRF ranking

### Benchmark Standards

Targets based on:
- **User experience research**: 100ms feels instant, 300ms feels responsive
- **Legal domain context**: Research queries tolerate higher latency than simple lookups
- **Technical capabilities**: Realistic given current architecture and infrastructure
- **Industry comparison**: Competitive with legal research platforms

## Benchmark Limitations

### What the Benchmark Measures
✅ **Search API latency**: End-to-end request processing time
✅ **System consistency**: Performance variation across queries
✅ **Configuration impact**: Effect of different search modes
✅ **Scale validation**: Performance at 6K document corpus size

### What the Benchmark Doesn't Measure
❌ **Search relevance**: Quality of returned results (separate evaluation needed)
❌ **Concurrent load**: Single-threaded benchmark (use load testing for concurrency)
❌ **Memory usage**: Resource consumption not measured
❌ **Database performance**: Underlying database metrics not captured

### Environmental Factors

**Network latency**: Assumes local/low-latency backend connection
**System load**: Best run on idle system for consistent results
**Cache state**: Warmup attempts to normalize but results may vary
**Data distribution**: Performance may differ with different document sets

## Benchmark Evolution

### Future Enhancements

**Relevance integration**: Combine performance with result quality metrics
**Load testing**: Multi-user concurrent scenario benchmarks
**Geographic distribution**: Test latency across different regions
**Query complexity analysis**: Correlate performance with query characteristics
**Resource monitoring**: CPU, memory, I/O utilization during benchmarks

### Continuous Improvement

**Baseline establishment**: Regular benchmarks to establish performance trends
**Regression detection**: Automated performance testing in CI/CD pipeline
**Capacity planning**: Use benchmark data to guide infrastructure decisions
**Algorithm optimization**: Identify optimization opportunities from benchmark results

This methodology ensures the benchmark provides actionable insights for maintaining and improving Juddges search performance as the system scales.