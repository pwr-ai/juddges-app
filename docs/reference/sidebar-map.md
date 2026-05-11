# Sidebar reference

The left sidebar is the entry point to every primary workflow in the app.
This page is the canonical map of what each item does and which step of
the [First 30 minutes](../tutorials/first-30-minutes.md) tutorial covers
it.

![JUDDGES sidebar with Dashboard, Search Judgments, Research Collections, Base Coding Schema, and Compare Datasets items visible.](../assets/onboarding/dashboard.png)

| Item | Route | What it does | Tutorial reference |
|---|---|---|---|
| **Dashboard** | `/` | Headline corpus statistics, popular topics, and entry points to the main flows. The on-screen banner links into the in-app onboarding tour. | — |
| **Search Judgments** | `/search` | Hybrid semantic + full-text search over the corpus, with filters for jurisdiction, language, date, and issuing body. | [Step 01 — Search the corpus](../tutorials/first-30-minutes.md#step-01--search-the-corpus) |
| **Saved Searches** | `/saved-searches` | Persisted queries and filters. Visible to admin users only at present; will be opened up to all logged-in users as the feature matures. | (referenced under Step 01: *Save the search*) |
| **Research Collections** | `/collections` | Named sets of judgments — the working folder for a research question. Feeds into extraction pipelines. | [Step 02 — Build a research collection](../tutorials/first-30-minutes.md#step-02--build-a-research-collection) |
| **Base Coding Schema** | `/schemas/base` | The canonical 51-field extraction template, with EN/PL descriptions, JSON export, and a searchable field table. | [Step 04 — Read the base coding schema](../tutorials/first-30-minutes.md#step-04--read-the-base-coding-schema) |
| **Compare Datasets** | `/dataset-comparison` | Cross-jurisdiction analytics — corpus-level comparisons of PL vs UK judgment populations. | — |

## Routes reachable by URL but currently hidden from the sidebar

These pages exist and work, but are not surfaced as sidebar entries while
their UX is being refined. They become relevant once you've completed the
four-step tour.

| Route | What it does |
|---|---|
| `/chat` | Retrieval-augmented chat with cited sources. See [Step 03 — Ask a question with cited sources](../tutorials/first-30-minutes.md#step-03--ask-a-question-with-cited-sources). |
| `/extract` | Configure and launch an extraction job over a collection using a coding schema. |
| `/extractions` | Browse extraction job results and inspect the structured output table. |
| `/statistics` | Corpus-wide statistics: counts, completeness, decision types, date ranges. |

## How to find anything else

- Press <kbd>⌘ K</kbd> / <kbd>Ctrl K</kbd> anywhere in the app to open
  the command palette and search by page name.
- The footer of every page exposes a flat list of links to About, Team,
  Publications, Help, Contact, Privacy, and Terms.
- The bottom-left search box in the sidebar is reserved for the future
  in-app quick-search palette.
