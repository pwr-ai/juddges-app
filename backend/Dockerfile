# ==============================================================================
# Base Stage - Common Poetry setup
# ==============================================================================
FROM python:3.12-slim AS base

RUN pip install --no-cache-dir poetry==2.1.3 && \
    poetry config virtualenvs.create false

WORKDIR /app

# Copy dependency files first for better caching
COPY ./pyproject.toml ./README.md ./poetry.lock* ./
COPY ./packages ./packages

# ==============================================================================
# Development Stage - For hot reload development
# ==============================================================================
FROM base AS development

# Install all dependencies including dev dependencies
RUN poetry install --no-interaction --no-ansi --no-root
COPY ./app ./app
RUN poetry install --no-interaction --no-ansi --with dev

# Set up Hugging Face cache directories
ENV HF_HOME=/tmp/hf \
    HF_HUB_CACHE=/tmp/hf/hub \
    TRANSFORMERS_CACHE=/tmp/hf/transformers

RUN mkdir -p /tmp/hf/hub /tmp/hf/transformers && \
    chmod -R 777 /tmp/hf

# Create non-root user
RUN adduser --disabled-password --gecos '' appuser && \
    chown -R appuser:appuser /app && \
    chown -R appuser:appuser /tmp/hf

USER appuser

EXPOSE 8080

# Development server with hot reload
CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8080", "--reload"]

# ==============================================================================
# Builder Stage - Install production dependencies
# ==============================================================================
FROM base AS builder

# Install dependencies only (no dev dependencies)
RUN poetry install --no-interaction --no-ansi --no-root --only main

# ==============================================================================
# Production Stage - Optimized for production deployment
# ==============================================================================
FROM python:3.12-slim AS production

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY ./packages ./packages
COPY ./app ./app

# Set up Hugging Face cache directories
ENV HF_HOME=/tmp/hf \
    HF_HUB_CACHE=/tmp/hf/hub \
    TRANSFORMERS_CACHE=/tmp/hf/transformers

# Create Hugging Face cache directories and ensure they're writable
RUN mkdir -p /tmp/hf/hub /tmp/hf/transformers && chmod -R 777 /tmp/hf

# Create non-root user
RUN adduser --disabled-password --gecos '' appuser && \
    chown -R appuser:appuser /app
USER appuser

EXPOSE 8002

# Use gunicorn with uvicorn workers for better process management and monitoring
# 12 workers for high concurrency handling
# --timeout 120: Request timeout (2 minutes for complex AI/ML operations)
# --graceful-timeout 30: Graceful shutdown timeout
# --keep-alive 5: Keep-alive connections
# --max-requests 1000: Restart workers after 1000 requests (prevents memory leaks)
# --max-requests-jitter 50: Add randomness to prevent all workers restarting simultaneously
CMD ["gunicorn", "app.server:app", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--workers", "12", \
     "--bind", "0.0.0.0:8002", \
     "--timeout", "120", \
     "--graceful-timeout", "30", \
     "--keep-alive", "5", \
     "--max-requests", "1000", \
     "--max-requests-jitter", "50", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "--log-level", "info"]
