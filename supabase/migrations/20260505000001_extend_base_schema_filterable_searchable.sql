-- =============================================================================
-- Migration: Extend base-schema filterable + searchable surface
-- =============================================================================
-- Exposes all remaining base_* columns through public.filter_documents_by_extracted_data.
--
-- Three tiers of work:
--   Tier 1: B-tree / GIN indexes for every previously-unindexed filterable
--           column (counts, enums, multi-value arrays, booleans).
--   Tier 2: A single STORED `base_search_tsv` generated column + GIN index
--           replacing the on-the-fly `to_tsvector(...) @@ ...` inside the RPC.
--           This converts the FTS branch from a full table scan into an index
--           lookup and broadens coverage to ~20 source fields.
--   Tier 3: Selective pg_trgm GIN indexes on judge / representative names so
--           users can ILIKE on partial strings without seq-scanning.
--
-- Cost (rough, per 1M rows):
--   Tier 1: ~0.5–0.8 GB across ~15 indexes
--   Tier 2: ~0.7–1.0 GB for the GIN + ~150 MB for the generated column
--   Tier 3: ~0.2–0.5 GB across 2 trigram indexes
-- Write amplification is paid once per judgment at extraction-completion time.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------------
-- Tier 1: filter indexes for previously-unindexed base_* columns
-- -----------------------------------------------------------------------------

-- Numeric / count
CREATE INDEX IF NOT EXISTS idx_judgments_base_co_def_acc_num
    ON public.judgments(base_co_def_acc_num);

-- Scalar enum facets (B-tree)
CREATE INDEX IF NOT EXISTS idx_judgments_base_offender_job_offence
    ON public.judgments(base_offender_job_offence);
CREATE INDEX IF NOT EXISTS idx_judgments_base_offender_home_offence
    ON public.judgments(base_offender_home_offence);
CREATE INDEX IF NOT EXISTS idx_judgments_base_offender_victim_relationship
    ON public.judgments(base_offender_victim_relationship);

-- Boolean filters: partial indexes (only TRUE rows; ~10x smaller than full B-tree)
CREATE INDEX IF NOT EXISTS idx_judgments_base_did_offender_confess_true
    ON public.judgments(id) WHERE base_did_offender_confess = TRUE;
CREATE INDEX IF NOT EXISTS idx_judgments_base_vic_impact_statement_true
    ON public.judgments(id) WHERE base_vic_impact_statement = TRUE;

-- TEXT[] containment / overlap (GIN)
CREATE INDEX IF NOT EXISTS idx_judgments_base_convict_plea_dates_gin
    ON public.judgments USING gin(base_convict_plea_dates);
CREATE INDEX IF NOT EXISTS idx_judgments_base_what_ancilliary_orders_gin
    ON public.judgments USING gin(base_what_ancilliary_orders);
CREATE INDEX IF NOT EXISTS idx_judgments_base_pros_evid_type_trial_gin
    ON public.judgments USING gin(base_pros_evid_type_trial);
CREATE INDEX IF NOT EXISTS idx_judgments_base_def_evid_type_trial_gin
    ON public.judgments USING gin(base_def_evid_type_trial);
CREATE INDEX IF NOT EXISTS idx_judgments_base_agg_fact_sent_gin
    ON public.judgments USING gin(base_agg_fact_sent);
CREATE INDEX IF NOT EXISTS idx_judgments_base_mit_fact_sent_gin
    ON public.judgments USING gin(base_mit_fact_sent);
CREATE INDEX IF NOT EXISTS idx_judgments_base_sent_guide_which_gin
    ON public.judgments USING gin(base_sent_guide_which);
CREATE INDEX IF NOT EXISTS idx_judgments_base_reason_quash_conv_gin
    ON public.judgments USING gin(base_reason_quash_conv);
CREATE INDEX IF NOT EXISTS idx_judgments_base_reason_sent_excessive_gin
    ON public.judgments USING gin(base_reason_sent_excessive);
CREATE INDEX IF NOT EXISTS idx_judgments_base_reason_sent_lenient_gin
    ON public.judgments USING gin(base_reason_sent_lenient);

-- -----------------------------------------------------------------------------
-- Tier 2: unified base-schema FTS via STORED generated tsvector + GIN
-- -----------------------------------------------------------------------------
-- Replaces the on-the-fly `to_tsvector(...) @@ websearch_to_tsquery(...)` block
-- inside filter_documents_by_extracted_data. Weights:
--   A — high-signal identifiers (case name, citation, keywords)
--   B — party / counsel / charged offences / appeal grounds
--   C — courts / aggravating + mitigating factors
--   D — sentences received, ancillary orders, mental/job/home narrative fields
-- All source columns are wrapped in coalesce() so a NULL source never poisons
-- the generated value to NULL.
--
-- Note on f_immutable_tsvector: PostgreSQL requires STORED GENERATED expressions
-- to be IMMUTABLE end-to-end. Two functions in the original expression are
-- not IMMUTABLE in Postgres and need wrapping:
--
--   1. to_tsvector(regconfig, text) is IMMUTABLE in Postgres ≥ 14 (verified on
--      the Supabase Postgres 17 target), so calling it directly with an
--      explicit 'simple'::regconfig literal would actually be safe. We still
--      route it through the wrapper for symmetry with the array variant below
--      and to centralise the regconfig choice.
--   2. array_to_string(anyarray, text) is STABLE — this is the *actual* blocker
--      that fails the original migration with SQLSTATE 42P17 ("generation
--      expression is not immutable"), regardless of whether the surrounding
--      to_tsvector is IMMUTABLE or not.
--
-- Fix: wrap both flavors in plpgsql IMMUTABLE wrappers. plpgsql is opaque to
-- the planner's deep-immutability check (which walks into inlinable LANGUAGE
-- sql function bodies and re-derives volatility from their dependencies);
-- LANGUAGE sql wrappers would still be rejected. We overload by argument
-- type — the text variant handles text columns; the text[] variant embeds
-- the array_to_string conversion internally so the GENERATED expression
-- never references array_to_string at all.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.f_immutable_tsvector(text)
RETURNS tsvector
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE
AS $$ BEGIN RETURN to_tsvector('simple'::regconfig, coalesce($1, '')); END; $$;

CREATE OR REPLACE FUNCTION public.f_immutable_tsvector(text[])
RETURNS tsvector
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE
AS $$ BEGIN RETURN to_tsvector('simple'::regconfig, array_to_string(coalesce($1, ARRAY[]::TEXT[]), ' ')); END; $$;

ALTER TABLE public.judgments
    ADD COLUMN IF NOT EXISTS base_search_tsv tsvector
        GENERATED ALWAYS AS (
            setweight(public.f_immutable_tsvector(base_case_name), 'A') ||
            setweight(public.f_immutable_tsvector(base_neutral_citation_number), 'A') ||
            setweight(public.f_immutable_tsvector(base_keywords), 'A') ||
            setweight(public.f_immutable_tsvector(base_appeal_court_judges_names), 'B') ||
            setweight(public.f_immutable_tsvector(base_offender_representative_name), 'B') ||
            setweight(public.f_immutable_tsvector(base_crown_attorney_general_representative_name), 'B') ||
            setweight(public.f_immutable_tsvector(base_convict_offences), 'B') ||
            setweight(public.f_immutable_tsvector(base_acquit_offences), 'B') ||
            setweight(public.f_immutable_tsvector(base_appeal_ground), 'B') ||
            setweight(public.f_immutable_tsvector(base_conv_court_names), 'C') ||
            setweight(public.f_immutable_tsvector(base_sent_court_name), 'C') ||
            setweight(public.f_immutable_tsvector(base_agg_fact_sent), 'C') ||
            setweight(public.f_immutable_tsvector(base_mit_fact_sent), 'C') ||
            setweight(public.f_immutable_tsvector(base_sentences_received), 'D') ||
            setweight(public.f_immutable_tsvector(base_what_ancilliary_orders), 'D') ||
            setweight(public.f_immutable_tsvector(base_offender_mental_offence), 'D') ||
            setweight(public.f_immutable_tsvector(base_victim_mental_offence), 'D') ||
            setweight(public.f_immutable_tsvector(base_offender_job_offence), 'D') ||
            setweight(public.f_immutable_tsvector(base_offender_home_offence), 'D') ||
            setweight(public.f_immutable_tsvector(base_victim_job_offence), 'D') ||
            setweight(public.f_immutable_tsvector(base_victim_home_offence), 'D')
        ) STORED;

CREATE INDEX IF NOT EXISTS idx_judgments_base_search_tsv
    ON public.judgments USING gin(base_search_tsv);

-- -----------------------------------------------------------------------------
-- Tier 3: selective trigram indexes (substring/typo-tolerant ILIKE lookup)
-- -----------------------------------------------------------------------------
-- base_case_name and base_neutral_citation_number are already trgm-indexed
-- by 20260226000001. Add only fields where users genuinely type partial strings.
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_judgments_base_appeal_court_judges_trgm
    ON public.judgments USING gin (base_appeal_court_judges_names gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_judgments_base_offender_representative_trgm
    ON public.judgments USING gin (base_offender_representative_name gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- Update filter_documents_by_extracted_data to expose the new filter parameters
-- and route the FTS branch through base_search_tsv (Tier 2).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.filter_documents_by_extracted_data(
    p_filters JSONB DEFAULT '{}'::jsonb,
    p_text_query TEXT DEFAULT NULL,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    case_number TEXT,
    title TEXT,
    jurisdiction TEXT,
    decision_date DATE,
    extracted_data JSONB,
    total_count BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    -- existing scalar enums
    v_appellant TEXT[] := public._jsonb_to_text_array(p_filters -> 'appellant');
    v_appeal_against TEXT[] := public._jsonb_to_text_array(p_filters -> 'appeal_against');
    v_appeal_outcome TEXT[] := public._jsonb_to_text_array(p_filters -> 'appeal_outcome');
    v_plea_point TEXT[] := public._jsonb_to_text_array(p_filters -> 'plea_point');
    v_remand_decision TEXT[] := public._jsonb_to_text_array(p_filters -> 'remand_decision');
    v_sentence_serve TEXT[] := public._jsonb_to_text_array(p_filters -> 'sentence_serve');
    v_offender_gender TEXT[] := public._jsonb_to_text_array(p_filters -> 'offender_gender');
    v_offender_intox_offence TEXT[] := public._jsonb_to_text_array(p_filters -> 'offender_intox_offence');
    v_victim_gender TEXT[] := public._jsonb_to_text_array(p_filters -> 'victim_gender');
    v_victim_intox_offence TEXT[] := public._jsonb_to_text_array(p_filters -> 'victim_intox_offence');
    v_victim_type TEXT[] := public._jsonb_to_text_array(p_filters -> 'victim_type');
    v_pre_sent_report TEXT[] := public._jsonb_to_text_array(p_filters -> 'pre_sent_report');

    -- new scalar enums
    v_offender_job_offence TEXT[] := public._jsonb_to_text_array(p_filters -> 'offender_job_offence');
    v_offender_home_offence TEXT[] := public._jsonb_to_text_array(p_filters -> 'offender_home_offence');
    v_offender_victim_relationship TEXT[] := public._jsonb_to_text_array(p_filters -> 'offender_victim_relationship');

    -- existing array fields
    v_keywords TEXT[] := public._jsonb_to_text_array(p_filters -> 'keywords');
    v_convict_offences TEXT[] := public._jsonb_to_text_array(p_filters -> 'convict_offences');
    v_acquit_offences TEXT[] := public._jsonb_to_text_array(p_filters -> 'acquit_offences');
    v_appeal_ground TEXT[] := public._jsonb_to_text_array(p_filters -> 'appeal_ground');

    -- new array fields
    v_sentences_received TEXT[] := public._jsonb_to_text_array(p_filters -> 'sentences_received');
    v_what_ancilliary_orders TEXT[] := public._jsonb_to_text_array(p_filters -> 'what_ancilliary_orders');
    v_pros_evid_type_trial TEXT[] := public._jsonb_to_text_array(p_filters -> 'pros_evid_type_trial');
    v_def_evid_type_trial TEXT[] := public._jsonb_to_text_array(p_filters -> 'def_evid_type_trial');
    v_agg_fact_sent TEXT[] := public._jsonb_to_text_array(p_filters -> 'agg_fact_sent');
    v_mit_fact_sent TEXT[] := public._jsonb_to_text_array(p_filters -> 'mit_fact_sent');
    v_sent_guide_which TEXT[] := public._jsonb_to_text_array(p_filters -> 'sent_guide_which');
    v_reason_quash_conv TEXT[] := public._jsonb_to_text_array(p_filters -> 'reason_quash_conv');
    v_reason_sent_excessive TEXT[] := public._jsonb_to_text_array(p_filters -> 'reason_sent_excessive');
    v_reason_sent_lenient TEXT[] := public._jsonb_to_text_array(p_filters -> 'reason_sent_lenient');
    v_reason_dismiss TEXT[] := public._jsonb_to_text_array(p_filters -> 'reason_dismiss');
    v_convict_plea_dates TEXT[] := public._jsonb_to_text_array(p_filters -> 'convict_plea_dates');

    -- booleans
    v_did_offender_confess BOOLEAN := NULL;
    v_vic_impact_statement BOOLEAN := NULL;

    -- existing numerics
    v_num_victims_eq NUMERIC := NULL;
    v_num_victims_min NUMERIC := NULL;
    v_num_victims_max NUMERIC := NULL;

    v_case_number_eq NUMERIC := NULL;
    v_case_number_min NUMERIC := NULL;
    v_case_number_max NUMERIC := NULL;

    v_victim_age_eq NUMERIC := NULL;
    v_victim_age_min NUMERIC := NULL;
    v_victim_age_max NUMERIC := NULL;

    -- new numeric: co_def_acc_num
    v_co_def_acc_num_eq NUMERIC := NULL;
    v_co_def_acc_num_min NUMERIC := NULL;
    v_co_def_acc_num_max NUMERIC := NULL;

    -- date
    v_date_eq DATE := NULL;
    v_date_from DATE := NULL;
    v_date_to DATE := NULL;

    -- existing substring
    v_case_name_like TEXT := NULL;
    v_neutral_citation_like TEXT := NULL;

    -- new substring (Tier 3)
    v_judges_like TEXT := NULL;
    v_offender_rep_like TEXT := NULL;
BEGIN
    IF p_filters ? 'did_offender_confess' THEN
        v_did_offender_confess := (p_filters ->> 'did_offender_confess')::BOOLEAN;
    END IF;

    IF p_filters ? 'vic_impact_statement' THEN
        v_vic_impact_statement := (p_filters ->> 'vic_impact_statement')::BOOLEAN;
    END IF;

    IF p_filters ? 'num_victims' THEN
        IF jsonb_typeof(p_filters -> 'num_victims') = 'object' THEN
            IF (p_filters -> 'num_victims') ? 'min' THEN
                v_num_victims_min := (p_filters -> 'num_victims' ->> 'min')::NUMERIC;
            END IF;
            IF (p_filters -> 'num_victims') ? 'max' THEN
                v_num_victims_max := (p_filters -> 'num_victims' ->> 'max')::NUMERIC;
            END IF;
        ELSE
            v_num_victims_eq := (p_filters ->> 'num_victims')::NUMERIC;
        END IF;
    END IF;

    IF p_filters ? 'case_number' THEN
        IF jsonb_typeof(p_filters -> 'case_number') = 'object' THEN
            IF (p_filters -> 'case_number') ? 'min' THEN
                v_case_number_min := (p_filters -> 'case_number' ->> 'min')::NUMERIC;
            END IF;
            IF (p_filters -> 'case_number') ? 'max' THEN
                v_case_number_max := (p_filters -> 'case_number' ->> 'max')::NUMERIC;
            END IF;
        ELSE
            v_case_number_eq := (p_filters ->> 'case_number')::NUMERIC;
        END IF;
    END IF;

    IF p_filters ? 'victim_age_offence' THEN
        IF jsonb_typeof(p_filters -> 'victim_age_offence') = 'object' THEN
            IF (p_filters -> 'victim_age_offence') ? 'min' THEN
                v_victim_age_min := (p_filters -> 'victim_age_offence' ->> 'min')::NUMERIC;
            END IF;
            IF (p_filters -> 'victim_age_offence') ? 'max' THEN
                v_victim_age_max := (p_filters -> 'victim_age_offence' ->> 'max')::NUMERIC;
            END IF;
        ELSE
            v_victim_age_eq := (p_filters ->> 'victim_age_offence')::NUMERIC;
        END IF;
    END IF;

    IF p_filters ? 'co_def_acc_num' THEN
        IF jsonb_typeof(p_filters -> 'co_def_acc_num') = 'object' THEN
            IF (p_filters -> 'co_def_acc_num') ? 'min' THEN
                v_co_def_acc_num_min := (p_filters -> 'co_def_acc_num' ->> 'min')::NUMERIC;
            END IF;
            IF (p_filters -> 'co_def_acc_num') ? 'max' THEN
                v_co_def_acc_num_max := (p_filters -> 'co_def_acc_num' ->> 'max')::NUMERIC;
            END IF;
        ELSE
            v_co_def_acc_num_eq := (p_filters ->> 'co_def_acc_num')::NUMERIC;
        END IF;
    END IF;

    IF p_filters ? 'date_of_appeal_court_judgment' THEN
        IF jsonb_typeof(p_filters -> 'date_of_appeal_court_judgment') = 'object' THEN
            IF (p_filters -> 'date_of_appeal_court_judgment') ? 'from' THEN
                v_date_from := (p_filters -> 'date_of_appeal_court_judgment' ->> 'from')::DATE;
            ELSIF (p_filters -> 'date_of_appeal_court_judgment') ? 'min' THEN
                v_date_from := (p_filters -> 'date_of_appeal_court_judgment' ->> 'min')::DATE;
            END IF;

            IF (p_filters -> 'date_of_appeal_court_judgment') ? 'to' THEN
                v_date_to := (p_filters -> 'date_of_appeal_court_judgment' ->> 'to')::DATE;
            ELSIF (p_filters -> 'date_of_appeal_court_judgment') ? 'max' THEN
                v_date_to := (p_filters -> 'date_of_appeal_court_judgment' ->> 'max')::DATE;
            END IF;
        ELSE
            v_date_eq := (p_filters ->> 'date_of_appeal_court_judgment')::DATE;
        END IF;
    END IF;

    IF p_filters ? 'case_name' THEN
        v_case_name_like := NULLIF(TRIM(p_filters ->> 'case_name'), '');
    END IF;
    IF p_filters ? 'neutral_citation_number' THEN
        v_neutral_citation_like := NULLIF(TRIM(p_filters ->> 'neutral_citation_number'), '');
    END IF;
    IF p_filters ? 'appeal_court_judges_names' THEN
        v_judges_like := NULLIF(TRIM(p_filters ->> 'appeal_court_judges_names'), '');
    END IF;
    IF p_filters ? 'offender_representative_name' THEN
        v_offender_rep_like := NULLIF(TRIM(p_filters ->> 'offender_representative_name'), '');
    END IF;

    RETURN QUERY
    WITH filtered AS (
        SELECT
            j.id,
            j.case_number,
            j.title,
            j.jurisdiction,
            j.decision_date,
            COALESCE(j.base_raw_extraction, '{}'::jsonb) AS extracted_data
        FROM public.judgments j
        WHERE
            j.base_extraction_status = 'completed'

            -- existing scalar enum filters
            AND (v_appellant IS NULL OR j.base_appellant = ANY(v_appellant))
            AND (v_appeal_against IS NULL OR j.base_appeal_against && v_appeal_against)
            AND (v_appeal_outcome IS NULL OR j.base_appeal_outcome && v_appeal_outcome)
            AND (v_plea_point IS NULL OR j.base_plea_point = ANY(v_plea_point))
            AND (v_remand_decision IS NULL OR j.base_remand_decision = ANY(v_remand_decision))
            AND (v_sentence_serve IS NULL OR j.base_sentence_serve && v_sentence_serve)
            AND (v_offender_gender IS NULL OR j.base_offender_gender && v_offender_gender)
            AND (v_offender_intox_offence IS NULL OR j.base_offender_intox_offence && v_offender_intox_offence)
            AND (v_victim_gender IS NULL OR j.base_victim_gender && v_victim_gender)
            AND (v_victim_intox_offence IS NULL OR j.base_victim_intox_offence && v_victim_intox_offence)
            AND (v_victim_type IS NULL OR j.base_victim_type = ANY(v_victim_type))
            AND (v_pre_sent_report IS NULL OR j.base_pre_sent_report = ANY(v_pre_sent_report))

            -- new scalar enum filters
            AND (v_offender_job_offence IS NULL OR j.base_offender_job_offence = ANY(v_offender_job_offence))
            AND (v_offender_home_offence IS NULL OR j.base_offender_home_offence = ANY(v_offender_home_offence))
            AND (v_offender_victim_relationship IS NULL OR j.base_offender_victim_relationship = ANY(v_offender_victim_relationship))

            -- booleans
            AND (v_did_offender_confess IS NULL OR j.base_did_offender_confess = v_did_offender_confess)
            AND (v_vic_impact_statement IS NULL OR j.base_vic_impact_statement = v_vic_impact_statement)

            -- existing array filters
            AND (v_keywords IS NULL OR j.base_keywords && v_keywords)
            AND (v_convict_offences IS NULL OR j.base_convict_offences && v_convict_offences)
            AND (v_acquit_offences IS NULL OR j.base_acquit_offences && v_acquit_offences)
            AND (v_appeal_ground IS NULL OR j.base_appeal_ground && v_appeal_ground)

            -- new array filters
            AND (v_sentences_received IS NULL OR j.base_sentences_received && v_sentences_received)
            AND (v_what_ancilliary_orders IS NULL OR j.base_what_ancilliary_orders && v_what_ancilliary_orders)
            AND (v_pros_evid_type_trial IS NULL OR j.base_pros_evid_type_trial && v_pros_evid_type_trial)
            AND (v_def_evid_type_trial IS NULL OR j.base_def_evid_type_trial && v_def_evid_type_trial)
            AND (v_agg_fact_sent IS NULL OR j.base_agg_fact_sent && v_agg_fact_sent)
            AND (v_mit_fact_sent IS NULL OR j.base_mit_fact_sent && v_mit_fact_sent)
            AND (v_sent_guide_which IS NULL OR j.base_sent_guide_which && v_sent_guide_which)
            AND (v_reason_quash_conv IS NULL OR j.base_reason_quash_conv && v_reason_quash_conv)
            AND (v_reason_sent_excessive IS NULL OR j.base_reason_sent_excessive && v_reason_sent_excessive)
            AND (v_reason_sent_lenient IS NULL OR j.base_reason_sent_lenient && v_reason_sent_lenient)
            AND (v_reason_dismiss IS NULL OR j.base_reason_dismiss && v_reason_dismiss)
            AND (v_convict_plea_dates IS NULL OR j.base_convict_plea_dates && v_convict_plea_dates)

            -- existing numerics
            AND (
                (v_num_victims_eq IS NULL OR j.base_num_victims = v_num_victims_eq)
                AND (v_num_victims_min IS NULL OR j.base_num_victims >= v_num_victims_min)
                AND (v_num_victims_max IS NULL OR j.base_num_victims <= v_num_victims_max)
            )
            AND (
                (v_case_number_eq IS NULL OR j.base_case_number = v_case_number_eq)
                AND (v_case_number_min IS NULL OR j.base_case_number >= v_case_number_min)
                AND (v_case_number_max IS NULL OR j.base_case_number <= v_case_number_max)
            )
            AND (
                (v_victim_age_eq IS NULL OR j.base_victim_age_offence = v_victim_age_eq)
                AND (v_victim_age_min IS NULL OR j.base_victim_age_offence >= v_victim_age_min)
                AND (v_victim_age_max IS NULL OR j.base_victim_age_offence <= v_victim_age_max)
            )

            -- new numeric
            AND (
                (v_co_def_acc_num_eq IS NULL OR j.base_co_def_acc_num = v_co_def_acc_num_eq)
                AND (v_co_def_acc_num_min IS NULL OR j.base_co_def_acc_num >= v_co_def_acc_num_min)
                AND (v_co_def_acc_num_max IS NULL OR j.base_co_def_acc_num <= v_co_def_acc_num_max)
            )

            -- date
            AND (
                (v_date_eq IS NULL OR j.base_date_of_appeal_court_judgment = v_date_eq)
                AND (v_date_from IS NULL OR j.base_date_of_appeal_court_judgment >= v_date_from)
                AND (v_date_to IS NULL OR j.base_date_of_appeal_court_judgment <= v_date_to)
            )

            -- existing substring
            AND (
                v_case_name_like IS NULL OR
                j.base_case_name ILIKE '%' || v_case_name_like || '%'
            )
            AND (
                v_neutral_citation_like IS NULL OR
                j.base_neutral_citation_number ILIKE '%' || v_neutral_citation_like || '%'
            )

            -- new substring (Tier 3)
            AND (
                v_judges_like IS NULL OR
                j.base_appeal_court_judges_names ILIKE '%' || v_judges_like || '%'
            )
            AND (
                v_offender_rep_like IS NULL OR
                j.base_offender_representative_name ILIKE '%' || v_offender_rep_like || '%'
            )

            -- text query now uses indexed base_search_tsv (Tier 2)
            AND (
                p_text_query IS NULL OR TRIM(p_text_query) = '' OR
                j.base_search_tsv @@ websearch_to_tsquery('simple', p_text_query)
            )
    )
    SELECT
        f.id,
        f.case_number,
        f.title,
        f.jurisdiction,
        f.decision_date,
        f.extracted_data,
        COUNT(*) OVER()::BIGINT AS total_count
    FROM filtered f
    ORDER BY f.decision_date DESC NULLS LAST, f.id
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.filter_documents_by_extracted_data(JSONB, TEXT, INT, INT)
    TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Refresh planner statistics so the new indexes are picked immediately.
-- -----------------------------------------------------------------------------
ANALYZE public.judgments;
