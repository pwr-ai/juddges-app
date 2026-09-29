# How to compare PL and UK judgments

## Goal

Run one base-schema filter against both jurisdictions at once and read the
coded fields (appeal outcome, sentence, plea, gender, …) side by side, with
coverage shown honestly instead of implied. This is `/compare` — the fourth
step of the **Explore** sidebar flow (see `docs/reference/sidebar-map.md`).

## Steps

1. **Open `/compare`.** It starts with no filter and shows an empty state
   ("Ask a research question") — it never runs a whole-corpus comparison on
   its own. Add a filter or a text query to run it.
2. **Describe the question or pick chips.** Either click **Describe your
   search** and type a question in Polish or English (the same NL dialog as
   `/search/extractions`; see
   `docs/how-to/save-extraction-filter-as-collection.md`), or use the free-text
   box, the decision-date range, and the base-schema drawer directly. There is
   no jurisdiction control — `/compare` always runs both sides, and a
   `jurisdiction` key carried in from a pasted permalink is dropped.
3. **Read `N_PL` / `N_UK` and the three sections.** The totals bar shows how
   many judgments matched the filter in each jurisdiction (before any
   per-field coverage is applied). Below it, fields are grouped into three
   tiers:
   - **Primary** — both jurisdictions have coverage at or above 80 %; shown as
     a bar chart.
   - **Partial** — both jurisdictions have at least one coded judgment, but
     one is below 80 %; shown as a chart with a coverage badge.
   - **Unavailable** — at least one jurisdiction has zero coded judgments for
     that field; listed as a sentence, never drawn as a misleading 0 % bar.
   - (A fourth tier, **empty** — no judgment matched in either jurisdiction —
     is hidden entirely rather than shown as a blank chart.)
4. **Read the badge.** "coverage PL 74 % / UK 98 %" means: of the judgments
   that matched your filter in that jurisdiction, this is the share that also
   have this field coded. Coverage = `covered / total` (`total` = matched
   judgments with completed base extraction; `covered` = those with a
   non-null value in that column). The 80 % rule decides primary vs. partial;
   a jurisdiction at exactly 0 % covered moves the whole field to
   "unavailable" instead of drawing a zero-height bar next to a real one.
5. **Save as pair.** Click **Save as collection pair**, give it a name in the
   "Save both result sets" dialog, and submit. This creates two collections
   (`"<name> — PL"`, `"<name> — UK"`) from the current filter and links
   them; `/collections` then shows a `<name> · PL` / `<name> · UK` badge on
   each side, linking back to `/compare/<pairId>`.
6. **Run the same extension schema on both, then revisit `/compare/<pairId>`.**
   Open the pair (via the badge on `/collections`, or the link `/compare/<pairId>`
   you land on after saving). Until both sides have a completed extraction
   job, the extension section shows **Extract on PL collection** / **Extract
   on UK collection** buttons that open `/extract?collection=<id>` for each
   side — pick the same schema for both, or pick the second one to match a
   schema you already ran on the other side. Once both collections have a
   completed job with the **same** schema, reopen `/compare/<pairId>` — it
   adds an extension-schema section below the base fields, tallied from
   each side's newest successful job. If the two collections' newest jobs
   ran different schemas, or only one side has a completed job, the pair
   still shows its base-field comparison; the extension section explains
   why it is missing instead of guessing.
7. **Export CSV.** The export button downloads a long-format CSV of exactly
   the numbers on screen (UTF-8 with a BOM, so Excel renders Polish labels
   correctly). One row per (field, value, jurisdiction):

   | Column | Meaning |
   |---|---|
   | `field` | base-schema field name |
   | `value` | one coded value of that field |
   | `jurisdiction` | `PL` or `UK` |
   | `count` | matched judgments with this value, in this jurisdiction |
   | `share` | `count / covered` for this jurisdiction; empty when `covered` is 0 |
   | `coverage` | `covered / total` for this jurisdiction; empty when `total` is 0 |
   | `covered` | judgments in this jurisdiction with the field coded |
   | `total` | judgments in this jurisdiction matched by the filter (completed base extraction only) |

   Fields with no comparable values (unavailable / empty tiers) contribute no
   rows — there is nothing to compare, and the reason is already visible on
   screen.
8. **Copy link.** The `?f=`/`?q=`/`?nl=` query string is the same codec
   `/search/extractions` uses, so a `/compare` permalink is portable between
   the two pages (paste it into either one and it reproduces the same
   filter). A saved pair's link is just `/compare/<pairId>` — no filter blob
   needed, since the membership lives in the pair row.

## Caveats

- `case_type` and `court_level` are not exposed here — they are `judgments`
  columns, not base-schema fields, and are known to be miscoded on the UK
  side (`case_type = 'Civil'` on every UK row — 1,000/1,000 sampled;
  `court_level = 'Crown Court'` on most UK rows — 887/1,000 sampled — for
  what are actually Court of Appeal decisions; see
  `docs/reference/APP_STATUS_2026-08-21.md` §4). This is a data defect, not a
  missing feature, and it is out of scope to fix here.
- Free-text fields such as `keywords`/`legal_topics` are not comparable and
  never appear as chips: they are high-cardinality and PL-only in practice
  (0 coded on the UK side), so a side-by-side count would only show "UK: 0 %"
  for every value.
- Shares and coverage are descriptive statistics, not an inferential test —
  `/compare` reports proportions of the matched, coded judgments; it does not
  run a significance test on the difference between PL and UK, and coverage
  asymmetry between jurisdictions (a field coded for 77 % of PL judgments but
  99 % of UK judgments, say) can by itself produce a different-looking
  distribution even when the underlying rates are similar.

## Reference

Endpoint contracts, the underlying RPC, and error codes are documented in
`docs/reference/base-schema-filter-api.md` and `docs/api/API_REFERENCE.md`.
