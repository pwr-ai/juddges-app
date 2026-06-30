"""Shared rate-limit constants for the Reasoning Line Tracker API (#147 split)."""

# Computationally expensive — stricter rate limit
REASONING_LINES_RATE_LIMIT = "10/hour"
REASONING_LINES_READ_RATE_LIMIT = "30/hour"
# LLM-based classification — most expensive, strictest limit
REASONING_LINES_LLM_RATE_LIMIT = "5/hour"
# Semantic search / cross-reference endpoints
REASONING_LINES_SEARCH_RATE_LIMIT = "30/hour"
