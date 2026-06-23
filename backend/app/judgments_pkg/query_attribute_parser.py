"""Query-time attribute parser for the general ``/search`` path (issue #192).

Turns a free-text query such as ``"wyrok SN 2023 III CSK 245/22 rozwód"`` into
structured attributes (court, year/date-range, case number, judge,
jurisdiction) plus the unparsed *remainder* that downstream becomes the
full-text query.

Design constraints:

* **Deterministic heuristics only.** Regex + small lexicons. No LLM here — the
  LLM fallback mentioned in the issue is explicitly out of scope until the
  heuristics prove insufficient. This keeps the parser cheap (issue acceptance:
  "parser must be cheap when it doesn't match").
* **Base-search invariance.** A query with no recognised tokens parses to an
  empty :class:`ParsedQuery` whose ``remainder`` equals the input verbatim, so
  the router can fall through to byte-identical base-search behaviour.
* **Filterable vs searchable split.** Only ``jurisdiction`` and
  ``decision_date`` are *filterable* in the Meili index, so only those become
  filter clauses (:func:`build_meili_filter`). Court / case number / judge are
  *searchable* — they are surfaced via :meth:`ParsedQuery.fts_terms` so the
  router can append them to the FTS query and preserve recall.

The parser is pure and side-effect free; the router owns wiring it into the
request path.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# ── court lexicon ─────────────────────────────────────────────────────────
#
# Maps a recognised court abbreviation to its jurisdiction. Order matters only
# for the regex alternation: longer tokens first so e.g. ``UKSC`` wins before a
# hypothetical shorter prefix. Polish lower-court codes (SO/SR) are included as
# the issue lists them.

_PL_COURTS = ("SN", "NSA", "TK", "SO", "SR")
_UK_COURTS = ("UKSC", "EWCA", "EWHC")

_COURT_JURISDICTION: dict[str, str] = {
    **dict.fromkeys(_PL_COURTS, "pl"),
    **dict.fromkeys(_UK_COURTS, "uk"),
}

# Longest-first so multi-char UK codes match before any overlap.
_COURT_TOKENS = sorted(_COURT_JURISDICTION, key=len, reverse=True)
_COURT_RE = re.compile(
    r"\b(" + "|".join(re.escape(t) for t in _COURT_TOKENS) + r")\b",
    re.IGNORECASE,
)

# ── jurisdiction lexicon ──────────────────────────────────────────────────
#
# Explicit ``jurisdiction:pl`` / standalone ``pl`` / ``uk`` tokens. Kept narrow
# to avoid hijacking ordinary words.

_JURISDICTION_RE = re.compile(
    r"\b(?:jurisdiction\s*[:=]\s*)?(pl|uk|poland|polska|united\s+kingdom)\b",
    re.IGNORECASE,
)

_JURISDICTION_NORMALISE = {
    "pl": "pl",
    "poland": "pl",
    "polska": "pl",
    "uk": "uk",
    "united kingdom": "uk",
}

# ── date / year ───────────────────────────────────────────────────────────
#
# Plausible decision years; bounded so stray 4-digit numbers (case fragments,
# page counts) are not mistaken for years.
_YEAR_MIN = 1900
_YEAR_MAX = 2099

# "2020-2023" or "2020 - 2023"
_YEAR_RANGE_RE = re.compile(r"\b(19\d{2}|20\d{2})\s*-\s*(19\d{2}|20\d{2})\b")
# Polish "od 2021 do 2023"
_YEAR_RANGE_PL_RE = re.compile(
    r"\bod\s+(19\d{2}|20\d{2})\s+do\s+(19\d{2}|20\d{2})\b",
    re.IGNORECASE,
)
# Single 4-digit year as its own token.
_YEAR_RE = re.compile(r"\b(19\d{2}|20\d{2})\b")

# ── case number ───────────────────────────────────────────────────────────
#
# UK neutral citation, e.g. ``[2023] EWCA Civ 1234`` / ``[2021] UKSC 5``.
_UK_CITATION_RE = re.compile(
    r"\[\d{4}\]\s+(?:UKSC|UKHL|EWCA|EWHC|EWFC|EWCOP)"
    r"(?:\s+[A-Za-z]+)?\s+\d+",
)

# Polish docket, e.g. ``III CSK 245/22``: a roman-numeral chamber, a 1-4 letter
# division code, then ``number/year``.
_PL_CASE_RE = re.compile(r"\b([IVXLCDM]{1,4})\s+([A-Z]{1,4})\s+(\d+/\d{2,4})\b")
# Polish docket *prefix* only (chamber + division, no number/year yet).
_PL_CASE_PREFIX_RE = re.compile(r"\b([IVXLCDM]{1,4})\s+([A-Z]{2,4})\b")

# ── judge ─────────────────────────────────────────────────────────────────
#
# Only extract a judge when an explicit cue word precedes a capitalised name —
# never guess a name out of arbitrary free text (issue: "when unambiguous").
# A name is 1-3 capitalised words; UK honorifics (Lord/Lady/Justice/Mr/Mrs) are
# treated as part of the name.
_JUDGE_RE = re.compile(
    r"\b(?:sędzia|sędziego|sędzią|przewodnicząc[ya]|"
    r"before|judge|justice|hon(?:ourable)?)\s+"
    r"((?:Lord|Lady|Justice|Mr|Mrs|Ms|Sir|Dame)?\s*"
    r"[A-ZŁŚŻŹĆŃÓĄĘ][\wł]+(?:\s+[A-ZŁŚŻŹĆŃÓĄĘ][\wł]+){0,2})",
)


@dataclass
class ParsedQuery:
    """Structured result of parsing a free-text search query.

    ``remainder`` is the text left after structural tokens are stripped — it is
    what should be sent to the full-text engine. For a query with no recognised
    tokens, ``remainder`` equals the original (trimmed) input and
    :meth:`has_attributes` is ``False``.
    """

    remainder: str = ""
    court: str | None = None
    jurisdiction: str | None = None
    year: int | None = None
    date_from: str | None = None  # ISO date (inclusive lower bound)
    date_to: str | None = None  # ISO date (inclusive upper bound)
    case_number: str | None = None
    case_number_prefix: str | None = None
    judge: str | None = None
    # Spans (start, end) into the original query that were consumed by a parsed
    # attribute — used internally to build the remainder. Not part of the API.
    _consumed: list[tuple[int, int]] = field(default_factory=list, repr=False)

    def has_attributes(self) -> bool:
        """True when at least one structured attribute was extracted."""
        return any(
            v is not None
            for v in (
                self.court,
                self.jurisdiction,
                self.year,
                self.date_from,
                self.date_to,
                self.case_number,
                self.case_number_prefix,
                self.judge,
            )
        )

    def fts_terms(self) -> list[str]:
        """Searchable-but-not-filterable attributes, for appending to the FTS
        query so recall on ``court_name`` / ``case_number`` / ``judges_flat``
        is preserved even though they aren't filterable in the Meili index.
        """
        terms: list[str] = []
        if self.court:
            terms.append(self.court)
        if self.case_number:
            terms.append(self.case_number)
        elif self.case_number_prefix:
            terms.append(self.case_number_prefix)
        if self.judge:
            terms.append(self.judge)
        return terms


def _year_to_range(year: int) -> tuple[str, str]:
    """Expand a single year into an inclusive ISO date range."""
    return f"{year}-01-01", f"{year}-12-31"


def parse_query_attributes(query: str) -> ParsedQuery:
    """Parse a free-text query into structured attributes + FTS remainder.

    The implementation is order-sensitive: more specific patterns (UK
    citations, Polish dockets, year ranges) are consumed before greedier ones
    (single years, court tokens, bare jurisdiction words) so the same characters
    aren't double-counted.
    """
    original = (query or "").strip()
    if not original:
        return ParsedQuery(remainder="")

    parsed = ParsedQuery()
    text = original

    def consume(match: re.Match[str]) -> None:
        parsed._consumed.append((match.start(), match.end()))

    # 1. UK neutral citation (most specific). Captures the year implicitly so we
    #    do not also treat the bracketed year as a free-standing year token.
    m = _UK_CITATION_RE.search(text)
    if m:
        parsed.case_number = re.sub(r"\s+", " ", m.group(0)).strip()
        consume(m)

    # 2. Polish full docket → case_number; else docket prefix → prefix.
    if parsed.case_number is None:
        m = _PL_CASE_RE.search(text)
        if m:
            parsed.case_number = re.sub(r"\s+", " ", m.group(0)).strip()
            consume(m)
        else:
            m = _PL_CASE_PREFIX_RE.search(text)
            if m:
                parsed.case_number_prefix = re.sub(r"\s+", " ", m.group(0)).strip()
                consume(m)

    # 3. Date ranges before single year.
    range_found = False
    for pattern in (_YEAR_RANGE_PL_RE, _YEAR_RANGE_RE):
        m = pattern.search(text)
        if m:
            y1, y2 = int(m.group(1)), int(m.group(2))
            lo, hi = sorted((y1, y2))
            parsed.date_from = f"{lo}-01-01"
            parsed.date_to = f"{hi}-12-31"
            consume(m)
            range_found = True
            break

    # 4. Single year (only if no range and the year isn't inside a consumed
    #    span such as a UK citation's bracketed year).
    if not range_found:
        for m in _YEAR_RE.finditer(text):
            if _within_consumed(m.start(), parsed._consumed):
                continue
            year = int(m.group(1))
            if _YEAR_MIN <= year <= _YEAR_MAX:
                parsed.year = year
                consume(m)
            break

    # 5. Judge (explicit cue word required).
    m = _JUDGE_RE.search(text)
    if m:
        parsed.judge = re.sub(r"\s+", " ", m.group(1)).strip()
        consume(m)

    # 6. Court token → also infers jurisdiction.
    m = _COURT_RE.search(text)
    if m:
        token = m.group(1).upper()
        parsed.court = token
        parsed.jurisdiction = _COURT_JURISDICTION.get(token)
        consume(m)

    # 7. Explicit jurisdiction token (only if court didn't already set it).
    if parsed.jurisdiction is None:
        for jm in _JURISDICTION_RE.finditer(text):
            if _within_consumed(jm.start(), parsed._consumed):
                continue
            raw = re.sub(r"\s+", " ", jm.group(1).lower())
            normalised = _JURISDICTION_NORMALISE.get(raw)
            if normalised:
                parsed.jurisdiction = normalised
                consume(jm)
                break

    parsed.remainder = (
        _build_remainder(original, parsed._consumed)
        if parsed.has_attributes()
        else original
    )
    return parsed


def _within_consumed(pos: int, consumed: list[tuple[int, int]]) -> bool:
    """True if character offset ``pos`` falls inside an already-consumed span."""
    return any(start <= pos < end for start, end in consumed)


def _build_remainder(original: str, consumed: list[tuple[int, int]]) -> str:
    """Remove consumed spans from ``original`` and collapse whitespace."""
    if not consumed:
        return original
    keep: list[str] = []
    cursor = 0
    for start, end in sorted(consumed):
        if start > cursor:
            keep.append(original[cursor:start])
        cursor = max(cursor, end)
    keep.append(original[cursor:])
    return re.sub(r"\s+", " ", "".join(keep)).strip()


def build_meili_filter(parsed: ParsedQuery) -> str | None:
    """Build a Meilisearch ``filter`` expression from *filterable* attributes.

    Only ``jurisdiction`` and ``decision_date`` are filterable in the Meili
    index (see ``meilisearch_config.MEILI_SETTINGS['filterableAttributes']``),
    so only those become filter clauses. Court / case number / judge are
    searchable, not filterable — they belong in the FTS query
    (:meth:`ParsedQuery.fts_terms`) and never appear here.

    Returns ``None`` when there is nothing filterable, so the caller can omit
    the ``filter`` payload entirely and keep base-search behaviour intact.
    """
    clauses: list[str] = []

    if parsed.jurisdiction:
        clauses.append(f'jurisdiction = "{parsed.jurisdiction}"')

    date_from = parsed.date_from
    date_to = parsed.date_to
    if date_from is None and date_to is None and parsed.year is not None:
        date_from, date_to = _year_to_range(parsed.year)

    if date_from is not None:
        clauses.append(f'decision_date >= "{date_from}"')
    if date_to is not None:
        clauses.append(f'decision_date <= "{date_to}"')

    if not clauses:
        return None
    return " AND ".join(clauses)
