"""Unit tests for corpus-derived suggestion extraction (issue #153).

Covers:
- N-gram extraction with PL/EN stop-word filtering.
- Structured-field aggregation (keywords, legal_topics, court, judges, ...).
- Popular-query language inference.
- A deterministic top-N snapshot over a small fixture corpus so future changes
  to the extractor produce stable, comparable rankings.
"""

from __future__ import annotations

import pytest

from app.services.suggestions_config import (
    MEILISEARCH_SUGGESTIONS_INDEX_SETTINGS,
    aggregate_field_suggestions,
    build_suggestion_documents,
    extract_ngrams,
    make_suggestion_slug,
    popular_query_suggestions,
)

pytestmark = pytest.mark.unit


# ── Fixture corpus ───────────────────────────────────────────────────────────

_PL_SUMMARY = (
    "Sąd uznał rażące naruszenie prawa procesowego. Rażące naruszenie prawa "
    "stanowiło podstawę uchylenia wyroku. Posiadanie środków odurzających."
)
_EN_SUMMARY = (
    "The court found a clear abuse of process. Abuse of process tainted the "
    "trial. The defendant pleaded guilty to drug possession."
)


def _fixture_rows() -> list[dict]:
    rows: list[dict] = []
    # Several PL judgments repeating the doctrine phrase.
    for i in range(4):
        rows.append(
            {
                "id": f"pl-{i}",
                "jurisdiction": "PL",
                "court_name": "Sąd Apelacyjny w Warszawie",
                "judges": [{"name": "Jan Kowalski", "role": "przewodniczący"}],
                "summary": _PL_SUMMARY,
                "full_text": _PL_SUMMARY,
                "keywords": ["narkotyki", "posiadanie"],
                "legal_topics": ["przestępstwa narkotykowe"],
                "cited_legislation": ["Ustawa o przeciwdziałaniu narkomanii"],
                "judges_flat": "Jan Kowalski (przewodniczący)",
            }
        )
    # Several UK judgments repeating an EN doctrine phrase.
    for i in range(4):
        rows.append(
            {
                "id": f"uk-{i}",
                "jurisdiction": "UK",
                "court_name": "Court of Appeal",
                "judges": [{"name": "Lord Smith", "role": "judge"}],
                "summary": _EN_SUMMARY,
                "full_text": _EN_SUMMARY,
                "keywords": ["drugs", "possession"],
                "legal_topics": ["drug offences"],
                "cited_legislation": ["Misuse of Drugs Act 1971"],
                "judges_flat": "Lord Smith (judge)",
            }
        )
    return rows


# ── Index settings sanity ────────────────────────────────────────────────────


class TestIndexSettings:
    def test_searchable_and_filterable_shape(self):
        s = MEILISEARCH_SUGGESTIONS_INDEX_SETTINGS
        assert s["searchableAttributes"] == ["term"]
        assert set(s["filterableAttributes"]) == {"language", "category"}
        assert "weight:desc" in s["rankingRules"]


# ── make_suggestion_slug ─────────────────────────────────────────────────────


class TestMakeSlug:
    def test_folds_accents_and_namespaces(self):
        slug = make_suggestion_slug("Rażące naruszenie prawa", "pl", "phrase")
        assert slug == "phrase:pl:razace_naruszenie_prawa"
        assert slug.isascii()

    def test_same_term_distinct_per_category(self):
        a = make_suggestion_slug("Fraud", "en", "keyword")
        b = make_suggestion_slug("Fraud", "en", "phrase")
        assert a != b


# ── N-gram extraction ────────────────────────────────────────────────────────


class TestExtractNgrams:
    def test_keeps_pl_doctrine_phrase(self):
        counts = extract_ngrams(_PL_SUMMARY, "pl")
        assert "rażące naruszenie prawa" in counts

    def test_keeps_en_doctrine_phrase(self):
        counts = extract_ngrams(_EN_SUMMARY, "en")
        assert "abuse of process" in counts

    def test_drops_stopword_edges(self):
        # "of the" / "the court" must never appear as standalone suggestions.
        counts = extract_ngrams("the court of the realm", "en")
        for term in counts:
            tokens = term.split()
            assert tokens[0] not in {"the", "of"}
            assert tokens[-1] not in {"the", "of"}

    def test_drops_pure_numbers(self):
        counts = extract_ngrams("section 1971 act", "en")
        assert "1971" not in counts


# ── Structured-field aggregation ─────────────────────────────────────────────


class TestAggregateFields:
    def test_aggregates_keywords_with_language_tag(self):
        result = aggregate_field_suggestions(_fixture_rows())
        assert result[("narkotyki", "pl", "keyword")] == 4
        assert result[("drugs", "en", "keyword")] == 4

    def test_court_and_judge_extracted(self):
        result = aggregate_field_suggestions(_fixture_rows())
        assert result[("Sąd Apelacyjny w Warszawie", "pl", "court")] == 4
        # Role parenthetical is stripped from judge names.
        assert result[("Jan Kowalski", "pl", "judge")] == 4
        assert result[("Lord Smith", "en", "judge")] == 4

    def test_legislation_extracted(self):
        result = aggregate_field_suggestions(_fixture_rows())
        assert result[("Misuse of Drugs Act 1971", "en", "legislation")] == 4


# ── Popular-query language inference ──────────────────────────────────────────


class TestPopularQueries:
    def test_pl_diacritics_tagged_pl(self):
        result = popular_query_suggestions(
            [{"query": "rażące naruszenie", "search_count": 12}]
        )
        assert ("rażące naruszenie", "pl", "query") in result

    def test_plain_ascii_tagged_en(self):
        result = popular_query_suggestions(
            [{"query": "abuse of process", "search_count": 7}]
        )
        assert ("abuse of process", "en", "query") in result


# ── Top-N snapshot over the fixture corpus ───────────────────────────────────


class TestBuildSuggestionsSnapshot:
    def test_top_documents_are_stable_and_well_formed(self):
        rows = _fixture_rows()
        docs = build_suggestion_documents(
            rows,
            popular_queries=[{"query": "drug possession", "search_count": 50}],
            min_ngram_doc_frequency=2,
        )

        # Every doc carries the issue-defined shape.
        for d in docs:
            assert set(d) == {"id", "term", "language", "category", "weight"}
            assert d["language"] in {"pl", "en"}
            assert isinstance(d["weight"], int)

        # Both languages are represented.
        langs = {d["language"] for d in docs}
        assert langs == {"pl", "en"}

        # The explicit popular query outranks raw n-grams (priority weighting).
        top_terms = {(d["term"].casefold(), d["language"]) for d in docs[:8]}
        assert ("drug possession", "en") in top_terms

        # Sorted by weight descending.
        weights = [d["weight"] for d in docs]
        assert weights == sorted(weights, reverse=True)

    def test_dedup_collapses_term_across_categories(self):
        # "possession" is both an EN keyword and may surface as an n-gram;
        # only one (term, language) record should survive.
        rows = _fixture_rows()
        docs = build_suggestion_documents(rows, min_ngram_doc_frequency=2)
        seen = [(d["term"].casefold(), d["language"]) for d in docs]
        assert len(seen) == len(set(seen))
