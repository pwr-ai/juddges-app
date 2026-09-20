-- =============================================================================
-- Migration: shared base-schema filter set + thin wrapper (Foundation for A/B/C)
-- =============================================================================
-- filter_documents_by_extracted_data carried a ~300-line WHERE clause that the
-- PL/UK comparison and "save filter as collection" also need. It moves, verbatim,
-- into list_extracted_filter_matches, which returns the matching (id, jurisdiction)
-- set; the original RPC becomes a wrapper with an UNCHANGED signature and result
-- shape (a new parameter would create a PostgREST overload → HTTP 300).
--
-- New keys read from p_filters:
--   jurisdiction   JSON array of 'PL' | 'UK'                      → j.jurisdiction = ANY(...)
--   decision_date  {"from","to"} | {"min","max"} | "YYYY-MM-DD"    → j.decision_date range / equality
--   collection_ids JSON array of collection UUIDs                 → membership in collection_judgments
-- The corpus is ~12k rows, so materialising the id set per call is cheap.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_extracted_filter_matches(
    p_filters JSONB DEFAULT '{}'::jsonb,
    p_text_query TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    jurisdiction TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    -- === BEGIN verbatim copy: 20260505000001:160-232
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
    -- === END verbatim copy
    -- core judgment columns (Foundation; Spec B)
    v_jurisdiction TEXT[] := public._jsonb_to_text_array(p_filters -> 'jurisdiction');
    v_decision_date_eq DATE := NULL;
    v_decision_date_from DATE := NULL;
    v_decision_date_to DATE := NULL;
    -- collection membership (Foundation; Spec C). collection_judgments.judgment_id is TEXT,
    -- collection_id is UUID — cast the filter once, not the column per row.
    v_collection_ids UUID[] := (
        SELECT array_agg(x::uuid)
        FROM unnest(public._jsonb_to_text_array(p_filters -> 'collection_ids')) AS x
    );
BEGIN
    -- === BEGIN verbatim copy: 20260505000001:234-324
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

    -- === END verbatim copy
    IF p_filters ? 'decision_date' THEN
        IF jsonb_typeof(p_filters -> 'decision_date') = 'object' THEN
            IF (p_filters -> 'decision_date') ? 'from' THEN
                v_decision_date_from := (p_filters -> 'decision_date' ->> 'from')::DATE;
            ELSIF (p_filters -> 'decision_date') ? 'min' THEN
                v_decision_date_from := (p_filters -> 'decision_date' ->> 'min')::DATE;
            END IF;
            IF (p_filters -> 'decision_date') ? 'to' THEN
                v_decision_date_to := (p_filters -> 'decision_date' ->> 'to')::DATE;
            ELSIF (p_filters -> 'decision_date') ? 'max' THEN
                v_decision_date_to := (p_filters -> 'decision_date' ->> 'max')::DATE;
            END IF;
        ELSE
            v_decision_date_eq := (p_filters ->> 'decision_date')::DATE;
        END IF;
    END IF;

    RETURN QUERY
    SELECT j.id, j.jurisdiction
    FROM public.judgments j
    WHERE
        j.base_extraction_status = 'completed'
        -- === BEGIN verbatim copy: 20260505000001:337-436

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
        -- === END verbatim copy
        -- core judgment columns (Foundation)
        AND (v_jurisdiction IS NULL OR j.jurisdiction = ANY(v_jurisdiction))
        AND (v_decision_date_eq IS NULL OR j.decision_date = v_decision_date_eq)
        AND (v_decision_date_from IS NULL OR j.decision_date >= v_decision_date_from)
        AND (v_decision_date_to IS NULL OR j.decision_date <= v_decision_date_to)
        -- collection membership (Foundation)
        AND (v_collection_ids IS NULL OR EXISTS (
            SELECT 1 FROM public.collection_judgments cj
            WHERE cj.collection_id = ANY(v_collection_ids)
              AND cj.judgment_id = j.id::text
        ));
END;
$$;

-- Thin wrapper: identical signature, result columns, ORDER BY, LIMIT/OFFSET.
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
BEGIN
    RETURN QUERY
    SELECT
        j.id,
        j.case_number,
        j.title,
        j.jurisdiction,
        j.decision_date,
        COALESCE(j.base_raw_extraction, '{}'::jsonb) AS extracted_data,
        COUNT(*) OVER()::BIGINT AS total_count
    FROM public.list_extracted_filter_matches(p_filters, p_text_query) m
    JOIN public.judgments j ON j.id = m.id
    ORDER BY j.decision_date DESC NULLS LAST, j.id
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_extracted_filter_matches(JSONB, TEXT)
    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.filter_documents_by_extracted_data(JSONB, TEXT, INT, INT)
    TO anon, authenticated, service_role;
