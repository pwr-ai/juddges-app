# prod-v1.5.12

> Release Notes for Version prod-v1.5.12

_Generated on 2026-09-30 from `prod-v1.5.11..HEAD` (170 commits)._

## Summary
This release includes various enhancements, bug fixes, and dependency updates aimed at improving the overall functionality and user experience.

## Highlights
- Enhanced cohort features for better data handling.
- Improved extraction search capabilities with new filtering options.
- Updated dependencies for better performance and security.

## Ecosystem Improvements
- Allowed list label elements instead of the whole HTML profile.
- Maintained line breaks and italics in mermaid labels.

## Dependency Updates
- Raised the undici override floor to 7.29.1.
- Overrode lodash-es to 4.18.1 under chevrotain.
- Bumped mermaid from 11.17.2 to 12.0.0 in /frontend.

## Precedents Enhancements
- Rendered the cohort block and filtered the ranked list.
- Decoupled rank badge from document_id equality.
- Formatted enum values and improved PL grammar.

## Extraction and Search Features
- Saved filtered result sets as collections.
- Highlighted base fields that matched the extraction filter.
- Implemented jurisdiction and decision_date fields on BaseSchemaFilter.

## User Interface Updates
- Removed dead legal-reference-badge and its CSS rule.
- Improved error handling in SaveAsCollectionDialog.

## Testing and Documentation
- Added Playwright tests for agents targeting route-contract harness.
- Updated documentation for the /compare endpoint and its usage.

## Source Commits
- `0b01d977` fix(ecosystem): allowlist label elements instead of the whole HTML profile
- `9a08b68e` fix(ecosystem): keep line breaks and italics in mermaid labels
- `512b4d52` chore(deps): raise the undici override floor to 7.29.1
- `f17f605d` chore(deps): override lodash-es to 4.18.1 under chevrotain
- `a2f91d1e` fix(docker): run workers under init to reap zombie processes
- `f1d1a2c6` chore(deps): lock psycopg 3.3.6 to match psycopg-binary
- `eeba950f` chore(deps): bump mermaid from 11.17.2 to 12.0.0 in /frontend
- `92a82dfc` chore(deps): bump the pip-minor-patch group across 1 directory with 8 updates
- `e60bb895` chore(deps): bump the npm-minor-patch group across 1 directory with 18 updates
- `e317e8a8` fix(precedents): format enum values, fix PL grammar, harden chart spec
- `9161b17a` fix(precedents): decouple rank badge from document_id equality
- `c679924f` fix(precedents): attach document_id when loading candidate rows
- `2e22f5d8` fix(agents): stop un-ignoring personal skill symlinks under .claude
- `98fbbe89` test(precedents): route-contract spec for the cohort block
- `074224ed` fix(precedents): keep rank badge as the unfiltered ranking position
- `535787b4` fix(test): assert real collection document counts, not a stub artifact
- `7a42ff45` feat(precedents): render the cohort block and filter the ranked list
- `48177307` fix(toast): render both success-toast actions instead of dropping secondary
- `28f98d63` chore(test): add playwright test agents targeting route-contract harness
- `5d97e64e` feat(precedents): In similar cases block over the vector cohort
- `1e134fe3` feat(i18n): precedents cohort copy in English and Polish
- `0f2a7cd3` feat(precedents): cohort types and pure grouping helpers
- `30cf963b` chore(openapi): regenerate snapshot and types for the cohort fix wave
- `53fcd35a` fix(precedents): apply whole-branch review fix wave for the cohort feature
- `31d1d1a5` chore(openapi): regenerate snapshot and types for the precedents cohort
- `4fc1be7a` feat(precedents): resolve a case number typed into the query box
- `bd692a0a` feat(precedents): return the raw vector cohort before the ranking pass
- `ce49da13` feat(db): batched cohort projection and case-number lookup
- `caaf04dc` chore(ui): delete the dead legal-reference-badge and its CSS rule
- `8a2c87cb` docs(precedents): add phase D implementation plan
- `6389e211` fix(frontend): account for the 5th Explore step in FlowStepper tests
- `3f7d2afe` fix(db): revoke the cache tables from service_role too, and guard the lock
- `b89992a0` docs(compare): correct the /compare empty-state description
- `a826d025` fix(compare): NULL-safe job ordering; test empty-array coverage
- `6349928d` fix(compare): safe CSV download, 4xx retry skip, save-pair ordering, i18n copy
- `36000cd6` fix(db): bring LangChain LLM cache tables under RLS
- `270072b5` fix(agents): anchor the evidence gate to the script, not the caller's cwd
- `4b0cf934` fix(search): keep the space either side of a highlighted chunk
- `72b51b01` chore(agents): block finishing a frontend change without route-contract evidence
- `a88ba51e` docs(compare): fix jurisdiction-stripping, UI labels, and coverage caveat
- `c3cfaa77` docs(compare): how-to, API reference, spec of record for PL/UK compare
- `ada70a1a` feat(collections): pair badge linking to /compare
- `85b4e5bc` feat(nav): add /compare to the Explore flow, palette, and dataset-comparison page
- `b8f86fe6` fix(compare): tier-correct extension fields, pair 404 state, save-pair latch
- `916d636b` feat(compare): /compare/[pairId] with extension-schema section
- `5f46b924` feat(compare): save result as PL/UK collection pair
- `b205473a` fix(stats): close first-use gaps in the statistics view
- `91d80734` feat(compare): /compare page with side-by-side share charts and coverage tiers
- `4847990c` fix(test): call the arg-less pairs proxy GET without a request
- `d20ae61a` test(stats): assert a field card renders in the statistics route-contract spec
- `9f6cde04` test(stats): route-contract spec for the statistics view
- `3ccf6b2b` fix(compare): buildComparePermalink no longer touches window with no origin
- `09ad8a35` feat(bff): proxy routes for /compare and /collections/pairs
- `3a6a705b` fix(stats): sync the result view from the URL and narrow drill-back to the clicked bar
- `1645a32a` feat(compare): client types, hooks, share transform, permalink
- `308f70c3` fix(i18n): correct Polish compare copy from review round 1
- `ac9c5bd8` feat(stats): statistics view on /search/extractions with drill-back and export
- `1479f114` feat(i18n): compare namespace (en, pl)
- `3ea2e73a` refactor(charts): share BivariateBarChart; add yTickSuffix/hoverTemplate
- `19af9191` feat(stats): view toggle, scale slider and field card components
- `acf30506` refactor(api): make the pair-id UUID guard public for the compare router
- `e411b005` feat(stats): CSV and cohort.json export helpers
- `0dba8a71` chore(openapi): regenerate snapshot and types for GET /compare/pairs/{pair_id}
- `7ec1a3ed` feat(api): GET /compare/pairs/{id} with extension-schema fields
- `e1cf7ea2` fix(stats): keep the sampling seed non-optional and scoped to the statistics view
- `ba0098f6` feat(stats): aggregate types, field allowlist, query hook and URL state
- `fff1cd50` fix(api): degrade gracefully when the collection-pairs lookup fails
- `de1fc1d4` refactor(charts): move bar chart primitives to components/charts
- `3582fd17` feat(api): GET /collections carries the PL/UK pair reference
- `27e278d7` fix(api): strip the from-filter name once, before the pair bound check
- `12c4fb6c` fix(api): bound the pair name to 200 chars in split mode
- `21c835a8` docs: restore CRLF line endings in API_REFERENCE.md
- `2fd4a535` feat(api): split_by_jurisdiction on POST /collections/from-filter
- `166a73ac` feat(api): GET/DELETE /collections/pairs
- `a0cdfed2` feat(db): CollectionPairsDB over collection_pairs
- `db15eb7c` fix(compare): bound and dedupe fields, run the RPC loop off the event loop
- `3d8c1354` docs(stats): default field set is seven fields in the performance target
- `bf557701` feat(api): POST /compare/export long CSV
- `22e59773` docs(stats): document aggregate_extracted_data in the base-schema filter reference
- `599a17ea` fix(stats): bound seed, cap p_fields and drop free-text field from the default set
- `146da8cc` feat(api): POST /compare/facets
- `854f178a` feat(compare): CompareService over the by-jurisdiction facet RPC
- `72b0f529` feat(filters): strip_ignored drops jurisdiction for by-jurisdiction callers
- `1caafa5c` feat(compare): comparable field registry from JSON Schema
- `34f27614` feat(compare): response models and coverage tier policy
- `ee8e6b18` feat(stats): add POST /extractions/base-schema/aggregate and its BFF route
- `39f5cddd` feat(db): collection_pairs table with owner RLS
- `6bded63e` fix(db): harden aggregate_extracted_data inputs and numeric buckets
- `04327896` feat(db): get_extracted_facet_counts_by_jurisdiction with coverage
- `615cb080` feat(db): add aggregate_extracted_data over the shared filter cohort
- `26bb618e` fix(ui): stop the shimmer pattern matching past a rule boundary
- `1e9c7a10` feat(stats): add the aggregable-field allowlist and validator
- `dfd4c98d` chore(ui): teach the banned-class gate to read CSS
- `f4f70032` docs(stats): build the aggregate on list_extracted_filter_matches; canonical aggregable-field list
- `654f6e2f` docs(agents): put the not-a-gate rule next to the trigger, explain origins
- `007a659b` chore(agents): register a local @playwright/mcp server for UI verification
- `0b4d992f` docs(design): specify the areas the cluster reviews found silent
- `782c1763` fix(search): tighten SaveAsCollectionDialog error, title and saving state
- `a839f961` fix(documents): rebuild search links from full URL state so back-nav keeps q/nl/page
- `53ebdfad` chore(ui): remove gradient kill-switch and hard-fail the class gate
- `e65b9d65` docs: NL filter generator, save-as-collection how-to, queries 11/12
- `0af11120` fix(styles): drop self-referential headers.tsx re-export
- `da5bca07` feat(extractions-search): save the filtered result set as a collection
- `e47257e6` test(documents): cover the ?f= -> highlightKeys wiring and add a11y marker for matched fields
- `e99c9b63` feat(documents): highlight base fields that matched the extraction filter
- `1fdf1b8b` fix(extractions): type filterValue as unknown, drop duplicate encodeFilters call
- `2da60bf4` feat(documents): matchedMetadataKeys mirrors RPC filter semantics
- `f99c3fba` fix(extractions-search): result rows link to /documents/{id} with the filter blob
- `6a3b9c4f` feat(extractions-search): keep the NL question in the URL (?nl=)
- `c4bb1447` test(e2e): derive flow job totals from the submitted ids, harden the stub
- `39e32979` feat(extractions-search): ScopeFilters strip for jurisdiction and decision date
- `e86e9cfd` test(e2e): gate the search → collection → extraction flow on every PR
- `9dfb2e59` fix(ui): forward aria-label on the glass button variant
- `ef9f908e` fix(nl-filter): po/after is strictly next year, narrow RUF001 ignore, align dash
- `23625c84` refactor(styles): migrate remaining lib primitives to editorial
- `6812b1db` docs(stats): add phase B implementation plan for cohort statistics
- `0e591ef0` feat(nl-filter): prompt rules for jurisdiction and date ranges (PL/EN), case_type excluded
- `4506269c` feat(nl-filter): jurisdiction and decision_date fields on BaseSchemaFilter
- `d2180b07` chore(openapi): regenerate snapshot and types for POST /collections/from-filter
- `e9474a1e` fix(security): verify collection_ids ownership on POST /collections/from-filter
- `06b8c9cb` fix(security): reject collection_ids on the unauthenticated filter endpoint
- `8e48ca63` test(route-contract): assert stub status before parsing JSON
- `ca950cb1` refactor(types): re-export Jurisdiction instead of redeclaring it
- `bc28248c` refactor(config): move SAVE_FROM_FILTER_MAX_DOCUMENTS into settings
- `572dc8c9` docs(api): match Create-Collection-From-Filter example to Collection model
- `1a768fe4` docs: mark completeness.py consumers and facet RPC as planned, not shipped
- `6c2d41f8` docs: base-schema filter API reference (shared filter RPC, from-filter endpoint, URL codec)
- `55e72ec9` fix(route-contract): correct AdapterRequest type and drop dead helper
- `1f253594` test(route-contract): extract synthetic-session helper and unexpected-request guard
- `7896c6d1` feat(bff): proxyToBackend helper, /api/collections/from-filter route and typed client
- `079bda1c` fix(extractions-search): drop duplicate epoch<->ISO naming from drawer-adapter
- `6f1496ec` fix(extractions-search): shared drawer adapter (ISO<->epoch) and one URL codec for filter pages
- `26197afc` test(extractions-search): cover FieldRow's enum_multi active badge in ExtractedFilterDrawer
- `9d8bb5a3` feat(extractions-search): core filter fields (jurisdiction, decision_date) with chips
- `3d07a7ab` feat(extraction): shared completeness helpers (empty markers, completed statuses, coverage ratio)
- `88ac38a0` refactor(nav): drop the signed-in /search prefetch override and fix admin comment
- `f5c27a8e` fix(collections): delete collection on failed bulk add from filter
- `4452dc97` test(nav): scan the flow config as a primary nav surface
- `fdc53b76` feat(collections): POST /collections/from-filter (list-shaped, cap 5000, chunked bulk add)
- `7a73342d` docs(nav): regenerate sidebar map from the flow config and pin it with a test
- `6b28917a` feat(nav): add FlowStepper showing the current persona flow step
- `dc1925fa` test(extraction): close the AST-guard blind spot for FILTER_IDS_RPC
- `741dcf61` feat(nav): render sidebar workflow groups from the flow config
- `1bbcf779` feat(extraction): resolve_filter_ids over list_extracted_filter_matches; shared Jurisdiction literal
- `67a3a7eb` refactor(styles): retone the last red and yellow status tints
- `f0a69922` feat(nav): add persona flow config and i18n keys
- `a8c9e57d` feat(db): shared list_extracted_filter_matches with jurisdiction/decision_date/collection_ids; filter RPC becomes a wrapper
- `da61ca50` docs(nav): add phase A implementation plan for persona flows
- `a2180d39` fix(extractions): link result rows to the judgment reader
- `2b09b5fa` docs(product): persona flows design and quantitative use-case research note
- `5d62a5ea` chore(docs): track docs/superpowers plans and specs in git
- `e77ce65c` docs(design): name red and yellow in the Avoid list
- `1f27a449` fix(styles): put the important modifier on the utility, not the variant
- `f4fe23a9` refactor(styles): de-slop the shared button and surface token sources
- `ea383e25` refactor(styles): let the banned-class gate see red and yellow
- `782b034e` refactor(styles): migrate cards, headers, feedback and dialogs to editorial
- `a57ecca5` refactor(styles): migrate button and surface tokens to editorial
- `c9699d9c` refactor(schema-studio): migrate schema studio glyphs and widgets to editorial
- `078336d8` refactor(app): migrate static and informational pages to editorial
- `5c141def` refactor(schemas): migrate schema components and pages to editorial
- `b7f28297` refactor(chat): migrate legacy chat components to editorial
- `d7c00d27` refactor(search): migrate search filters and date picker to editorial
- `3b4b6832` refactor(settings): finish the admin and misc long tail
- `b5a10158` test(support): remove startup race in the child-process timeout test
- `4ad61079` refactor(extractions): migrate extraction results table to editorial
- `70cd5f27` refactor(admin): migrate admin and settings surfaces to editorial
- `5088d420` refactor(auth): migrate auth forms and navigation chrome to editorial
- `4eadc4b9` refactor(blog): migrate blog and publications surfaces to editorial
- `ee988174` refactor(chat): migrate chat and search surfaces to editorial
- `952992fe` fix(reasoning-lines): label trend=shifting as a change of direction
