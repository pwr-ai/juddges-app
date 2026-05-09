-- Drop seeded tax_interpretation* rows from dashboard stats.
--
-- Search and dashboard now treat the application as judgment-only;
-- these rows would otherwise display as zero counts.
--
-- The seed rows live in `public.doc_type_stats` (column `doc_type`),
-- written by `public.refresh_dashboard_stats()` in
-- `20260325000001_create_dashboard_precomputed_stats.sql` lines 530-532.
-- The companion table `public.dashboard_precomputed_stats` (column
-- `stat_key`) does not currently seed any tax_interpretation* rows, but
-- the equivalent DELETE is included for defence-in-depth in case a
-- future seed adds them under those keys.
--
-- Note: `refresh_dashboard_stats()` will re-insert the doc_type_stats
-- rows on its next call (it TRUNCATEs and re-INSERTs from a static
-- VALUES list). Updating that function to stop seeding them is owned
-- by Task 3 (backend tax_interpretation purge) per the design spec.

delete from public.doc_type_stats
where doc_type in (
  'tax_interpretation',
  'tax_interpretation_pl',
  'tax_interpretation_uk'
);

delete from public.dashboard_precomputed_stats
where stat_key in (
  'tax_interpretation',
  'tax_interpretation_pl',
  'tax_interpretation_uk'
);
