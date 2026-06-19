# JOSS paper draft

Draft submission for the [Journal of Open Source Software](https://joss.theoj.org/).

## Files

- `paper.md` — manuscript with JOSS YAML frontmatter
- `paper.bib` — BibTeX references

## Before submitting

- Replace each author's `orcid: 0000-0000-0000-0000` placeholder with a real ORCID iD
- Confirm the `version` in `paper.bib` (`zenodo-juddges-app` entry) matches the tagged release being submitted
- Confirm corresponding-author and affiliations are correct
- Run the local build below and review the rendered PDF

## Local build (Docker)

JOSS uses [Open Journals' `inara` toolchain](https://github.com/openjournals/inara).
From the repository root:

```bash
docker run --rm \
  --volume "$PWD/paper":/data \
  --user "$(id -u):$(id -g)" \
  --env JOURNAL=joss \
  openjournals/inara
```

The rendered `paper.pdf` and `paper.crossref.xml` will appear next to `paper.md`.

## Submission

1. Tag a release (`prod-vX.Y.Z`) and ensure the Zenodo DOI resolves.
2. Submit at <https://joss.theoj.org/papers/new> with the repository URL and the released version.
3. JOSS opens a public review issue; address reviewer feedback by editing `paper.md` / `paper.bib` on a feature branch and merging into `main`.

## Word count target

JOSS expects **~250–1000 words** for *Summary* + *Statement of need* combined. The current draft sits inside that window; re-check after any edits.
