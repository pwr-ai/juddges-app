"""Derive ``case_type`` / ``court_level`` for UK judgments (issue #799).

The source dataset's ``court_type`` never contains "crim", so deriving the
labels from it tagged every Court of Appeal (Criminal Division) judgment as
Civil. The neutral citation is authoritative, so it is parsed first and the
legacy ``court_type`` heuristic is only a fallback.

Pure and dependency-free so that ``scripts/`` can load it by file path.
"""

from __future__ import annotations

import re

APPEAL_COURT_LEVEL = "Court of Appeal"  # same value the PL appeal courts use
HIGH_COURT_LEVEL = "High Court"

# `[2013] EWCA Crim 2410` and the odd `[2017] EWCA 967 (Crim)` form.
_EWCA_RE = re.compile(
    r"EWCA\s*(?:(?P<pre>Crim|Civ)\b|\d+\s*\((?P<post>Crim|Civ)\))", re.IGNORECASE
)
_EWHC_RE = re.compile(r"EWHC\b(?:\s*\d+)?(?:\s*\((?P<div>[A-Za-z]+)\))?", re.IGNORECASE)


def classify_uk_citation(text: str | None) -> tuple[str, str] | None:
    """Return ``(case_type, court_level)`` from a neutral citation, or None."""
    if not text:
        return None
    m = _EWCA_RE.search(text)
    if m:
        division = (m.group("pre") or m.group("post")).lower()
        case_type = "Criminal" if division == "crim" else "Civil"
        return case_type, APPEAL_COURT_LEVEL
    m = _EWHC_RE.search(text)
    if m:
        division = (m.group("div") or "").lower()
        case_type = "Administrative" if division == "admin" else "Civil"
        return case_type, HIGH_COURT_LEVEL
    return None


def classify_uk_judgment(
    case_number: str | None, court_type: str | None = None
) -> tuple[str, str]:
    """Citation-first ``(case_type, court_level)``; legacy heuristic as fallback."""
    derived = classify_uk_citation(case_number)
    if derived:
        return derived
    ct = (court_type or "").lower()
    court_level = (
        HIGH_COURT_LEVEL
        if "high" in ct
        else "Crown Court"
        if "crown" in ct
        else "Court"
    )
    return ("Criminal" if "crim" in ct else "Civil"), court_level
