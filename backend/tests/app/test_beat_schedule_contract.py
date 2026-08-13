"""Every scheduled task must actually exist and accept its scheduled kwargs (#489).

`app/tasks/reasoning_line_pipeline.py` and `app/tasks/suggestions_index.py` sat at
0% coverage while running in production every week. A broken import or a renamed
task in either surfaces as a silent weekly failure in a worker log nobody reads —
the same shape as the dashboard stats that sat three months stale (#467).

Beat resolves a schedule entry to a task **by name at tick time**, and a
mismatched name or an unexpected kwarg raises inside the worker, not at deploy.
Both are decidable here: `celery_app.tasks` is the registry the worker will use,
and the task's own signature is introspectable.

This deliberately does not chase coverage percentages. It asserts the two things
that actually break unattended scheduled work.
"""

from __future__ import annotations

import inspect

import pytest

from app.workers import celery_app


def _scheduled_entries() -> list[tuple[str, dict]]:
    """(schedule name, entry) for everything beat would run."""
    return sorted(celery_app.conf.beat_schedule.items())


_LOADED = False


def _load_task_modules() -> None:
    """Import the task modules the way a worker does, not the way a test would.

    Importing `app.workers` alone registers almost nothing: `conf.imports` is
    consumed by the Celery loader during worker startup, so in a plain test
    process `celery_app.tasks` holds only tasks defined in `app/workers.py`
    itself. Importing the modules by hand here would sidestep exactly the failure
    this file exists to catch — a module dropped from `conf.imports` registers
    nothing, and beat then resolves its names to nothing at tick time.

    `conf.imports` is explicit rather than `autodiscover_tasks(["app.tasks"])`
    because autodiscovery only finds a module literally named `app.tasks.tasks`.
    """
    global _LOADED
    if not _LOADED:
        celery_app.loader.import_default_modules()
        _LOADED = True


def _registered_task(task_name: str):
    """Resolve a task the way the worker does, via the app registry."""
    _load_task_modules()
    return celery_app.tasks.get(task_name)


@pytest.mark.unit
def test_the_schedule_is_not_empty() -> None:
    """Guard the guard: an empty schedule would make everything below vacuous."""
    entries = _scheduled_entries()
    assert len(entries) >= 8, f"only {len(entries)} scheduled entries found"


@pytest.mark.unit
@pytest.mark.parametrize(("schedule_name", "entry"), _scheduled_entries())
def test_scheduled_task_is_registered(schedule_name: str, entry: dict) -> None:
    """A name beat cannot resolve is a weekly no-op that logs and moves on."""
    task_name = entry["task"]
    assert _registered_task(task_name) is not None, (
        f"beat entry {schedule_name!r} schedules {task_name!r}, which is not in "
        f"celery_app.tasks. Either the task was renamed or its module is missing "
        f"from celery_app.conf.imports. Registered: "
        f"{sorted(n for n in celery_app.tasks if not n.startswith('celery.'))}"
    )


@pytest.mark.unit
@pytest.mark.parametrize(("schedule_name", "entry"), _scheduled_entries())
def test_scheduled_kwargs_match_the_task_signature(
    schedule_name: str, entry: dict
) -> None:
    """`digest.send` takes `frequency`; the ingestion entry passes `polish`/`uk`.

    A signature drift is invisible until the tick fires, and then it raises inside
    the worker rather than anywhere a human is looking.
    """
    kwargs = entry.get("kwargs") or {}
    if not kwargs:
        pytest.skip(f"{schedule_name} passes no kwargs")

    task = _registered_task(entry["task"])
    assert task is not None, f"{entry['task']} is not registered"

    signature = inspect.signature(task.run)
    accepts_any = any(
        param.kind is inspect.Parameter.VAR_KEYWORD
        for param in signature.parameters.values()
    )
    if accepts_any:
        return

    unexpected = sorted(set(kwargs) - set(signature.parameters))
    assert not unexpected, (
        f"beat entry {schedule_name!r} passes {unexpected} to {entry['task']!r}, "
        f"which accepts {sorted(signature.parameters)}. This raises inside the "
        f"worker when the tick fires."
    )


@pytest.mark.unit
@pytest.mark.parametrize(("schedule_name", "entry"), _scheduled_entries())
def test_scheduled_task_has_no_unfilled_required_arguments(
    schedule_name: str, entry: dict
) -> None:
    """Beat passes only what the entry declares, so anything else must be optional.

    Catches the reverse of the test above: a task that grows a new required
    parameter while its schedule entry stays unchanged.
    """
    task = _registered_task(entry["task"])
    assert task is not None, f"{entry['task']} is not registered"

    provided = set(entry.get("kwargs") or {})
    positional = len(entry.get("args") or [])

    parameters = [
        param
        for name, param in inspect.signature(task.run).parameters.items()
        # `bind=True` tasks receive self as the first argument.
        if name != "self"
        and param.kind
        not in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD)
    ]

    unfilled = [
        param.name
        for index, param in enumerate(parameters)
        if param.default is inspect.Parameter.empty
        and param.name not in provided
        and index >= positional
    ]
    assert not unfilled, (
        f"{entry['task']!r} requires {unfilled}, which beat entry "
        f"{schedule_name!r} does not provide"
    )


@pytest.mark.unit
def test_the_weekly_pipeline_modules_are_actually_imported() -> None:
    """The two modules this issue is about must be in `conf.imports`.

    They are the reason for this file: scheduled, unattended, and previously at
    0% coverage. Registration is asserted per-entry above, but naming them here
    makes the intent survive a future refactor of the schedule.
    """
    imports = set(celery_app.conf.imports)
    for module in ("app.tasks.reasoning_line_pipeline", "app.tasks.suggestions_index"):
        assert module in imports, (
            f"{module} is not in celery_app.conf.imports, so none of its tasks "
            "register and every scheduled tick for them silently does nothing"
        )
