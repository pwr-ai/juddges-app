"""Unit tests for the Meilisearch ``topics`` index configuration."""

from app.services.meilisearch_config import MEILISEARCH_TOPICS_INDEX_SETTINGS


class TestTopicsIndexSettings:
    def test_searchable_attributes_order(self):
        """label_pl and label_en should rank above aliases."""
        attrs = MEILISEARCH_TOPICS_INDEX_SETTINGS["searchableAttributes"]
        assert attrs.index("label_pl") < attrs.index("aliases_pl")
        assert attrs.index("label_en") < attrs.index("aliases_en")

    def test_searchable_attributes_complete(self):
        """All four bilingual fields must be present."""
        attrs = MEILISEARCH_TOPICS_INDEX_SETTINGS["searchableAttributes"]
        assert attrs == ["label_pl", "label_en", "aliases_pl", "aliases_en"]

    def test_filterable_attributes(self):
        filterable = MEILISEARCH_TOPICS_INDEX_SETTINGS["filterableAttributes"]
        assert "category" in filterable
        assert "jurisdictions" in filterable

    def test_sortable_attributes(self):
        sortable = MEILISEARCH_TOPICS_INDEX_SETTINGS["sortableAttributes"]
        assert "doc_count" in sortable

    def test_ranking_rules_end_with_doc_count_desc(self):
        rules = MEILISEARCH_TOPICS_INDEX_SETTINGS["rankingRules"]
        assert rules[-1] == "doc_count:desc", (
            "doc_count:desc must be the final ranking rule so topics with more "
            "case coverage rank higher when other signals tie"
        )

    def test_ranking_rules_contain_standard_rules(self):
        rules = MEILISEARCH_TOPICS_INDEX_SETTINGS["rankingRules"]
        for expected in ("words", "typo", "proximity", "attribute", "exactness"):
            assert expected in rules, f"missing standard rule: {expected}"

    def test_typo_tolerance_one_typo_threshold(self):
        min_sizes = MEILISEARCH_TOPICS_INDEX_SETTINGS["typoTolerance"][
            "minWordSizeForTypos"
        ]
        assert min_sizes["oneTypo"] == 4

    def test_typo_tolerance_two_typos_threshold(self):
        min_sizes = MEILISEARCH_TOPICS_INDEX_SETTINGS["typoTolerance"][
            "minWordSizeForTypos"
        ]
        assert min_sizes["twoTypos"] == 8

    def test_displayed_attributes_is_wildcard(self):
        """All fields should be displayed (wildcard)."""
        displayed = MEILISEARCH_TOPICS_INDEX_SETTINGS["displayedAttributes"]
        assert displayed == ["*"]

    def test_stop_words_is_empty(self):
        """Topics are short phrases; stop-word removal should not be applied."""
        assert MEILISEARCH_TOPICS_INDEX_SETTINGS["stopWords"] == []
