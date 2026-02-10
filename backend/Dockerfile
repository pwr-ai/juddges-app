# Build stage
FROM python:3.12-slim AS builder

RUN pip install --no-cache-dir poetry==2.1.3 && \
    poetry config virtualenvs.create false

WORKDIR /app

# Copy dependency files first for better caching
COPY ./pyproject.toml ./README.md ./poetry.lock* ./
COPY ./packages ./packages

# Install dependencies only (no dev dependencies)
RUN poetry install --no-interaction --no-ansi --no-root --only main

# Production stage
FROM python:3.12-slim

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY ./packages ./packages
COPY ./app ./app

# Set build-time environment variables with placeholder values
# These will be overridden at runtime with actual values from .env
ARG OPENAI_API_KEY=""
ARG WV_HOST=""
ARG WV_URL=""
ARG WV_PORT=""
ARG WV_GRPC_PORT=""
ARG WV_API_KEY=""
ARG BACKEND_API_KEY=""
ARG API_BASE_URL=""
ARG SUPABASE_URL=""
ARG SUPABASE_ANON_KEY=""
ARG SUPABASE_SERVICE_ROLE_KEY=""
ARG TEST_USER_ID=""


# Set environment variables
ENV OPENAI_API_KEY=${OPENAI_API_KEY}
ENV WV_HOST=${WV_HOST}
ENV WV_URL=${WV_URL}
ENV WV_PORT=${WV_PORT}
ENV WV_GRPC_PORT=${WV_GRPC_PORT}
ENV WV_API_KEY=${WV_API_KEY}
ENV BACKEND_API_KEY=${BACKEND_API_KEY}
ENV API_BASE_URL=${API_BASE_URL}
ENV SUPABASE_URL=${SUPABASE_URL}
ENV SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
ENV SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
ENV TEST_USER_ID=${TEST_USER_ID}

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
