-- =============================================================================
-- Migration: Add count_judgments_filtered() helper
-- =============================================================================
-- The /search hot path returns paginated chunks via search_judgments_hybrid.
-- Until now, the response carried estimated_total = NULL because counting
-- across the full filtered judgments table requires its own pass.
--
-- This function returns the total number of judgments matching the search
-- filters (the same WHERE clauses as search_judgments_hybrid) but ignoring
-- query/text-relevance — i.e. the size of the candidate pool. The backend
-- calls this only on the first page (offset == 0) when the client requests
-- include_count, so the cost is bounded.
--
-- The result is "estimated" in the user-facing sense: it is an exact COUNT(*)
-- of filter matches, but does not reflect reranker / similarity-threshold
-- pruning. That is acceptable per spec C4.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.count_judgments_filtered(
    filter_jurisdictions text[] DEFAULT NULL,
    filter_court_names text[] DEFAULT NULL,
    filter_court_levels text[] DEFAULT NULL,
    filter_case_types text[] DEFAULT NULL,
    filter_decision_types text[] DEFAULT NULL,
    filter_outcomes text[] DEFAULT NULL,
    filter_keywords text[] DEFAULT NULL,
    filter_legal_topics text[] DEFAULT NULL,
    filter_cited_legislation text[] DEFAULT NULL,
    filter_date_from date DEFAULT NULL,
    filter_date_to date DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
    SELECT COUNT(*)::bigint
    FROM public.judgments j
    WHERE (filter_jurisdictions IS NULL OR j.jurisdiction = ANY(filter_jurisdictions))
        AND (filter_court_names IS NULL OR j.court_name = ANY(filter_court_names))
        AND (filter_court_levels IS NULL OR j.court_level = ANY(filter_court_levels))
        AND (filter_case_types IS NULL OR j.case_type = ANY(filter_case_types))
        AND (filter_decision_types IS NULL OR j.decision_type = ANY(filter_decision_types))
        AND (filter_outcomes IS NULL OR j.outcome = ANY(filter_outcomes))
        AND (filter_date_from IS NULL OR j.decision_date >= filter_date_from)
        AND (filter_date_to IS NULL OR j.decision_date <= filter_date_to)
        AND (filter_keywords IS NULL OR j.keywords && filter_keywords)
        AND (filter_legal_topics IS NULL OR j.legal_topics && filter_legal_topics)
        AND (filter_cited_legislation IS NULL OR j.cited_legislation && filter_cited_legislation);
$$;

COMMENT ON FUNCTION public.count_judgments_filtered IS
    'Returns COUNT(*) of judgments matching the same filter set as '
    'search_judgments_hybrid. Used by the /documents/search endpoint to '
    'populate PaginationMetadata.estimated_total on the first page.';

GRANT EXECUTE ON FUNCTION public.count_judgments_filtered TO anon, authenticated, service_role;
