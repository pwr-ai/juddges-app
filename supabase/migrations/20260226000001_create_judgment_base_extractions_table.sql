-- =============================================================================
-- Migration: Store fixed base-schema extraction fields directly on judgments
-- =============================================================================
-- This migration:
-- 1. Adds typed base-schema extraction columns to public.judgments
-- 2. Adds indexes for filtering/faceting/search + UMAP viewport queries
-- 3. Adds RPC functions used by /extractions/base-schema/* endpoints
--
-- Note: base schema is fixed, so typed columns are preferred over JSONB-only.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------------
-- Add extraction metadata + fixed base-schema columns on main judgments table
-- -----------------------------------------------------------------------------
ALTER TABLE public.judgments
    -- extraction metadata
    ADD COLUMN IF NOT EXISTS base_schema_key TEXT NOT NULL DEFAULT 'universal_legal_document_base_schema',
    ADD COLUMN IF NOT EXISTS base_schema_version TEXT NOT NULL DEFAULT 'v1',
    ADD COLUMN IF NOT EXISTS base_extraction_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (base_extraction_status IN ('pending', 'completed', 'failed')),
    ADD COLUMN IF NOT EXISTS base_extraction_model TEXT,
    ADD COLUMN IF NOT EXISTS base_extraction_error TEXT,
    ADD COLUMN IF NOT EXISTS base_extracted_at TIMESTAMPTZ,

    -- UMAP coordinates for 2D visualization
    ADD COLUMN IF NOT EXISTS umap_x DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS umap_y DOUBLE PRECISION,

    -- fixed base schema fields (prefixed with base_ to avoid collisions)
    ADD COLUMN IF NOT EXISTS base_keywords TEXT[],
    ADD COLUMN IF NOT EXISTS base_neutral_citation_number TEXT,
    ADD COLUMN IF NOT EXISTS base_case_number NUMERIC,
    ADD COLUMN IF NOT EXISTS base_date_of_appeal_court_judgment DATE,
    ADD COLUMN IF NOT EXISTS base_appeal_court_judges_names TEXT,
    ADD COLUMN IF NOT EXISTS base_case_name TEXT,
    ADD COLUMN IF NOT EXISTS base_offender_representative_name TEXT,
    ADD COLUMN IF NOT EXISTS base_crown_attorney_general_representative_name TEXT,
    ADD COLUMN IF NOT EXISTS base_conv_court_names TEXT,
    ADD COLUMN IF NOT EXISTS base_convict_plea_dates TEXT[],
    ADD COLUMN IF NOT EXISTS base_convict_offences TEXT[],
    ADD COLUMN IF NOT EXISTS base_acquit_offences TEXT[],
    ADD COLUMN IF NOT EXISTS base_did_offender_confess BOOLEAN,
    ADD COLUMN IF NOT EXISTS base_plea_point TEXT,
    ADD COLUMN IF NOT EXISTS base_remand_decision TEXT,
    ADD COLUMN IF NOT EXISTS base_remand_custody_time TEXT,
    ADD COLUMN IF NOT EXISTS base_sent_court_name TEXT,
    ADD COLUMN IF NOT EXISTS base_sentences_received TEXT[],
    ADD COLUMN IF NOT EXISTS base_sentence_serve TEXT[],
    ADD COLUMN IF NOT EXISTS base_what_ancilliary_orders TEXT[],
    ADD COLUMN IF NOT EXISTS base_offender_gender TEXT[],
    ADD COLUMN IF NOT EXISTS base_offender_age_offence TEXT,
    ADD COLUMN IF NOT EXISTS base_offender_job_offence TEXT,
    ADD COLUMN IF NOT EXISTS base_offender_home_offence TEXT,
    ADD COLUMN IF NOT EXISTS base_offender_mental_offence TEXT,
    ADD COLUMN IF NOT EXISTS base_offender_intox_offence TEXT[],
    ADD COLUMN IF NOT EXISTS base_offender_victim_relationship TEXT,
    ADD COLUMN IF NOT EXISTS base_victim_type TEXT,
    ADD COLUMN IF NOT EXISTS base_num_victims INTEGER,
    ADD COLUMN IF NOT EXISTS base_victim_gender TEXT[],
    ADD COLUMN IF NOT EXISTS base_victim_age_offence NUMERIC,
    ADD COLUMN IF NOT EXISTS base_victim_job_offence TEXT,
    ADD COLUMN IF NOT EXISTS base_victim_home_offence TEXT,
    ADD COLUMN IF NOT EXISTS base_victim_mental_offence TEXT,
    ADD COLUMN IF NOT EXISTS base_victim_intox_offence TEXT[],
    ADD COLUMN IF NOT EXISTS base_pros_evid_type_trial TEXT[],
    ADD COLUMN IF NOT EXISTS base_def_evid_type_trial TEXT[],
    ADD COLUMN IF NOT EXISTS base_pre_sent_report TEXT,
    ADD COLUMN IF NOT EXISTS base_agg_fact_sent TEXT[],
    ADD COLUMN IF NOT EXISTS base_mit_fact_sent TEXT[],
    ADD COLUMN IF NOT EXISTS base_vic_impact_statement BOOLEAN,
    ADD COLUMN IF NOT EXISTS base_appellant TEXT,
    ADD COLUMN IF NOT EXISTS base_co_def_acc_num INTEGER,
    ADD COLUMN IF NOT EXISTS base_appeal_against TEXT[],
    ADD COLUMN IF NOT EXISTS base_appeal_ground TEXT[],
    ADD COLUMN IF NOT EXISTS base_sent_guide_which TEXT[],
    ADD COLUMN IF NOT EXISTS base_appeal_outcome TEXT[],
    ADD COLUMN IF NOT EXISTS base_reason_quash_conv TEXT[],
    ADD COLUMN IF NOT EXISTS base_reason_sent_excessive TEXT[],
    ADD COLUMN IF NOT EXISTS base_reason_sent_lenient TEXT[],
    ADD COLUMN IF NOT EXISTS base_reason_dismiss TEXT[],

    -- raw payload for audit/debug/backward compatibility
    ADD COLUMN IF NOT EXISTS base_raw_extraction JSONB NOT NULL DEFAULT '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- Backward compatibility: convert legacy scalar enums to new enum arrays
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'judgments'
          AND column_name = 'base_sentence_serve' AND udt_name = 'text'
    ) THEN
        ALTER TABLE public.judgments
            ALTER COLUMN base_sentence_serve TYPE TEXT[] USING (
                CASE base_sentence_serve
                    WHEN 'concurrent' THEN ARRAY['serve_concurrent']
                    WHEN 'consecutive' THEN ARRAY['serve_consecutive']
                    WHEN 'combination' THEN ARRAY['serve_concurrent', 'serve_consecutive']
                    WHEN 'dont_know' THEN ARRAY['serve_unknown']
                    ELSE NULL
                END
            );
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'judgments'
          AND column_name = 'base_offender_gender' AND udt_name = 'text'
    ) THEN
        ALTER TABLE public.judgments
            ALTER COLUMN base_offender_gender TYPE TEXT[] USING (
                CASE base_offender_gender
                    WHEN 'all_male' THEN ARRAY['gender_male']
                    WHEN 'all_female' THEN ARRAY['gender_female']
                    WHEN 'male_and_female' THEN ARRAY['gender_male', 'gender_female']
                    ELSE NULL
                END
            );
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'judgments'
          AND column_name = 'base_offender_intox_offence' AND udt_name = 'text'
    ) THEN
        ALTER TABLE public.judgments
            ALTER COLUMN base_offender_intox_offence TYPE TEXT[] USING (
                CASE base_offender_intox_offence
                    WHEN 'yes_drinking' THEN ARRAY['intox_alcohol']
                    WHEN 'yes_drugs' THEN ARRAY['intox_drugs']
                    WHEN 'yes_drinking_and_drugs' THEN ARRAY['intox_alcohol', 'intox_drugs']
                    WHEN 'no' THEN ARRAY[]::TEXT[]
                    WHEN 'dont_know' THEN ARRAY['intox_unknown']
                    ELSE NULL
                END
            );
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'judgments'
          AND column_name = 'base_victim_gender' AND udt_name = 'text'
    ) THEN
        ALTER TABLE public.judgments
            ALTER COLUMN base_victim_gender TYPE TEXT[] USING (
                CASE base_victim_gender
                    WHEN 'all_male' THEN ARRAY['gender_male']
                    WHEN 'all_female' THEN ARRAY['gender_female']
                    WHEN 'male_and_female' THEN ARRAY['gender_male', 'gender_female']
                    ELSE NULL
                END
            );
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'judgments'
          AND column_name = 'base_victim_intox_offence' AND udt_name = 'text'
    ) THEN
        ALTER TABLE public.judgments
            ALTER COLUMN base_victim_intox_offence TYPE TEXT[] USING (
                CASE base_victim_intox_offence
                    WHEN 'yes_drinking' THEN ARRAY['intox_alcohol']
                    WHEN 'yes_drugs' THEN ARRAY['intox_drugs']
                    WHEN 'yes_drinking_and_drugs' THEN ARRAY['intox_alcohol', 'intox_drugs']
                    WHEN 'no' THEN ARRAY[]::TEXT[]
                    WHEN 'dont_know' THEN ARRAY['intox_unknown']
                    ELSE NULL
                END
            );
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'judgments'
          AND column_name = 'base_appeal_against' AND udt_name = 'text'
    ) THEN
        ALTER TABLE public.judgments
            ALTER COLUMN base_appeal_against TYPE TEXT[] USING (
                CASE base_appeal_against
                    WHEN 'conviction_unsafe' THEN ARRAY['appeal_conviction_unsafe']
                    WHEN 'sentence_unduly_excessive' THEN ARRAY['appeal_sentence_excessive']
                    WHEN 'sentence_unduly_lenient' THEN ARRAY['appeal_sentence_lenient']
                    WHEN 'both' THEN ARRAY['appeal_conviction_unsafe', 'appeal_sentence_excessive']
                    WHEN 'other' THEN ARRAY['appeal_other']
                    ELSE NULL
                END
            );
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'judgments'
          AND column_name = 'base_appeal_outcome' AND udt_name = 'text'
    ) THEN
        ALTER TABLE public.judgments
            ALTER COLUMN base_appeal_outcome TYPE TEXT[] USING (
                CASE base_appeal_outcome
                    WHEN 'dismissed_failed_refused' THEN ARRAY['outcome_dismissed_or_refused']
                    WHEN 'allowed_conviction_quashed' THEN ARRAY['outcome_conviction_quashed']
                    WHEN 'allowed_replaced_by_more_excessive_sentence' THEN ARRAY['outcome_sentence_more_severe']
                    WHEN 'allowed_replaced_by_more_lenient_sentence' THEN ARRAY['outcome_sentence_more_lenient']
                    WHEN 'mixed_decision' THEN ARRAY['outcome_other']
                    ELSE NULL
                END
            );
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Enum constraints (idempotent)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_judgments_base_plea_point'
    ) THEN
        ALTER TABLE public.judgments
            ADD CONSTRAINT chk_judgments_base_plea_point
            CHECK (base_plea_point IS NULL OR base_plea_point IN (
                'police_presence', 'first_court_appearance', 'before_trial',
                'first_day_of_trial', 'after_first_day_of_trial', 'dont_know'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_judgments_base_remand_decision'
    ) THEN
        ALTER TABLE public.judgments
            ADD CONSTRAINT chk_judgments_base_remand_decision
            CHECK (base_remand_decision IS NULL OR base_remand_decision IN (
                'unconditional_bail', 'conditional_bail', 'remanded_in_custody', 'dont_know'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_judgments_base_sentence_serve'
    ) THEN
        ALTER TABLE public.judgments
            ADD CONSTRAINT chk_judgments_base_sentence_serve
            CHECK (base_sentence_serve IS NULL OR base_sentence_serve <@ ARRAY[
                'serve_concurrent', 'serve_consecutive', 'serve_unknown'
            ]::TEXT[]);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_judgments_base_offender_gender'
    ) THEN
        ALTER TABLE public.judgments
            ADD CONSTRAINT chk_judgments_base_offender_gender
            CHECK (base_offender_gender IS NULL OR base_offender_gender <@ ARRAY[
                'gender_male', 'gender_female', 'gender_unknown'
            ]::TEXT[]);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_judgments_base_offender_job_offence'
    ) THEN
        ALTER TABLE public.judgments
            ADD CONSTRAINT chk_judgments_base_offender_job_offence
            CHECK (base_offender_job_offence IS NULL OR base_offender_job_offence IN (
                'employed', 'self_employed', 'unemployed', 'student', 'retired', 'other', 'dont_know'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_judgments_base_offender_home_offence'
    ) THEN
        ALTER TABLE public.judgments
            ADD CONSTRAINT chk_judgments_base_offender_home_offence
            CHECK (base_offender_home_offence IS NULL OR base_offender_home_offence IN (
                'fixed_address', 'homeless', 'temporary_accommodation', 'dont_know'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_judgments_base_offender_intox_offence'
    ) THEN
        ALTER TABLE public.judgments
            ADD CONSTRAINT chk_judgments_base_offender_intox_offence
            CHECK (base_offender_intox_offence IS NULL OR base_offender_intox_offence <@ ARRAY[
                'intox_alcohol', 'intox_drugs', 'intox_unknown'
            ]::TEXT[]);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_judgments_base_offender_victim_relationship'
    ) THEN
        ALTER TABLE public.judgments
            ADD CONSTRAINT chk_judgments_base_offender_victim_relationship
            CHECK (base_offender_victim_relationship IS NULL OR base_offender_victim_relationship IN (
                'stranger', 'relative', 'acquaintance', 'dont_know'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_judgments_base_victim_type'
    ) THEN
        ALTER TABLE public.judgments
            ADD CONSTRAINT chk_judgments_base_victim_type
            CHECK (base_victim_type IS NULL OR base_victim_type IN ('individual_person', 'organisation'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_judgments_base_victim_gender'
    ) THEN
        ALTER TABLE public.judgments
            ADD CONSTRAINT chk_judgments_base_victim_gender
            CHECK (base_victim_gender IS NULL OR base_victim_gender <@ ARRAY[
                'gender_male', 'gender_female', 'gender_unknown'
            ]::TEXT[]);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_judgments_base_victim_intox_offence'
    ) THEN
        ALTER TABLE public.judgments
            ADD CONSTRAINT chk_judgments_base_victim_intox_offence
            CHECK (base_victim_intox_offence IS NULL OR base_victim_intox_offence <@ ARRAY[
                'intox_alcohol', 'intox_drugs', 'intox_unknown'
            ]::TEXT[]);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_judgments_base_pre_sent_report'
    ) THEN
        ALTER TABLE public.judgments
            ADD CONSTRAINT chk_judgments_base_pre_sent_report
            CHECK (base_pre_sent_report IS NULL OR base_pre_sent_report IN (
                'low', 'medium', 'high', 'dont_know'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_judgments_base_appellant'
    ) THEN
        ALTER TABLE public.judgments
            ADD CONSTRAINT chk_judgments_base_appellant
            CHECK (base_appellant IS NULL OR base_appellant IN (
                'offender', 'attorney_general', 'other'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_judgments_base_appeal_against'
    ) THEN
        ALTER TABLE public.judgments
            ADD CONSTRAINT chk_judgments_base_appeal_against
            CHECK (base_appeal_against IS NULL OR base_appeal_against <@ ARRAY[
                'appeal_conviction_unsafe',
                'appeal_sentence_excessive',
                'appeal_sentence_lenient',
                'appeal_other',
                'appeal_unknown'
            ]::TEXT[]);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_judgments_base_appeal_outcome'
    ) THEN
        ALTER TABLE public.judgments
            ADD CONSTRAINT chk_judgments_base_appeal_outcome
            CHECK (base_appeal_outcome IS NULL OR base_appeal_outcome <@ ARRAY[
                'outcome_dismissed_or_refused',
                'outcome_conviction_quashed',
                'outcome_sentence_more_severe',
                'outcome_sentence_more_lenient',
                'outcome_other',
                'outcome_unknown'
            ]::TEXT[]);
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Indexes for extracted-field filters/facets/search
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_judgments_base_extraction_status ON public.judgments(base_extraction_status);

-- Scalar facet filters
CREATE INDEX IF NOT EXISTS idx_judgments_base_appellant ON public.judgments(base_appellant);
CREATE INDEX IF NOT EXISTS idx_judgments_base_plea_point ON public.judgments(base_plea_point);
CREATE INDEX IF NOT EXISTS idx_judgments_base_remand_decision ON public.judgments(base_remand_decision);
CREATE INDEX IF NOT EXISTS idx_judgments_base_victim_type ON public.judgments(base_victim_type);
CREATE INDEX IF NOT EXISTS idx_judgments_base_pre_sent_report ON public.judgments(base_pre_sent_report);

-- Numeric/date range filters
CREATE INDEX IF NOT EXISTS idx_judgments_base_case_number ON public.judgments(base_case_number);
CREATE INDEX IF NOT EXISTS idx_judgments_base_num_victims ON public.judgments(base_num_victims);
CREATE INDEX IF NOT EXISTS idx_judgments_base_victim_age_offence ON public.judgments(base_victim_age_offence);
CREATE INDEX IF NOT EXISTS idx_judgments_base_appeal_judgment_date ON public.judgments(base_date_of_appeal_court_judgment DESC);

-- UMAP viewport filters
CREATE INDEX IF NOT EXISTS idx_judgments_umap_xy ON public.judgments(umap_x, umap_y);

-- Array containment/overlap filters
CREATE INDEX IF NOT EXISTS idx_judgments_base_keywords_gin ON public.judgments USING gin(base_keywords);
CREATE INDEX IF NOT EXISTS idx_judgments_base_convict_offences_gin ON public.judgments USING gin(base_convict_offences);
CREATE INDEX IF NOT EXISTS idx_judgments_base_acquit_offences_gin ON public.judgments USING gin(base_acquit_offences);
CREATE INDEX IF NOT EXISTS idx_judgments_base_sentences_received_gin ON public.judgments USING gin(base_sentences_received);
CREATE INDEX IF NOT EXISTS idx_judgments_base_appeal_ground_gin ON public.judgments USING gin(base_appeal_ground);
CREATE INDEX IF NOT EXISTS idx_judgments_base_reason_dismiss_gin ON public.judgments USING gin(base_reason_dismiss);
CREATE INDEX IF NOT EXISTS idx_judgments_base_sentence_serve_gin ON public.judgments USING gin(base_sentence_serve);
CREATE INDEX IF NOT EXISTS idx_judgments_base_offender_gender_gin ON public.judgments USING gin(base_offender_gender);
CREATE INDEX IF NOT EXISTS idx_judgments_base_offender_intox_offence_gin ON public.judgments USING gin(base_offender_intox_offence);
CREATE INDEX IF NOT EXISTS idx_judgments_base_victim_gender_gin ON public.judgments USING gin(base_victim_gender);
CREATE INDEX IF NOT EXISTS idx_judgments_base_victim_intox_offence_gin ON public.judgments USING gin(base_victim_intox_offence);
CREATE INDEX IF NOT EXISTS idx_judgments_base_appeal_against_gin ON public.judgments USING gin(base_appeal_against);
CREATE INDEX IF NOT EXISTS idx_judgments_base_appeal_outcome_gin ON public.judgments USING gin(base_appeal_outcome);

-- Text search aids
CREATE INDEX IF NOT EXISTS idx_judgments_base_case_name_trgm
    ON public.judgments USING gin (base_case_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_judgments_base_neutral_citation_trgm
    ON public.judgments USING gin (base_neutral_citation_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_judgments_base_search_tsv ON public.judgments
USING gin (
    to_tsvector(
        'simple'::regconfig,
        coalesce(base_case_name, '') || ' ' ||
        coalesce(base_neutral_citation_number, '') || ' ' ||
        coalesce(base_appeal_court_judges_names, '') || ' ' ||
        coalesce(base_offender_representative_name, '') || ' ' ||
        coalesce(base_crown_attorney_general_representative_name, '') || ' ' ||
        coalesce(base_conv_court_names, '') || ' ' ||
        coalesce(base_sent_court_name, '') || ' ' ||
        coalesce(array_to_string(base_keywords, ' '), '') || ' ' ||
        coalesce(array_to_string(base_convict_offences, ' '), '') || ' ' ||
        coalesce(array_to_string(base_acquit_offences, ' '), '') || ' ' ||
        coalesce(array_to_string(base_appeal_ground, ' '), '')
    )
);

-- -----------------------------------------------------------------------------
-- Helper functions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._jsonb_to_text_array(p_value JSONB)
RETURNS TEXT[]
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_value IS NULL THEN NULL
        WHEN jsonb_typeof(p_value) = 'array'
            THEN ARRAY(SELECT jsonb_array_elements_text(p_value))
        ELSE ARRAY[p_value #>> '{}']
    END
$$;


CREATE OR REPLACE FUNCTION public._base_field_to_column(field_path TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE field_path
        WHEN 'keywords' THEN 'base_keywords'
        WHEN 'neutral_citation_number' THEN 'base_neutral_citation_number'
        WHEN 'case_number' THEN 'base_case_number'
        WHEN 'date_of_appeal_court_judgment' THEN 'base_date_of_appeal_court_judgment'
        WHEN 'appeal_court_judges_names' THEN 'base_appeal_court_judges_names'
        WHEN 'case_name' THEN 'base_case_name'
        WHEN 'offender_representative_name' THEN 'base_offender_representative_name'
        WHEN 'crown_attorney_general_representative_name' THEN 'base_crown_attorney_general_representative_name'
        WHEN 'conv_court_names' THEN 'base_conv_court_names'
        WHEN 'convict_plea_dates' THEN 'base_convict_plea_dates'
        WHEN 'convict_offences' THEN 'base_convict_offences'
        WHEN 'acquit_offences' THEN 'base_acquit_offences'
        WHEN 'did_offender_confess' THEN 'base_did_offender_confess'
        WHEN 'plea_point' THEN 'base_plea_point'
        WHEN 'remand_decision' THEN 'base_remand_decision'
        WHEN 'remand_custody_time' THEN 'base_remand_custody_time'
        WHEN 'sent_court_name' THEN 'base_sent_court_name'
        WHEN 'sentences_received' THEN 'base_sentences_received'
        WHEN 'sentence_serve' THEN 'base_sentence_serve'
        WHEN 'what_ancilliary_orders' THEN 'base_what_ancilliary_orders'
        WHEN 'offender_gender' THEN 'base_offender_gender'
        WHEN 'offender_age_offence' THEN 'base_offender_age_offence'
        WHEN 'offender_job_offence' THEN 'base_offender_job_offence'
        WHEN 'offender_home_offence' THEN 'base_offender_home_offence'
        WHEN 'offender_mental_offence' THEN 'base_offender_mental_offence'
        WHEN 'offender_intox_offence' THEN 'base_offender_intox_offence'
        WHEN 'offender_victim_relationship' THEN 'base_offender_victim_relationship'
        WHEN 'victim_type' THEN 'base_victim_type'
        WHEN 'num_victims' THEN 'base_num_victims'
        WHEN 'victim_gender' THEN 'base_victim_gender'
        WHEN 'victim_age_offence' THEN 'base_victim_age_offence'
        WHEN 'victim_job_offence' THEN 'base_victim_job_offence'
        WHEN 'victim_home_offence' THEN 'base_victim_home_offence'
        WHEN 'victim_mental_offence' THEN 'base_victim_mental_offence'
        WHEN 'victim_intox_offence' THEN 'base_victim_intox_offence'
        WHEN 'pros_evid_type_trial' THEN 'base_pros_evid_type_trial'
        WHEN 'def_evid_type_trial' THEN 'base_def_evid_type_trial'
        WHEN 'pre_sent_report' THEN 'base_pre_sent_report'
        WHEN 'agg_fact_sent' THEN 'base_agg_fact_sent'
        WHEN 'mit_fact_sent' THEN 'base_mit_fact_sent'
        WHEN 'vic_impact_statement' THEN 'base_vic_impact_statement'
        WHEN 'appellant' THEN 'base_appellant'
        WHEN 'co_def_acc_num' THEN 'base_co_def_acc_num'
        WHEN 'appeal_against' THEN 'base_appeal_against'
        WHEN 'appeal_ground' THEN 'base_appeal_ground'
        WHEN 'sent_guide_which' THEN 'base_sent_guide_which'
        WHEN 'appeal_outcome' THEN 'base_appeal_outcome'
        WHEN 'reason_quash_conv' THEN 'base_reason_quash_conv'
        WHEN 'reason_sent_excessive' THEN 'base_reason_sent_excessive'
        WHEN 'reason_sent_lenient' THEN 'base_reason_sent_lenient'
        WHEN 'reason_dismiss' THEN 'base_reason_dismiss'
        ELSE NULL
    END
$$;

-- -----------------------------------------------------------------------------
-- RPC: filter documents by extracted base fields
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

    v_keywords TEXT[] := public._jsonb_to_text_array(p_filters -> 'keywords');
    v_convict_offences TEXT[] := public._jsonb_to_text_array(p_filters -> 'convict_offences');
    v_acquit_offences TEXT[] := public._jsonb_to_text_array(p_filters -> 'acquit_offences');
    v_appeal_ground TEXT[] := public._jsonb_to_text_array(p_filters -> 'appeal_ground');

    v_did_offender_confess BOOLEAN := NULL;
    v_vic_impact_statement BOOLEAN := NULL;

    v_num_victims_eq NUMERIC := NULL;
    v_num_victims_min NUMERIC := NULL;
    v_num_victims_max NUMERIC := NULL;

    v_case_number_eq NUMERIC := NULL;
    v_case_number_min NUMERIC := NULL;
    v_case_number_max NUMERIC := NULL;

    v_victim_age_eq NUMERIC := NULL;
    v_victim_age_min NUMERIC := NULL;
    v_victim_age_max NUMERIC := NULL;

    v_date_eq DATE := NULL;
    v_date_from DATE := NULL;
    v_date_to DATE := NULL;

    v_case_name_like TEXT := NULL;
    v_neutral_citation_like TEXT := NULL;
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

            AND (v_did_offender_confess IS NULL OR j.base_did_offender_confess = v_did_offender_confess)
            AND (v_vic_impact_statement IS NULL OR j.base_vic_impact_statement = v_vic_impact_statement)

            AND (v_keywords IS NULL OR j.base_keywords && v_keywords)
            AND (v_convict_offences IS NULL OR j.base_convict_offences && v_convict_offences)
            AND (v_acquit_offences IS NULL OR j.base_acquit_offences && v_acquit_offences)
            AND (v_appeal_ground IS NULL OR j.base_appeal_ground && v_appeal_ground)

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
            AND (
                (v_date_eq IS NULL OR j.base_date_of_appeal_court_judgment = v_date_eq)
                AND (v_date_from IS NULL OR j.base_date_of_appeal_court_judgment >= v_date_from)
                AND (v_date_to IS NULL OR j.base_date_of_appeal_court_judgment <= v_date_to)
            )
            AND (
                v_case_name_like IS NULL OR
                j.base_case_name ILIKE '%' || v_case_name_like || '%'
            )
            AND (
                v_neutral_citation_like IS NULL OR
                j.base_neutral_citation_number ILIKE '%' || v_neutral_citation_like || '%'
            )
            AND (
                p_text_query IS NULL OR TRIM(p_text_query) = '' OR
                to_tsvector(
                    'simple'::regconfig,
                    coalesce(j.base_case_name, '') || ' ' ||
                    coalesce(j.base_neutral_citation_number, '') || ' ' ||
                    coalesce(j.base_appeal_court_judges_names, '') || ' ' ||
                    coalesce(j.base_offender_representative_name, '') || ' ' ||
                    coalesce(j.base_crown_attorney_general_representative_name, '') || ' ' ||
                    coalesce(j.base_conv_court_names, '') || ' ' ||
                    coalesce(j.base_sent_court_name, '') || ' ' ||
                    coalesce(array_to_string(j.base_keywords, ' '), '') || ' ' ||
                    coalesce(array_to_string(j.base_convict_offences, ' '), '') || ' ' ||
                    coalesce(array_to_string(j.base_acquit_offences, ' '), '') || ' ' ||
                    coalesce(array_to_string(j.base_appeal_ground, ' '), '')
                ) @@ websearch_to_tsquery('simple', p_text_query)
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


-- -----------------------------------------------------------------------------
-- RPC: facet counts for extracted fields
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_extracted_facet_counts(
    field_path TEXT
)
RETURNS TABLE (
    value TEXT,
    count BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_column TEXT;
    v_udt_name TEXT;
    v_sql TEXT;
BEGIN
    v_column := public._base_field_to_column(field_path);

    IF v_column IS NULL THEN
        RAISE EXCEPTION 'Unknown extracted field: %', field_path;
    END IF;

    SELECT c.udt_name
    INTO v_udt_name
    FROM information_schema.columns c
    WHERE
        c.table_schema = 'public'
        AND c.table_name = 'judgments'
        AND c.column_name = v_column;

    IF v_udt_name IS NULL THEN
        RAISE EXCEPTION 'Column not found for extracted field: %', field_path;
    END IF;

    IF v_udt_name = '_text' THEN
        v_sql := format(
            $q$
            SELECT
                elem::text AS value,
                COUNT(*)::bigint AS count
            FROM public.judgments j
            CROSS JOIN LATERAL unnest(COALESCE(j.%1$I, ARRAY[]::text[])) AS elem
            WHERE j.base_extraction_status = 'completed'
              AND elem IS NOT NULL
              AND elem <> ''
            GROUP BY elem
            ORDER BY count DESC, elem ASC
            LIMIT 200
            $q$,
            v_column
        );
    ELSE
        v_sql := format(
            $q$
            SELECT
                j.%1$I::text AS value,
                COUNT(*)::bigint AS count
            FROM public.judgments j
            WHERE j.base_extraction_status = 'completed'
              AND j.%1$I IS NOT NULL
            GROUP BY j.%1$I
            ORDER BY count DESC, j.%1$I::text ASC
            LIMIT 200
            $q$,
            v_column
        );
    END IF;

    RETURN QUERY EXECUTE v_sql;
END;
$$;


-- -----------------------------------------------------------------------------
-- RPC: fetch UMAP points for viewport/bounding-box rendering
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_base_schema_umap_points(
    p_min_x DOUBLE PRECISION DEFAULT NULL,
    p_max_x DOUBLE PRECISION DEFAULT NULL,
    p_min_y DOUBLE PRECISION DEFAULT NULL,
    p_max_y DOUBLE PRECISION DEFAULT NULL,
    p_limit INT DEFAULT 5000
)
RETURNS TABLE (
    judgment_id UUID,
    umap_x DOUBLE PRECISION,
    umap_y DOUBLE PRECISION,
    case_name TEXT,
    appeal_outcome TEXT,
    appellant TEXT
)
LANGUAGE SQL
STABLE
AS $$
    SELECT
        j.id AS judgment_id,
        j.umap_x,
        j.umap_y,
        j.base_case_name AS case_name,
        array_to_string(j.base_appeal_outcome, ', ') AS appeal_outcome,
        j.base_appellant AS appellant
    FROM public.judgments j
    WHERE
        j.base_extraction_status = 'completed'
        AND j.umap_x IS NOT NULL
        AND j.umap_y IS NOT NULL
        AND (p_min_x IS NULL OR j.umap_x >= p_min_x)
        AND (p_max_x IS NULL OR j.umap_x <= p_max_x)
        AND (p_min_y IS NULL OR j.umap_y >= p_min_y)
        AND (p_max_y IS NULL OR j.umap_y <= p_max_y)
    ORDER BY j.id
    LIMIT GREATEST(COALESCE(p_limit, 5000), 1);
$$;


GRANT EXECUTE ON FUNCTION public._jsonb_to_text_array(JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._base_field_to_column(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.filter_documents_by_extracted_data(JSONB, TEXT, INT, INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_extracted_facet_counts(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_base_schema_umap_points(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT) TO anon, authenticated, service_role;
