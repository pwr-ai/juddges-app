# Contributing to Juddges App

Thanks for your interest in contributing. Juddges App is the web application companion to the [JuDDGES research project](https://github.com/pwr-ai/JuDDGES) at Wrocław University of Science and Technology. We welcome bug reports, feature ideas, documentation improvements, and code contributions.

This file is a quick on-ramp. The full contribution guide — environment setup, architecture overview, testing strategy, code style, and review expectations — lives at [`docs/contributing/CONTRIBUTING.md`](docs/contributing/CONTRIBUTING.md). Please read it before opening a non-trivial pull request.

## Filing an Issue

Use the templates under [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/) to report a bug, request a feature, or ask a question. Before filing, please search existing issues to avoid duplicates. Include reproduction steps, expected vs. actual behavior, and your environment (OS, Node/Python versions, deployment mode) for bug reports.

For security vulnerabilities, do **not** open a public issue. Follow the disclosure process in [`SECURITY.md`](SECURITY.md).

## Starting Work

1. Fork the repo and clone your fork.
2. Branch from `develop`, not `main`. Use a descriptive prefix: `feat/…`, `fix/…`, `docs/…`, `chore/…`, `refactor/…`.
3. Make focused commits. We follow [Conventional Commits](https://www.conventionalcommits.org/) — commit messages must use a recognized type (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`) and a short imperative subject.
4. Run lint, type checks, and the relevant test suites locally before pushing. See `docs/contributing/CONTRIBUTING.md` for exact commands per stack (frontend Next.js, backend FastAPI).
5. Open a pull request against `develop`. Link related issues, describe what changed and why, and include a test plan.

## Conduct

We expect contributors to be respectful in issues, pull requests, and discussions. Concerns about contributor behaviour can be sent to aisolutions@lukaszaugustyniak.com.

## Licensing

Juddges App is released under the Apache License 2.0. By submitting a contribution, you agree that your work will be licensed under the same terms. You retain copyright; we ask only for the rights granted by Apache-2.0. Do not contribute code you do not have the right to submit.

## Maintainers

Core team: Łukasz Augustyniak (lead), Jakub Binkowski, Albert Sawczyn, Kamil Tagowski, Michał Bernaczyk, Krzysztof Kamiński, Tomasz Kajdanowicz.

Questions that don't fit an issue template can go to aisolutions@lukaszaugustyniak.com.
