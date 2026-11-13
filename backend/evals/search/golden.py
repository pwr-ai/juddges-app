"""Golden-set format for the offline search evaluation (issue #831).

One JSON object per line in ``golden_set.jsonl``::

    {
      "qid": "pl-case-001",
      "query": "III Ca 1553/21",
      "jurisdiction": "PL",            # PL | UK — the corpus slice the query targets
      "language": "pl",                # pl | en — language the query is written in
      "category": "case_number",       # case_number | citation | topical
      "relevant": [
        {
          "id": "1d4a01ff-...",        # judgment id (optional if case_number given)
          "case_number": "III Ca 1553/21",
          "grade": 3,                  # 1 = topically relevant, 2 = cites it, 3 = it
          "source": "exact_case_number",
          "heuristic": false,
          "evidence": "case_number field equals the query"
        }
      ],
      "notes": "free text"
    }

A hit matches a label by ``id`` first, then by normalised ``case_number``. The
case-number fallback is what keeps the set usable on another environment whose
judgment ids differ (a local re-ingest) as long as the case numbers agree. Each
label is matched at most once, so two indexed copies of one judgment never
count twice.

``heuristic`` is false only where the label is true by construction (the query
*is* the judgment's case number). Everything else — a judgment that cites the
queried signature, a judgment carrying a topic tag — is a proxy for what a
lawyer would call relevant, and is marked ``heuristic: true`` so results can be
read with and without it.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping

GOLDEN_SET_PATH = Path(__file__).resolve().parent / "golden_set.jsonl"

JURISDICTIONS = frozenset({"PL", "UK"})
LANGUAGES = frozenset({"pl", "en"})
CATEGORIES = frozenset({"case_number", "citation", "topical"})
GRADES = frozenset({1, 2, 3})
LABEL_SOURCES = frozenset(
    {"exact_case_number", "cites_case_number", "keyword_tag", "extracted_keyword"}
)

_WS_RE = re.compile(r"\s+")


def normalize_case_number(value: str | None) -> str:
    """Case-insensitive, whitespace-collapsed form used to compare case numbers.

    ``"III  Ca 1553/21"`` and ``"iii ca 1553/21"`` compare equal; nothing else
    is rewritten, so ``[2019] EWCA Crim 952`` never matches ``[2015] EWCA Crim
    952``.
    """
    if not value:
        return ""
    return _WS_RE.sub(" ", value).strip().casefold()


@dataclass(frozen=True)
class RelevantDoc:
    grade: int
    source: str
    heuristic: bool
    id: str | None = None
    case_number: str | None = None
    evidence: str = ""


@dataclass(frozen=True)
class GoldenQuery:
    qid: str
    query: str
    jurisdiction: str
    language: str
    category: str
    relevant: tuple[RelevantDoc, ...]
    notes: str = ""

    @property
    def grades(self) -> list[int]:
        return [r.grade for r in self.relevant]

    def without_heuristic(self) -> GoldenQuery:
        """Same query keeping only labels that are true by construction."""
        return GoldenQuery(
            qid=self.qid,
            query=self.query,
            jurisdiction=self.jurisdiction,
            language=self.language,
            category=self.category,
            relevant=tuple(r for r in self.relevant if not r.heuristic),
            notes=self.notes,
        )


class GoldenSetError(ValueError):
    """Raised when a golden-set line is malformed."""


def _require(cond: bool, where: str, msg: str) -> None:
    if not cond:
        raise GoldenSetError(f"{where}: {msg}")


def parse_query(obj: Mapping[str, Any], where: str = "query") -> GoldenQuery:
    """Validate one golden-set record and return it as a :class:`GoldenQuery`."""
    for key in ("qid", "query", "jurisdiction", "language", "category", "relevant"):
        _require(key in obj, where, f"missing {key!r}")
    where = f"{where} ({obj['qid']})"
    _require(
        isinstance(obj["query"], str) and obj["query"].strip() != "",
        where,
        "query must be a non-empty string",
    )
    _require(
        obj["jurisdiction"] in JURISDICTIONS,
        where,
        f"bad jurisdiction {obj['jurisdiction']!r}",
    )
    _require(obj["language"] in LANGUAGES, where, f"bad language {obj['language']!r}")
    _require(obj["category"] in CATEGORIES, where, f"bad category {obj['category']!r}")
    _require(
        isinstance(obj["relevant"], list) and obj["relevant"],
        where,
        "relevant must be a non-empty list",
    )

    docs: list[RelevantDoc] = []
    for i, rel in enumerate(obj["relevant"]):
        rwhere = f"{where} relevant[{i}]"
        _require(
            bool(rel.get("id") or rel.get("case_number")),
            rwhere,
            "needs an id or a case_number",
        )
        _require(
            rel.get("grade") in GRADES, rwhere, f"grade must be one of {sorted(GRADES)}"
        )
        _require(
            rel.get("source") in LABEL_SOURCES,
            rwhere,
            f"bad source {rel.get('source')!r}",
        )
        _require(
            isinstance(rel.get("heuristic"), bool), rwhere, "heuristic must be a bool"
        )
        _require(
            rel["heuristic"] or rel["source"] == "exact_case_number",
            rwhere,
            "only exact_case_number labels may be non-heuristic",
        )
        docs.append(
            RelevantDoc(
                grade=rel["grade"],
                source=rel["source"],
                heuristic=rel["heuristic"],
                id=rel.get("id"),
                case_number=rel.get("case_number"),
                evidence=rel.get("evidence", ""),
            )
        )
    return GoldenQuery(
        qid=obj["qid"],
        query=obj["query"],
        jurisdiction=obj["jurisdiction"],
        language=obj["language"],
        category=obj["category"],
        relevant=tuple(docs),
        notes=obj.get("notes", ""),
    )


def load_golden_set(path: Path = GOLDEN_SET_PATH) -> list[GoldenQuery]:
    """Load and validate a JSONL golden set; blank lines are skipped."""
    queries: list[GoldenQuery] = []
    seen: set[str] = set()
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        where = f"{path.name}:{lineno}"
        try:
            obj = json.loads(line)
        except json.JSONDecodeError as exc:
            raise GoldenSetError(f"{where}: invalid JSON ({exc})") from exc
        query = parse_query(obj, where)
        _require(query.qid not in seen, where, f"duplicate qid {query.qid!r}")
        seen.add(query.qid)
        queries.append(query)
    return queries


@dataclass
class _LabelIndex:
    by_id: dict[str, list[int]] = field(default_factory=dict)
    by_case: dict[str, list[int]] = field(default_factory=dict)


def grade_hits(
    hits: Iterable[Mapping[str, Any]],
    query: GoldenQuery,
    *,
    match_case_number: bool = True,
) -> list[int]:
    """Grade each retrieved hit (in rank order) against the query's labels.

    A hit takes the grade of the first unused label whose ``id`` equals the
    hit's ``id``; failing that (and unless ``match_case_number`` is off), the
    first unused label whose case number equals the hit's. Unmatched hits
    grade 0.

    Polish signatures are only unique per court (``II AKa 144/22`` exists at
    several appeal courts), so the case-number fallback can credit a
    same-signature judgment from another court. Pass
    ``match_case_number=False`` on the environment the set was built from to
    rule that out.
    """
    index = _LabelIndex()
    for i, rel in enumerate(query.relevant):
        if rel.id:
            index.by_id.setdefault(rel.id, []).append(i)
        if rel.case_number:
            index.by_case.setdefault(normalize_case_number(rel.case_number), []).append(
                i
            )

    used: set[int] = set()
    grades: list[int] = []
    for hit in hits:
        candidates = list(index.by_id.get(str(hit.get("id") or ""), []))
        if match_case_number:
            candidates += index.by_case.get(
                normalize_case_number(hit.get("case_number")), []
            )
        match = next((i for i in candidates if i not in used), None)
        if match is None:
            grades.append(0)
        else:
            used.add(match)
            grades.append(query.relevant[match].grade)
    return grades
