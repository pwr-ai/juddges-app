# ==============================================================================
# Base Stage - Common uv setup
# ==============================================================================
FROM python:3.12.10-slim AS base

# Pinned uv binary (keep in step with the CI setup-uv version and the
# uv_build pin in pyproject.toml). Only the base/builder stages carry it; the
# production stage starts from a clean python image and copies the venv only.
COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /uvx /bin/

# The venv lives OUTSIDE /app: docker-compose.dev.yml bind-mounts ./backend over
# /app, which would hide a /app/.venv. Putting its bin/ first on PATH makes
# python, gunicorn, uvicorn, celery and pytest resolve without `uv run`.
# UV_LINK_MODE=copy: the uv cache is a BuildKit cache mount (another
# filesystem), so hardlinking is impossible. Use the image's interpreter and
# never download one, so the venv's python symlink is valid in production too.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    UV_PYTHON=/usr/local/bin/python3.12 \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/opt/venv/bin:${PATH}"

WORKDIR /app

# Copy dependency metadata first for better caching: the lockfile plus every
# workspace member's pyproject.toml (uv needs them to resolve the workspace),
# but not the sources, so a code change does not reinstall dependencies.
COPY ./pyproject.toml ./README.md ./uv.lock ./
COPY ./packages/juddges_search/pyproject.toml ./packages/juddges_search/README.md ./packages/juddges_search/
COPY ./packages/schema_generator_agent/pyproject.toml ./packages/schema_generator_agent/README.md ./packages/schema_generator_agent/
COPY ./packages/research_agent/pyproject.toml ./packages/research_agent/README.md ./packages/research_agent/
COPY ./packages/juddges_mcp/pyproject.toml ./packages/juddges_mcp/README.md ./packages/juddges_mcp/

# ==============================================================================
# Development Stage - For hot reload development
# ==============================================================================
FROM base AS development

# Install all dependencies including the dev group. Third-party packages first
# (--no-install-workspace skips the root project and the workspace members,
# whose sources are not copied yet), then the workspace itself, editable.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-workspace
COPY ./packages ./packages
COPY ./app ./app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen

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

# Compile .pyc at install time so production workers do not pay for it on boot.
ENV UV_COMPILE_BYTECODE=1

# Dependencies only (no dev group), then the workspace. The workspace stays an
# EDITABLE install on purpose: juddges_search locates its config/ (prompts,
# schemas, extraction contexts) via Path(__file__).parents[2], and
# app/extraction_domain reads packages/juddges_search/config/prompts relative
# to /app. A --no-editable wheel install would put the modules in site-packages
# without that sibling config/ tree, so the sources must stay at /app/packages.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-workspace
COPY ./packages ./packages
COPY ./app ./app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# ==============================================================================
# Production Stage - Optimized for production deployment
# ==============================================================================
FROM python:3.12.10-slim AS production

WORKDIR /app

# The venv from the builder (no uv, no build tooling). Its editable .pth files
# point at /app and /app/packages, which are copied below at the same paths.
ENV PATH="/opt/venv/bin:${PATH}"
COPY --from=builder /opt/venv /opt/venv

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
    chown -R appuser:appuser /app && \
    mkdir -p /var/lib/celery && \
    chown appuser:appuser /var/lib/celery
USER appuser

EXPOSE 8002

# Release version reported by /health (set by scripts/build_and_push_prod.sh).
# Declared last so a new version does not invalidate the layers above.
ARG APP_VERSION=unknown
ENV APP_VERSION=${APP_VERSION}

# Use gunicorn with uvicorn workers for better process management and monitoring
# Worker count is env-driven via GUNICORN_WORKERS. When unset it defaults to the
# gunicorn-recommended (2 * vCPU) + 1, computed from the container's CPU count.
# On a 2-4 vCPU prod host this yields 5-9 workers instead of a hard-coded 12,
# which removed needless context-switch overhead.
# --timeout 120: Request timeout (2 minutes for complex AI/ML operations)
# --graceful-timeout 30: Graceful shutdown timeout
# --keep-alive 5: Keep-alive connections
# --max-requests 1000: Restart workers after 1000 requests (prevents memory leaks)
# --max-requests-jitter 50: Add randomness to prevent all workers restarting simultaneously
CMD ["sh", "-c", \
     "exec gunicorn app.server:app \
        --worker-class uvicorn.workers.UvicornWorker \
        --workers \"${GUNICORN_WORKERS:-$(( $(nproc) * 2 + 1 ))}\" \
        --bind 0.0.0.0:8002 \
        --timeout 120 \
        --graceful-timeout 30 \
        --keep-alive 5 \
        --max-requests 1000 \
        --max-requests-jitter 50 \
        --access-logfile - \
        --error-logfile - \
        --log-level info"]
