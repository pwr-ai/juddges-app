# Domain glossary

## Judgment

A court decision in the `judgments` corpus. Some existing paths and fields
still call a judgment a document.

## Extraction filter

Predicates over extracted base-schema fields and scope fields such as
jurisdiction, decision date, and collection membership, optionally combined
with a text query. The shared SQL filter determines which judgments match.
The natural-language question records where a filter came from; manual edits
do not clear that provenance.

## Cohort

The judgments selected for an analysis. An extraction-filter cohort contains
the matching judgments. A precedent cohort contains the raw vector-search
candidates before the separate ranking step; its order and membership need
not match the ranked shortlist.

## Precedent ranking

The ordered shortlist returned by precedent search. Selecting a value in the
cohort filters the visible shortlist while preserving each judgment's
original one-based rank. Accepting a new search result clears that selection.

## Collection

A user-owned saved membership of judgments. Saving an extraction filter
copies the matching judgment identifiers into a collection; it does not
create a continuously evaluated query.

## Collection pair

Linked PL and UK collections created from the same extraction filter. Saved
pair comparisons use the collections' current membership rather than
reapplying the stored filter and text query. Creation compensates failed
writes by attempting to delete the collections created so far; this cleanup
is best-effort, not a database transaction.
