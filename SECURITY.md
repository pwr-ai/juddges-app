# Security Policy

We take security seriously. This document explains which versions of Juddges App
receive security fixes, how to report a vulnerability, and what to expect after
you do.

## Supported Versions

Juddges App follows a `prod-vMAJOR.MINOR.PATCH` release line. Only the current
minor line receives security fixes; older lines are addressed on a best-effort
basis when an upgrade path is impractical.

| Version line     | Status                                |
| ---------------- | ------------------------------------- |
| `prod-v0.1.x`    | Supported — security fixes published  |
| `< prod-v0.1.0`  | Best-effort only; please upgrade      |

The latest release is published as Docker images on Docker Hub
(`<docker-username>/juddges-frontend` and `<docker-username>/juddges-backend`)
and tagged in this repository as `prod-vX.Y.Z`.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security problems.**

Preferred channel — GitHub Security Advisories (private):

  https://github.com/pwr-ai/juddges-app/security/advisories/new

Alternative channel — email the maintainer:

  aisolutions@lukaszaugustyniak.com

When you report, please include as much of the following as you can:

- A clear description of the vulnerability and the affected component
  (frontend, backend API, ingestion script, deployment script, etc.).
- The version or commit SHA you tested against.
- Reproduction steps or a proof-of-concept (script, curl invocation,
  payload, or screenshots).
- Your assessment of impact: what an attacker can read, modify, or disrupt.
- Any suggested mitigation or patch, if you have one.
- Whether you would like to be credited in the advisory, and under what name.

### What to expect from us

- **Acknowledgement within 5 business days** of your initial report,
  confirming we have received it and assigned an internal owner.
- **Triage and remediation timeline within 14 days** of acknowledgement,
  including a target fix date and the affected version range.
- Regular status updates while a fix is in progress.
- Credit in the published advisory and release notes once the fix ships,
  unless you ask to remain anonymous.

If a report turns out to fall outside the scope of this project (see below),
we will say so explicitly and, where possible, point you at the right
upstream contact.

## Disclosure Policy

We follow **coordinated disclosure**. By default, please give us a
**90-day embargo** from the date of acknowledgement before public
disclosure. We will work with you to ship a fix and publish an advisory
within that window. If we need more time, we will explain why and propose
a revised date; if you need less time (for example, an exploit is already
public), tell us and we will accelerate.

Once a fix is released:

- A GitHub Security Advisory is published with a CVE where applicable.
- Release notes for the fix version reference the advisory.
- The reporter is credited unless they have requested otherwise.

## Out of Scope

Juddges App integrates with several third-party services. Vulnerabilities
in those services should be reported to their respective vendors, not to
this project:

- **OpenAI** (LLM and embeddings APIs) — https://openai.com/security/
- **Supabase** (PostgreSQL, pgvector, Auth, Storage) — https://supabase.com/.well-known/security.txt
- **Meilisearch** (full-text search engine) — https://github.com/meilisearch/meilisearch/security
- **Langfuse** (LLM observability, optional) — report via their GitHub Security Advisories
- **Redis** (Celery broker/result backend) — report via the Redis security process

We are happy to receive reports about how Juddges App **uses** these
services (for example, an API key being leaked into client-side code, or a
misconfigured row-level security policy on our schema). Bugs in the
upstream services themselves are not in scope.

Also out of scope:

- Vulnerabilities that require physical access to a user's machine.
- Issues in third-party dependencies that have no exploitable path through
  Juddges App (please still let us know so we can update, but treat them
  as best-effort).
- Social-engineering attacks against maintainers or users.
- Reports generated solely by automated scanners with no demonstrated
  impact.

Thank you for helping keep Juddges App and its users safe.
