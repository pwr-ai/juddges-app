"""`auth_tiers.py` must not describe routers that no longer exist (#489).

That module showed 0% coverage, but chasing the percentage would be ceremony: it
contains a docstring, four re-exports and five string constants — no behaviour to
cover, and nothing in the codebase imports it.

The risk it actually carries is drift. Its docstring is the single place a reader
looks to answer "what authentication does this router require", and being prose it
cannot go stale loudly. It already did: removing eight routers in #476 required
hand-pruning this file, and nothing would have caught the omission.

So this asserts the one direction that is unambiguous — every router the docstring
names must still be registered in `app/server.py`. A wrong auth tier is a security
bug rather than a documentation bug, which is why prose describing tiers deserves
a check at all.

Deliberately not asserted: that every registered router appears in the docstring.
The quick reference groups by tier and legitimately summarises, so requiring
completeness would fail on prose choices rather than on drift.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[2]
AUTH_TIERS = BACKEND_ROOT / "app" / "core" / "auth_tiers.py"
SERVER = BACKEND_ROOT / "app" / "server.py"

_ROUTER_TOKEN = re.compile(r"\b([a-z][a-z0-9_]*_router)\b")

# Names that appear in the docstring but are not router variables in server.py.
KNOWN_NON_VARIABLES = {
    # LangServe mounts these by path, not through a router variable.
    "qa_router",
    "chat_router",
}


def _docstring_routers() -> set[str]:
    """Router names mentioned in the module docstring."""
    source = AUTH_TIERS.read_text()
    # The docstring is the first triple-quoted block in the file.
    match = re.search(r'"""(.*?)"""', source, re.DOTALL)
    assert match, "auth_tiers.py has no module docstring to check"
    return set(_ROUTER_TOKEN.findall(match.group(1))) - KNOWN_NON_VARIABLES


def _server_routers() -> set[str]:
    """Router variables that `server.py` actually imports."""
    return set(_ROUTER_TOKEN.findall(SERVER.read_text()))


@pytest.mark.unit
def test_the_extraction_found_something() -> None:
    """Guard the guard: a regex that matches nothing makes the check vacuous."""
    documented = _docstring_routers()
    registered = _server_routers()
    assert len(documented) >= 10, f"only found {len(documented)} documented routers"
    assert len(registered) >= 20, f"only found {len(registered)} routers in server.py"


@pytest.mark.unit
def test_the_tier_re_exports_still_resolve_to_their_sources() -> None:
    """The four re-exported dependencies must be the real ones.

    `auth_tiers` exists so a new router can write `Depends(require_user)` without
    knowing where that lives. Nothing currently imports it, so if
    `app.auth.verify_api_key` or `app.core.auth_jwt.require_admin` were renamed,
    the re-export would break and no test would notice — the module would sit
    there advertising an auth dependency that cannot be imported.

    Asserting identity rather than mere importability: a re-export that resolves
    to a different object than the source is worse than a broken one, because it
    would silently apply the wrong tier.
    """
    from app import auth as auth_module
    from app.core import auth_jwt, auth_tiers

    assert auth_tiers.require_api_key is auth_module.verify_api_key
    assert auth_tiers.require_user is auth_jwt.get_current_user
    assert auth_tiers.optional_user is auth_jwt.get_optional_user
    assert auth_tiers.require_admin is auth_jwt.require_admin

    # The tier labels are documentation anchors; a typo'd constant is a silently
    # mislabelled router.
    assert auth_tiers.AUTH_TIER_PUBLIC == "PUBLIC"
    assert auth_tiers.AUTH_TIER_API_KEY == "API_KEY"
    assert auth_tiers.AUTH_TIER_USER == "USER"
    assert auth_tiers.AUTH_TIER_ADMIN == "ADMIN"
    assert auth_tiers.AUTH_TIER_MIXED == "MIXED"


@pytest.mark.unit
def test_auth_tiers_does_not_document_routers_that_no_longer_exist() -> None:
    """Catches the drift that #476 had to fix by hand."""
    stale = sorted(_docstring_routers() - _server_routers())
    assert not stale, (
        "app/core/auth_tiers.py documents routers that app/server.py no longer "
        f"registers: {stale}. Its docstring is where a reader checks which "
        "authentication a router requires, so a stale entry is misleading about "
        "auth. Remove them, or add them to KNOWN_NON_VARIABLES if they are "
        "mounted by path rather than as a router variable."
    )
