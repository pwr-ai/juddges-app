"""Tests for prompt file validation and structure."""

from pathlib import Path

import pytest
import yaml


@pytest.fixture
def prompt_dir():
    """Resolve the prompt directory relative to the package source.

    Avoids hardcoded developer paths so the test runs in any checkout layout
    (local dev, CI runners, Docker images).
    """
    import schema_generator_agent

    return Path(schema_generator_agent.__file__).parent / "configs" / "prompt" / "law"


def test_all_prompts_exist(prompt_dir):
    """Test that all required prompt files exist."""
    required_prompts = [
        "problem_definer_helper.yaml",
        "problem_definer.yaml",
        "schema_generator.yaml",
        "schema_assessment.yaml",
        "schema_refiner.yaml",
        "query_generator.yaml",
        "schema_data_assessment.yaml",
        "schema_data_assessment_merger.yaml",
        "schema_data_refiner.yaml",
    ]

    for prompt_file in required_prompts:
        prompt_path = prompt_dir / prompt_file
        assert prompt_path.exists(), f"Missing prompt file: {prompt_file}"


def test_prompts_have_valid_yaml(prompt_dir):
    """Test that all prompt files are valid YAML."""
    for prompt_file in prompt_dir.glob("*.yaml"):
        with open(prompt_file) as f:
            try:
                data = yaml.safe_load(f)
                assert data is not None, f"Empty YAML in {prompt_file.name}"
            except yaml.YAMLError as e:
                pytest.fail(f"Invalid YAML in {prompt_file.name}: {e}")


def test_prompts_contain_required_content(prompt_dir):
    """Test that prompts contain required content fields."""
    for prompt_file in prompt_dir.glob("*.yaml"):
        with open(prompt_file) as f:
            data = yaml.safe_load(f)

            # Prompts should have some content (flexible checking)
            # They may be in different formats (template strings, structured messages, etc.)
            assert data is not None and len(data) > 0, (
                f"{prompt_file.name} has no content"
            )

            # Most prompts should be template strings
            # Check that it's either a string or a dict with expected keys
            if isinstance(data, dict):
                # Should have some keys
                assert len(data.keys()) > 0, f"{prompt_file.name} has empty dict"


def test_problem_definer_helper_prompt_structure(prompt_dir):
    """Test specific structure of problem_definer_helper prompt."""
    prompt_file = prompt_dir / "problem_definer_helper.yaml"

    with open(prompt_file) as f:
        data = yaml.safe_load(f)

    # Should have problem_definer_helper_prompt key
    assert "problem_definer_helper_prompt" in data, (
        "Missing problem_definer_helper_prompt key"
    )

    # The prompt should be a non-empty string
    prompt_content = data["problem_definer_helper_prompt"]
    assert isinstance(prompt_content, str), "Prompt should be a string"
    assert len(prompt_content) > 0, "Prompt should not be empty"

    # Should contain template placeholder for user input
    assert "{user_input}" in prompt_content, "Missing {user_input} placeholder"


def test_problem_definer_prompt_structure(prompt_dir):
    """Test specific structure of problem_definer prompt."""
    prompt_file = prompt_dir / "problem_definer.yaml"

    with open(prompt_file) as f:
        data = yaml.safe_load(f)

    assert "problem_definer_prompt" in data
    prompt_content = data["problem_definer_prompt"]
    assert isinstance(prompt_content, str)
    assert len(prompt_content) > 0


def test_schema_generator_prompt_structure(prompt_dir):
    """Test specific structure of schema_generator prompt."""
    prompt_file = prompt_dir / "schema_generator.yaml"

    with open(prompt_file) as f:
        data = yaml.safe_load(f)

    assert "schema_generator_prompt" in data
    prompt_content = data["schema_generator_prompt"]
    assert isinstance(prompt_content, str)
    assert len(prompt_content) > 0

    # Should mention JSON Schema since that's what it generates
    assert "schema" in prompt_content.lower() or "json" in prompt_content.lower()


def test_schema_assessment_prompt_structure(prompt_dir):
    """Test specific structure of schema_assessment prompt."""
    prompt_file = prompt_dir / "schema_assessment.yaml"

    with open(prompt_file) as f:
        data = yaml.safe_load(f)

    assert "schema_assessment_prompt" in data
    prompt_content = data["schema_assessment_prompt"]
    assert isinstance(prompt_content, str)
    assert len(prompt_content) > 0

    # Should have placeholders for schema and assessment
    assert "{current_schema}" in prompt_content


def test_schema_refiner_prompt_structure(prompt_dir):
    """Test specific structure of schema_refiner prompt."""
    prompt_file = prompt_dir / "schema_refiner.yaml"

    with open(prompt_file) as f:
        data = yaml.safe_load(f)

    assert "schema_refiner_prompt" in data
    prompt_content = data["schema_refiner_prompt"]
    assert isinstance(prompt_content, str)
    assert len(prompt_content) > 0

    # Should reference both current schema and assessment
    assert "{current_schema}" in prompt_content
    assert "{assessment_result}" in prompt_content


def test_query_generator_prompt_structure(prompt_dir):
    """Test specific structure of query_generator prompt."""
    prompt_file = prompt_dir / "query_generator.yaml"

    with open(prompt_file) as f:
        data = yaml.safe_load(f)

    assert "query_generator_prompt" in data
    prompt_content = data["query_generator_prompt"]
    assert isinstance(prompt_content, str)
    assert len(prompt_content) > 0


def test_prompts_no_syntax_errors(prompt_dir):
    """Test that prompts don't have obvious syntax errors."""
    for prompt_file in prompt_dir.glob("*.yaml"):
        with open(prompt_file) as f:
            data = yaml.safe_load(f)

            # If it's a dict, check each value
            if isinstance(data, dict):
                for key, value in data.items():
                    if isinstance(value, str):
                        # Check for unmatched braces (common error in templates)
                        open_braces = value.count("{")
                        close_braces = value.count("}")
                        assert open_braces == close_braces, (
                            f"Unmatched braces in {prompt_file.name}:{key}"
                        )


def test_all_prompts_are_readable(prompt_dir):
    """Test that all prompt files can be read without errors."""
    for prompt_file in prompt_dir.glob("*.yaml"):
        try:
            with open(prompt_file, encoding="utf-8") as f:
                content = f.read()
                assert len(content) > 0, f"Empty file: {prompt_file.name}"
        except Exception as e:
            pytest.fail(f"Failed to read {prompt_file.name}: {e}")


def test_prompts_use_consistent_formatting(prompt_dir):
    """Test that prompts use consistent placeholder formatting."""
    import re

    for prompt_file in prompt_dir.glob("*.yaml"):
        with open(prompt_file) as f:
            data = yaml.safe_load(f)

            if isinstance(data, dict):
                for value in data.values():
                    if isinstance(value, str) and "{" in value:
                        # Find template placeholders (single braces with simple identifiers)
                        # Skip JSON examples (which contain nested structures)
                        placeholders = re.findall(r"\{([a-z_][a-z0-9_]*)\}", value)
                        for placeholder in placeholders:
                            # Should be lowercase with underscores (snake_case)
                            assert placeholder.replace("_", "").isalnum(), (
                                f"Placeholder {{{placeholder}}} in {prompt_file.name} should be snake_case"
                            )
                            assert placeholder.islower() or "_" in placeholder, (
                                f"Placeholder {{{placeholder}}} in {prompt_file.name} should be lowercase"
                            )
