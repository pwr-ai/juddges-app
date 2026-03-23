# Supabase Complete Reference: Auth + Search (2025-2026)

> Single-file reference for adding Supabase Auth and pgvector Search to any project with Python/FastAPI backend and React/Next.js frontend. Compiled from official docs, community discussions, and production experience.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Installation & Setup](#2-installation--setup)
3. [Environment Variables](#3-environment-variables)
4. [Frontend: Next.js Auth with @supabase/ssr](#4-frontend-nextjs-auth-with-supabasessr)
5. [Backend: Python/FastAPI Client Patterns](#5-backend-pythonfastapi-client-patterns)
6. [Backend: JWT Authentication](#6-backend-jwt-authentication)
7. [Backend: Error Handling](#7-backend-error-handling)
8. [Vector Search with pgvector](#8-vector-search-with-pgvector)
9. [Hybrid Search (Full-Text + Semantic)](#9-hybrid-search-full-text--semantic)
10. [Automatic Embedding Pipeline](#10-automatic-embedding-pipeline)
11. [Row Level Security (RLS)](#11-row-level-security-rls)
12. [Connection Pooling & Supavisor](#12-connection-pooling--supavisor)
13. [API Key Model (2025-2026)](#13-api-key-model-2025-2026)
14. [Migration: auth-helpers to @supabase/ssr](#14-migration-auth-helpers-to-supabasessr)
15. [Production Checklist](#15-production-checklist)
16. [Common Pitfalls](#16-common-pitfalls)
17. [Sources](#17-sources)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 15)                        │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │ Browser Client│  │ Server Components│  │     Middleware        │  │
│  │ @supabase/ssr │  │  @supabase/ssr   │  │  Session Refresh      │  │
│  │ (publishable  │  │  (publishable    │  │  getUser() / token    │  │
│  │  key only)    │  │   key + cookies) │  │  refresh + cookies    │  │
│  └──────────────┘  └──────────────────┘  └───────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ JWT Token (Authorization header)
┌─────────────────────────────▼───────────────────────────────────────┐
│                      BACKEND (FastAPI / Python)                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │ Admin Client      │  │ User Client      │  │ JWT Validation    │  │
│  │ (service_role/    │  │ (anon key +      │  │ get_user(token)   │  │
│  │  secret key)      │  │  user JWT)       │  │                   │  │
│  │ Bypasses RLS      │  │ Respects RLS     │  │                   │  │
│  └──────────────────┘  └──────────────────┘  └───────────────────┘  │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│                   SUPABASE (PostgreSQL + pgvector)                    │
│  ┌────────────┐  ┌───────────────┐  ┌────────────┐  ┌────────────┐  │
│  │ Auth       │  │ pgvector      │  │ RLS        │  │ Supavisor  │  │
│  │ (sessions, │  │ (HNSW index,  │  │ (per-user  │  │ (conn      │  │
│  │  JWT,      │  │  halfvec,     │  │  policies) │  │  pooling)  │  │
│  │  OAuth)    │  │  hybrid RRF)  │  │            │  │            │  │
│  └────────────┘  └───────────────┘  └────────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Principles (2025-2026)

1. **Use `@supabase/ssr`** — replaces deprecated `@supabase/auth-helpers-nextjs`
2. **Use `getUser()` not `getSession()`** — server-side JWT validation (or `getClaims()` for local-only)
3. **New API key model** — `sb_publishable_...` (client) + `sb_secret_...` (server, revocable)
4. **HNSW over IVFFlat** — recommended default for vector indexes
5. **Singleton admin client** — never create a new Python client per request (~5s overhead)
6. **`halfvec`** — 50% storage reduction with equivalent accuracy for embeddings
7. **Hybrid search with RRF** — combine full-text + semantic for best precision

---

## 2. Installation & Setup

### Frontend (Next.js)

```bash
npm install @supabase/supabase-js @supabase/ssr
```

### Backend (Python/FastAPI)

```bash
pip install supabase           # v2.28.0+ (as of Feb 2026)
# or
poetry add supabase
# or
uv add supabase
```

Requires Python >= 3.9. The SDK is a monorepo containing: `supabase`, `realtime-py`, `supabase_functions`, `storage3`, `postgrest`, `supabase_auth`.

### Database Extensions (SQL)

```sql
-- Core: pgvector for embeddings
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Optional: automatic embedding pipeline
CREATE EXTENSION IF NOT EXISTS pgmq;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS hstore WITH SCHEMA extensions;
```

---

## 3. Environment Variables

### Frontend (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# New projects (Nov 2025+):
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

### Backend (`.env`)

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key    # NEVER expose
SUPABASE_ANON_KEY=your-anon-key                    # For user-scoped clients
OPENAI_API_KEY=sk-...

# Direct DB (migrations, Celery)
DATABASE_URL=postgresql://postgres:pw@db.project.supabase.co:5432/postgres
# Pooled (app servers)
DATABASE_URL_POOLED=postgresql://postgres:pw@project.pooler.supabase.com:6543/postgres
```

### Security Matrix

| Variable | Frontend | Backend | Safe to expose? |
|----------|----------|---------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Yes | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Yes | Yes (RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | **NEVER** | Yes | **NEVER** |
| `OPENAI_API_KEY` | **NEVER** | Yes | **NEVER** |

### Startup Validation (Python — recommended)

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    supabase_anon_key: str
    openai_api_key: str

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()  # Raises ValidationError at startup if vars missing
```

---

## 4. Frontend: Next.js Auth with @supabase/ssr

### File Structure

```
lib/supabase/
├── client.ts          # Browser client (Client Components)
├── server.ts          # Server client (Server Components, Route Handlers)
└── middleware.ts       # Session refresh proxy
middleware.ts           # Root middleware entry point
app/auth/
├── callback/route.ts  # OAuth PKCE code exchange
├── confirm/route.ts   # Email OTP / magic link verification
├── login/page.tsx     # Login UI
├── sign-up/page.tsx   # Sign-up UI
└── error/page.tsx     # Auth error display
```

### 4.1 Browser Client (`lib/supabase/client.ts`)

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

Optional: add `import 'client-only'` at the top to prevent accidental server-side import.

### 4.2 Server Client (`lib/supabase/server.ts`)

```typescript
import 'server-only';  // Build error if imported in Client Component
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — middleware handles cookies
          }
        },
      },
    }
  );
}
```

### 4.3 Middleware Client (`lib/supabase/middleware.ts`)

The **only** place cookies are actually written to the response. Every other server-side client relies on this having run first.

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Step 1: Update request cookies (for downstream Server Components)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Step 2: Rebuild response with updated request
          supabaseResponse = NextResponse.next({ request });
          // Step 3: Set cookies on response (for browser)
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // CRITICAL: No code between createServerClient and getUser()
  const { data: { user } } = await supabase.auth.getUser();

  // Route protection
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/api/health")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    // Preserve redirect target
    url.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // CRITICAL: Return supabaseResponse as-is
  return supabaseResponse;
}
```

### 4.4 Root Middleware (`middleware.ts`)

```typescript
import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

### 4.5 OAuth Callback (`app/auth/callback/route.ts`)

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${origin}/auth/error?error=${encodeURIComponent(error)}`
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`);
}
```

### 4.6 Login Page (`app/auth/login/page.tsx`)

```tsx
"use client";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      router.push(redirectTo);
      router.refresh();
    }
  };

  const handleOAuth = async (provider: "google" | "github") => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${redirectTo}` },
    });
  };

  return (
    <form onSubmit={handleLogin}>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p>{error}</p>}
      <button type="submit">Sign In</button>
      <button type="button" onClick={() => handleOAuth("google")}>Google</button>
    </form>
  );
}
```

### 4.7 Protecting Server Components

```typescript
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ProtectedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // RLS automatically scopes data to this user
  const { data } = await supabase.from("documents").select("*").limit(20);
  return <div>Welcome, {user.email}!</div>;
}
```

### 4.8 `getUser()` vs `getSession()` vs `getClaims()`

| Method | Network call | Validates JWT | Detects logout | Use where |
|--------|-------------|--------------|----------------|-----------|
| `getSession()` | No | No | No | Client-side only (NEVER server) |
| `getClaims()` | No | Local JWT only | No | Fast local validation |
| `getUser()` | Yes | Yes (auth server) | Yes | Server-side (always) |

### 4.9 Token Refresh Chain

```
Browser Request → middleware.ts → getUser() refreshes expired token
  → writes new token to request.cookies AND response.cookies
  → Server Component reads fresh cookies via createClient()
  → Supabase evaluates auth.uid() correctly in RLS
  → Response carries Set-Cookie back to browser
```

---

## 5. Backend: Python/FastAPI Client Patterns

### 5.1 Pattern A: Lazy Singleton Admin Client (Recommended)

```python
import os
from typing import Optional
from supabase import Client, ClientOptions, create_client
from loguru import logger

_admin_client: Optional[Client] = None

def get_admin_client() -> Client:
    """Lazy singleton. Bypasses RLS. Use for admin/system operations."""
    global _admin_client
    if _admin_client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
        options = ClientOptions(
            postgrest_client_timeout=30,
            storage_client_timeout=30,
            schema="public",
        )
        _admin_client = create_client(url, key, options=options)
        logger.info("Supabase admin client initialized")
    return _admin_client
```

Why lazy: avoids import-time failures when env vars aren't set (e.g., tests). Never create a new client per request — it takes ~5 seconds due to httpx client creation.

### 5.2 Pattern B: FastAPI Dependency Injection

```python
from fastapi import Depends
from supabase import Client

async def get_supabase() -> Client:
    return get_admin_client()

@app.get("/api/documents")
async def list_documents(supabase: Client = Depends(get_supabase)):
    result = supabase.table("documents").select("*").execute()
    return result.data
```

### 5.3 Pattern C: Per-Request User Client (RLS-Enforced)

```python
def get_user_client(access_token: str) -> Client:
    """Creates client with user JWT for RLS. Slower — new client per request."""
    url = os.getenv("SUPABASE_URL")
    anon_key = os.getenv("SUPABASE_ANON_KEY")
    options = ClientOptions(postgrest_client_timeout=30, storage_client_timeout=30)
    client = create_client(url, anon_key, options=options)
    client.auth.set_session(access_token, "")
    return client
```

### 5.4 Pattern D: FastAPI Lifespan (Async, cleanest lifecycle)

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from supabase import AsyncClient, acreate_client, AsyncClientOptions

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.supabase = await acreate_client(
        supabase_url=os.getenv("SUPABASE_URL"),
        supabase_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
        options=AsyncClientOptions(postgrest_client_timeout=15),
    )
    yield

app = FastAPI(lifespan=lifespan)

async def get_db(request: Request) -> AsyncClient:
    return request.app.state.supabase
```

### 5.5 Sync vs Async Client

| Dimension | `Client` (sync) | `AsyncClient` (async) |
|-----------|-----------------|----------------------|
| Import | `from supabase import create_client` | `from supabase import acreate_client` |
| Construction | `create_client(url, key)` | `await acreate_client(url, key)` |
| Realtime | Not supported | Required |
| FastAPI CRUD | Works (httpx internally) | Preferred for high concurrency |

### 5.6 ClientOptions (Timeout Configuration)

```python
from supabase import ClientOptions

options = ClientOptions(
    postgrest_client_timeout=30,   # DB/PostgREST calls
    storage_client_timeout=60,     # File uploads (longer)
    schema="public",
)
# DEPRECATED: create_client(url, key, timeout=30) — raises warnings
```

---

## 6. Backend: JWT Authentication

### 6.1 Complete Auth Module

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional

security = HTTPBearer()

class AuthenticatedUser:
    def __init__(self, user_data: dict, access_token: str):
        self.id = user_data.get("id")
        self.email = user_data.get("email")
        self.role = user_data.get("role", "authenticated")
        self.raw_token = access_token
        self.app_metadata = user_data.get("app_metadata", {})
        self.user_metadata = user_data.get("user_metadata", {})

    def is_admin(self) -> bool:
        return self.app_metadata.get("is_admin", False)

    def __repr__(self) -> str:
        return f"AuthenticatedUser(id={self.id}, email={self.email})"


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> AuthenticatedUser:
    token = credentials.credentials
    try:
        admin = get_admin_client()
        response = admin.auth.get_user(token)
        if not response or not response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        user_data = (
            response.user.model_dump()
            if hasattr(response.user, "model_dump")
            else response.user.__dict__
        )
        return AuthenticatedUser(user_data, token)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth failed: {e}")


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        HTTPBearer(auto_error=False)
    ),
) -> Optional[AuthenticatedUser]:
    if not credentials:
        return None
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


async def require_admin(
    user: AuthenticatedUser = Depends(get_current_user),
) -> AuthenticatedUser:
    if not user.is_admin():
        raise HTTPException(status_code=403, detail="Admin required")
    return user
```

### 6.2 Type Aliases for Clean Routes

```python
from typing import Annotated

AdminDB = Annotated[Client, Depends(get_admin_client)]
CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]
OptionalUser = Annotated[Optional[AuthenticatedUser], Depends(get_optional_user)]

@router.get("/api/me")
async def me(user: CurrentUser):
    return {"id": user.id, "email": user.email}
```

---

## 7. Backend: Error Handling

### 7.1 PostgREST Exception Handling

```python
from postgrest.exceptions import APIError
from gotrue.errors import AuthApiError, AuthSessionMissingError

try:
    result = client.table("documents").select("*").execute()
except APIError as e:
    # e.code: PostgreSQL error code (e.g., "23505")
    # e.message: human-readable message
    logger.error(f"DB error [{e.code}]: {e.message}")
```

### 7.2 Common Error Codes

| Code | Meaning | HTTP Status |
|------|---------|-------------|
| `23505` | Unique constraint violation | 409 |
| `23503` | Foreign key violation | 400 |
| `42501` | Insufficient privilege (RLS denial) | 403 |
| `PGRST116` | No rows returned (`.single()`) | 404 |
| `PGRST301` | JWT expired | 401 |

### 7.3 Safe Result Checking

```python
# Use maybe_single() to avoid PGRST116 on empty results
result = client.table("docs").select("*").eq("id", id).maybe_single().execute()
if result.data is None:
    raise HTTPException(status_code=404)

# For lists, always guard against None
data = result.data or []
```

---

## 8. Vector Search with pgvector

### 8.1 Table Schema

```sql
CREATE TABLE documents (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding extensions.vector(768),
    fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 8.2 Vector Type Selection

| Type | Bits/dim | 1536-dim size | Max indexable dims | Use when |
|------|----------|--------------|-------------------|----------|
| `vector` | 32 | ~6 KB | 2,000 | Full precision needed |
| `halfvec` | 16 | ~3 KB | 4,000 | **Default for production** |
| `bit` | 1 | ~192 B | 64,000 | Binary quantization, fast but less accurate |

### 8.3 Embedding Model Dimensions

| Model | Dimensions | Column Type |
|-------|-----------|-------------|
| `text-embedding-3-small` | 1536 | `halfvec(1536)` |
| `text-embedding-3-large` | 3072 | `halfvec(3072)` |
| `text-embedding-ada-002` | 1536 | `halfvec(1536)` |
| Supabase `gte-small` | 384 | `halfvec(384)` |

### 8.4 Indexes

```sql
-- HNSW (recommended — safe on empty tables, self-maintaining)
CREATE INDEX idx_docs_embedding
    ON documents USING hnsw (embedding vector_cosine_ops);

-- With custom parameters
CREATE INDEX idx_docs_embedding_custom
    ON documents USING hnsw (embedding vector_cosine_ops)
    WITH (m = 24, ef_construction = 128);

-- halfvec HNSW
CREATE INDEX ON documents USING hnsw (embedding halfvec_cosine_ops);

-- High-dimensional with halfvec cast
CREATE INDEX ON documents
    USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

-- GIN for full-text search
CREATE INDEX idx_docs_fts ON documents USING gin(fts);

-- B-tree for RLS performance
CREATE INDEX idx_docs_user_id ON documents(user_id);

-- Partial index (only non-null embeddings)
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
    WHERE embedding IS NOT NULL;
```

### 8.5 HNSW vs IVFFlat

| Feature | HNSW | IVFFlat |
|---------|------|---------|
| Build on empty table | Safe | Must have data first |
| Self-maintaining | Yes | No (rebuild needed) |
| Recall | Better | Good with tuning |
| Memory | Higher | Lower |
| **Recommendation** | **Default choice** | Only for extreme memory constraints |

### 8.6 HNSW Parameters

| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| `m` | 16 | 2-100 | Connections/node. Higher = better recall, more memory |
| `ef_construction` | 64 | 4-1000 | Build candidates. Higher = better index, slower build |
| `ef_search` | 40 | 1-1000 | Query candidates. Higher = better recall, slower query |

```sql
-- Tune at query time per session
SET hnsw.ef_search = 100;

-- Per transaction only
BEGIN;
SET LOCAL hnsw.ef_search = 100;
SELECT * FROM match_documents(...);
COMMIT;
```

### 8.7 Distance Operators

| Operator | Metric | Index Class | Best For |
|----------|--------|------------|----------|
| `<->` | Euclidean (L2) | `vector_l2_ops` | Absolute distances |
| `<#>` | Negative inner product | `vector_ip_ops` | Normalized vectors (fastest) |
| `<=>` | Cosine distance | `vector_cosine_ops` | Most common, any vectors |

### 8.8 Match Documents SQL Function

```sql
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding extensions.vector(768),
    match_threshold FLOAT DEFAULT 0.78,
    match_count INT DEFAULT 10
)
RETURNS TABLE (
    id BIGINT, title TEXT, content TEXT, similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
    SELECT id, title, content,
           1 - (embedding <=> query_embedding) AS similarity
    FROM documents
    WHERE 1 - (embedding <=> query_embedding) > match_threshold
    ORDER BY embedding <=> query_embedding ASC
    LIMIT match_count;
$$;
```

### 8.9 Calling from Python

```python
import openai

def generate_embedding(text: str, model: str = "text-embedding-3-small") -> list[float]:
    client = openai.OpenAI()
    text = text.replace("\n", " ").strip()
    response = client.embeddings.create(model=model, input=text)
    return response.data[0].embedding

def semantic_search(query: str, match_count: int = 10) -> list:
    embedding = generate_embedding(query)
    supabase = get_admin_client()
    result = supabase.rpc("match_documents", {
        "query_embedding": embedding,
        "match_threshold": 0.78,
        "match_count": match_count,
    }).execute()
    return result.data

def batch_upsert_documents(documents: list[dict], batch_size: int = 100):
    """Batch embed + upsert with rate-limit handling."""
    import time
    client = openai.OpenAI()
    supabase = get_admin_client()

    for i in range(0, len(documents), batch_size):
        batch = documents[i:i + batch_size]
        texts = [doc["content"].replace("\n", " ") for doc in batch]
        response = client.embeddings.create(model="text-embedding-3-small", input=texts)
        embeddings = [item.embedding for item in response.data]
        rows = [{
            "content": doc["content"],
            "metadata": doc.get("metadata", {}),
            "embedding": emb,
        } for doc, emb in zip(batch, embeddings)]
        supabase.table("documents").upsert(rows).execute()
        if i + batch_size < len(documents):
            time.sleep(0.5)  # Respect OpenAI rate limits
```

### 8.10 Calling from Next.js

```typescript
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

export async function semanticSearch(query: string) {
  const openai = new OpenAI();
  const { data } = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const supabase = await createClient();
  const { data: results, error } = await supabase.rpc("match_documents", {
    query_embedding: data[0].embedding,
    match_threshold: 0.78,
    match_count: 10,
  });
  if (error) throw error;
  return results;
}
```

### 8.11 LangChain Integration

```python
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import SupabaseVectorStore

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
vector_store = SupabaseVectorStore(
    client=get_admin_client(),
    embedding=embeddings,
    table_name="documents",
    query_name="match_documents",  # Must match SQL function name
)
results = vector_store.similarity_search("tenant eviction rights", k=5)
```

---

## 9. Hybrid Search (Full-Text + Semantic)

### 9.1 SQL Function (RRF — Reciprocal Rank Fusion)

```sql
CREATE OR REPLACE FUNCTION hybrid_search(
    query_text TEXT,
    query_embedding extensions.vector(768),
    match_count INT,
    full_text_weight FLOAT DEFAULT 1.0,
    semantic_weight FLOAT DEFAULT 1.0,
    rrf_k INT DEFAULT 50
)
RETURNS SETOF documents
LANGUAGE sql
AS $$
WITH full_text AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY ts_rank_cd(fts, websearch_to_tsquery(query_text)) DESC) AS rank_ix
    FROM documents
    WHERE fts @@ websearch_to_tsquery(query_text)
    LIMIT LEAST(match_count, 30) * 2
),
semantic AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY embedding <=> query_embedding) AS rank_ix
    FROM documents
    ORDER BY rank_ix
    LIMIT LEAST(match_count, 30) * 2
)
SELECT documents.*
FROM full_text
    FULL OUTER JOIN semantic ON full_text.id = semantic.id
    JOIN documents ON COALESCE(full_text.id, semantic.id) = documents.id
ORDER BY
    COALESCE(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
    COALESCE(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight
    DESC
LIMIT LEAST(match_count, 30);
$$;
```

### 9.2 How RRF Scoring Works

Each document gets `score = 1 / (k + rank)` from each method. Final score = weighted sum. `k=50` is the smoothing constant. Items ranked high by both methods score highest.

### 9.3 Weight Tuning

| Weights | Best for |
|---------|----------|
| `full_text=1, semantic=1` | Balanced (default) |
| `full_text=0.5, semantic=1.5` | Conceptual queries |
| `full_text=1.5, semantic=0.5` | Exact keyword/phrase matching |

### 9.4 Calling from Python

```python
def hybrid_search(query: str, match_count: int = 10,
                  full_text_weight: float = 1.0, semantic_weight: float = 1.0) -> list:
    embedding = generate_embedding(query)
    supabase = get_admin_client()
    result = supabase.rpc("hybrid_search", {
        "query_text": query,
        "query_embedding": embedding,
        "match_count": match_count,
        "full_text_weight": full_text_weight,
        "semantic_weight": semantic_weight,
    }).execute()
    return result.data
```

---

## 10. Automatic Embedding Pipeline

Auto-generate embeddings on INSERT/UPDATE using pg_cron + pgmq + Edge Functions.

### 10.1 Table Setup

```sql
CREATE TABLE documents (
    id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding halfvec(768),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON documents USING hnsw (embedding halfvec_cosine_ops);
```

### 10.2 Content Function

```sql
CREATE OR REPLACE FUNCTION embedding_input(doc documents)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    RETURN '# ' || doc.title || E'\n\n' || doc.content;
END;
$$;
```

### 10.3 Triggers

```sql
-- Clear embedding when content changes
CREATE TRIGGER clear_document_embedding_on_update
    BEFORE UPDATE OF title, content ON documents
    FOR EACH ROW EXECUTE FUNCTION util.clear_column('embedding');

-- Queue embedding job on insert
CREATE TRIGGER embed_documents_on_insert
    AFTER INSERT ON documents FOR EACH ROW
    EXECUTE FUNCTION util.queue_embeddings('embedding_input', 'embedding');

-- Queue embedding job on update
CREATE TRIGGER embed_documents_on_update
    AFTER UPDATE OF title, content ON documents FOR EACH ROW
    EXECUTE FUNCTION util.queue_embeddings('embedding_input', 'embedding');
```

### 10.4 Scheduled Processing

```sql
SELECT cron.schedule('process-embeddings', '10 seconds',
    'SELECT util.process_embeddings()');
```

See [Supabase Automatic Embeddings docs](https://supabase.com/docs/guides/ai/automatic-embeddings) for the full `util.queue_embeddings` and `util.process_embeddings` function implementations.

---

## 11. Row Level Security (RLS)

### 11.1 Enable RLS

```sql
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
```

### 11.2 Common Policies

```sql
-- Users read own data
CREATE POLICY "users_read_own" ON documents
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- Users insert own data
CREATE POLICY "users_insert_own" ON documents
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- Users update own data
CREATE POLICY "users_update_own" ON documents
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- Public read (e.g., public judgment corpus)
CREATE POLICY "public_read" ON documents
    FOR SELECT TO anon, authenticated
    USING (true);

-- Team access via security definer function
CREATE FUNCTION is_team_member(tid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
    SELECT EXISTS (
        SELECT 1 FROM team_members
        WHERE team_id = tid AND user_id = auth.uid()
    );
$$;

CREATE POLICY "team_access" ON documents
    FOR SELECT TO authenticated
    USING (is_team_member(team_id));
```

### 11.3 RLS Performance (Critical)

1. **Index RLS columns** — 100x improvement on large tables:
   ```sql
   CREATE INDEX ON documents(user_id);
   ```

2. **Wrap `auth.uid()` in SELECT** — caches per-statement:
   ```sql
   -- BAD (per-row): USING (auth.uid() = user_id)
   -- GOOD (cached):
   USING ((SELECT auth.uid()) = user_id)
   ```

3. **Use `TO` role** — prevents running for wrong roles:
   ```sql
   CREATE POLICY "..." ON table TO authenticated USING (...);
   ```

4. **Optimize joins** — use security definer functions, not subqueries in policies.

### 11.4 RLS with Vector Search

RLS applies automatically to `LANGUAGE sql` functions. Use `LANGUAGE plpgsql SECURITY DEFINER` only when you want to bypass RLS.

```sql
-- Respects RLS:
CREATE FUNCTION match_my_docs(...) RETURNS ... LANGUAGE sql STABLE AS $$ ... $$;

-- Bypasses RLS (for admin operations):
CREATE FUNCTION match_all_docs(...) RETURNS ... LANGUAGE plpgsql SECURITY DEFINER AS $$ ... $$;
```

---

## 12. Connection Pooling & Supavisor

### 12.1 Modes

| Mode | Port | Behavior | Use When |
|------|------|----------|----------|
| Transaction | 6543 | Shares connections | Serverless, auto-scaling |
| Session | 5432 | Exclusive per client | Long queries, prepared statements |

### 12.2 Pool Size Rules

- Keep under **40%** of max connections (if REST API is also used)
- Keep under **80%** for dedicated connections
- Reserve headroom for Auth and Realtime services
- Monitor via Supabase Grafana dashboard

### 12.3 Not Supported in Transaction Mode

- `SET` statements (session-level settings)
- `LISTEN / NOTIFY`
- Advisory locks
- Prepared statements
- `WITH HOLD` cursors

### 12.4 SQLAlchemy Configuration

```python
from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=300,
)
```

---

## 13. API Key Model (2025-2026)

### Legacy vs New

| Aspect | Legacy | New (Nov 2025+) |
|--------|--------|-----------------|
| Client key | `anon` (JWT) | `sb_publishable_...` |
| Server key | `service_role` (JWT) | `sb_secret_...` |
| Revocation | Rotate JWT secret (breaks all clients) | Delete individual key (instant) |
| GitHub scanning | Manual | Auto-revoke on detection |
| Browser blocking | No | `sb_secret_` rejects browser User-Agent |

### Migration

Legacy keys still work. New projects (post Nov 2025) and restored projects use the new model. Track [Discussion #29260](https://github.com/orgs/supabase/discussions/29260) for timeline.

---

## 14. Migration: auth-helpers to @supabase/ssr

```bash
npm uninstall @supabase/auth-helpers-nextjs
npm install @supabase/ssr
```

| Old (`auth-helpers-nextjs`) | New (`@supabase/ssr`) |
|-----------------------------|-----------------------|
| `createClientComponentClient()` | `createBrowserClient(url, key)` |
| `createServerComponentClient({ cookies })` | `createServerClient(url, key, { cookies })` |
| `createRouteHandlerClient({ cookies })` | `createServerClient(url, key, { cookies })` |
| `createMiddlewareClient({ req, res })` | `createServerClient(url, key, { cookies })` |

Do NOT use both packages simultaneously.

---

## 15. Production Checklist

### Database

- [ ] RLS enabled on every table in `public` schema
- [ ] RLS policies tested with multiple roles
- [ ] Indexes on all columns in RLS policies
- [ ] `auth.uid()` wrapped in `(SELECT ...)` in all policies
- [ ] `TO` role specified in all policies
- [ ] `SECURITY DEFINER` functions have `SET search_path = ''`
- [ ] Security Advisor run (Supabase dashboard) — zero critical issues

### API Keys

- [ ] Service role key not in any frontend `.env`
- [ ] No keys in git (`git log --all -S "sb_secret"`)
- [ ] GitHub Secret Scanning enabled
- [ ] Key rotation schedule quarterly
- [ ] `.env*` in `.gitignore`

### Auth

- [ ] Email confirmations enabled
- [ ] CAPTCHA on signup/login (hCaptcha or Turnstile)
- [ ] Custom SMTP configured
- [ ] `app_metadata` (not `user_metadata`) used for roles in RLS

### Network

- [ ] Network restrictions on direct DB access
- [ ] CORS configured (not `*`)
- [ ] MFA on Supabase dashboard

### Application

- [ ] Rate limiting on API endpoints
- [ ] Connection pooling configured
- [ ] SSL for all connections
- [ ] PITR enabled for backups
- [ ] Vector indexes pre-warmed with test queries
- [ ] Monitoring configured (Grafana, Langfuse)

---

## 16. Common Pitfalls

### 1. `getSession()` on the server

```typescript
// BAD: Does NOT validate JWT
const { data: { session } } = await supabase.auth.getSession();
// GOOD: Validates with auth server
const { data: { user } } = await supabase.auth.getUser();
```

### 2. New Python client per request

~5 seconds overhead per `create_client()` call. Use singleton.

### 3. Missing index on RLS column

`auth.uid() = user_id` without `CREATE INDEX ON table(user_id)` → sequential scan → timeouts on 1M rows.

### 4. IVFFlat on changing data

Degrades as data changes. HNSW self-maintains. Always prefer HNSW.

### 5. Code between client creation and auth check

```typescript
// BAD: Random logouts
const supabase = createServerClient(...);
await someFunction();  // NO!
await supabase.auth.getUser();

// GOOD: Immediate
const supabase = createServerClient(...);
await supabase.auth.getUser();
```

### 6. Dropping `supabaseResponse` cookies

Creating a new `NextResponse.next()` in middleware without copying cookies → session termination.

### 7. Wrong embedding dimensions

Column dimensions must exactly match model output. Mismatch = silent failures or errors.

### 8. Eager module-level client init

```python
# BAD: Fails at import time if env vars missing (breaks tests)
supabase_client = create_client(os.getenv("SUPABASE_URL"), ...)

# GOOD: Lazy init
def get_client():
    global _client
    if _client is None:
        _client = create_client(...)
    return _client
```

### 9. Using `user_metadata` in RLS

Users can modify their own `user_metadata`. Use `app_metadata` (admin-only writes) for roles/permissions.

---

## 17. Sources

### Official Supabase Docs
- [Python API Reference](https://supabase.com/docs/reference/python/initializing)
- [Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Creating SSR Client](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Auth Quickstart (Next.js)](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
- [Vector Columns](https://supabase.com/docs/guides/ai/vector-columns)
- [HNSW Indexes](https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes)
- [Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search)
- [Automatic Embeddings](https://supabase.com/docs/guides/ai/automatic-embeddings)
- [RLS Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [RAG with Permissions](https://supabase.com/docs/guides/ai/rag-with-permissions)
- [Connection Management](https://supabase.com/docs/guides/database/connection-management)
- [API Keys](https://supabase.com/docs/guides/api/api-keys)
- [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Rate Limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Securing Your API](https://supabase.com/docs/guides/api/securing-your-api)
- [User Sessions](https://supabase.com/docs/guides/auth/sessions)

### Community Discussions
- [Global async Supabase client for FastAPI](https://github.com/orgs/supabase/discussions/28843)
- [Properly using Supabase with FastAPI](https://github.com/orgs/supabase/discussions/33811)
- [Upcoming API Key Changes](https://github.com/orgs/supabase/discussions/29260)
- [New API keys replacing legacy JWT](https://github.com/orgs/supabase/discussions/40300)

### Blog & Changelog
- [Security Retro 2025](https://supabase.com/blog/supabase-security-2025-retro)
- [pgvector HNSW Performance](https://supabase.com/blog/increase-performance-pgvector-hnsw)
- [Supavisor 1.0](https://supabase.com/blog/supavisor-postgres-connection-pooler)
- [Python Support](https://supabase.com/blog/python-support)

### GitHub & PyPI
- [supabase-py](https://github.com/supabase/supabase-py)
- [supabase on PyPI (v2.28.0)](https://pypi.org/project/supabase/)

### Third-Party
- [Supabase Vector Storage 2025 Deep Dive](https://sparkco.ai/blog/mastering-supabase-vector-storage-a-2025-deep-dive)
- [halfvec Storage Savings (Neon)](https://neon.com/blog/dont-use-vector-use-halvec-instead-and-save-50-of-your-storage-cost)
- [HNSW Configuration (DeepWiki)](https://deepwiki.com/pgvector/pgvector/5.1.4-hnsw-configuration-parameters)
- [Cookie-Based Auth 2025 Guide](https://the-shubham.medium.com/next-js-supabase-cookie-based-auth-workflow-the-best-auth-solution-2025-guide-f6738b4673c1)
- [Optimize pgvector search (Neon)](https://neon.com/docs/ai/ai-vector-search-optimization)
- [OpenAI Cookbook: Supabase Semantic Search](https://cookbook.openai.com/examples/vector_databases/supabase/semantic-search)
- [Optimizing Vector Search at Scale (Medium)](https://medium.com/@dikhyantkrishnadalai/optimizing-vector-search-at-scale-lessons-from-pgvector-supabase-performance-tuning-ce4ada4ba2ed)
