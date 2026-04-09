# Unite! Researcher Discovery System — VLDB 2026 Demo Paper

A VLDB demo track paper describing **Unite!**, an interdisciplinary researcher discovery system for a network of nine European universities. Integrates OpenAlex and Semantic Scholar data, enriched with ORCID profiles and DOI-based abstract retrieval, providing hybrid (semantic + keyword) search.

## Prerequisites

- **TeX Live 2023+** with `pdflatex` and `bibtex`
- Ubuntu/Debian: `sudo apt install texlive-full` (or at minimum `texlive-latex-recommended texlive-fonts-extra texlive-bibtex-extra`)
- Optional: `latexmk` (`sudo apt install latexmk`)

## Building the PDF

**Full build** (resolves all citations and cross-references):

```bash
pdflatex -interaction=nonstopmode main.tex \
  && bibtex main \
  && pdflatex -interaction=nonstopmode main.tex \
  && pdflatex -interaction=nonstopmode main.tex
```

**Quick rebuild** (text-only changes, no new citations):

```bash
pdflatex -interaction=nonstopmode main.tex
```

**Using latexmk** (handles passes automatically):

```bash
latexmk -pdf main.tex
```

Output: `main.pdf`

## Cleaning Up

```bash
rm -f main.aux main.bbl main.blg main.log main.out main.fdb_latexmk main.fls main.synctex.gz
# or with latexmk:
latexmk -c
```

## Repository Structure

| File | Description |
|---|---|
| `main.tex` | Paper source (single file) |
| `bibiliography.bib` | Bibliography entries (note: intentional misspelling) |
| `acmart.cls` | VLDB/ACM document class (do not edit) |
| `ACM-Reference-Format.bst` | Bibliography style (do not edit) |
| `system_architecture.pdf` | System architecture figure (Fig. 1) |
| `figures/` | Additional figures |
| `vldb-template.tex` | Reference template (not compiled) |
| `sample.bib` | Sample bibliography from template (not used) |

## Submission

- **Conference**: VLDB 2026, Boston, MA, USA (Aug 31 - Sep 4, 2026)
- **Track**: Demonstrations
- **Page limit**: 4 pages (inclusive of all material)
- **Format**: Single-anonymous, PVLDB Vol. 19 templates
