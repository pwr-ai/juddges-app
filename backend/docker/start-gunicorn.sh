#!/bin/sh
# Production entrypoint for the backend API (#547).
#
# Worker count resolution, in order:
#   1. GUNICORN_WORKERS, if set to a positive integer (an explicit pin wins,
#      and is NOT capped).
#   2. (2 * CPUs) + 1, where CPUs is the container's cgroup CPU quota
#      (docker compose `deploy.resources.limits.cpus`) rounded up, falling back
#      to `nproc` only when no quota is set; capped at GUNICORN_MAX_WORKERS
#      (default 8).
#
# `nproc` alone reports every host core regardless of the cgroup limit: on a
# 48-core host with `cpus: '8'` it produced 97 workers on a fresh host where
# GUNICORN_WORKERS was not pinned in .env.
#
# `start-gunicorn.sh --print-workers` prints the resolved count and exits
# (used by the unit tests). CGROUP_ROOT exists for the same reason.
set -eu

CGROUP_ROOT="${CGROUP_ROOT:-/sys/fs/cgroup}"
DEFAULT_MAX_WORKERS=8

is_positive_int() {
    case "$1" in
        '' | *[!0-9]*) return 1 ;;
    esac
    [ "$1" -gt 0 ]
}

# Ceiling of quota/period, or nothing when no CPU limit is in force.
cgroup_cpus() {
    quota=""
    period=""
    if [ -r "$CGROUP_ROOT/cpu.max" ]; then
        # cgroup v2: "<quota|max> <period>"
        read -r quota period < "$CGROUP_ROOT/cpu.max" || true
    elif [ -r "$CGROUP_ROOT/cpu/cpu.cfs_quota_us" ] && [ -r "$CGROUP_ROOT/cpu/cpu.cfs_period_us" ]; then
        # cgroup v1: quota is -1 when unlimited
        read -r quota < "$CGROUP_ROOT/cpu/cpu.cfs_quota_us" || true
        read -r period < "$CGROUP_ROOT/cpu/cpu.cfs_period_us" || true
    fi
    if is_positive_int "$quota" && is_positive_int "$period"; then
        echo $(( (quota + period - 1) / period ))
    fi
}

resolve_workers() {
    workers="${GUNICORN_WORKERS:-}"
    if [ -n "$workers" ]; then
        if is_positive_int "$workers"; then
            echo "$workers"
            return 0
        fi
        echo "start-gunicorn: ignoring invalid GUNICORN_WORKERS='$workers'" >&2
    fi

    cpus="$(cgroup_cpus)"
    if ! is_positive_int "$cpus"; then
        cpus="$(nproc)"
    fi

    max="${GUNICORN_MAX_WORKERS:-$DEFAULT_MAX_WORKERS}"
    if ! is_positive_int "$max"; then
        echo "start-gunicorn: ignoring invalid GUNICORN_MAX_WORKERS='$max'" >&2
        max="$DEFAULT_MAX_WORKERS"
    fi

    workers=$(( cpus * 2 + 1 ))
    if [ "$workers" -gt "$max" ]; then
        workers="$max"
    fi
    echo "$workers"
}

WORKERS="$(resolve_workers)"

if [ "${1:-}" = "--print-workers" ]; then
    echo "$WORKERS"
    exit 0
fi

echo "start-gunicorn: starting with $WORKERS workers" >&2

# --timeout 120: request timeout (2 minutes for complex AI/ML operations)
# --graceful-timeout 30: graceful shutdown timeout
# --keep-alive 5: keep-alive connections
# --max-requests 1000 (+ jitter 50): recycle workers to bound memory growth
exec gunicorn app.server:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers "$WORKERS" \
    --bind 0.0.0.0:8002 \
    --timeout 120 \
    --graceful-timeout 30 \
    --keep-alive 5 \
    --max-requests 1000 \
    --max-requests-jitter 50 \
    --access-logfile - \
    --error-logfile - \
    --log-level info \
    "$@"
