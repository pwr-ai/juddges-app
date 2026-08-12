-- =============================================================================
-- Migration: create the publication tables
-- =============================================================================
-- Refs #464.
--
-- `/publications` and `/publications/admin` are non-functional because none of
-- the four tables the feature uses has ever existed: `publications`,
-- `publication_schemas`, `publication_collections` and
-- `publication_extraction_jobs`. This was the last group of missing tables in
-- the schema-drift sweep; it had to wait for `extraction_jobs` (#437) and
-- `extraction_schemas` (#450), both of which the join tables point at.
--
-- Every column is derived from a real call site:
--   * publications — the `Publication` model in backend/app/publications.py
--     (id, title, authors, venue, venue_short, year, month, abstract, project,
--     type, status, links, tags, citations, manuscript_number,
--     acceptance_date, publication_date, created_at, updated_at) plus `user_id`,
--     which the model does not expose but `create_publication` writes and
--     `_authorize_publication_mutation` reads back to gate every mutation.
--     Lengths and ranges mirror the Field(...) constraints on
--     CreatePublicationRequest so a payload that passes validation cannot be
--     rejected by the database and vice versa.
--   * the three join tables — the PostgREST selects in
--     backend/packages/juddges_search/juddges_search/db/publications_db.py:
--     each carries `publication_id`, its own foreign key, `description` and
--     `created_at`, and nothing else.
--
-- Type notes:
--   * `authors` (list[PublicationAuthor]) and `links` (PublicationLinks) are
--     structured objects — JSONB. `tags` is a flat list[str], so it is TEXT[].
--   * `acceptance_date` / `publication_date` are DATE. The API models type them
--     as bare `str` with no format validation, and Postgres' DATE input accepts
--     both 'YYYY-MM-DD' and a full ISO timestamp, so no writer regresses;
--     PostgREST renders them back as 'YYYY-MM-DD' strings, which is what
--     `transform_publication` expects.
--   * `project`, `type` and `status` are TEXT + CHECK rather than Postgres
--     enums: adding a value to a CHECK is a plain migration, while extending an
--     enum type is not transactional in older servers. The value sets below are
--     the full member lists of PublicationProject / PublicationType /
--     PublicationStatus (backend/app/publications.py, mirrored in
--     frontend/types/publication.ts). Both create and update validate through
--     those Pydantic enums, so the CHECKs cannot reject a legal API payload.
--     `project` currently admits one value; widen the CHECK in the same commit
--     that adds a member to the enum.
--
-- Foreign keys are load-bearing here, not decoration: publications_db.py reads
-- the linked resources as PostgREST *embedded resources*, which resolve through
-- the FK graph. A missing constraint is a 400 on the whole query, not an empty
-- list. The embeds this migration has to satisfy:
--   publications
--     -> publication_schemas(schema_id, description, created_at)
--     -> publication_collections(collection_id, description, created_at)
--     -> publication_extraction_jobs(job_id, description, created_at,
--                                    extraction_jobs(status))
--   publication_schemas    -> extraction_schemas(id, name, description, status)
--   publication_collections -> collections(id, name, description)
--   publication_extraction_jobs -> extraction_jobs(id, job_id, status, ...)
--
-- Note `publication_extraction_jobs.job_id` references the TEXT `job_id`
-- column of `extraction_jobs`, not its uuid primary key: `job_id` is the Celery
-- task id that every caller passes around (LinkExtractionJobRequest.job_id, the
-- `/publications/{id}/extraction-jobs/{job_id}` routes) and it is UNIQUE, which
-- is all Postgres and PostgREST need. PostgREST derives its relationship graph
-- from pg_constraint, keyed on the constrained columns rather than on
-- primary-key-ness, so the nested `extraction_jobs(status)` embed resolves
-- through this constraint as a normal many-to-one.
-- =============================================================================


-- =============================================================================
-- public.publications
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.publications (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title             TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
    -- [{name, affiliation, url}, ...] per PublicationAuthor.
    authors           JSONB NOT NULL DEFAULT '[]'::jsonb,
    venue             TEXT NOT NULL CHECK (char_length(venue) BETWEEN 1 AND 500),
    venue_short       TEXT CHECK (venue_short IS NULL OR char_length(venue_short) <= 50),
    year              INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2100),
    month             INTEGER CHECK (month IS NULL OR month BETWEEN 1 AND 12),
    abstract          TEXT NOT NULL CHECK (char_length(abstract) BETWEEN 1 AND 10000),
    project           TEXT NOT NULL CHECK (project IN ('JuDDGES')),
    type              TEXT NOT NULL
                      CHECK (type IN ('journal', 'conference', 'preprint', 'workshop')),
    status            TEXT NOT NULL
                      CHECK (status IN ('published', 'accepted', 'under_review', 'preprint')),
    -- {pdf, arxiv, doi, code, website, video} per PublicationLinks. Defaulted to
    -- an empty object because `create_publication` sends `{}` when links are absent
    -- and `transform_publication` does `PublicationLinks(**data.get("links", {}))`.
    links             JSONB NOT NULL DEFAULT '{}'::jsonb,
    tags              TEXT[] NOT NULL DEFAULT '{}'::text[],
    citations         INTEGER CHECK (citations IS NULL OR citations >= 0),
    manuscript_number TEXT CHECK (manuscript_number IS NULL
                                  OR char_length(manuscript_number) <= 100),
    acceptance_date   DATE,
    publication_date  DATE,
    -- Creator, stamped by POST /publications. NULLABLE and ON DELETE SET NULL:
    -- a publication is curated content that outlives the account that entered
    -- it, and `_authorize_publication_mutation` treats a NULL owner as
    -- admin-only, so orphaning a row fails closed rather than open.
    user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GET /publications orders by (year DESC, created_at DESC) on every request and
-- filters on any subset of project / year / status / type (publications_db.py
-- get_publications). The composite serves the unfiltered ordered page and the
-- `year` filter; the three single-column indexes serve the other filters, which
-- are each low-cardinality but selective enough to beat a full scan once the
-- catalogue grows.
CREATE INDEX IF NOT EXISTS idx_publications_year_created
    ON public.publications(year DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_publications_project ON public.publications(project);
CREATE INDEX IF NOT EXISTS idx_publications_status  ON public.publications(status);
CREATE INDEX IF NOT EXISTS idx_publications_type    ON public.publications(type);

CREATE OR REPLACE FUNCTION public.tg_publications_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_publications_set_updated_at ON public.publications;
CREATE TRIGGER trg_publications_set_updated_at
    BEFORE UPDATE ON public.publications
    FOR EACH ROW EXECUTE FUNCTION public.tg_publications_set_updated_at();

COMMENT ON TABLE public.publications IS
    'Curated research publications behind /publications. Columns mirror the Publication model in backend/app/publications.py; user_id records who entered the row and gates mutations, it does not restrict who may read it.';
COMMENT ON COLUMN public.publications.user_id IS
    'Creator of the row, set by POST /publications. NULL means pre-ownership or a deleted account; _authorize_publication_mutation then allows admins only.';


-- =============================================================================
-- public.publication_schemas
-- =============================================================================
-- Join table for the extraction schemas a publication reports on. The composite
-- primary key is what makes `add_schema_link` idempotent: a repeat link raises
-- a duplicate-key error, which the caller deliberately swallows as success.

CREATE TABLE IF NOT EXISTS public.publication_schemas (
    publication_id UUID NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
    schema_id      UUID NOT NULL REFERENCES public.extraction_schemas(id) ON DELETE CASCADE,
    description    TEXT CHECK (description IS NULL OR char_length(description) <= 1000),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (publication_id, schema_id)
);

-- The primary key covers publication -> schemas. This one covers the reverse
-- direction and backs the ON DELETE CASCADE from extraction_schemas.
CREATE INDEX IF NOT EXISTS idx_publication_schemas_schema_id
    ON public.publication_schemas(schema_id);

COMMENT ON TABLE public.publication_schemas IS
    'Extraction schemas linked to a publication. Read through the PostgREST embed publication_schemas(schema_id, description, created_at) and, on the sub-resource route, with extraction_schemas(...) nested.';


-- =============================================================================
-- public.publication_collections
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.publication_collections (
    publication_id UUID NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
    collection_id  UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
    description    TEXT CHECK (description IS NULL OR char_length(description) <= 1000),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (publication_id, collection_id)
);

CREATE INDEX IF NOT EXISTS idx_publication_collections_collection_id
    ON public.publication_collections(collection_id);

COMMENT ON TABLE public.publication_collections IS
    'Document collections linked to a publication. CASCADE on collection_id because the link says nothing once the collection is gone.';


-- =============================================================================
-- public.publication_extraction_jobs
-- =============================================================================
-- job_id is TEXT and references extraction_jobs(job_id) — the UNIQUE Celery
-- task id — because that is the identifier the API surface uses end to end.
-- CASCADE keeps a link from outliving the job whose status it exists to show.

CREATE TABLE IF NOT EXISTS public.publication_extraction_jobs (
    publication_id UUID NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
    job_id         TEXT NOT NULL REFERENCES public.extraction_jobs(job_id) ON DELETE CASCADE,
    description    TEXT CHECK (description IS NULL OR char_length(description) <= 1000),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (publication_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_publication_extraction_jobs_job_id
    ON public.publication_extraction_jobs(job_id);

COMMENT ON TABLE public.publication_extraction_jobs IS
    'Extraction jobs linked to a publication. job_id references extraction_jobs(job_id), the TEXT Celery task id, not the uuid primary key; the nested extraction_jobs(status) embed resolves through that constraint.';


-- =============================================================================
-- RLS
-- =============================================================================
-- Decision: RLS enabled on all four tables with no anon or authenticated
-- policy, and no grant to either role. Only service_role reaches them.
--
-- Who actually touches these tables today:
--   * backend/app/publications.py goes through PublicationsDB, which builds its
--     client from SUPABASE_SERVICE_ROLE_KEY (juddges_search/db/_base.py
--     `_init_client`). service_role has BYPASSRLS, so no policy here affects the
--     API at all.
--   * the Next.js side never queries these tables. Every route under
--     frontend/app/api/publications/ proxies to the FastAPI backend over HTTP
--     (`fetch(`${API_BASE_URL}/publications...`)`); there is no
--     `.from('publication…')` anywhere in frontend/.
--
-- So the owner-scoped pattern used by collections and extraction_jobs would be
-- wrong twice over: publications are curated catalogue content that everyone is
-- meant to read, and scoping reads to `auth.uid() = user_id` would hide one
-- editor's entries from every other reader the moment a direct client appeared.
-- Public-ness is decided in the backend instead — `/publications` and
-- `/api/publications` are declared public GETs in
-- frontend/lib/supabase/public-route-policy.ts, while writes require a JWT and
-- linking requires an admin (`require_admin`).
--
-- Granting `anon`/`authenticated` a blanket SELECT would therefore widen the
-- exposed surface with no consumer to justify it, so this migration denies both
-- roles by default — the same choice 20260804000001 made for blog_posts,
-- blog_tags and blog_categories, which are the closest analogue in the schema.
-- If a server component ever needs to read publications directly with a user
-- token, add `FOR SELECT TO anon, authenticated USING (true)` on
-- `publications` (and the equivalent parent-scoped predicate on the join
-- tables) in that change, together with the matching GRANT.
--
-- Two gates, not one, because neither is sufficient alone:
--   * ENABLE ROW LEVEL SECURITY with no policy denies every row to any role
--     without BYPASSRLS. This is the gate that matters, because Supabase's
--     default privileges (`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL
--     ON TABLES TO anon, authenticated, service_role`) hand table privileges to
--     anon and authenticated on every newly created table whether a migration
--     asks for them or not.
--   * the explicit REVOKE cancels exactly those inherited privileges, so a
--     later `CREATE POLICY` cannot accidentally open the table up on its own.

ALTER TABLE public.publications                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_schemas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_collections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publication_extraction_jobs  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.publications                FROM anon, authenticated;
REVOKE ALL ON public.publication_schemas         FROM anon, authenticated;
REVOKE ALL ON public.publication_collections     FROM anon, authenticated;
REVOKE ALL ON public.publication_extraction_jobs FROM anon, authenticated;

GRANT ALL ON public.publications                TO service_role;
GRANT ALL ON public.publication_schemas         TO service_role;
GRANT ALL ON public.publication_collections     TO service_role;
GRANT ALL ON public.publication_extraction_jobs TO service_role;
