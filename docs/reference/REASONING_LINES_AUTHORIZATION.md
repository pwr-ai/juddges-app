# Reasoning-lines authorization

Reasoning lines are a shared, global data set. The tables
`reasoning_lines`, `reasoning_line_members`, and `reasoning_line_events` do not
contain an owner or user identifier. Their RLS model grants authenticated users
read access and reserves writes for the service role. The API intentionally
does not infer per-user ownership that the schema cannot enforce.

| Operation | Access | Reason |
|---|---|---|
| `GET /reasoning-lines/` | Authenticated user | Shared read |
| `GET /reasoning-lines/dag` | Authenticated user | Shared read |
| `GET /reasoning-lines/{id}` | Authenticated user | Shared read |
| `GET /reasoning-lines/{id}/timeline` | Authenticated user | Shared read |
| `GET /reasoning-lines/{id}/related` | Authenticated user | Shared read |
| `POST /reasoning-lines/discover` | Authenticated user | Read-only computation |
| `POST /reasoning-lines/search` | Authenticated user | Read-only computation |
| `POST /reasoning-lines/create` | Admin | Creates global records |
| `DELETE /reasoning-lines/{id}` | Admin | Changes global status |
| `POST /reasoning-lines/detect-events` | Admin | Persists global events |
| `POST /reasoning-lines/{id}/drift-analysis` | Admin | Persists drift events |
| `POST /reasoning-lines/{id}/analyze-outcomes` | Admin | Updates shared members |

The Next.js BFF accepts only the method/path combinations above and only UUID
values in dynamic line-ID positions. It validates the Supabase user, forwards
that verified session's Bearer token to FastAPI, injects the server-side API
key, and retains the hashed per-user rate-limit identity. FastAPI independently
validates the Bearer token and applies the read/admin boundary; possession of
the backend API key alone is not user authorization.
