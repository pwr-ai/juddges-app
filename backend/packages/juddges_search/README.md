# juddges_search

RAG (Retrieval-Augmented Generation) search implementation for Juddges App.

## Overview

This package provides AI-powered search capabilities for judicial decisions, including:
- Vector-based semantic search using Supabase pgvector
- Full-text search with PostgreSQL
- Hybrid search combining semantic and keyword approaches
- LangChain integration for RAG workflows
- Chat and QA chains for legal research

## Installation

This package is installed as an editable dependency in the main backend:

```bash
cd backend
poetry install
```

## Usage

```python
from juddges_search.chains.chat import chat_chain
from juddges_search.retrieval import search_judgments

# Use in your FastAPI endpoints
results = search_judgments(query="criminal appeal", jurisdiction="UK")
```

## Migration Note

This package was originally named `ai_tax_search` in the AI-Tax platform. It has been rebranded to `juddges_search` for the Juddges App.
