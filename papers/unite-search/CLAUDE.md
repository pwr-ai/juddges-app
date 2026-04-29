# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a LaTeX academic paper for the **VLDB demo track** describing **Unite!** — an interdisciplinary researcher discovery system for a network of nine European universities. The paper uses the VLDB/ACM `acmart` template (`sigconf, nonacm`). The repository is synced with Overleaf.

## Prerequisites

- TeX Live 2023+ (`pdflatex`, `bibtex`)
- On Ubuntu/Debian: `sudo apt install texlive-full` (or at minimum `texlive-latex-recommended texlive-fonts-extra texlive-bibtex-extra`)
- Optional: `latexmk` for simplified builds (`sudo apt install latexmk`)

## Build Commands

```bash
# Full build (pdflatex + bibtex, 3 passes to resolve all references and citations)
pdflatex -interaction=nonstopmode main.tex && bibtex main && pdflatex -interaction=nonstopmode main.tex && pdflatex -interaction=nonstopmode main.tex

# Quick compile (no bibliography update, useful when only editing text)
pdflatex -interaction=nonstopmode main.tex

# Clean auxiliary files
rm -f main.aux main.bbl main.blg main.log main.out main.fdb_latexmk main.fls main.synctex.gz

# Output: main.pdf (3 pages currently)
```

Alternatively, use `latexmk` if available:
```bash
latexmk -pdf main.tex        # Full build (handles all passes automatically)
latexmk -c                   # Clean aux files
```

## Repository Structure

- `main.tex` — The paper source (single-file paper)
- `bibiliography.bib` — Bibliography file (note: intentional misspelling "bibiliography")
- `acmart.cls` / `ACM-Reference-Format.bst` — VLDB/ACM template files (do not edit)
- `vldb-template.tex` — Reference template with example content (not compiled)
- `figures/` — Figures directory
  - `diagram_paper.drawio.png` — Data pipeline architecture diagram
- `system_architecture.pdf` — System architecture figure used in the paper
- `sample.bib` — Sample bibliography from the ACM template (not used in compilation)

## Conference & Submission Details

- **Conference**: VLDB 2026 — 52nd International Conference on Very Large Data Bases
- **Location**: Boston, MA, USA — Aug 31 - Sep 4, 2026
- **Track**: Demonstrations
- **Submission site**: https://cmt3.research.microsoft.com/PVLDBv19_2026/ (choose "Demo" track)
- **Demo Chairs**: Stefania Dumbrava (ENSIIE & INRIA Paris), John Paparrizos (Ohio State & Aristotle Univ. Thessaloniki)

### Key Dates (all AoE)

| Milestone | Date |
|---|---|
| Proposal submission deadline | March 29, 2026 |
| Notification of acceptance | May 31, 2026 |
| Camera-ready deadline | June 28, 2026 |

### Submission Requirements

- **4 pages max** inclusive of ALL material (references, figures, everything)
- Camera-ready format using PVLDB Vol. 19 templates: http://vldb.org/pvldb/volumes/19/formatting/
- Single-anonymous (must include author names and affiliations)
- Optional video submission (up to 5 min, 50MB max, MPEG/AVI/MP4) — added as supplementary file after initial paper submission
- Reviewers prioritize: **novelty/significance to data management**, exact demo scenarios, audience interaction, system architecture, and supported functionality

## Paper Context

- **Topic**: Unite! integrates OpenAlex and Semantic Scholar data, enriches with ORCID profiles and DOI-based abstract retrieval, and provides hybrid (semantic + keyword) search for researcher discovery
- **Current state**: Introduction and System Architecture sections are substantially written; Abstract, Search/Recommendation, and Demonstration sections contain only outline comments
- **Key comparison table** (Table 1): Compares Unite against Google Scholar, OpenAlex, Scopus, Semantic Scholar, and ResearchGate

## Writing Conventions

- Bibliography is in `bibiliography.bib` (not `sample.bib`)
- The `\bibliography{bibiliography}` call uses the misspelled filename — keep consistent
- Commented-out outlines (`%` lines) serve as writing guides for incomplete sections — preserve them when editing nearby content
- VLDB boilerplate blocks marked with `%%% VLDB block start/end %%%` must not be modified
