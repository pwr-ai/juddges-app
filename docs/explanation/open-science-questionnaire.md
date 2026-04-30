# Open Science Questionnaire — Juddges App

This document answers the standard open-science / FAIR-software questionnaire for **Juddges App**, the web application companion to the [JuDDGES research project](https://github.com/pwr-ai/JuDDGES). It is intended for funder reporting and external open-science assessments. For an internal rubric-style evaluation of the same project, see [`open-science-assessment.md`](open-science-assessment.md).

The repository being described is: <https://github.com/pwr-ai/juddges-app>

---

## Briefly describe the context and purpose of the web app

Juddges App is a web application for legal experts, researchers, and annotators working with judicial decisions from Poland and England & Wales. It provides:

- **Hybrid semantic + full-text search** over court judgments (Supabase pgvector for embeddings, Meilisearch for full-text).
- **Retrieval-augmented chat** for legal research, grounded in retrieved judgments.
- **Structured information extraction** from legal documents via LLM-driven schema generation.
- **Annotation workflow** with rich-text editing for labelling and dataset curation.
- **Analytics dashboard** for jurisdiction, court, and decision-trend insights.

Its primary purpose is to make the datasets and models produced by the JuDDGES research project accessible through an interactive interface, and to accelerate the creation of structured, high-quality legal datasets that can be used downstream — including for fine-tuning large language models for legal reasoning.

The web application is data-agnostic at the level of textual judgments: any legal document corpus that fits the ingestion schema can be loaded; the deployment used for testing is populated from public Hugging Face datasets.

---

## DOCUMENTATION — Describe the license and accessibility

### How can the web app be accessed by third parties?

The source code is publicly available at <https://github.com/pwr-ai/juddges-app> under the **Apache License 2.0** (see [`LICENSE`](../../LICENSE)). Both the frontend (`frontend/package.json`) and the backend (`backend/pyproject.toml`) declare the same license.

The application is self-hostable via Docker Compose. It depends on the following external services, which third parties must provision themselves:

- **Supabase** (PostgreSQL + pgvector + Auth) — open-source under Apache 2.0 / PostgreSQL License; can be self-hosted or used as a managed service.
- **OpenAI API** (or any LiteLLM-compatible provider) — required for embeddings and chat. A `BACKEND_API_KEY` and `OPENAI_API_KEY` are required in `.env`.
- **Meilisearch** — open-source under MIT License (full-text search).
- **Redis** — open-source (Celery task queue + cache).
- **Langfuse** (optional) — open-source under MIT License (LLM observability).

Pre-built Docker images are published on Docker Hub as `${DOCKER_USERNAME}/juddges-{frontend,backend}` and tagged with the `prod-v<semver>` release version.

### What type of documentation is available, provided with the web app and delivered under the same conditions?

Technical documentation lives in [`docs/`](../) and is organized under the [Diátaxis framework](https://diataxis.fr/):

- [`docs/tutorials/`](../tutorials/) — learning-oriented walkthroughs
- [`docs/how-to/`](../how-to/) — task-oriented guides (deployment, data ingestion, etc.)
- [`docs/reference/`](../reference/) — API and configuration reference
- [`docs/explanation/`](../explanation/) — architecture and concept deep-dives
- [`docs/getting-started/`](../getting-started/) — setup and onboarding
- [`docs/architecture/`](../architecture/) — system design notes
- [`docs/features/`](../features/) — feature-specific documentation

All documentation is in **Markdown**, lives inside the same repository as the source code, and is therefore released under the same **Apache License 2.0** as the software.

The backend exposes interactive API documentation at runtime:

- Swagger UI: `http://localhost:8004/docs`
- ReDoc: `http://localhost:8004/redoc`
- Generated automatically by FastAPI from the typed Python schemas (an OpenAPI 3 specification).

### Does the documentation describe how to use/build/deploy/install the web app?

Yes. Coverage:

- **Install / quick start** — root [`README.md`](../../README.md) covers prerequisites, environment configuration, database migrations, and Docker-based local startup.
- **Build / deploy** — [`docs/how-to/deployment.md`](../how-to/deployment.md) and the helper scripts [`scripts/build_and_push_prod.sh`](../../scripts/build_and_push_prod.sh) and [`scripts/deploy_prod.sh`](../../scripts/deploy_prod.sh).
- **Branching and release flow** — documented in [`README.md`](../../README.md) and [`CLAUDE.md`](../../CLAUDE.md): two-branch model (`main` for production, `develop` for integration), `prod-v<semver>` tag convention, hotfix workflow.
- **Data ingestion** — [`docs/how-to/data-ingestion.md`](../how-to/data-ingestion.md) and the [`scripts/ingest_judgments.py`](../../scripts/ingest_judgments.py) CLI.

---

## TESTING — Are sample data and/or parameters that can be used to test the web app available with the source code?

Yes. The repository ships with reproducible data ingestion against public Hugging Face datasets curated by the JuDDGES research group (<https://huggingface.co/JuDDGES>):

```bash
# Quick smoke test — 20 judgments total
python scripts/ingest_judgments.py --polish 10 --uk 10

# Full sample dataset — ~6,000 judgments (Polish + England & Wales)
python scripts/ingest_judgments.py --polish 3000 --uk 3000
```

Automated tests:

- **Backend** — [`pytest`](https://pytest.org/) with `@pytest.mark.unit` / `@pytest.mark.integration` markers; integration tests require live database, Redis, and OpenAI API.
- **Frontend** — Jest for unit tests and [Playwright](https://playwright.dev/) for end-to-end browser tests (`frontend/`).

Search-quality regression is tracked separately, with the methodology documented in [`docs/explanation/search-benchmark-methodology.md`](search-benchmark-methodology.md).

---

## INTEROPERABILITY — Do you use existing and standard input/output formats?

Yes. The application uses widely supported, vendor-neutral formats:

- **HTTP REST API** with JSON request and response bodies.
- **OpenAPI 3** specification auto-generated by FastAPI; available at `/docs` (Swagger UI) and `/redoc` and importable into any standards-compliant client generator.
- **GraphQL** (Strawberry) for selected query endpoints.
- **PostgreSQL** as the primary store (open standard).
- **pgvector** embeddings as standard `vector(N)` columns.
- **Markdown** for all documentation.
- **JSON** for ingestion pipelines and configuration.
- **CFF 1.2.0** for citation metadata ([`CITATION.cff`](../../CITATION.cff)).

---

## VERSIONING — Do you use a version control system?

Yes. The project uses **Git**, with the canonical repository hosted on **GitHub** at <https://github.com/pwr-ai/juddges-app>.

Workflow conventions:

- **Two-branch model**: `main` (production) and `develop` (integration). Feature/fix branches start from `develop` and are merged back into `develop` via pull requests.
- **Conventional Commits** for commit messages.
- **Annotated Git tags** of the form `prod-v<semver>` (e.g. `prod-v0.1.3`) mark every production release.
- Synchronized version metadata across `VERSION`, `backend/pyproject.toml`, and `frontend/package.json`, kept in sync by [`scripts/build_and_push_prod.sh`](../../scripts/build_and_push_prod.sh).

---

## REPRODUCIBILITY

### Do you provide releases of your software?

Yes. Releases are published as:

- **Annotated Git tags** `prod-v<semver>` on the `main` branch — see <https://github.com/pwr-ai/juddges-app/tags>.
- **Docker images** on Docker Hub, tagged with the matching version and `latest`.
- **Zenodo archive** with a persistent DOI:
  - Concept DOI (always resolves to the latest release): [10.5281/zenodo.19911856](https://doi.org/10.5281/zenodo.19911856)

### How do you define language-specific dependencies of your web app and their version?

Dependencies are pinned per-language in standard manifest files:

- **Python (backend)** — Python 3.12+; dependencies declared in [`backend/pyproject.toml`](../../backend/pyproject.toml) and locked in `backend/poetry.lock` via [Poetry](https://python-poetry.org/).
- **JavaScript / TypeScript (frontend)** — Node.js 18+; dependencies declared in [`frontend/package.json`](../../frontend/package.json) and locked in `frontend/package-lock.json` via npm.
- **Container runtime** — Dockerfiles in `backend/Dockerfile` and `frontend/Dockerfile`; orchestration in `docker-compose.yml` (production) and `docker-compose.dev.yml` (development).

The codebase is implemented in English; the web application UI supports English and Polish, and the underlying search and extraction can be applied to any language. Test data is in Polish and English.

### Do you state how to report bugs and/or usability problems by the software user(s)?

Yes. Bugs, feature requests, and usability problems can be reported via **GitHub Issues** at <https://github.com/pwr-ai/juddges-app/issues>.

The contribution workflow — including how to file issues and open pull requests — is documented in [`docs/contributing/CONTRIBUTING.md`](../contributing/CONTRIBUTING.md).

### Do you state how to report bugs and/or usability problems by the web app user(s)?

End-user (non-developer) feedback channels are available within the application via the in-app feedback widget (thumbs up/down on search results and chat responses), which writes to the backend `feedback` endpoints. Public-facing bug reports for hosted deployments should also use **GitHub Issues** at <https://github.com/pwr-ai/juddges-app/issues>.

---

## RECOGNITION — Do you include citation information (CITATION.cff, codemeta.json or BibTeX)?

Yes. The repository includes a [`CITATION.cff`](../../CITATION.cff) file at the root, in [Citation File Format 1.2.0](https://citation-file-format.github.io/). It contains:

- Full author list with affiliations (Wrocław University of Science and Technology, University of Wrocław, Court of Appeal in Wrocław).
- Persistent identifier — Zenodo concept DOI [10.5281/zenodo.19911856](https://doi.org/10.5281/zenodo.19911856).
- License (Apache-2.0), repository URL, abstract, keywords, and a `preferred-citation` block.

GitHub renders this metadata as a **"Cite this repository"** button in the repository sidebar, providing one-click APA, BibTeX, and other citation formats.

The DOI badge on the repository README links directly to the Zenodo deposit:

```markdown
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.19911856.svg)](https://doi.org/10.5281/zenodo.19911856)
```
