"""Guard tests for issue #469: `exc_info` is not a loguru keyword.

`loguru`'s `logger.error()` accepts no `exc_info` parameter. Any unknown
keyword is forwarded to `str.format()` on the message, so `exc_info=True`
silently turns the message into a format template. When the interpolated text
contains braces — a `PostgrestAPIError` stringifies to a dict-shaped repr —
formatting raises *from inside the logger*, inside an `except` block: the
intended error line is never written and a `KeyError` escapes the handler,
converting a deliberately handled failure into an unhandled one.

It only bites when a sink is installed, which is why the whole backend suite
stayed green with 60 of these in the tree (`tests/conftest.py` calls
`logger.remove()`). So a behavioural test alone is not enough — the AST scan
below is the real guard.

The correct loguru spellings are `logger.exception(...)` inside an `except`
block, or `logger.opt(exception=True).<level>(...)` anywhere.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest
from loguru import logger

pytestmark = pytest.mark.unit

BACKEND_DIR = Path(__file__).resolve().parents[2]
SCANNED_ROOTS = (BACKEND_DIR / "app", BACKEND_DIR / "packages")


# ===== AST scanner =====


def _receiver_identifiers(node: ast.AST) -> set[str]:
    """Every identifier in a receiver expression's name/attribute/call chain.

    Handles plain `logger`, dotted receivers (`app.core.logger`,
    `self._logger`) and chained calls (`logger.opt(...)`, `logger.bind(...)`).
    """
    names: set[str] = set()
    current: ast.AST | None = node
    while current is not None:
        if isinstance(current, ast.Name):
            names.add(current.id)
            return names
        if isinstance(current, ast.Attribute):
            names.add(current.attr)
            current = current.value
        elif isinstance(current, ast.Call):
            current = current.func
        elif isinstance(current, ast.Subscript):
            current = current.value
        else:
            return names
    return names


def _stdlib_logger_names(tree: ast.AST) -> set[str]:
    """Names bound to a `logging.getLogger(...)` result in this module.

    `exc_info` *is* a real parameter of stdlib `logging`, so a stdlib logger
    must not be flagged. The backend uses loguru everywhere (123 modules vs 0
    after #469 moved `app/core/session_store.py` over), but this keeps the
    guard correct rather than merely strict.
    """
    names: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign) or not isinstance(node.value, ast.Call):
            continue
        func = node.value.func
        attr = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
        if attr != "getLogger":
            continue
        for target in node.targets:
            if isinstance(target, ast.Name):
                names.add(target.id)
            elif isinstance(target, ast.Attribute):
                names.add(target.attr)
    return names


def find_exc_info_logger_calls(source: str, filename: str) -> list[str]:
    """Return `filename:line` for every `logger.*(..., exc_info=...)` call."""
    tree = ast.parse(source, filename=filename)
    stdlib_names = _stdlib_logger_names(tree)
    offenders: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if not isinstance(node.func, ast.Attribute):
            continue
        identifiers = _receiver_identifiers(node.func)
        if not any("logger" in name.lower() for name in identifiers):
            continue
        if identifiers & stdlib_names:
            continue
        for keyword in node.keywords:
            if keyword.arg == "exc_info":
                offenders.append(f"{filename}:{node.lineno}")
    return offenders


def _python_files() -> list[Path]:
    return [
        path
        for root in SCANNED_ROOTS
        for path in sorted(root.rglob("*.py"))
        if "__pycache__" not in path.parts
    ]


# ===== The guard =====


def test_no_logger_call_passes_exc_info() -> None:
    offenders: list[str] = []
    for path in _python_files():
        offenders += find_exc_info_logger_calls(
            path.read_text(encoding="utf-8"), str(path.relative_to(BACKEND_DIR))
        )

    assert not offenders, (
        "loguru's logger takes no `exc_info` keyword; it is forwarded to "
        "str.format() and raises on brace-bearing messages (see #469). Use "
        "`logger.exception(...)` inside an `except` block, or "
        "`logger.opt(exception=True).<level>(...)`. Offending call sites:\n"
        + "\n".join(f"  {site}" for site in offenders)
    )


def test_scanned_roots_are_non_empty() -> None:
    """A guard that scans nothing passes for the wrong reason."""
    files = _python_files()
    assert len(files) > 100, f"expected the whole backend tree, scanned {len(files)}"


# ===== The guard has teeth =====


@pytest.mark.parametrize(
    "snippet",
    [
        'logger.error("boom", exc_info=True)',
        'logger.warning("boom", exc_info=True)',
        'logger.info("boom", exc_info=True)',
        'logger.debug("boom", exc_info=True)',
        'logger.critical("boom", exc_info=True)',
        'logger.exception("boom", exc_info=True)',
        'logger.error("boom", exc_info=False)',
        'logger.error("boom {}", value, exc_info=exc)',
        'logger.opt(exception=True).error("boom", exc_info=True)',
        'logger.bind(job="1").error("boom", exc_info=True)',
        'self._logger.error("boom", exc_info=True)',
        'app.core.logging.logger.error("boom", exc_info=True)',
    ],
)
def test_scanner_flags_violation(snippet: str) -> None:
    assert find_exc_info_logger_calls(snippet, "fake.py") == ["fake.py:1"]


@pytest.mark.parametrize(
    "snippet",
    [
        'logger.exception("boom")',
        'logger.opt(exception=True).error("boom")',
        'logger.error("boom {}: {}", job_id, exc)',
        "subprocess.run(cmd, check=True)",
        "with pytest.raises(ValueError) as exc_info:\n    pass",
        # stdlib logging really does take exc_info.
        "import logging\nlogger = logging.getLogger(__name__)\n"
        'logger.error("boom", exc_info=True)',
        'self.logger = logging.getLogger("x")\nself.logger.error("boom", exc_info=True)',
    ],
)
def test_scanner_accepts_correct_usage(snippet: str) -> None:
    assert find_exc_info_logger_calls(snippet, "fake.py") == []


def test_backend_binds_no_stdlib_loggers() -> None:
    """The stdlib exemption above must stay theoretical.

    `app/core/session_store.py` was the backend's only `logging.getLogger`
    module, and with no stdlib handler configured anywhere its warnings never
    reached a sink at all — the same "the log line is lost" failure #469 is
    about. It now uses loguru like the other 123 modules. If a stdlib logger
    reappears, decide deliberately whether it belongs.
    """
    offenders = [
        str(path.relative_to(BACKEND_DIR))
        for path in _python_files()
        if _stdlib_logger_names(ast.parse(path.read_text(encoding="utf-8")))
    ]
    assert not offenders, f"stdlib logging.getLogger reintroduced in: {offenders}"


def test_scanner_reports_every_offender_with_line_numbers() -> None:
    source = (
        "from loguru import logger\n"
        'logger.error("a", exc_info=True)\n'
        'logger.info("b")\n'
        'logger.opt(exception=True).warning("c", exc_info=True)\n'
    )
    assert find_exc_info_logger_calls(source, "many.py") == ["many.py:2", "many.py:4"]


# ===== A previously-broken path now logs correctly =====


class _BraceyError(Exception):
    """Stringifies like a `PostgrestAPIError`: a dict-shaped repr."""

    def __str__(self) -> str:
        return "{'code': 'P0409', 'message': 'conflict'}"


@pytest.fixture
def loguru_sink() -> list[str]:
    """Install a real sink; without one loguru never formats the message."""
    captured: list[str] = []
    handler_id = logger.add(
        captured.append,
        level="DEBUG",
        format="{level.name} | {message}",
        backtrace=False,
        diagnose=False,
        catch=False,
    )
    try:
        yield captured
    finally:
        logger.remove(handler_id)


def test_loguru_rejects_exc_info_on_bracey_message(loguru_sink: list[str]) -> None:
    """Pins the bug this contract exists to prevent.

    This is the shape every fixed call site used to have. It raises *instead
    of* logging, so the error the `except` block meant to record is lost.
    """
    with pytest.raises(KeyError, match="code"):
        try:
            raise _BraceyError()
        except _BraceyError as exc:
            # The one deliberate `exc_info` in the repo: it must stay here, in
            # a test, to pin the behaviour. The AST guard scans app/ and
            # packages/ only, so it does not flag this line.
            logger.error(f"boom: {exc}", exc_info=True)

    assert loguru_sink == []


async def test_handle_errors_logs_bracey_app_exception(
    loguru_sink: list[str],
) -> None:
    """`app.errors.handle_errors` is one of the 60 loguru sites fixed in #469.

    Its message interpolates `AppException.message`, which carries upstream
    Postgres/PostgREST text, so braces reach the logger in production.
    """
    from fastapi import HTTPException

    from app.errors import AppException, ErrorCode, handle_errors

    bracey_message = "{'code': 'P0409', 'message': 'conflict'}"

    @handle_errors
    async def failing_route() -> None:
        raise AppException(
            message=bracey_message,
            code=ErrorCode.INTERNAL_ERROR,
            status_code=409,
        )

    # The handler's own translation propagates; no KeyError from the logger.
    with pytest.raises(HTTPException) as exc_info:
        await failing_route()
    assert exc_info.value.status_code == 409

    assert len(loguru_sink) == 1
    record = loguru_sink[0]
    assert "ERROR | Application error in failing_route" in record
    assert bracey_message in record
    # loguru appends the captured traceback to the formatted message.
    assert "Traceback (most recent call last):" in record
    assert "AppException" in record


async def test_session_store_logs_bracey_redis_failure(loguru_sink: list[str]) -> None:
    """`SessionStore` was the one module logging through stdlib `logging`, so
    its `exc_info=True` was valid — but with no stdlib handler configured the
    warning reached no sink. On loguru with `opt(exception=True)` it lands in
    the same sinks as everything else, traceback included."""
    from app.core.session_store import SessionStore

    class _ExplodingRedis:
        async def get(self, key: str) -> None:
            raise _BraceyError()

    store = SessionStore()
    store._redis = _ExplodingRedis()

    assert await store.get("missing-session") is None

    assert len(loguru_sink) == 1
    record = loguru_sink[0]
    assert "WARNING | Redis get failed, trying fallback" in record
    assert "Traceback (most recent call last):" in record
    assert "_BraceyError" in record
