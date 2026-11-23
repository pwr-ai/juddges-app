"""Unit tests for the single-shot schema generation chain (aggregatable-first prompt)."""

import copy
import json
from types import SimpleNamespace

import pytest
from juddges_search.chains import schema_generation as sg
from juddges_search.info_extraction.oai_schema_validation import validate_openai_schema
from langchain_core.runnables import RunnableLambda

pytestmark = pytest.mark.unit

EXISTING_FIELDS = [
    {
        "field_name": "appeal_outcome",
        "field_type": "string",
        "description": "Outcome of the appeal",
        "type": "string",
        "enum": ["allowed", "dismissed", "other"],
    },
    {
        "field_name": "grounds",
        "field_type": "array",
        "description": "Grounds",
        "type": "array",
        "items": {"type": "string", "enum": ["procedure", "evidence"]},
    },
    {
        "field_name": "decided_on",
        "field_type": "string",
        "description": "Decision date",
        "type": "string",
        "format": "date",
    },
    {
        "field_name": "party",
        "field_type": "object",
        "description": "Party",
        "type": "object",
        "properties": {"name": {"type": "string"}},
        "required": ["name"],
        "additionalProperties": False,
    },
]


def _inputs(**kw):
    base = {"user_request": "costs of proceedings", "schema_name": "S"}
    base.update(kw)
    return base


class TestMerge:
    def test_existing_definitions_are_preserved(self):
        generated = {
            "type": "object",
            "properties": {"costs_awarded": {"type": "boolean", "description": "d"}},
        }
        merged = sg.merge_and_mark_new_fields(generated, copy.deepcopy(EXISTING_FIELDS))
        props = merged["properties"]
        assert props["appeal_outcome"] == {
            "type": "string",
            "description": "Outcome of the appeal",
            "enum": ["allowed", "dismissed", "other"],
        }
        assert props["grounds"]["items"] == {
            "type": "string",
            "enum": ["procedure", "evidence"],
        }
        assert props["decided_on"]["format"] == "date"
        assert props["party"]["properties"] == {"name": {"type": "string"}}
        assert props["party"]["required"] == ["name"]
        assert all(
            "x-ai-generated" not in props[n]
            for n in ("appeal_outcome", "grounds", "decided_on", "party")
        )

    def test_new_fields_marked_and_required_complete(self):
        generated = {
            "type": "object",
            "properties": {"costs_awarded": {"type": "boolean", "description": "d"}},
        }
        merged = sg.merge_and_mark_new_fields(generated, copy.deepcopy(EXISTING_FIELDS))
        assert merged["properties"]["costs_awarded"]["x-ai-generated"] is True
        assert merged["required"] == list(merged["properties"].keys())

    def test_existing_wins_over_generated_duplicate(self):
        generated = {
            "type": "object",
            "properties": {"appeal_outcome": {"type": "boolean"}},
        }
        merged = sg.merge_and_mark_new_fields(generated, copy.deepcopy(EXISTING_FIELDS))
        assert merged["properties"]["appeal_outcome"]["type"] == "string"

    def test_legacy_minimal_payload_and_validation_rules(self):
        legacy = [
            {
                "field_name": "a",
                "field_type": "string",
                "description": "x",
                "validation_rules": {"enum": ["p", "q"]},
            }
        ]
        merged = sg.merge_and_mark_new_fields(
            {"type": "object", "properties": {}}, legacy
        )
        assert merged["properties"]["a"] == {
            "type": "string",
            "description": "x",
            "enum": ["p", "q"],
        }

    def test_no_existing_marks_everything(self):
        out = sg.merge_and_mark_new_fields(
            {"properties": {"a": {"type": "boolean"}}}, None
        )
        assert out["properties"]["a"]["x-ai-generated"] is True


class TestPrompt:
    def test_rules_present_without_existing(self):
        text = sg.build_full_prompt(_inputs())
        assert "JSON" in text  # required by json_object mode
        assert "Decompose" in text and "aggregat" in text.lower()
        assert "15-40" in text
        assert "not_stated" in text
        assert "EXISTING FIELDS" not in text
        assert "x-ai-generated" not in text
        assert "court name" in text  # base metadata not to be duplicated
        assert "costs of proceedings" in text

    def test_existing_fields_and_instructions_rendered(self):
        text = sg.build_full_prompt(
            _inputs(
                existing_fields=EXISTING_FIELDS,
                extraction_instructions="Focus on UK criminal appeals",
            )
        )
        assert "EXISTING FIELDS" in text
        assert "enum=['allowed', 'dismissed', 'other']" in text
        assert "items=string enum=['procedure', 'evidence']" in text
        assert "Focus on UK criminal appeals" in text
        assert "x-ai-generated" not in text


class TestParsing:
    def test_bare_json(self):
        assert sg.parse_llm_json_output(
            SimpleNamespace(content='{"properties": {"a": {}}}')
        ) == {"properties": {"a": {}}}

    def test_fallback_markdown(self):
        msg = SimpleNamespace(content='Here:\n```json\n{"properties": {"a": {}}}\n```')
        assert sg.parse_llm_json_output(msg) == {"properties": {"a": {}}}

    def test_invalid_raises(self):
        with pytest.raises(ValueError):
            sg.parse_llm_json_output(SimpleNamespace(content="no json"))

    def test_non_object_raises(self):
        with pytest.raises(ValueError):
            sg.parse_llm_json_output(SimpleNamespace(content="[1, 2]"))


class TestNullability:
    def test_type_array_is_rejected_by_validator_so_prompt_forbids_it(self):
        schema = {
            "type": "object",
            "properties": {"x": {"type": ["boolean", "null"]}},
            "required": ["x"],
            "additionalProperties": False,
        }
        with pytest.raises(TypeError):
            validate_openai_schema(schema, raise_on_error=False)
        assert '"type" must be a single string' in sg.build_full_prompt(_inputs())

    def test_union_collapsed_before_validation(self):
        fixed = sg.validate_and_fix_schema(
            {"properties": {"x": {"type": ["boolean", "null"], "description": "d"}}}
        )
        assert fixed["properties"]["x"]["type"] == "boolean"

    def test_not_stated_enum_validates(self):
        fixed = sg.validate_and_fix_schema(
            {
                "properties": {
                    "x": {
                        "type": "string",
                        "enum": ["yes", "no", "not_stated"],
                        "description": "d",
                    }
                }
            }
        )
        assert fixed["required"] == ["x"]


class TestChain:
    @pytest.mark.asyncio
    async def test_generate_schema_json_mode_end_to_end(self, monkeypatch):
        captured = {}

        def fake_model(prompt_value):
            captured["prompt"] = prompt_value.to_string()
            return SimpleNamespace(
                content=json.dumps(
                    {
                        "type": "object",
                        "properties": {
                            "costs_awarded": {"type": "boolean", "description": "d"},
                            "costs_bearer": {
                                "type": "string",
                                "enum": ["claimant", "defendant", "not_stated"],
                                "description": "d",
                            },
                        },
                    }
                )
            )

        monkeypatch.setattr(sg, "_get_model", lambda: RunnableLambda(fake_model))
        sg._build_schema_generation_chain.cache_clear()
        try:
            result = await sg.generate_schema(
                "costs", existing_fields=copy.deepcopy(EXISTING_FIELDS)
            )
        finally:
            sg._build_schema_generation_chain.cache_clear()
        props = result["schema"]["properties"]
        assert props["appeal_outcome"]["enum"] == ["allowed", "dismissed", "other"]
        assert props["costs_awarded"]["x-ai-generated"] is True
        assert set(result["new_fields"]) == {"costs_awarded", "costs_bearer"}
        assert "EXISTING FIELDS" in captured["prompt"]

    def test_model_bound_to_json_mode(self, monkeypatch):
        class FakeLLM:
            def bind(self, **kw):
                self.kw = kw
                return self

        llm = FakeLLM()
        monkeypatch.setattr(sg, "get_default_llm", lambda **kw: llm)
        assert sg._get_model() is llm
        assert llm.kw == {"response_format": {"type": "json_object"}}
