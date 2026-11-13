"""Derive the seed golden set from a (non-production) judgments index (issue #831).

Every label comes from a signal that can be re-checked against the corpus:

* ``case_number`` queries -- the query *is* a judgment's case number. Every
  indexed judgment whose ``case_number`` equals it is relevant at grade 3,
  true by construction (``heuristic: false``). Every other judgment whose
  ``full_text`` cites that case number is grade 2, ``heuristic: true``: citing
  a case is evidence of overlap, not proof a lawyer wants it.
* ``citation`` queries -- the query is a signature/neutral citation found in
  the opening of a sampled judgment (its ``title``/``summary``, i.e. the
  heading that names the decision under appeal or the judgments relied on).
  Labels as above: grade 3 for the judgment carrying it, if indexed, and grade
  2 for every judgment whose ``full_text`` cites it.

``full_text`` is searchable but not retrievable in the index, so "cites" is
established with a Meilisearch phrase search restricted to ``full_text``
(``attributesToSearchOn``): every token of the signature, adjacent and in
order. That makes these labels lean on the keyword engine's tokeniser; they
measure "find the judgments that cite X", which keyword search should win.
* ``topical`` queries -- a hand-written paraphrase of a topic, labelled with
  every judgment carrying the matching tag: SAOS editorial ``keywords`` for PL,
  LLM-extracted ``base_keywords`` for UK. Grade 1, ``heuristic: true``. The
  paraphrases avoid the tag's own words where Polish/English allow, so the
  labels do not simply reward keyword matching on the tag.

The output is a frozen artefact: regenerating against a different corpus
snapshot changes which judgments are sampled. Commit a regenerated set as a new
baseline, never mix numbers from two versions of it.

Usage (from ``backend/``, in the dev backend container)::

    python -m evals.search.build_golden [--out PATH] [--per-jurisdiction 8]
        [--citations 5]
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any

from rich.console import Console

from evals.search.cli import flag, has_flag, production_marker
from evals.search.golden import GOLDEN_SET_PATH, normalize_case_number, parse_query

if TYPE_CHECKING:
    from collections.abc import Iterable

    from app.services.search import MeiliSearchService

# Same shapes as app/judgments_pkg/query_attribute_parser.py.
PL_CASE_RE = re.compile(r"\b([IVXLCDM]{1,4})\s+([A-Z][A-Za-z]{0,3})\s+(\d+/\d{2,4})\b")
UK_CITATION_RE = re.compile(
    r"\[\d{4}\]\s+(?:UKSC|UKHL|EWCA|EWHC|EWFC|EWCOP)(?:\s+[A-Za-z]+)?\s+\d+"
)

# Case numbers quoted in issues #798 (hybrid acceptance criterion) and #799,
# pinned so the set always covers them.
PINNED_CASE_NUMBERS: tuple[tuple[str, str], ...] = (
    ("PL", "III Ca 1553/21"),
    ("UK", "[2019] EWCA Crim 952"),
    ("UK", "[2013] EWCA Crim 2410"),
)

# Leading authorities cited across the UK corpus. The labels depend only on the
# citation string appearing in a judgment's text (checked against the index at
# build time); the case names are for the reader.
PINNED_CITATIONS: tuple[tuple[str, str], ...] = (
    ("UK", "[2016] UKSC 8"),  # R v Jogee (joint enterprise)
    ("UK", "[2005] EWCA Crim 824"),  # R v Hanson (bad character)
    ("UK", "[2005] EWCA Crim 2864"),  # R v Lang (dangerousness)
    ("UK", "[2012] UKSC 51"),  # R v Waya (confiscation)
    ("UK", "[2017] UKSC 67"),  # Ivey v Genting (dishonesty)
    ("UK", "[2020] EWCA Crim 575"),  # R v Barton and Booth (dishonesty)
)

# Decision years to stratify the case-number sample over; the first matching
# judgments of each year are taken, so the sample is spread over the corpus
# rather than bunched at the front of the index.
SAMPLE_YEARS: dict[str, tuple[int, ...]] = {
    "PL": (2009, 2011, 2012, 2014, 2016, 2018, 2020, 2022),
    "UK": (2004, 2008, 2011, 2013, 2015, 2018, 2021, 2024),
}

# (jurisdiction, language, filter field, tag value, query, label source)
TOPICAL_SPECS: tuple[tuple[str, str, str, str, str, str], ...] = (
    (
        "PL",
        "pl",
        "keywords",
        "Obrona Konieczna",
        "odpieranie bezpośredniego bezprawnego zamachu na dobro chronione prawem",
        "keyword_tag",
    ),
    (
        "PL",
        "pl",
        "keywords",
        "Warunkowe Przedterminowe Zwolnienie",
        "zwolnienie skazanego z odbywania reszty kary pozbawienia wolności przed terminem",
        "keyword_tag",
    ),
    (
        "PL",
        "pl",
        "keywords",
        "Nadzwyczajne Złagodzenie Kary",
        "wymierzenie kary poniżej dolnej granicy ustawowego zagrożenia",
        "keyword_tag",
    ),
    (
        "PL",
        "pl",
        "keywords",
        "Opinia Biegłego",
        "ocena wiarygodności ekspertyzy sporządzonej przez specjalistę powołanego przez sąd",
        "keyword_tag",
    ),
    (
        "PL",
        "pl",
        "keywords",
        "Przedawnienie roszczeń",
        "upływ terminu do dochodzenia roszczenia majątkowego przed sądem",
        "keyword_tag",
    ),
    (
        "UK",
        "en",
        "base_keywords",
        "self-defence",
        "defendant used reasonable force to protect himself from an attack",
        "extracted_keyword",
    ),
    (
        "UK",
        "en",
        "base_keywords",
        "dangerous driving",
        "death caused by a motorist driving at excessive speed",
        "extracted_keyword",
    ),
    (
        "UK",
        "en",
        "base_keywords",
        "confiscation order",
        "benefit figure and recoverable amount under the proceeds of crime regime",
        "extracted_keyword",
    ),
    (
        "UK",
        "en",
        "base_keywords",
        "joint enterprise",
        "secondary party liability for a killing carried out by a co-accused",
        "extracted_keyword",
    ),
    (
        "UK",
        "en",
        "base_keywords",
        "burglary",
        "sentencing burglary dwelling",
        "extracted_keyword",
    ),
)

# Meilisearch's default pagination.maxTotalHits; nothing past it is reachable.
MAX_HITS = 1000
LANGUAGE = {"PL": "pl", "UK": "en"}


def _quote(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def _phrase(value: str) -> str:
    # Meilisearch phrase search: every token, adjacent, in order.
    return '"' + value.replace('"', "") + '"'


_UK_KEY_RE = re.compile(r"\[(\d{4})\]\s*([A-Za-z]+)\D*?(\d+)")


def signature_key(signature: str | None) -> str:
    """Identity of a signature for "is this the judgment's own one?" checks.

    UK neutral citations come in several spellings for one judgment --
    ``[2018] EWCA Crim 2154``, ``[2018] EWCA 2154 (Crim)`` -- so they reduce to
    year + court + number. Polish signatures only need whitespace/case folding.
    """
    norm = normalize_case_number(signature)
    m = _UK_KEY_RE.match(norm)
    return f"{m.group(1)}|{m.group(2)}|{m.group(3)}" if m else norm


def cited_signatures(text: str | None, jurisdiction: str, own: str | None) -> list[str]:
    """Signatures cited in ``text`` (first-seen order), excluding the judgment's own."""
    if not text:
        return []
    pattern = PL_CASE_RE if jurisdiction == "PL" else UK_CITATION_RE
    own_key = signature_key(own)
    seen: dict[str, str] = {}
    for match in pattern.finditer(text):
        sig = re.sub(r"\s+", " ", match.group(0)).strip()
        key = signature_key(sig)
        if key != own_key and key not in seen:
            seen[key] = sig
    return list(seen.values())


async def _search(service: MeiliSearchService, **kwargs: Any) -> list[dict[str, Any]]:
    result = await service.search(**kwargs)
    return list(result.get("hits", []))


def _jurisdiction_filter(jurisdiction: str) -> str:
    return f"jurisdiction = {_quote(jurisdiction)}"


async def docs_with_case_number(
    service: MeiliSearchService, case_number: str, jurisdiction: str
) -> list[dict[str, Any]]:
    """Every indexed judgment whose ``case_number`` equals ``case_number``."""
    hits = await _search(
        service,
        query=_phrase(case_number),
        limit=50,
        filters=_jurisdiction_filter(jurisdiction),
    )
    key = signature_key(case_number)
    return [h for h in hits if signature_key(h.get("case_number")) == key]


async def docs_citing(
    service: MeiliSearchService, signature: str, jurisdiction: str
) -> list[dict[str, Any]]:
    """Judgments (other than the one carrying ``signature``) whose text cites it."""
    # search()/documents_search() never set attributesToSearchOn, so this one
    # call goes through the raw POST helper; tooling only, never a request path.
    raw = await service._search_post(
        {
            "q": _phrase(signature),
            "limit": 100,
            "filter": _jurisdiction_filter(jurisdiction),
            "attributesToSearchOn": ["full_text"],
            "attributesToRetrieve": ["id", "case_number"],
        }
    )
    key = signature_key(signature)
    return [
        h for h in raw.get("hits", []) if signature_key(h.get("case_number")) != key
    ]


def _label(
    doc: dict[str, Any], grade: int, source: str, evidence: str
) -> dict[str, Any]:
    return {
        "id": doc.get("id"),
        "case_number": doc.get("case_number"),
        "grade": grade,
        "source": source,
        "heuristic": source != "exact_case_number",
        "evidence": evidence,
    }


def _signature_labels(
    signature: str, target: list[dict[str, Any]], citing: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    return [
        _label(d, 3, "exact_case_number", "case_number field equals the query")
        for d in target
    ] + [
        _label(d, 2, "cites_case_number", f"full_text phrase-matches {signature!r}")
        for d in citing
    ]


async def case_number_query(
    service: MeiliSearchService,
    qid: str,
    jurisdiction: str,
    case_number: str,
    note: str,
) -> dict[str, Any] | None:
    target = await docs_with_case_number(service, case_number, jurisdiction)
    if not target:
        return None
    citing = await docs_citing(service, case_number, jurisdiction)
    return {
        "qid": qid,
        "query": case_number,
        "jurisdiction": jurisdiction,
        "language": LANGUAGE[jurisdiction],
        "category": "case_number",
        "relevant": _signature_labels(case_number, target, citing),
        "notes": f"{note}; cited by {len(citing)} other judgment(s)",
    }


async def sample_docs(
    service: MeiliSearchService, jurisdiction: str, per_year: int = 1, skip: int = 2
) -> list[dict[str, Any]]:
    docs: list[dict[str, Any]] = []
    for year in SAMPLE_YEARS[jurisdiction]:
        docs += await _search(
            service,
            query="",
            limit=per_year,
            offset=skip,
            filters=(
                f"{_jurisdiction_filter(jurisdiction)} AND "
                f'decision_date >= "{year}-01-01" AND decision_date < "{year + 1}-01-01"'
            ),
        )
    return docs


def opening_citations(
    sources: Iterable[dict[str, Any]], jurisdiction: str
) -> Iterable[tuple[str, str]]:
    """``(signature, note)`` for signatures cited in each source's opening."""
    for src in sources:
        opening = f"{src.get('title') or ''} {src.get('summary') or ''}"
        for sig in cited_signatures(opening, jurisdiction, src.get("case_number")):
            yield sig, f"found in the opening of {src.get('case_number')}"


async def citation_queries(
    service: MeiliSearchService,
    jurisdiction: str,
    wanted: int,
    candidates: Iterable[tuple[str, str]],
    exclude: set[str],
    max_citing: int = 30,
) -> list[dict[str, Any]]:
    """Up to ``wanted`` citation queries, the first candidates that qualify.

    A candidate qualifies when 2..``max_citing`` other judgments cite it: one
    citing judgment is just the source, and a signature cited everywhere is
    boilerplate rather than a research target.
    """
    out: list[dict[str, Any]] = []
    used = set(exclude)
    for sig, note in candidates:
        if len(out) >= wanted:
            break
        if signature_key(sig) in used:
            continue
        used.add(signature_key(sig))
        citing = await docs_citing(service, sig, jurisdiction)
        if not 2 <= len(citing) <= max_citing:
            continue
        target = await docs_with_case_number(service, sig, jurisdiction)
        out.append(
            {
                "qid": "",  # numbered by build()
                "query": sig,
                "jurisdiction": jurisdiction,
                "language": LANGUAGE[jurisdiction],
                "category": "citation",
                "relevant": _signature_labels(sig, target, citing),
                "notes": (
                    f"{note}; {len(target)} judgment(s) with this case number "
                    f"indexed, cited by {len(citing)}"
                ),
            }
        )
    return out


async def topical_queries(service: MeiliSearchService) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    counters: dict[str, int] = {}
    for jurisdiction, language, field_name, tag, query, source in TOPICAL_SPECS:
        docs = await _search(
            service,
            query="",
            limit=MAX_HITS,
            filters=(
                f"jurisdiction = {_quote(jurisdiction)} AND {field_name} = {_quote(tag)}"
            ),
        )
        if not docs:
            continue
        counters[jurisdiction] = counters.get(jurisdiction, 0) + 1
        out.append(
            {
                "qid": f"{jurisdiction.lower()}-topic-{counters[jurisdiction]:03d}",
                "query": query,
                "jurisdiction": jurisdiction,
                "language": language,
                "category": "topical",
                "relevant": [
                    _label(d, 1, source, f"{field_name} contains {tag!r}") for d in docs
                ],
                "notes": f"paraphrase of the {field_name} tag {tag!r}",
            }
        )
    return out


async def build(
    service: MeiliSearchService, per_jurisdiction: int, citations: int
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for jurisdiction in ("PL", "UK"):
        n = 0
        for pinned_jur, case_number in PINNED_CASE_NUMBERS:
            if pinned_jur != jurisdiction:
                continue
            rec = await case_number_query(
                service,
                f"{jurisdiction.lower()}-case-{n + 1:03d}",
                jurisdiction,
                case_number,
                "pinned: quoted in issue #798/#799",
            )
            if rec:
                records.append(rec)
                n += 1
        sampled = await sample_docs(service, jurisdiction)
        for doc in sampled:
            if n >= per_jurisdiction:
                break
            case_number = (doc.get("case_number") or "").strip()
            if not case_number or any(
                signature_key(case_number) == signature_key(r["query"]) for r in records
            ):
                continue
            rec = await case_number_query(
                service,
                f"{jurisdiction.lower()}-case-{n + 1:03d}",
                jurisdiction,
                case_number,
                f"sampled: decision_date {doc.get('decision_date')}",
            )
            if rec:
                records.append(rec)
                n += 1
        pinned = [
            (sig, "pinned: leading authority")
            for jur, sig in PINNED_CITATIONS
            if jur == jurisdiction
        ]
        cites = await citation_queries(
            service,
            jurisdiction,
            len(pinned),
            pinned,
            exclude={signature_key(r["query"]) for r in records},
            max_citing=100,
        )
        cites += await citation_queries(
            service,
            jurisdiction,
            citations,
            opening_citations(
                await sample_docs(service, jurisdiction, per_year=25, skip=0),
                jurisdiction,
            ),
            exclude={signature_key(r["query"]) for r in records + cites},
        )
        for i, rec in enumerate(cites, 1):
            rec["qid"] = f"{jurisdiction.lower()}-cite-{i:03d}"
        records += cites
    records += await topical_queries(service)
    return records


async def _run(argv: list[str], console: Console) -> int:
    from app.services.search import MeiliSearchService

    out = Path(flag(argv, "--out") or GOLDEN_SET_PATH)
    per_jurisdiction = int(flag(argv, "--per-jurisdiction") or "8")
    citations = int(flag(argv, "--citations") or "5")

    service = MeiliSearchService.from_env()
    if not service.configured:
        console.print("[bold red]Meilisearch is not configured.[/]")
        return 2
    # Topical labels pull up to MAX_HITS full documents in one request; the
    # backend's 5 s default is sized for interactive search, not this.
    service.timeout_seconds = max(service.timeout_seconds, 120.0)
    try:
        records = await build(service, per_jurisdiction, citations)
    finally:
        await service.aclose()

    for i, rec in enumerate(records):
        parse_query(rec, f"record {i}")  # never write a set the loader rejects
    out.write_text(
        "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records),
        encoding="utf-8",
    )
    by_cat: dict[str, int] = {}
    for rec in records:
        by_cat[rec["category"]] = by_cat.get(rec["category"], 0) + 1
    console.print(f"Wrote {len(records)} queries to {out}: {by_cat}")
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    console = Console()
    if has_flag(argv, "--help") or has_flag(argv, "-h"):
        console.print(__doc__ or "")
        return 0
    marker = production_marker()
    if marker:
        console.print(
            f"[bold red]Refusing to run:[/] {marker} marks this as production."
        )
        return 2
    return asyncio.run(_run(argv, console))


if __name__ == "__main__":
    sys.exit(main())
