"""Corpus-derived autocomplete suggestions: extraction + Meilisearch config.

Issue #153 — surface the *language of legal practice* (legal terms, doctrines,
court names, judge names, statute names) as phrase-level autocomplete
suggestions mined from the PL + EN judgment corpus.

This module is deliberately self-contained and free of heavy ML dependencies
(spaCy NER is an optional follow-up in the issue): suggestions are derived from

1. Already-structured array/scalar fields on ``judgments``:
   ``keywords``, ``legal_topics``, ``cited_legislation``, ``court_name``,
   ``judges_flat`` (flattened from ``judges`` JSONB).
2. Language-aware n-grams (1-4) over ``summary`` / ``full_text`` after PL + EN
   stop-word filtering, frequency thresholds, and a length cap.
3. Popular query strings from ``search_analytics`` (a strong signal for what
   users are *trying* to type).

Each emitted suggestion is shaped like::

    {"id": "<slug>", "term": "rażące naruszenie prawa", "language": "pl",
     "category": "legal_topic", "weight": 1234}

The shape matches the issue sketch (``term`` / ``language`` / ``category`` /
``weight``) plus a deterministic ``id`` so Meilisearch has a stable primary key
and re-runs are idempotent.
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from typing import Any, Literal

# ── Suggestion taxonomy ──────────────────────────────────────────────────────

SuggestionCategory = Literal[
    "keyword",
    "legal_topic",
    "legislation",
    "court",
    "judge",
    "phrase",
    "query",
]

SuggestionLanguage = Literal["pl", "en"]

# Categories the API and frontend agree on (kept here as the single source of
# truth so a taxonomy change forces both sides to update).
SUGGESTION_CATEGORIES: tuple[str, ...] = (
    "keyword",
    "legal_topic",
    "legislation",
    "court",
    "judge",
    "phrase",
    "query",
)

# ── Index settings for the ``suggestions`` index ─────────────────────────────
# Per-term records keep responses small and phrase-rankable; full judgments
# stay in the ``judgments`` index. ``weight:desc`` is the final ranking rule so
# corpus frequency breaks ties between equally-good prefix matches.
MEILISEARCH_SUGGESTIONS_INDEX_SETTINGS: dict[str, Any] = {
    "searchableAttributes": ["term"],
    "filterableAttributes": ["language", "category"],
    "sortableAttributes": ["weight"],
    "displayedAttributes": ["*"],
    "rankingRules": [
        "words",
        "typo",
        "proximity",
        "attribute",
        "exactness",
        "weight:desc",
    ],
    "typoTolerance": {
        "enabled": True,
        "minWordSizeForTypos": {"oneTypo": 4, "twoTypos": 8},
    },
    # Phrases are short and meaningful; stop-word removal would harm recall.
    "stopWords": [],
    "pagination": {"maxTotalHits": 1000},
}


# ── Stop-word lists (PL + EN) ────────────────────────────────────────────────
# Intentionally small, hand-curated lists covering high-frequency function words
# and boilerplate legal-document tokens that would otherwise dominate n-grams.
_PL_STOPWORDS: frozenset[str] = frozenset(
    {
        "i",
        "w",
        "z",
        "na",
        "do",
        "się",
        "nie",
        "że",
        "to",
        "jest",
        "po",
        "jak",
        "co",
        "ale",
        "przez",
        "przy",
        "od",
        "ze",
        "za",
        "który",
        "która",
        "które",
        "którego",
        "której",
        "jego",
        "jej",
        "ich",
        "tego",
        "tej",
        "tym",
        "być",
        "może",
        "już",
        "gdy",
        "więc",
        "ta",
        "ten",
        "te",
        "oraz",
        "lub",
        "albo",
        "a",
        "o",
        "u",
        "pod",
        "nad",
        "bez",
        "dla",
        "także",
        "również",
        "był",
        "była",
        "było",
        "były",
        "są",
        "ma",
        "mają",
        "sąd",
        "sądu",
        "sądem",
        "wyrok",
        "wyroku",
        "wyrokiem",
        "nr",
        "r",
        "roku",
        "dnia",
        "akt",
        "sprawy",
        "sprawa",
        "sprawie",
        "art",
        "ust",
        "pkt",
        "poz",
        "str",
        "zł",
        "ww",
        "tj",
        "tzn",
        "in",
    }
)

_EN_STOPWORDS: frozenset[str] = frozenset(
    {
        "the",
        "a",
        "an",
        "and",
        "or",
        "of",
        "to",
        "in",
        "on",
        "for",
        "with",
        "as",
        "by",
        "at",
        "from",
        "is",
        "was",
        "were",
        "are",
        "be",
        "been",
        "being",
        "that",
        "this",
        "these",
        "those",
        "it",
        "its",
        "he",
        "she",
        "they",
        "his",
        "her",
        "their",
        "which",
        "who",
        "whom",
        "whose",
        "had",
        "has",
        "have",
        "not",
        "no",
        "but",
        "if",
        "than",
        "then",
        "so",
        "such",
        "court",
        "judgment",
        "case",
        "para",
        "paras",
        "paragraph",
        "appeal",
        "appellant",
        "respondent",
        "page",
        "pp",
        "v",
        "vs",
        "ltd",
        "re",
    }
)

# Word tokens: letters (incl. PL/Latin diacritics) followed by word chars.
_TOKEN_RE = re.compile(
    r"[A-Za-zÀ-ÿĄ-żŁłŚśŻżŹźĆćŃńÓóĘęĄą][\wÀ-ÿĄ-żŁłŚśŻżŹźĆćŃńÓóĘęĄą-]*"
)

# Phrase length bounds (issue: "basic legal-term extraction", "a length cap").
_MIN_NGRAM = 1
_MAX_NGRAM = 4
_MIN_TERM_CHARS = 3
_MAX_TERM_CHARS = 64


def make_suggestion_slug(term: str, language: str, category: str) -> str:
    """Deterministic ASCII slug primary key.

    Folds accents, lowercases, and joins ``category:language:term`` so the same
    term in different categories/languages stays distinct and re-runs are
    idempotent.
    """
    normalized = unicodedata.normalize("NFD", term)
    normalized = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    normalized = normalized.encode("ascii", "ignore").decode("ascii").lower()
    normalized = re.sub(r"[^a-z0-9]+", "_", normalized).strip("_") or "x"
    return f"{category}:{language}:{normalized}"


def _is_meaningful_term(term: str) -> bool:
    """Reject empty/over-long terms and terms that are all stop-words/digits."""
    if not (_MIN_TERM_CHARS <= len(term) <= _MAX_TERM_CHARS):
        return False
    tokens = term.split()
    if not tokens:
        return False
    # Every token a stop-word or pure number → not meaningful.
    stop = _PL_STOPWORDS | _EN_STOPWORDS
    return any(tok.lower() not in stop and not tok.isdigit() for tok in tokens)


def _tokenize(text: str) -> list[str]:
    """Lowercased word tokens, punctuation/numbers stripped to bare words."""
    return [m.group(0).lower() for m in _TOKEN_RE.finditer(text)]


def extract_ngrams(
    text: str,
    language: SuggestionLanguage,
    *,
    min_n: int = _MIN_NGRAM,
    max_n: int = _MAX_NGRAM,
) -> Counter[str]:
    """Count stop-word-filtered n-grams (``min_n``..``max_n``) in one text.

    An n-gram is kept only when its first and last tokens are content words
    (not stop-words). This drops fragments like "of the court" while keeping
    "rażące naruszenie prawa" / "abuse of process".
    """
    stop = _PL_STOPWORDS if language == "pl" else _EN_STOPWORDS
    tokens = _tokenize(text)
    counts: Counter[str] = Counter()
    n_tokens = len(tokens)
    for n in range(min_n, max_n + 1):
        for i in range(n_tokens - n + 1):
            gram = tokens[i : i + n]
            # Trim stop-words on the edges; require content words at both ends.
            if gram[0] in stop or gram[-1] in stop:
                continue
            # Drop grams that are >50% stop-words or contain a bare number.
            stop_count = sum(1 for t in gram if t in stop)
            if stop_count * 2 > len(gram):
                continue
            if any(t.isdigit() for t in gram):
                continue
            phrase = " ".join(gram)
            if _is_meaningful_term(phrase):
                counts[phrase] += 1
    return counts


def _lang_for_jurisdiction(jurisdiction: str | None) -> SuggestionLanguage:
    """PL judgments → Polish suggestions; everything else → English."""
    return "pl" if (jurisdiction or "").upper() == "PL" else "en"


def aggregate_field_suggestions(
    rows: list[dict[str, Any]],
) -> dict[tuple[str, str, str], int]:
    """Aggregate the already-structured fields into weighted suggestion terms.

    Returns a mapping ``(term, language, category) -> weight`` where weight is
    the corpus document frequency. ``rows`` are ``judgments`` rows carrying at
    least ``jurisdiction`` plus the mined columns.
    """
    acc: Counter[tuple[str, str, str]] = Counter()

    for row in rows:
        lang = _lang_for_jurisdiction(row.get("jurisdiction"))

        for category, field in (
            ("keyword", "keywords"),
            ("legal_topic", "legal_topics"),
            ("legislation", "cited_legislation"),
        ):
            values = row.get(field) or []
            if isinstance(values, str):
                values = [values]
            for raw in values:
                term = (raw or "").strip()
                if term and _is_meaningful_term(term):
                    acc[(term, lang, category)] += 1

        court = (row.get("court_name") or "").strip()
        if court and _is_meaningful_term(court):
            acc[(court, lang, "court")] += 1

        # ``judges_flat`` is a comma-joined "Name (role)" string; split on
        # commas and strip the parenthetical role for the suggestion term.
        judges_flat = (row.get("judges_flat") or "").strip()
        if judges_flat:
            for chunk in judges_flat.split(","):
                name = re.sub(r"\s*\([^)]*\)\s*", "", chunk).strip()
                if name and _is_meaningful_term(name):
                    acc[(name, lang, "judge")] += 1

    return dict(acc)


def aggregate_ngram_suggestions(
    rows: list[dict[str, Any]],
    *,
    min_doc_frequency: int = 3,
    max_terms_per_language: int = 2000,
) -> dict[tuple[str, str, str], int]:
    """Mine free-text n-grams from ``summary`` / ``full_text`` per language.

    ``min_doc_frequency`` filters rare noise; ``max_terms_per_language`` caps the
    output to the most frequent phrases so the index stays small. Returns the
    same ``(term, language, category="phrase") -> weight`` mapping shape.
    """
    per_lang: dict[str, Counter[str]] = {"pl": Counter(), "en": Counter()}

    for row in rows:
        lang = _lang_for_jurisdiction(row.get("jurisdiction"))
        text_parts = [
            (row.get("summary") or "").strip(),
            # Cap full_text to keep extraction bounded on long judgments.
            (row.get("full_text") or "").strip()[:4000],
        ]
        text = " ".join(p for p in text_parts if p)
        if not text:
            continue
        # Count each phrase once per document (document frequency, not term
        # frequency) so a single verbose judgment can't dominate the ranking.
        doc_grams = extract_ngrams(text, lang)  # type: ignore[arg-type]
        for phrase in doc_grams:
            per_lang[lang][phrase] += 1

    acc: dict[tuple[str, str, str], int] = {}
    for lang, counter in per_lang.items():
        frequent = [
            (term, freq)
            for term, freq in counter.most_common()
            if freq >= min_doc_frequency
        ][:max_terms_per_language]
        for term, freq in frequent:
            acc[(term, lang, "phrase")] = freq
    return acc


def popular_query_suggestions(
    popular_queries: list[dict[str, Any]],
) -> dict[tuple[str, str, str], int]:
    """Turn popular search-log queries into ``query``-category suggestions.

    Language is inferred heuristically: a query containing any Polish diacritic
    or known Polish stop-word is tagged ``pl``, otherwise ``en``. ``weight`` is
    the search count.
    """
    acc: dict[tuple[str, str, str], int] = {}
    for entry in popular_queries:
        term = (entry.get("query") or "").strip()
        if not term or not _is_meaningful_term(term):
            continue
        weight = int(entry.get("search_count", 0) or 0)
        lang: SuggestionLanguage = "en"
        lowered = term.lower()
        if re.search(r"[ąćęłńóśźż]", lowered) or any(
            tok in _PL_STOPWORDS for tok in lowered.split()
        ):
            lang = "pl"
        acc[(term, lang, "query")] = max(weight, 1)
    return acc


def build_suggestion_documents(
    rows: list[dict[str, Any]],
    *,
    popular_queries: list[dict[str, Any]] | None = None,
    min_ngram_doc_frequency: int = 3,
    max_ngrams_per_language: int = 2000,
    max_total: int = 5000,
) -> list[dict[str, Any]]:
    """Build the full, deduplicated, ranked list of suggestion documents.

    Merges structured-field, n-gram, and popular-query sources. When the same
    ``(term, language)`` appears in several categories the higher-priority,
    higher-weight record wins (structured fields and explicit queries outrank
    raw n-grams). Output is sorted by weight desc and capped at ``max_total``.
    """
    # Category priority: curated/explicit signals beat raw phrase mining.
    priority = {
        "query": 5,
        "legal_topic": 4,
        "keyword": 4,
        "legislation": 3,
        "court": 3,
        "judge": 2,
        "phrase": 1,
    }

    merged: dict[tuple[str, str, str], int] = {}
    for source in (
        aggregate_field_suggestions(rows),
        aggregate_ngram_suggestions(
            rows,
            min_doc_frequency=min_ngram_doc_frequency,
            max_terms_per_language=max_ngrams_per_language,
        ),
        popular_query_suggestions(popular_queries or []),
    ):
        for key, weight in source.items():
            merged[key] = merged.get(key, 0) + weight

    # Collapse (term, language) collisions across categories: keep the record
    # with the highest (priority, weight).
    best: dict[tuple[str, str], tuple[str, int]] = {}
    for (term, lang, category), weight in merged.items():
        tl = (term.casefold(), lang)
        candidate = (category, weight)
        current = best.get(tl)
        if current is None:
            best[tl] = candidate
            continue
        cur_cat, cur_w = current
        if (priority[category], weight) > (priority[cur_cat], cur_w):
            best[tl] = candidate

    # Re-materialise with a representative original casing for each (term, lang).
    casing: dict[tuple[str, str], str] = {}
    for term, lang, _category in merged:
        casing.setdefault((term.casefold(), lang), term)

    docs: list[dict[str, Any]] = []
    for (term_cf, lang), (category, weight) in best.items():
        term = casing.get((term_cf, lang), term_cf)
        docs.append(
            {
                "id": make_suggestion_slug(term, lang, category),
                "term": term,
                "language": lang,
                "category": category,
                "weight": int(weight),
            }
        )

    docs.sort(key=lambda d: d["weight"], reverse=True)
    return docs[:max_total]
