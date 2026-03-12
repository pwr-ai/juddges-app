#!/usr/bin/env python3
"""Generate markdown release notes from git commits using OpenAI."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from openai import OpenAI
from pydantic import BaseModel, Field

DEFAULT_MODEL = os.getenv("OPENAI_RELEASE_NOTES_MODEL", "gpt-4o-mini")
TAG_PATTERNS = ("prod-v*", "v*")


class ReleaseSection(BaseModel):
    title: str
    items: list[str] = Field(default_factory=list)


class ReleaseNotesPayload(BaseModel):
    headline: str
    overview: str
    highlights: list[str] = Field(default_factory=list)
    breaking_changes: list[str] = Field(default_factory=list)
    sections: list[ReleaseSection] = Field(default_factory=list)


@dataclass(frozen=True)
class CommitEntry:
    short_hash: str
    subject: str


@dataclass(frozen=True)
class ReleaseContext:
    version: str
    previous_tag: str | None
    to_ref: str
    commit_entries: list[CommitEntry]

    @property
    def comparison_label(self) -> str:
        return self.previous_tag or "initial-history"


def run_git(repo_root: Path, *args: str) -> str:
    result = subprocess.run(  # noqa: S603
        ["git", "-C", str(repo_root), *args],  # noqa: S607
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def resolve_previous_tag(repo_root: Path) -> str | None:
    for pattern in TAG_PATTERNS:
        output = run_git(repo_root, "tag", "--list", pattern, "--sort=-v:refname")
        tags = [line.strip() for line in output.splitlines() if line.strip()]
        if tags:
            return tags[0]
    return None


def collect_commit_entries(
    repo_root: Path,
    previous_tag: str | None,
    to_ref: str,
) -> list[CommitEntry]:
    git_args = ["log", "--no-merges", "--format=%h%x09%s"]
    if previous_tag:
        git_args.append(f"{previous_tag}..{to_ref}")
    else:
        git_args.extend(["-20", to_ref])

    output = run_git(repo_root, *git_args)
    entries: list[CommitEntry] = []
    for line in output.splitlines():
        if not line.strip():
            continue
        short_hash, subject = line.split("\t", 1)
        entries.append(CommitEntry(short_hash=short_hash, subject=subject.strip()))
    return entries


def build_release_context(
    repo_root: Path,
    version: str,
    previous_tag: str | None = None,
    to_ref: str = "HEAD",
) -> ReleaseContext:
    resolved_previous_tag = previous_tag or resolve_previous_tag(repo_root)
    return ReleaseContext(
        version=version,
        previous_tag=resolved_previous_tag,
        to_ref=to_ref,
        commit_entries=collect_commit_entries(repo_root, resolved_previous_tag, to_ref),
    )


def build_prompt(context: ReleaseContext) -> str:
    commit_lines = "\n".join(
        f"- {entry.short_hash} {entry.subject}" for entry in context.commit_entries
    )
    return (
        f"Release version: prod-v{context.version}\n"
        f"Compare range: {context.comparison_label}..{context.to_ref}\n"
        f"Commit count: {len(context.commit_entries)}\n\n"
        "Generate polished release notes for end users and developers.\n"
        "Use only the commit subjects provided below.\n"
        "Do not invent features, bug fixes, or breaking changes.\n"
        "Prefer user-facing language, but keep technical accuracy.\n"
        "Group related items into a small number of sections.\n"
        "If there are no breaking changes, return an empty list.\n\n"
        "Commits:\n"
        f"{commit_lines or '- No commits in range'}"
    )


def generate_release_notes_payload(
    context: ReleaseContext,
    model: str,
) -> ReleaseNotesPayload:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is required to generate release notes.")

    client = OpenAI()
    response = client.responses.parse(
        model=model,
        temperature=0.2,
        text_format=ReleaseNotesPayload,
        instructions=(
            "You write concise, accurate software release notes in markdown-friendly "
            "language. Summarize commit subjects into clear sections. Do not mention "
            "that the source input is commit messages. Never hallucinate."
        ),
        input=build_prompt(context),
    )

    payload = response.output_parsed
    if payload is None:
        raise RuntimeError("OpenAI returned no parsed release notes payload.")
    return payload


def render_markdown(context: ReleaseContext, payload: ReleaseNotesPayload) -> str:
    lines = [
        f"# prod-v{context.version}",
        "",
        f"> {payload.headline.strip()}",
        "",
        f"_Generated on {date.today().isoformat()} from "
        f"`{context.comparison_label}..{context.to_ref}` "
        f"({len(context.commit_entries)} commit"
        f"{'' if len(context.commit_entries) == 1 else 's'})._",
        "",
        "## Summary",
        payload.overview.strip(),
        "",
    ]

    if payload.highlights:
        lines.append("## Highlights")
        lines.extend(f"- {item}" for item in payload.highlights if item.strip())
        lines.append("")

    if payload.breaking_changes:
        lines.append("## Breaking Changes")
        lines.extend(f"- {item}" for item in payload.breaking_changes if item.strip())
        lines.append("")

    for section in payload.sections:
        items = [item.strip() for item in section.items if item.strip()]
        if not items:
            continue
        lines.append(f"## {section.title.strip()}")
        lines.extend(f"- {item}" for item in items)
        lines.append("")

    if context.commit_entries:
        lines.append("## Source Commits")
        lines.extend(
            f"- `{entry.short_hash}` {entry.subject}" for entry in context.commit_entries
        )
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def write_output(markdown: str, output_path: Path | None) -> None:
    if output_path is None:
        sys.stdout.write(markdown)
        return

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(markdown, encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate release notes from git commits using OpenAI.",
    )
    parser.add_argument("--version", required=True, help="Release version without prefix.")
    parser.add_argument(
        "--from-ref",
        default=None,
        help="Optional git ref/tag to start from. Defaults to latest prod-v* or v* tag.",
    )
    parser.add_argument(
        "--to-ref",
        default="HEAD",
        help="Git ref to end at. Defaults to HEAD.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Write the generated markdown to this path. Defaults to stdout.",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"OpenAI model to use. Defaults to {DEFAULT_MODEL}.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parent.parent
    context = build_release_context(
        repo_root=repo_root,
        version=args.version,
        previous_tag=args.from_ref,
        to_ref=args.to_ref,
    )
    payload = generate_release_notes_payload(context, model=args.model)
    markdown = render_markdown(context, payload)
    write_output(markdown, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
