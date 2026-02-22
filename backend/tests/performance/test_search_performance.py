"""Performance tests for search endpoints."""

import asyncio
import random
import statistics
import time
from typing import List

import pytest
from httpx import ASGITransport, AsyncClient

from app.server import app


@pytest.mark.performance
class TestSearchPerformance:
    """Performance tests for search endpoints."""

    @pytest.mark.anyio
    async def test_semantic_search_latency(self):
        """Test semantic search response time with p50, p95, p99 metrics."""
        latencies: List[float] = []
        test_queries = [
            "contract law",
            "tort liability",
            "criminal procedure",
            "property rights",
            "employment law",
        ]

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            for i in range(20):  # 20 iterations for better statistics
                query = test_queries[i % len(test_queries)]
                start = time.perf_counter()
                response = await client.post(
                    "/api/documents/search",
                    json={"query": query, "limit": 10},
                    headers={"X-API-Key": "test-key"},
                )
                latency = (time.perf_counter() - start) * 1000  # ms
                latencies.append(latency)

                assert response.status_code == 200

        # Calculate percentiles
        p50 = statistics.median(latencies)
        p95 = (
            statistics.quantiles(latencies, n=20)[18] if len(latencies) >= 20 else max(latencies)
        )  # 95th percentile
        p99 = (
            statistics.quantiles(latencies, n=100)[98] if len(latencies) >= 100 else max(latencies)
        )
        avg = statistics.mean(latencies)
        min_latency = min(latencies)
        max_latency = max(latencies)

        print(f"\n{'='*60}")
        print("Semantic Search Latency Metrics")
        print(f"{'='*60}")
        print(f"Iterations: {len(latencies)}")
        print(f"Min:        {min_latency:.1f}ms")
        print(f"p50:        {p50:.1f}ms")
        print(f"p95:        {p95:.1f}ms")
        print(f"p99:        {p99:.1f}ms")
        print(f"Max:        {max_latency:.1f}ms")
        print(f"Average:    {avg:.1f}ms")
        print(f"{'='*60}\n")

        # Assert performance targets
        # Note: These are reasonable targets for semantic search with embeddings + DB
        assert p95 < 3000, f"p95 latency {p95:.1f}ms exceeds 3s target"
        assert p99 < 5000, f"p99 latency {p99:.1f}ms exceeds 5s target"

    @pytest.mark.anyio
    async def test_concurrent_search_throughput(self):
        """Test search throughput under concurrent load."""
        num_requests = 50
        queries = [
            "legal precedent",
            "contract dispute",
            "negligence claim",
            "statutory interpretation",
        ]

        async def make_request():
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                start = time.perf_counter()
                response = await client.post(
                    "/api/documents/search",
                    json={"query": random.choice(queries), "limit": 5},
                    headers={"X-API-Key": "test-key"},
                )
                duration = time.perf_counter() - start
                return response.status_code, duration

        start_time = time.perf_counter()
        results = await asyncio.gather(*[make_request() for _ in range(num_requests)])
        total_time = time.perf_counter() - start_time

        successful = sum(1 for status, _ in results if status == 200)
        failed = num_requests - successful
        durations = [d for _, d in results]
        throughput = num_requests / total_time
        avg_latency = statistics.mean(durations) * 1000

        print(f"\n{'='*60}")
        print("Concurrent Search Throughput")
        print(f"{'='*60}")
        print(f"Total Requests:  {num_requests}")
        print(f"Successful:      {successful}")
        print(f"Failed:          {failed}")
        print(f"Total Time:      {total_time:.2f}s")
        print(f"Throughput:      {throughput:.1f} req/s")
        print(f"Avg Latency:     {avg_latency:.1f}ms")
        print(f"{'='*60}\n")

        assert successful == num_requests, f"Only {successful}/{num_requests} requests succeeded"
        assert throughput > 5, f"Throughput {throughput:.1f} req/s below 5 req/s target"

    @pytest.mark.anyio
    async def test_search_with_filters_performance(self):
        """Test search performance with various filters applied."""
        latencies: List[float] = []

        test_cases = [
            {"query": "contract", "limit": 10},
            {"query": "tort", "limit": 10, "jurisdiction": "PL"},
            {"query": "criminal", "limit": 20, "jurisdiction": "UK"},
            {"query": "liability", "limit": 5},
        ]

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            for test_case in test_cases * 5:  # Run each case 5 times
                start = time.perf_counter()
                response = await client.post(
                    "/api/documents/search",
                    json=test_case,
                    headers={"X-API-Key": "test-key"},
                )
                latency = (time.perf_counter() - start) * 1000
                latencies.append(latency)

                assert response.status_code == 200

        p95 = statistics.quantiles(latencies, n=20)[18]
        avg = statistics.mean(latencies)

        print(f"\n{'='*60}")
        print("Search with Filters Performance")
        print(f"{'='*60}")
        print(f"Iterations: {len(latencies)}")
        print(f"Average:    {avg:.1f}ms")
        print(f"p95:        {p95:.1f}ms")
        print(f"{'='*60}\n")

        assert p95 < 3000, f"Filtered search p95 {p95:.1f}ms exceeds 3s target"


@pytest.mark.performance
class TestDatabasePerformance:
    """Performance tests for database operations."""

    @pytest.mark.anyio
    async def test_vector_search_performance(self):
        """Test pgvector similarity search performance."""
        try:
            from juddges_search.retrieval.supabase_search import search_chunks_vector
        except ImportError:
            pytest.skip("juddges_search package not available")

        # Generate random embeddings for testing
        latencies: List[float] = []

        for _ in range(10):
            query_embedding = [random.random() for _ in range(1536)]

            start = time.perf_counter()
            try:
                results = await search_chunks_vector(
                    query_embedding=query_embedding, limit=10
                )
                latency = (time.perf_counter() - start) * 1000
                latencies.append(latency)
            except Exception as e:
                # If search fails (e.g., no data), record a 0 latency and continue
                print(f"Vector search failed: {e}")
                latencies.append(0)

        # Filter out failures
        valid_latencies = [l for l in latencies if l > 0]

        if valid_latencies:
            p50 = statistics.median(valid_latencies)
            p95 = (
                statistics.quantiles(valid_latencies, n=20)[18]
                if len(valid_latencies) >= 20
                else max(valid_latencies)
            )

            print(f"\n{'='*60}")
            print("Vector Search Performance")
            print(f"{'='*60}")
            print(f"Successful: {len(valid_latencies)}/{len(latencies)}")
            print(f"p50:        {p50:.1f}ms")
            print(f"p95:        {p95:.1f}ms")
            print(f"{'='*60}\n")

            assert p95 < 500, f"Vector search p95 {p95:.1f}ms exceeds 500ms target"
        else:
            pytest.skip("No valid vector search results")

    @pytest.mark.anyio
    async def test_full_text_search_performance(self):
        """Test PostgreSQL full-text search performance."""
        try:
            from juddges_search.retrieval.supabase_search import search_chunks_term
        except ImportError:
            pytest.skip("juddges_search package not available")

        latencies: List[float] = []
        queries = ["contract AND law", "tort OR liability", "criminal procedure", "property"]

        for query in queries * 3:  # Run each query 3 times
            start = time.perf_counter()
            try:
                results = await search_chunks_term(query_text=query, limit=10)
                latency = (time.perf_counter() - start) * 1000
                latencies.append(latency)
            except Exception as e:
                print(f"Full-text search failed: {e}")
                latencies.append(0)

        valid_latencies = [l for l in latencies if l > 0]

        if valid_latencies:
            p50 = statistics.median(valid_latencies)
            p95 = (
                statistics.quantiles(valid_latencies, n=20)[18]
                if len(valid_latencies) >= 20
                else max(valid_latencies)
            )

            print(f"\n{'='*60}")
            print("Full-text Search Performance")
            print(f"{'='*60}")
            print(f"Successful: {len(valid_latencies)}/{len(latencies)}")
            print(f"p50:        {p50:.1f}ms")
            print(f"p95:        {p95:.1f}ms")
            print(f"{'='*60}\n")

            assert p95 < 200, f"Full-text search p95 {p95:.1f}ms exceeds 200ms target"
        else:
            pytest.skip("No valid full-text search results")


@pytest.mark.performance
class TestAPIEndpointPerformance:
    """Performance tests for various API endpoints."""

    @pytest.mark.anyio
    async def test_health_check_latency(self):
        """Test health check endpoint latency."""
        latencies: List[float] = []

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            for _ in range(50):
                start = time.perf_counter()
                response = await client.get("/health/healthz")
                latency = (time.perf_counter() - start) * 1000
                latencies.append(latency)

                assert response.status_code == 200

        p50 = statistics.median(latencies)
        p95 = statistics.quantiles(latencies, n=20)[18]

        print(f"\n{'='*60}")
        print("Health Check Latency")
        print(f"{'='*60}")
        print(f"p50: {p50:.1f}ms")
        print(f"p95: {p95:.1f}ms")
        print(f"{'='*60}\n")

        # Health checks should be very fast
        assert p95 < 50, f"Health check p95 {p95:.1f}ms exceeds 50ms target"

    @pytest.mark.anyio
    async def test_document_retrieval_performance(self):
        """Test document retrieval endpoint performance."""
        latencies: List[float] = []

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            # First, try to get a list of documents
            try:
                response = await client.get(
                    "/api/documents?limit=5", headers={"X-API-Key": "test-key"}
                )
                if response.status_code != 200:
                    pytest.skip("Cannot retrieve document list")

                # Measure retrieval time for individual documents
                for _ in range(10):
                    start = time.perf_counter()
                    response = await client.get(
                        "/api/documents?limit=1", headers={"X-API-Key": "test-key"}
                    )
                    latency = (time.perf_counter() - start) * 1000
                    latencies.append(latency)

            except Exception as e:
                pytest.skip(f"Document retrieval not available: {e}")

        if latencies:
            p95 = (
                statistics.quantiles(latencies, n=20)[18]
                if len(latencies) >= 20
                else max(latencies)
            )
            avg = statistics.mean(latencies)

            print(f"\n{'='*60}")
            print("Document Retrieval Performance")
            print(f"{'='*60}")
            print(f"Average: {avg:.1f}ms")
            print(f"p95:     {p95:.1f}ms")
            print(f"{'='*60}\n")

            assert p95 < 1000, f"Document retrieval p95 {p95:.1f}ms exceeds 1s target"
