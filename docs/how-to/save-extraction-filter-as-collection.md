# How to turn a research question into a collection

This walks through `/search/extractions` end to end: a natural-language
question → a reviewed, shareable filter → a highlighted judgment → a saved
collection.

1. Open `/search/extractions` and click **Describe your search**.
2. Type the question in Polish or English, e.g. "kobiety skazane za oszustwo
   z wyrokiem w zawieszeniu, PL i UK, 2015–2024".
3. Review the translated filter: jurisdiction and decision date appear under
   **Scope** (above the drawer), everything else as removable chips. Click
   **Apply to form** — nothing runs until you do.
4. Adjust chips (×) or the Scope/Quick controls. The URL
   (`?f=<filters>&q=<text_query>&nl=<question>`) is shareable and reproduces
   the same result set for anyone who opens it.
5. Click a result row to open `/documents/{id}#base-fields` — the base-schema
   cells that satisfied your filter are highlighted, with a caption stating
   how many fields matched (also announced to screen readers).
6. Click **Save as collection** in the results bar (disabled only when there
   are zero results). The name defaults to your question; edit it if you
   like, then press **Save**.
   - There is no client-side cap: if the matched set exceeds the backend's
     `SAVE_FROM_FILTER_MAX_DOCUMENTS` (env var, default 5000), the save
     request fails with a `413` and the dialog shows the backend's message
     plus the matched/limit counts (narrow the filter and retry).
7. On success you land on `/collections/{id}` with every matching judgment
   attached. Extraction jobs accept at most `MAX_DOCUMENTS_PER_JOB` (env var,
   default 1000) documents at a time, so extracting a large collection runs
   across several jobs.

## Notes

- Nothing is auto-applied and nothing is auto-saved: the NL dialog only
  pre-fills the filter form, and the save dialog only submits when you press
  **Save**. You can always inspect and edit the chips before either step.
- `case_type` and `court_level` are not available as NL or Scope filters —
  this is a known data defect (UK criminal appeals are miscoded as `Civil`
  and as `Crown Court`; see `docs/reference/APP_STATUS_2026-08-21.md` §4),
  not a missing feature.
- See `docs/reference/base-schema-filter-api.md` for the underlying RPC,
  endpoint contracts, and the exact filter JSON shape.
