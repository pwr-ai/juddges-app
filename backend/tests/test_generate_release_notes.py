from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest


def _resolve_module_path() -> Path | None:
    here = Path(__file__).resolve()
    for parent in [here, *here.parents]:
        candidate = parent / "scripts" / "generate_release_notes.py"
        if candidate.is_file():
            return candidate
    return None


def load_module():
    module_path = _resolve_module_path()
    if module_path is None:
        pytest.skip(
            "scripts/generate_release_notes.py not in repo tree "
            "(running outside the full repo, e.g. backend-only container)"
        )
    spec = importlib.util.spec_from_file_location("generate_release_notes", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.mark.unit
def test_build_release_context_uses_latest_prod_tag(monkeypatch, tmp_path):
    module = load_module()

    def fake_run_git(_repo_root, *args):
        if args == ("tag", "--list", "prod-v*", "--sort=-v:refname"):
            return "prod-v0.1.2\nprod-v0.1.1"
        if args == ("log", "--no-merges", "--format=%h%x09%s", "prod-v0.1.2..HEAD"):
            return (
                "abc1234\tfeat: add export endpoint\ndef5678\tfix: harden auth checks"
            )
        raise AssertionError(f"Unexpected git args: {args}")

    monkeypatch.setattr(module, "run_git", fake_run_git)

    context = module.build_release_context(tmp_path, version="0.1.3")

    assert context.previous_tag == "prod-v0.1.2"
    assert [entry.subject for entry in context.commit_entries] == [
        "feat: add export endpoint",
        "fix: harden auth checks",
    ]


@pytest.mark.unit
def test_generate_release_notes_payload_uses_openai_parse(monkeypatch):
    module = load_module()
    captured = {}

    class FakeResponses:
        def parse(self, **kwargs):
            captured.update(kwargs)
            payload = module.ReleaseNotesPayload(
                headline="Search improvements and deployment hardening",
                overview="This release improves search quality and stabilizes deployment.",
                highlights=["Improved search relevance"],
                breaking_changes=[],
                sections=[
                    module.ReleaseSection(
                        title="Features",
                        items=["Added query export support"],
                    )
                ],
            )
            return SimpleNamespace(output_parsed=payload)

    class FakeOpenAI:
        def __init__(self):
            self.responses = FakeResponses()

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(module, "OpenAI", FakeOpenAI)

    context = module.ReleaseContext(
        version="0.1.3",
        previous_tag="prod-v0.1.2",
        to_ref="HEAD",
        commit_entries=[
            module.CommitEntry(
                short_hash="abc1234", subject="feat: add export endpoint"
            )
        ],
    )

    payload = module.generate_release_notes_payload(context, model="gpt-5-mini")

    assert payload.headline == "Search improvements and deployment hardening"
    assert captured["model"] == "gpt-5-mini"
    assert captured["text_format"] is module.ReleaseNotesPayload
    assert "feat: add export endpoint" in captured["input"]


@pytest.mark.unit
def test_render_markdown_includes_sections_and_source_commits():
    module = load_module()

    context = module.ReleaseContext(
        version="0.1.3",
        previous_tag="prod-v0.1.2",
        to_ref="HEAD",
        commit_entries=[
            module.CommitEntry(
                short_hash="abc1234", subject="feat: add export endpoint"
            ),
            module.CommitEntry(short_hash="def5678", subject="fix: harden auth checks"),
        ],
    )
    payload = module.ReleaseNotesPayload(
        headline="Search and reliability updates",
        overview="This release improves search workflows and reliability.",
        highlights=["Added export support", "Improved auth validation"],
        breaking_changes=[],
        sections=[
            module.ReleaseSection(title="Features", items=["Added export support"]),
            module.ReleaseSection(title="Fixes", items=["Improved auth validation"]),
        ],
    )

    markdown = module.render_markdown(context, payload)

    assert "# prod-v0.1.3" in markdown
    assert "## Highlights" in markdown
    assert "## Features" in markdown
    assert "## Source Commits" in markdown
    assert "`abc1234` feat: add export endpoint" in markdown
