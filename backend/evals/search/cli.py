"""Shared CLI plumbing for the search-eval commands (no argparse/click).

Flags are read straight from ``argv`` as ``--name value`` or ``--name=value``,
the same convention as ``tests/e2e_live/__main__.py``.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Mapping

PRODUCTION_MARKERS = frozenset({"production", "prod"})


def flag(argv: list[str], name: str) -> str | None:
    """Return the value of ``--name value`` / ``--name=value``, else None."""
    for i, arg in enumerate(argv):
        if arg == name and i + 1 < len(argv):
            return argv[i + 1]
        if arg.startswith(f"{name}="):
            return arg.split("=", 1)[1]
    return None


def has_flag(argv: list[str], name: str) -> bool:
    return name in argv


def production_marker(env: Mapping[str, str] | None = None) -> str | None:
    """Name of the env var that marks this process as production, if any.

    The prod backend container runs with ``PYTHON_ENV=production``; the dev
    one with ``development``. ``ENVIRONMENT`` and ``APP_ENV`` are honoured too. The eval fires hundreds of searches (and, for the
    semantic modes, TEI embeddings), so it must never run inside prod.
    """
    env = os.environ if env is None else env
    for var in ("PYTHON_ENV", "ENVIRONMENT", "APP_ENV"):
        if env.get(var, "").strip().lower() in PRODUCTION_MARKERS:
            return var
    return None
