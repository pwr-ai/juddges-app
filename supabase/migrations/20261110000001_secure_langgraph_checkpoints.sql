-- LangGraph's AsyncPostgresSaver.setup() creates these tables at backend boot.
-- Supabase's default grants made the agent state readable and writable through
-- PostgREST. Pre-create them so fresh installs never expose that state either.
-- Keep LangGraph's own checkpoint_migrations ledger empty: setup() still owns
-- its migrations and indexes and can safely run against these existing tables.
-- DDL matches langgraph-checkpoint-postgres 3.x (including task_path).
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.checkpoint_migrations (
    v INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS public.checkpoints (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    parent_checkpoint_id TEXT,
    type TEXT,
    checkpoint JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS public.checkpoint_blobs (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL,
    version TEXT NOT NULL,
    type TEXT NOT NULL,
    blob BYTEA,
    PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);

CREATE TABLE IF NOT EXISTS public.checkpoint_writes (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    channel TEXT NOT NULL,
    type TEXT,
    blob BYTEA NOT NULL,
    task_path TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

-- No API policies: agent state is private backend infrastructure. The backend
-- connects as the owning postgres role via DATABASE_URL and still bypasses RLS.
ALTER TABLE public.checkpoint_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoint_blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoint_writes ENABLE ROW LEVEL SECURITY;

-- Revoke PUBLIC as well as API roles, including BYPASSRLS service_role: there
-- are no legitimate PostgREST consumers of these tables. Revoking ALL also
-- removes TRUNCATE, which RLS cannot restrict.
REVOKE ALL ON public.checkpoint_migrations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.checkpoints FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.checkpoint_blobs FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.checkpoint_writes FROM PUBLIC, anon, authenticated, service_role;
