"""Unit tests for the topic-snapshot CLI helpers (#222).

The CLIs live in the repo-root ``scripts/`` dir (outside the backend package),
so we load them by path. We cover the pure validation/parsing logic — argparse
wiring and the Supabase/Meilisearch network calls are left to manual/integration
runs.
"""

import importlib.util
import json
import pathlib
import sys

import pytest

pytestmark = pytest.mark.unit

_SCRIPTS_DIR = pathlib.Path(__file__).resolve().parents[3] / "scripts"


def _load_script(name: str):
    path = _SCRIPTS_DIR / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"_script_{name}", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def validate_mod():
    return _load_script("validate_search_topics")


@pytest.fixture(scope="module")
def import_mod():
    return _load_script("import_search_topics_snapshot")


def _topic(**overrides):
    base = {
        "id": "t1",
        "label_pl": "Prawo",
        "label_en": "Law",
        "aliases_pl": [],
        "aliases_en": [],
        "category": "legal",
        "jurisdictions": ["PL"],
    }
    base.update(overrides)
    return base


class TestNormalizeText:
    def test_strips_accents_and_lowercases(self, validate_mod):
        assert validate_mod._normalize_text("Café Crème") == "cafe creme"

    def test_collapses_punctuation_and_whitespace(self, validate_mod):
        assert validate_mod._normalize_text("  Foo--Bar  ") == "foo bar"

    def test_drops_symbols(self, validate_mod):
        assert validate_mod._normalize_text("Tax & Law!!") == "tax law"


class TestStringValues:
    def test_collects_labels_and_aliases(self, validate_mod):
        topic = _topic(aliases_pl=["alias1"], aliases_en=["alias2", ""])
        pairs = validate_mod._string_values(topic)
        assert ("label_pl", "Prawo") in pairs
        assert ("label_en", "Law") in pairs
        assert ("aliases_pl", "alias1") in pairs
        assert ("aliases_en", "alias2") in pairs
        # Blank alias is skipped.
        assert all(v.strip() for _, v in pairs)


class TestValidateTopics:
    def test_valid_topic_has_no_errors(self, validate_mod):
        errors, warnings = validate_mod.validate_topics([_topic()])
        assert errors == []
        assert warnings == []

    def test_missing_required_field_is_error(self, validate_mod):
        bad = _topic()
        del bad["category"]
        errors, _ = validate_mod.validate_topics([bad])
        assert any("missing fields" in e for e in errors)

    def test_duplicate_id_is_error(self, validate_mod):
        errors, _ = validate_mod.validate_topics([_topic(), _topic()])
        assert any("duplicate id" in e for e in errors)

    def test_empty_label_is_error(self, validate_mod):
        errors, _ = validate_mod.validate_topics([_topic(label_pl="  ")])
        assert any("invalid label_pl" in e for e in errors)

    def test_non_list_aliases_is_error(self, validate_mod):
        errors, _ = validate_mod.validate_topics([_topic(aliases_pl="oops")])
        assert any("invalid aliases_pl" in e for e in errors)

    def test_duplicate_normalized_label_is_warning(self, validate_mod):
        topics = [
            _topic(id="a", label_en="Tax Law"),
            _topic(id="b", label_en="tax  law"),
        ]
        _, warnings = validate_mod.validate_topics(topics)
        assert any("duplicate normalized English label" in w for w in warnings)


class TestLoadTopicsFromFile:
    def test_plain_array(self, validate_mod, tmp_path):
        p = tmp_path / "topics.json"
        p.write_text(json.dumps([_topic()]), encoding="utf-8")
        assert validate_mod._load_topics_from_file(p) == [_topic()]

    def test_object_with_topics_key(self, validate_mod, tmp_path):
        p = tmp_path / "topics.json"
        p.write_text(json.dumps({"topics": [_topic()]}), encoding="utf-8")
        assert validate_mod._load_topics_from_file(p) == [_topic()]

    def test_invalid_shape_raises(self, validate_mod, tmp_path):
        p = tmp_path / "topics.json"
        p.write_text(json.dumps({"nope": 1}), encoding="utf-8")
        with pytest.raises(ValueError, match="JSON array"):
            validate_mod._load_topics_from_file(p)


class TestImportLoadTopics:
    def test_applies_defaults_for_optional_fields(self, import_mod, tmp_path):
        p = tmp_path / "snap.json"
        p.write_text(
            json.dumps(
                [{"id": "x", "label_pl": "P", "label_en": "L", "category": "c"}]
            ),
            encoding="utf-8",
        )
        out = import_mod._load_topics(p)
        assert len(out) == 1
        row = out[0]
        assert row["aliases_pl"] == [] and row["aliases_en"] == []
        assert row["doc_count"] == 0
        assert row["jurisdictions"] == []
        assert row["generated_at"]  # auto-stamped when absent

    def test_invalid_shape_raises(self, import_mod, tmp_path):
        p = tmp_path / "snap.json"
        p.write_text(json.dumps({"nope": 1}), encoding="utf-8")
        with pytest.raises(ValueError, match="JSON array"):
            import_mod._load_topics(p)
