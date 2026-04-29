# Open Science Assessment

This document evaluates the project's open-science alignment, assuming the source judgment data is publicly available on Hugging Face.

## Scope

This assessment uses a practical rubric based on:

- UNESCO open-science principles
- FAIR-style expectations for reuse, provenance, and accessibility
- Hugging Face guidance for public dataset and model documentation
- Standard software citation practice

The goal is not just to ask whether the code or data is visible, but whether the project is clearly reusable, citable, and responsibly documented.

## Summary

Overall rating: `3/5`

The project is strong on documentation, engineering reproducibility, and source provenance. It is materially weaker on the formal artifacts that usually distinguish a merely public project from a genuinely open-science-ready one:

- explicit software licensing
- machine-readable citation metadata
- dataset/model card style documentation
- responsible-use and limitations documentation

Public availability on Hugging Face helps significantly, but it does not replace those requirements.

## Category Ratings

### 1. Open Access to Data

Rating: `4/5`

Strengths:

- The repo names upstream datasets in `README.md`.
- The ingestion flow is documented in `docs/how-to/data-ingestion.md`.
- The main ingestion path loads Hugging Face datasets directly in `scripts/ingest_judgments.py`.

Assessment:

If the datasets are publicly available on Hugging Face, the project scores well on access. However, public availability alone is not enough for strong FAIR/open-science alignment.

## 2. Open-Source Software

Rating: `1/5`

Strengths:

- The repo is publicly inspectable.

Weaknesses:

- The repository claims MIT licensing in `README.md` and `docs/architecture/overview.md`.
- There is no actual `LICENSE` file in the repository root.

Assessment:

This is the biggest gap. Public code without a real license is not clearly open for reuse. The mismatch between the README claim and the missing file creates ambiguity.

## 3. Dataset Documentation

Rating: `2.5/5`

Strengths:

- The repo includes ingestion documentation and source descriptions.
- Transformation and output artifacts are documented in `scripts/README.md`.
- The ingestion guide explains source schemas and mappings.

Weaknesses:

- No project-level dataset card or datasheet for the derived 6K corpus was found.
- No explicit documentation was found for license inheritance or downstream redistribution constraints for derived data products.

Assessment:

This is better than many internal tools, but still below strong open-science practice. If the derived datasets are published, they should have proper dataset-card-style documentation.

## 4. Reproducibility

Rating: `4/5`

Strengths:

- Setup and run instructions are present in `README.md`.
- Scripts include reproducibility-oriented Docker guidance in `scripts/README.md`.
- Testing documentation exists in `docs/testing/TESTING.md`.
- Search benchmarking methodology is documented in `docs/explanation/search-benchmark-methodology.md`.

Weaknesses:

- Some workflows depend on external services and credentials.
- Reproducibility is operationally solid, but not yet packaged as a full research compendium release.

Assessment:

This is one of the stronger areas of the project.

## 5. Provenance and FAIR Reuse

Rating: `3/5`

Strengths:

- The ingestion pipeline stores provenance fields like `source_dataset`, `source_id`, and `source_url`.
- The repo documents source datasets and transformation logic.

Weaknesses:

- There is no clear project-level statement about versioned derived datasets, persistent identifiers, or release preservation.
- FAIR-style reuse would benefit from richer metadata, clearer licensing, and stronger release/versioning conventions for data artifacts.

Assessment:

The provenance model is directionally good, but still incomplete from a FAIR/open-science perspective.

## 6. Responsible Use and Limitations

Rating: `2/5`

Strengths:

- The broader product contains privacy and legal disclaimers in application/legal areas.

Weaknesses:

- No top-level dataset card, model card, or equivalent artifact was found covering:
  - intended use
  - out-of-scope use
  - limitations
  - possible bias
  - quality caveats
  - responsible-use guidance

Assessment:

This is a meaningful gap if the project is positioned as a research or open-science artifact rather than just an application repository.

## 7. Citation and Scholarly Credit

Rating: `1/5`

Strengths:

- The project has enough structure that it could be cited.

Weaknesses:

- No `CITATION.cff` or equivalent citation metadata was found.
- No clear citation guidance for software, data, or derived outputs was found.

Assessment:

This is another high-impact gap. Software and data citation are standard parts of open-science practice.

## 8. Community Openness

Rating: `3/5`

Strengths:

- The repo includes contribution guidance in `docs/contributing/CONTRIBUTING.md`.
- The same document includes a code-of-conduct section.

Weaknesses:

- No separate governance document was found.
- No separate security-policy document was found.

Assessment:

Reasonable for an early-stage project, but not especially mature.

## Key Evidence from the Repository

- `README.md` names the public data sources and provides setup instructions.
- `docs/how-to/data-ingestion.md` documents source schemas, transformation, and ingestion.
- `scripts/README.md` documents data-processing, curation, and benchmark scripts.
- `scripts/ingest_judgments.py` stores source provenance fields in transformed records.
- `docs/testing/TESTING.md` and `docs/explanation/search-benchmark-methodology.md` support reproducibility and evaluation.

## Notable Issues

### Missing License File

The repository claims:

- `README.md`: "MIT License - See LICENSE file for details"
- `docs/architecture/overview.md`: same claim

But no root `LICENSE` file exists.

This should be treated as a real open-science blocker.

### Missing Citation Metadata

No `CITATION.cff` or similar citation file was found.

### Missing Dataset-Card Style Documentation

No project-level dataset card or datasheet was found for:

- the curated Polish dataset
- the combined 6K corpus
- any other derived research data artifact

### Documentation Inconsistency Around Hugging Face Tokens

There is a small reproducibility/documentation inconsistency:

- `scripts/README.md` says `HF_TOKEN` is required for the ingestion script.
- `.env.example` says a Hugging Face token is only needed for private datasets.
- The main ingestion script itself primarily requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

This is not a major blocker, but it should be cleaned up.

## Recommended Improvements

### Highest Priority

1. Add a real root `LICENSE` file matching the stated license.
2. Add a root `CITATION.cff`.
3. Add a dataset card for any public derived dataset release.

### Medium Priority

1. Add a model/evaluation card for the search and embedding pipeline.
2. Add a responsible-use section covering intended use, limitations, and validation boundaries.
3. Version and archive code/data/results together for reproducible releases.

### Lower Priority

1. Add governance and security-policy documents.
2. Harmonize Hugging Face token documentation across the repo.

## Final Verdict

Assuming the judgment data is publicly available on Hugging Face, the project is meaningfully closer to open science than a typical closed internal AI application.

However, it is not yet fully open-science-ready in the stronger sense used by research and open-data communities. The current state is best described as:

- public and reasonably reproducible
- partially provenance-aware
- not yet formally open/reusable enough

Final rating: `3/5`
