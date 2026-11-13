"""Connection settings for library-managed state outside the Supabase Data API.

Only migration-owned private objects belong on this path. In particular, do not
fall back to public: a missing migration must fail setup instead of recreating
agent state under Supabase's public default grants.
"""

PRIVATE_DATABASE_SCHEMA = "juddges_private"
PRIVATE_DATABASE_OPTIONS = f"-c search_path={PRIVATE_DATABASE_SCHEMA}"
