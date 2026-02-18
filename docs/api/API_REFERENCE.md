# API Reference

Complete API documentation for the Juddges Legal Research Platform.

## Table of Contents

- [Authentication](#authentication)
- [Base URL](#base-url)
- [Common Patterns](#common-patterns)
- [Endpoints](#endpoints)
  - [Documents](#documents)
  - [Search](#search)
  - [Chat & Q&A](#chat--qa)
  - [Collections](#collections)
  - [Analytics](#analytics)
  - [Schemas](#schemas)
  - [Feedback](#feedback)
  - [Health](#health)
- [Error Responses](#error-responses)
- [Rate Limiting](#rate-limiting)
- [Pagination](#pagination)

## Authentication

All endpoints require authentication using one of the following methods:

### 1. API Key Authentication

For server-to-server communication:

```http
X-API-Key: your-api-key-here
```

### 2. JWT Bearer Token

For user authentication (via Supabase Auth):

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Guest Sessions

For unauthenticated access (limited features):

```http
X-Guest-Session-Id: guest-session-uuid
```

## Base URL

**Development:**
```
http://localhost:8004/api/v1
```

**Production:**
```
https://api.juddges.app/api/v1
```

**Interactive Documentation:**
- Swagger UI: `http://localhost:8004/docs`
- ReDoc: `http://localhost:8004/redoc`

## Common Patterns

### Request Headers

```http
Content-Type: application/json
Accept: application/json
X-API-Key: your-api-key
```

### Response Format

All responses follow this structure:

```json
{
  "data": { ... },          // Response data
  "message": "Success",     // Optional message
  "status": "success"       // Status: success | error
}
```

### Timestamps

All timestamps use ISO 8601 format:

```json
{
  "created_at": "2024-02-13T10:30:00Z",
  "updated_at": "2024-02-13T10:30:00Z"
}
```

### UUIDs

All IDs use UUID v4 format:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Endpoints

### Documents

#### List Documents

```http
GET /documents
```

List all documents with pagination and filtering.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | integer | No | Number of results (default: 20, max: 100) |
| `offset` | integer | No | Pagination offset (default: 0) |
| `jurisdiction` | string | No | Filter by jurisdiction: "PL" or "UK" |
| `court_name` | string | No | Filter by court name |
| `date_from` | string | No | Filter by decision date (ISO 8601) |
| `date_to` | string | No | Filter by decision date (ISO 8601) |
| `sort_by` | string | No | Sort field: "date", "relevance" (default: "date") |
| `sort_order` | string | No | Sort order: "asc", "desc" (default: "desc") |

**Example Request:**

```bash
curl -X GET "http://localhost:8004/api/v1/documents?limit=20&jurisdiction=PL" \
  -H "X-API-Key: your-api-key"
```

**Example Response:**

```json
{
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "case_number": "I CSK 123/2023",
      "title": "Contract Interpretation Case",
      "summary": "Supreme Court ruling on contract interpretation...",
      "jurisdiction": "PL",
      "court_name": "Supreme Court",
      "decision_date": "2023-06-15",
      "keywords": ["contract", "interpretation", "civil law"],
      "created_at": "2024-02-10T10:00:00Z"
    }
  ],
  "total": 145,
  "page": 1,
  "per_page": 20,
  "pages": 8
}
```

#### Get Document by ID

```http
GET /documents/{id}
```

Retrieve a single document by ID with full details.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | Document UUID |

**Example Request:**

```bash
curl -X GET "http://localhost:8004/api/v1/documents/550e8400-e29b-41d4-a716-446655440000" \
  -H "X-API-Key: your-api-key"
```

**Example Response:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "case_number": "I CSK 123/2023",
  "title": "Contract Interpretation Case",
  "summary": "Supreme Court ruling on contract interpretation...",
  "full_text": "Full text of the judgment...",
  "jurisdiction": "PL",
  "court_name": "Supreme Court",
  "court_level": "Supreme",
  "decision_date": "2023-06-15",
  "publication_date": "2023-07-01",
  "judges": [
    {"name": "Jan Kowalski", "role": "Presiding Judge"},
    {"name": "Anna Nowak", "role": "Judge"}
  ],
  "keywords": ["contract", "interpretation", "civil law"],
  "cited_legislation": ["Civil Code Art. 65", "Civil Code Art. 353"],
  "legal_topics": ["Contract Law", "Interpretation"],
  "case_type": "Civil",
  "decision_type": "Judgment",
  "outcome": "Upheld",
  "source_url": "https://source.example.com/judgment/123",
  "metadata": {
    "language": "pl",
    "page_count": 15
  },
  "created_at": "2024-02-10T10:00:00Z",
  "updated_at": "2024-02-10T10:00:00Z"
}
```

#### Search Documents

```http
POST /documents/search
```

Search documents using text query, filters, and optional semantic search.

**Request Body:**

```json
{
  "query": "contract law interpretation",
  "filters": {
    "jurisdiction": "PL",
    "court_level": "Supreme",
    "decision_date_from": "2020-01-01",
    "decision_date_to": "2024-12-31",
    "keywords": ["contract", "interpretation"],
    "case_type": "Civil"
  },
  "search_type": "hybrid",
  "limit": 20,
  "offset": 0,
  "include_highlights": true,
  "include_similar": false
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Search query text |
| `filters` | object | No | Filter options |
| `search_type` | string | No | "text", "semantic", "hybrid" (default: "hybrid") |
| `limit` | integer | No | Number of results (default: 20, max: 100) |
| `offset` | integer | No | Pagination offset (default: 0) |
| `include_highlights` | boolean | No | Include text highlights (default: true) |
| `include_similar` | boolean | No | Include similar documents (default: false) |

**Example Request:**

```bash
curl -X POST "http://localhost:8004/api/v1/documents/search" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "query": "contract interpretation",
    "filters": {"jurisdiction": "PL"},
    "limit": 10
  }'
```

**Example Response:**

```json
{
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "case_number": "I CSK 123/2023",
      "title": "Contract Interpretation Case",
      "summary": "Supreme Court ruling on contract interpretation...",
      "jurisdiction": "PL",
      "court_name": "Supreme Court",
      "decision_date": "2023-06-15",
      "score": 0.92,
      "highlights": {
        "full_text": [
          "...the <mark>contract</mark> must be <mark>interpreted</mark>...",
          "...principles of <mark>contract</mark> law require..."
        ],
        "summary": [
          "...ruling on <mark>contract</mark> <mark>interpretation</mark>..."
        ]
      }
    }
  ],
  "total": 145,
  "page": 1,
  "per_page": 10,
  "pages": 15,
  "search_metadata": {
    "query_time_ms": 187,
    "search_type": "hybrid",
    "embedding_time_ms": 42
  }
}
```

#### Find Similar Documents

```http
POST /documents/{id}/similar
```

Find documents similar to a given document using vector similarity.

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | Document UUID |

**Request Body:**

```json
{
  "limit": 10,
  "min_similarity": 0.7,
  "filters": {
    "jurisdiction": "PL"
  }
}
```

**Example Response:**

```json
{
  "results": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "case_number": "II CSK 456/2023",
      "title": "Similar Contract Case",
      "similarity": 0.89
    }
  ],
  "total": 15
}
```

### Search

#### Semantic Search

```http
POST /search/semantic
```

Pure vector-based semantic search using embeddings.

**Request Body:**

```json
{
  "query": "dispute resolution in commercial contracts",
  "limit": 10,
  "min_similarity": 0.75,
  "filters": {
    "jurisdiction": "UK"
  }
}
```

**Example Response:**

```json
{
  "results": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "case_number": "EWCA Civ 123",
      "title": "Commercial Dispute Case",
      "similarity": 0.88,
      "excerpt": "...relevant text excerpt..."
    }
  ],
  "total": 8,
  "query_metadata": {
    "embedding_time_ms": 45,
    "search_time_ms": 120
  }
}
```

#### Get Search Facets

```http
POST /search/facets
```

Get aggregated facets for search results (counts by category).

**Request Body:**

```json
{
  "query": "contract law",
  "facet_fields": ["jurisdiction", "court_level", "case_type", "year"]
}
```

**Example Response:**

```json
{
  "facets": {
    "jurisdiction": {
      "PL": 145,
      "UK": 78
    },
    "court_level": {
      "Supreme": 45,
      "Appeal": 98,
      "District": 80
    },
    "case_type": {
      "Civil": 150,
      "Criminal": 50,
      "Administrative": 23
    },
    "year": {
      "2024": 30,
      "2023": 95,
      "2022": 78,
      "2021": 20
    }
  },
  "total": 223
}
```

### Chat & Q&A

#### Chat Endpoint (RAG)

```http
POST /chat
```

Conversational chat with retrieval-augmented generation.

**Request Body:**

```json
{
  "message": "What are the key principles of contract interpretation in Polish law?",
  "thread_id": "thread-uuid",
  "filters": {
    "jurisdiction": "PL"
  },
  "stream": true
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | Yes | User's question or message |
| `thread_id` | UUID | No | Conversation thread ID (for context) |
| `filters` | object | No | Filter documents for retrieval |
| `stream` | boolean | No | Stream response (default: true) |

**Example Request:**

```bash
curl -X POST "http://localhost:8004/chat" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "message": "What are the key principles of contract interpretation?",
    "filters": {"jurisdiction": "PL"},
    "stream": false
  }'
```

**Example Response (non-streaming):**

```json
{
  "response": "Based on Polish Supreme Court decisions, the key principles of contract interpretation include:\n\n1. **Literal interpretation**: The primary focus is on the literal meaning of the contract terms...\n\n2. **Party intent**: Courts consider the actual intent of the parties...\n\n3. **Good faith**: Interpretation must be guided by good faith principles...",
  "sources": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "case_number": "I CSK 123/2023",
      "title": "Contract Interpretation Case",
      "relevance": 0.92
    }
  ],
  "metadata": {
    "model": "gpt-4",
    "tokens_used": 450,
    "retrieval_time_ms": 120,
    "generation_time_ms": 2300
  }
}
```

**Streaming Response:**

When `stream: true`, the response is sent as Server-Sent Events (SSE):

```
data: {"type": "token", "content": "Based"}
data: {"type": "token", "content": " on"}
data: {"type": "token", "content": " Polish"}
...
data: {"type": "sources", "sources": [...]}
data: {"type": "done"}
```

#### Question Answering

```http
POST /qa
```

Direct question answering with document context.

**Request Body:**

```json
{
  "question": "What is the statute of limitations for contract disputes?",
  "context_filters": {
    "jurisdiction": "PL",
    "keywords": ["statute of limitations", "contract"]
  }
}
```

**Example Response:**

```json
{
  "answer": "According to Polish Civil Code, the general statute of limitations for contract disputes is 6 years...",
  "confidence": 0.89,
  "sources": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "case_number": "I CSK 123/2023",
      "excerpt": "...relevant excerpt..."
    }
  ]
}
```

### Collections

#### List Collections

```http
GET /collections
```

List all document collections for the authenticated user.

**Example Response:**

```json
{
  "collections": [
    {
      "id": "880e8400-e29b-41d4-a716-446655440003",
      "name": "Contract Law Cases",
      "description": "Important contract law decisions",
      "document_count": 15,
      "created_at": "2024-02-01T10:00:00Z",
      "updated_at": "2024-02-13T15:30:00Z"
    }
  ],
  "total": 5
}
```

#### Create Collection

```http
POST /collections
```

Create a new document collection.

**Request Body:**

```json
{
  "name": "My Research Collection",
  "description": "Collection of cases for my research project",
  "document_ids": [
    "550e8400-e29b-41d4-a716-446655440000",
    "660e8400-e29b-41d4-a716-446655440001"
  ],
  "tags": ["research", "contract-law"]
}
```

**Example Response:**

```json
{
  "id": "990e8400-e29b-41d4-a716-446655440004",
  "name": "My Research Collection",
  "description": "Collection of cases for my research project",
  "document_count": 2,
  "created_at": "2024-02-13T16:00:00Z"
}
```

#### Get Collection

```http
GET /collections/{id}
```

Get collection details with all documents.

**Example Response:**

```json
{
  "id": "880e8400-e29b-41d4-a716-446655440003",
  "name": "Contract Law Cases",
  "description": "Important contract law decisions",
  "documents": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "case_number": "I CSK 123/2023",
      "title": "Contract Interpretation Case",
      "added_at": "2024-02-01T12:00:00Z"
    }
  ],
  "document_count": 15,
  "created_at": "2024-02-01T10:00:00Z",
  "updated_at": "2024-02-13T15:30:00Z"
}
```

### Analytics

#### Get Statistics

```http
GET /analytics/stats
```

Get general platform statistics.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jurisdiction` | string | No | Filter by jurisdiction |
| `date_from` | string | No | Start date for statistics |
| `date_to` | string | No | End date for statistics |

**Example Response:**

```json
{
  "total_documents": 200,
  "by_jurisdiction": {
    "PL": 100,
    "UK": 100
  },
  "by_court_level": {
    "Supreme": 45,
    "Appeal": 85,
    "District": 70
  },
  "by_year": {
    "2024": 30,
    "2023": 80,
    "2022": 60,
    "2021": 30
  },
  "search_activity": {
    "total_searches": 1542,
    "avg_searches_per_day": 87,
    "popular_queries": [
      {"query": "contract law", "count": 45},
      {"query": "tort liability", "count": 32}
    ]
  }
}
```

#### Get Trends

```http
GET /analytics/trends
```

Get decision trends over time.

**Example Response:**

```json
{
  "trends": {
    "decisions_by_month": [
      {"month": "2024-01", "count": 15},
      {"month": "2024-02", "count": 18}
    ],
    "case_types_trend": {
      "Civil": [12, 15, 10, 18],
      "Criminal": [5, 8, 6, 9]
    }
  }
}
```

### Schemas

#### List Schemas

```http
GET /schemas
```

List all available extraction schemas.

**Example Response:**

```json
{
  "schemas": [
    {
      "id": "aa0e8400-e29b-41d4-a716-446655440005",
      "name": "Contract Elements",
      "description": "Extract key elements from contract cases",
      "version": "1.0",
      "created_at": "2024-01-15T10:00:00Z"
    }
  ],
  "total": 5
}
```

#### Generate Schema

```http
POST /schemas/generate
```

Generate extraction schema using AI.

**Request Body:**

```json
{
  "description": "Extract party names, contract type, key obligations, and dispute points",
  "example_document_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Example Response:**

```json
{
  "schema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
      "parties": {
        "type": "array",
        "items": {"type": "string"}
      },
      "contract_type": {
        "type": "string"
      },
      "key_obligations": {
        "type": "array",
        "items": {"type": "string"}
      },
      "dispute_points": {
        "type": "array",
        "items": {"type": "string"}
      }
    }
  }
}
```

### Feedback

#### Submit Feedback

```http
POST /feedback
```

Submit user feedback on search results or chat responses.

**Request Body:**

```json
{
  "type": "search" | "chat" | "document",
  "rating": 1-5,
  "comment": "The search results were very relevant",
  "context": {
    "query": "contract law",
    "document_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Example Response:**

```json
{
  "id": "bb0e8400-e29b-41d4-a716-446655440006",
  "message": "Thank you for your feedback!",
  "created_at": "2024-02-13T16:30:00Z"
}
```

### Health

#### Health Check

```http
GET /health
```

Check API health status.

**Example Response:**

```json
{
  "status": "healthy",
  "version": "0.1.0",
  "timestamp": "2024-02-13T16:35:00Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "openai": "healthy"
  }
}
```

## Error Responses

All errors follow this format:

```json
{
  "error": "Error type",
  "message": "Human-readable error message",
  "details": {
    "field": "Additional error details"
  },
  "status_code": 400
}
```

### Common Error Codes

| Code | Type | Description |
|------|------|-------------|
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 422 | Unprocessable Entity | Validation error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Service temporarily unavailable |

### Example Error Response

```json
{
  "error": "ValidationError",
  "message": "Invalid request parameters",
  "details": {
    "query": "Query must be at least 3 characters long",
    "limit": "Limit must be between 1 and 100"
  },
  "status_code": 422
}
```

## Rate Limiting

API requests are rate-limited to prevent abuse:

**Limits:**
- 100 requests per minute per IP
- 1000 requests per hour per API key

**Headers:**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1676304000
```

**Rate Limit Error:**
```json
{
  "error": "RateLimitExceeded",
  "message": "Too many requests. Please try again later.",
  "retry_after": 60,
  "status_code": 429
}
```

## Pagination

All list endpoints support pagination:

**Request Parameters:**
```
?limit=20&offset=0
```

**Response:**
```json
{
  "results": [...],
  "total": 145,
  "page": 1,
  "per_page": 20,
  "pages": 8
}
```

**Link Header (optional):**
```http
Link: <http://api.example.com/documents?offset=20>; rel="next",
      <http://api.example.com/documents?offset=0>; rel="first"
```

---

For more information, see:
- [DEVELOPER_ONBOARDING.md](./DEVELOPER_ONBOARDING.md) - Getting started guide
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [Interactive API Docs](http://localhost:8004/docs) - When backend is running
