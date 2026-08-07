"""Contract tests for the Celery reliability configuration (#437).

These assertions encode guarantees that are invisible at runtime until a worker
dies mid-job: an early ack loses a 15-minute extraction, a visibility timeout
below the task time limit runs it twice, and a routed task whose queue has no
consumer never runs at all. Each test pins one of those.
"""

from __future__ import annotations

import fnmatch
import re
from pathlib import Path

import pytest
import yaml

from app.workers import celery_app

REPO_ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.unit
def test_long_tasks_are_acked_late_and_requeued_on_worker_loss() -> None:
    """An interrupted long task must be redelivered, not silently dropped.

    Celery's default acks the message when the worker reserves it, so a restart
    or OOM part-way through an extraction loses the job with no trace.
    """
    conf = celery_app.conf
    assert conf.task_acks_late is True
    assert conf.task_reject_on_worker_lost is True


@pytest.mark.unit
def test_worker_does_not_hoard_messages_in_a_local_buffer() -> None:
    """Prefetch must be 1 so queued jobs stay visible to idle workers.

    The default of 4 reserves 4 x concurrency messages inside one worker; with
    multi-minute tasks that is head-of-line blocking.
    """
    assert celery_app.conf.worker_prefetch_multiplier == 1


@pytest.mark.unit
def test_visibility_timeout_exceeds_the_hard_time_limit() -> None:
    """The redelivery window must outlast the longest a task may legally run.

    The Redis transport redelivers any message left un-acked for
    ``visibility_timeout``. If that window is shorter than the hard time limit,
    a task that is still running is handed to a second worker and executes
    twice — duplicated LLM spend and duplicated writes.
    """
    conf = celery_app.conf
    hard_limit = conf.task_time_limit
    soft_limit = conf.task_soft_time_limit

    assert hard_limit is not None, "an unbounded task can pin a worker slot forever"
    assert soft_limit is not None
    assert soft_limit < hard_limit, "the soft limit must fire first to allow cleanup"

    for option_name in ("broker_transport_options", "result_backend_transport_options"):
        options = getattr(conf, option_name)
        visibility_timeout = options.get("visibility_timeout")
        assert visibility_timeout is not None, f"{option_name} lacks visibility_timeout"
        assert visibility_timeout > hard_limit, (
            f"{option_name} visibility_timeout ({visibility_timeout}s) must exceed "
            f"task_time_limit ({hard_limit}s) or a still-running task is rerun"
        )


@pytest.mark.unit
def test_revoked_task_set_is_persisted() -> None:
    """Revocations must survive a worker restart.

    With ``task_acks_late`` the message for a revoked-and-terminated task is
    still on the broker. Without ``worker_state_db`` the in-memory revoked set
    is lost on restart and the cancelled job runs again.
    """
    assert celery_app.conf.worker_state_db


@pytest.mark.unit
def test_extraction_is_routed_off_the_shared_queue() -> None:
    """Long LLM work must not share a queue with the periodic jobs."""
    routes = celery_app.conf.task_routes
    extraction_route = routes["app.workers.extract_information_from_documents_task"]
    assert extraction_route["queue"] == "extraction"
    assert celery_app.conf.task_default_queue != "extraction"


def _resolve_queue(task_name: str) -> str:
    """Mirror Celery's glob matching over ``task_routes``."""
    for pattern, route in celery_app.conf.task_routes.items():
        if pattern == task_name or fnmatch.fnmatch(task_name, pattern):
            return route["queue"]
    return celery_app.conf.task_default_queue


@pytest.mark.unit
def test_every_scheduled_task_has_an_explicit_route() -> None:
    """A beat task falling through to the default queue is a starvation risk."""
    unrouted = [
        entry["task"]
        for entry in celery_app.conf.beat_schedule.values()
        if _resolve_queue(entry["task"]) == celery_app.conf.task_default_queue
    ]
    assert not unrouted, f"beat tasks with no explicit queue: {sorted(unrouted)}"


def _compose_worker_queues(compose_path: Path) -> set[str]:
    """Collect every queue name the workers in a compose file consume."""
    compose = yaml.safe_load(compose_path.read_text())
    consumed: set[str] = set()
    for service in compose["services"].values():
        command = service.get("command")
        if not command:
            continue
        if isinstance(command, list):
            command = " ".join(command)
        for match in re.finditer(r"(?:--queues|-Q)[=\s]+([\w,]+)", command):
            consumed.update(match.group(1).split(","))
    return consumed


@pytest.mark.unit
@pytest.mark.parametrize(
    "compose_file", ["docker-compose.yml", "docker-compose.dev.yml"]
)
def test_every_routed_queue_has_a_consumer(compose_file: str) -> None:
    """Guards the failure mode where a routed task has no worker listening.

    Adding a ``task_routes`` entry without a matching ``--queues`` flag makes
    the task enqueue successfully and then never run — no error anywhere.
    """
    routed_queues = {
        route["queue"] for route in celery_app.conf.task_routes.values()
    } | {celery_app.conf.task_default_queue}

    consumed = _compose_worker_queues(REPO_ROOT / compose_file)
    missing = routed_queues - consumed
    assert not missing, (
        f"{compose_file} has no worker consuming {sorted(missing)}; "
        f"tasks routed there would queue forever"
    )
