# EMNLP 2026 System Demonstrations submission

Draft submission for the [EMNLP 2026 System Demonstrations track](https://2026.emnlp.org/calls/demos/).

## Track facts

| Item | Value |
|---|---|
| **Submission deadline** | **2026-07-04** (AoE, 11:59 PM UTC-12:00) |
| **Page limit** | 6 pages main content + unlimited references / ethics / appendix |
| **Bonus page on accept** | +1 page (7 total) |
| **Review type** | **Single-blind** — author names appear at submission |
| **Demo video** | Required, ≤ 2.5 min, MPEG-4 or hosted link (YouTube etc.) |
| **Evaluation** | Required — submissions without any evaluation **may be desk-rejected** |
| **Ethics section** | Not formally required, but absence in sensitive domains may lead to rejection (legal data qualifies as sensitive — we include one) |

## Files

- `paper.tex` — manuscript skeleton in ACL style
- `paper.bib` — BibTeX references (mirrors `paper/joss/paper.bib`)
- `figures/` — architecture diagram and UI screenshots (currently empty)

## One-time setup: fetch the ACL style files

The ACL style files (`acl.sty`, `acl_natbib.bst`, etc.) are not bundled
here — they are released under their own license and must be fetched
from the official repo:

```bash
cd paper/emnlp-demo
curl -L -o acl.sty https://raw.githubusercontent.com/acl-org/acl-style-files/master/latex/acl.sty
curl -L -o acl_natbib.bst https://raw.githubusercontent.com/acl-org/acl-style-files/master/latex/acl_natbib.bst
```

(Or clone <https://github.com/acl-org/acl-style-files> and copy the
`latex/` contents into this directory.)

## Build

With a local TeX Live installation:

```bash
cd paper/emnlp-demo
latexmk -pdf paper.tex
```

Or inside Docker (no TeX installed locally):

```bash
docker run --rm -v "$PWD":/workdir -w /workdir texlive/texlive:latest \
  latexmk -pdf paper.tex
```

Clean build artifacts with `latexmk -C`.

## Before submission checklist

- [ ] Replace every `\todo{...}` marker in `paper.tex`
- [ ] Run retrieval evaluation, fill in `Table~\ref{tab:retrieval}`
- [ ] Run extraction evaluation, fill in field-level numbers
- [ ] Run latency benchmark on the production deployment
- [ ] Generate `figures/architecture.pdf` (e.g., with TikZ or Excalidraw → PDF)
- [ ] Capture annotated UI screenshots (`figures/search-ui.pdf`, etc.)
- [ ] Record demo video (≤ 2.5 min, MPEG-4 or hosted link)
- [ ] Fill in author ORCIDs where required by the submission portal
- [ ] Verify final PDF fits 6 content pages (references/ethics/appendix don't count)
- [ ] Confirm Zenodo DOI resolves and matches the version we'll cite
- [ ] Run `latexmk -C && latexmk -pdf paper.tex` from a clean tree to catch missing assets

## Submission flow

EMNLP demo submissions typically go through OpenReview or the conference
softconf instance. **Check the official call** at
<https://2026.emnlp.org/calls/demos/> closer to the deadline for the
exact submission URL — it is usually opened a few weeks before the
deadline.

If the conference offers an ACL Rolling Review (ARR) commitment path
for demos, prefer direct submission to the demo track for faster
turnaround on a system-paper format.

## Companion JOSS draft

A separate JOSS draft lives at `paper/joss/`. The two papers target
different venues with different audiences:
- **JOSS** — software-paper format, no page limit, ~250–1000 word
  Summary + Statement of Need, no empirical evaluation required.
- **EMNLP Demo** — 6 pages, ACL LaTeX, demo video, empirical
  evaluation required.

It is acceptable to have both in flight simultaneously (JOSS does not
forbid concurrent venue submission for non-overlapping audiences), but
double-check JOSS's policy at submission time.
