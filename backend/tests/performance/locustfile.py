"""Locust load testing configuration for Juddges API.

Run with:
    locust -f locustfile.py --host=http://localhost:8004
    
Or headless mode:
    locust -f locustfile.py --host=http://localhost:8004 --users 100 --spawn-rate 10 --run-time 5m --headless
"""

import random
from locust import HttpUser, task, between, events


class JuddgesUser(HttpUser):
    """Simulated user for load testing."""

    wait_time = between(1, 3)  # Wait 1-3s between tasks

    def on_start(self):
        """Called when user starts."""
        self.headers = {"X-API-Key": "test-api-key"}
        self.queries = [
            "contract law",
            "tort liability",
            "criminal procedure",
            "property rights",
            "employment discrimination",
            "negligence damages",
            "statutory interpretation",
            "judicial review",
        ]

    @task(5)  # Weight: 5 (most common operation)
    def search_documents(self):
        """Search for documents - most common user action."""
        query = random.choice(self.queries)
        limit = random.choice([5, 10, 20])

        self.client.post(
            "/api/documents/search",
            json={"query": query, "limit": limit},
            headers=self.headers,
            name="/api/documents/search",
        )

    @task(3)  # Weight: 3
    def search_with_filters(self):
        """Search with jurisdiction filters."""
        query = random.choice(self.queries)
        jurisdiction = random.choice(["PL", "UK"])

        self.client.post(
            "/api/documents/search",
            json={"query": query, "limit": 10, "jurisdiction": jurisdiction},
            headers=self.headers,
            name="/api/documents/search [filtered]",
        )

    @task(2)  # Weight: 2
    def get_documents_list(self):
        """Get paginated list of documents."""
        limit = random.choice([10, 20, 50])
        offset = random.randint(0, 100)

        self.client.get(
            f"/api/documents?limit={limit}&offset={offset}",
            headers=self.headers,
            name="/api/documents [list]",
        )

    @task(1)  # Weight: 1
    def chat_query(self):
        """Ask AI assistant a question."""
        questions = [
            "Explain contract breach remedies",
            "What is negligence in tort law?",
            "Define criminal procedure rights",
            "Summarize property law principles",
            "What are employment law protections?",
        ]
        question = random.choice(questions)

        self.client.post(
            "/api/chat",
            json={"question": question, "conversation_id": f"test-{self.get_user_id()}"},
            headers=self.headers,
            name="/api/chat",
        )

    @task(1)
    def health_check(self):
        """Perform health check."""
        self.client.get("/health/healthz", name="/health/healthz")

    def get_user_id(self):
        """Get unique user identifier."""
        return getattr(self, "_user_id", hash(self))


class PowerUser(HttpUser):
    """Power user performing more intensive operations."""

    wait_time = between(2, 5)

    def on_start(self):
        """Initialize power user."""
        self.headers = {"X-API-Key": "test-api-key"}

    @task(3)
    def large_search(self):
        """Perform search with large result sets."""
        queries = ["law", "court", "decision", "judgment"]
        query = random.choice(queries)

        self.client.post(
            "/api/documents/search",
            json={"query": query, "limit": 50},
            headers=self.headers,
            name="/api/documents/search [large]",
        )

    @task(2)
    def complex_search(self):
        """Perform complex multi-filter search."""
        self.client.post(
            "/api/documents/search",
            json={
                "query": "contract dispute resolution",
                "limit": 20,
                "jurisdiction": random.choice(["PL", "UK"]),
            },
            headers=self.headers,
            name="/api/documents/search [complex]",
        )

    @task(1)
    def analytics_query(self):
        """Query analytics data."""
        self.client.get("/api/analytics/summary", headers=self.headers, name="/api/analytics")


class AdminUser(HttpUser):
    """Admin user performing management tasks."""

    wait_time = between(5, 10)

    def on_start(self):
        """Initialize admin user."""
        self.headers = {"Authorization": "Bearer admin-token", "X-API-Key": "test-api-key"}

    @task(2)
    def view_collections(self):
        """View document collections."""
        self.client.get("/api/collections", headers=self.headers, name="/api/collections [list]")

    @task(1)
    def create_collection(self):
        """Create a new collection."""
        collection_name = f"Test Collection {random.randint(1, 10000)}"

        self.client.post(
            "/api/collections",
            json={"name": collection_name, "description": "Load test collection"},
            headers=self.headers,
            name="/api/collections [create]",
        )

    @task(1)
    def view_schemas(self):
        """View extraction schemas."""
        self.client.get("/api/schemas", headers=self.headers, name="/api/schemas [list]")


# Event listeners for reporting
@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Called when load test starts."""
    print("\n" + "=" * 60)
    print("Starting Juddges API Load Test")
    print("=" * 60)
    print(f"Host: {environment.host}")
    print(f"Users: {environment.runner.target_user_count if hasattr(environment.runner, 'target_user_count') else 'N/A'}")
    print("=" * 60 + "\n")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Called when load test stops."""
    print("\n" + "=" * 60)
    print("Load Test Complete")
    print("=" * 60)

    if environment.stats.total.num_requests > 0:
        print(f"Total Requests: {environment.stats.total.num_requests}")
        print(f"Total Failures: {environment.stats.total.num_failures}")
        print(
            f"Failure Rate: {environment.stats.total.num_failures / environment.stats.total.num_requests * 100:.2f}%"
        )
        print(f"Average Response Time: {environment.stats.total.avg_response_time:.2f}ms")
        print(f"Median Response Time: {environment.stats.total.median_response_time:.2f}ms")
        print(f"95th Percentile: {environment.stats.total.get_response_time_percentile(0.95):.2f}ms")
        print(f"99th Percentile: {environment.stats.total.get_response_time_percentile(0.99):.2f}ms")
        print(f"Requests/sec: {environment.stats.total.total_rps:.2f}")
    print("=" * 60 + "\n")
