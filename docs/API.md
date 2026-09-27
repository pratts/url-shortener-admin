# TidyLnk Admin API

The contract the admin panel is built against. The source of truth is the
Go backend (`pratts/url-shortener`, `internal/httpapi/admin`). Machine-readable
schemas are in [`openapi.json`](./openapi.json) (OpenAPI 3.0); generate
TypeScript types from it rather than writing them by hand.

- [Basics](#basics)
- [Errors](#errors)
- [Rate limits](#rate-limits)
- [Users](#users)
- [URLs](#urls)
- [Short links (redirect service)](#short-links-redirect-service)
- [Not available yet](#not-available-yet)
- [Updating openapi.json](#updating-openapijson)

## Basics

| | |
|---|---|
| Base URL | `{API_ORIGIN}/api/v1`; locally `http://localhost:8086/api/v1` |
| Format | JSON request and response bodies (`Content-Type: application/json`) |
| Auth | `Authorization: Bearer <token>`; the token comes from `POST /users/login` |
| Token lifetime | 1 hour by default (`JWT_EXPIRY_TIME_HOURS`). There is **no refresh endpoint and no logout endpoint**: on expiry every call returns 401, and logging out means discarding the token. |
| IDs | Numbers (`uint64`). |
| Timestamps | RFC 3339, UTC, second precision, e.g. `"2026-09-26T04:30:00Z"`. |
| Emails | Trimmed and stored lowercase; login and uniqueness are case-insensitive. |
| Request timeout | 5 s per request by default (`REQUEST_TIMEOUT_SECONDS`); a timeout surfaces as a 500. |

**CORS.** The API only answers browsers from origins listed in the backend's
`CORS_ORIGINS` (exact origins, `*` is not allowed), e.g.
`https://admin.tidylnk.com,http://localhost:5173`. Allowed request headers:
`Authorization`, `Content-Type`, `Accept`. Methods: `GET, POST, PUT, PATCH,
DELETE, OPTIONS`. **No response headers are exposed**, so browser code cannot
read `Retry-After`, `X-RateLimit-*` or `X-Request-Id`; use the status code.

**Health** (not under `/api/v1`, no auth): `GET /healthz` returns 200 when the
process is up; `GET /readyz` returns 200, or 503 when Postgres or Redis is
unreachable.

**Swagger UI**: `/api/v1/swagger/index.html`, only when the backend has
`ENABLE_SWAGGER=true` (off by default in production).

## Errors

Every error body has the same shape:

```json
{ "error": "Human-readable message" }
```

Validation and conflict errors add per-field messages under `fields`:

```json
{
  "error": "Validation failed",
  "fields": {
    "email": "must be a valid email address",
    "password": "must be between 8 and 72 bytes"
  }
}
```

A `fields` message is the part after the field name, meant to be shown next to
that input ("Email must be a valid email address").

| Status | Meaning | What the panel should do |
|---|---|---|
| 400 | Bad input. With `fields`: per-field errors; without: a single message. | Show `fields` on the matching form inputs; otherwise show `error`. |
| 401 | Missing, malformed, invalid or expired token; or wrong login credentials. | On any authenticated call: discard the token and go to `/login`. On `POST /users/login`: show "Invalid email or password". |
| 403 | Wrong `current_password` when changing the password. | Show on the current-password field. |
| 404 | The URL or user does not exist **or belongs to someone else** (the two are indistinguishable). Unknown routes return `{"error": "Endpoint not found"}`. | Show "not found" and return to the list. |
| 409 | Registration with an email that is already registered. | Show `fields.email`. |
| 429 | Rate limit reached. | Show "Too many attempts, try again later". |
| 500 | Unexpected server or database failure. The message is generic ("Failed to …"); details are only in server logs. | Show a generic error and allow retry. |

Authentication error messages (401): `Authorization header is missing`,
`Authorization header must use the Bearer scheme`, `Invalid token`.

## Rate limits

Limits are enforced per the key below and shared across server instances. A
blocked request gets `429 {"error": "Too many requests, please try again later"}`.

| Endpoint | Limit |
|---|---|
| `POST /users/login` | 20 attempts per 15 min per IP, **and** 5 **failed** attempts per 15 min per email. Once an email hits its limit, even the correct password returns 429 until the window passes. |
| `POST /users/register` | 5 per hour per IP (every attempt counts, including invalid ones). |
| `POST /urls` | 30 per minute per user (every attempt counts). |

**How the window works.** The limits use a sliding-window approximation (Fiber's
`SlidingWindow`), not a strict "N in the last window": hits are counted in fixed
buckets one window long, and a request is rejected when the current bucket's
hits plus the previous bucket's hits, weighted by the fraction of the current
bucket still to come, exceed the limit. A burst therefore keeps counting, with
decreasing weight, through most of the next window: after 30 link creations in
one minute, far fewer than 30 are allowed in the minute after. **Blocked
requests count too**: a 429 is itself a hit, so retrying straight away extends
the block. Clients should back off rather than retry in a loop.

**Turning limits off.** The backend's `RATE_LIMITS=off` disables all limits for
local development and tests (the e2e suite's `E2E_RATE_LIMITS=off` mode expects
it), and is refused in production.

## Users

### POST /users/register

Create an account. Available only when the backend has
`REGISTRATION_ENABLED=true` (the default); otherwise the route does not exist
(404). **Does not log the user in**: call login afterwards.

Request:
```json
{ "email": "alice@example.com", "name": "Alice", "password": "correct-horse" }
```

| Field | Rules |
|---|---|
| `email` | Required. A bare address (no `"Name <a@b.c>"` form), at most 254 characters. Trimmed and lowercased. |
| `name` | Required. 1–100 characters after trimming (counted as characters, not bytes). |
| `password` | Required. 8–72 **bytes** (bcrypt's limit; multi-byte characters count more than once). Send it as typed; **do not hash it on the client**. |

`201 Created`:
```json
{ "id": 1, "email": "alice@example.com", "name": "Alice", "verified": false }
```

Errors:
- 400 `{"error": "Invalid request body"}` for malformed JSON.
- 400 `Validation failed` with `fields` for `email`, `name`, `password`. All problems are reported at once. Messages: `must be a valid email address`, `must be at most 254 characters`, `must be 1-100 characters`, `must be between 8 and 72 bytes`.
- 409 `{"error": "email is already registered", "fields": {"email": "is already registered"}}`.
- 429 (5 per hour per IP).

`verified` is always `false` for now; nothing uses it yet.

### POST /users/login

Request:
```json
{ "email": "Alice@Example.com", "password": "correct-horse" }
```

`200 OK`:
```json
{
  "id": 1,
  "email": "alice@example.com",
  "name": "Alice",
  "verified": false,
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

The token is a JWT (HS256) with `sub` = user ID (string), `iat`, `exp` (Unix
seconds) and `iss` = `url-shortener-admin`. The panel may read `exp` from the
payload to log out proactively, but must still handle 401.

Errors:
- 400 `{"error": "Email and password are required"}` or `Invalid request body`.
- 401 `{"error": "Invalid email or password"}`, the same for an unknown email and a wrong password.
- 429 (see [Rate limits](#rate-limits)).

### GET /users/me

Auth required. `200 OK`: a Profile, `{ "id", "email", "name", "verified" }`.

Errors: 401; 404 `User not found` if the account was deleted.

### PATCH /users/me

Auth required. Change the name and/or the password. At least one of `name` and
`password` is required; `current_password` is required when `password` is set.
The email cannot be changed.

```json
{ "name": "Alice B" }
```
```json
{ "password": "new-password", "current_password": "correct-horse" }
```

`200 OK`: the updated Profile. The existing token stays valid after a password
change.

Errors:
- 400 `Validation failed` with `fields`:
  - `name`: `must be 1-100 characters`
  - `password`: `must be between 8 and 72 bytes`
  - `current_password`: `is required to change password`
  - empty body: `{"name": "or password is required"}` (read as "name or password is required")
- 403 `{"error": "current password is incorrect"}`.
- 401.

## URLs

All URL endpoints require auth and only ever see the caller's own links.

A **URL view** (`shortlink.View`):
```json
{
  "id": 42,
  "url": "https://example.com/some/long/path",
  "short_code": "aZ3kP9q",
  "short_url": "https://tidylnk.com/aZ3kP9q",
  "created_at": "2026-09-26T04:30:00Z",
  "updated_at": "2026-09-26T06:00:00Z",
  "created_by": 1
}
```
Use `short_url` as returned; don't build it on the client.

**Target URL rules** (create and update). The `url` must be:
- an absolute `http` or `https` URL with a host
- without credentials (`https://user:pass@…` is rejected)
- not pointing at the short-link domain itself
- at most 2048 characters (surrounding whitespace is trimmed)

A violation returns
`400 {"error": "url must be an absolute http(s) URL of at most 2048 characters, without credentials, and not pointing to this service"}`
(no `fields`). Validate the same rules client-side for a better message.

### POST /urls

Request: `{ "url": "https://example.com/page" }`

`201 Created`: a URL view. A random 7-character base62 `short_code` is
assigned; it cannot be chosen.

Errors: 400 (invalid body or target), 401, 429 (30 per minute per user), 500
`Failed to create short URL`.

### GET /urls

List the caller's links, **newest first**, one page at a time.

| Query | Default | Rules |
|---|---|---|
| `limit` | 50 | 1–100 |
| `cursor` | none | The `next_cursor` from the previous page. |

`200 OK`:
```json
{
  "items": [ { "id": 42, "url": "...", "short_code": "...", "...": "..." } ],
  "next_cursor": "37"
}
```
`items` is always an array (possibly empty). `next_cursor` is a string, or
`null` on the last page. Treat it as opaque: pass it back unchanged. There is
no total count and no offset paging. Use "Load more" or infinite scroll (e.g.
TanStack Query `useInfiniteQuery`).

Errors: 400 `limit must be between 1 and 100` or `Invalid cursor`; 401; 500.

### GET /urls/{id}

`200 OK`: a URL view. Errors: 400 `Invalid URL ID` (not a positive integer);
401; 404 `URL not found`.

### PUT /urls/{id}

Change the target. The short code never changes.

Request: `{ "url": "https://example.org/new" }`

`200 OK`: the updated URL view (`updated_at` changes). The redirect uses the new
target immediately.

Errors: 400 (invalid ID, body or target); 401; 404.

### DELETE /urls/{id}

`204 No Content`, with an empty body. The short link returns 404 from then on,
and its click history is deleted with it.

Errors: 400 `Invalid URL ID`; 401; 404.

## Short links (redirect service)

Separate service, separate origin (e.g. `https://tidylnk.com`). The panel only
links to it.

- `GET /{short_code}` → `302 Found` with `Location: <target>` and
  `Cache-Control: private, max-age=0`. Each visit records a click.
- Unknown or malformed codes → `404 {"error": "URL not found"}`.
- Limited to 120 requests per minute per IP.

Opening a short link from the panel counts as a click. That's fine for "Open",
but don't request short URLs automatically (no prefetching or link-preview
fetches).

## Not available yet

Don't build UI that assumes these exist:
- **Click analytics.** Clicks are stored (time, IP, User-Agent) but no endpoint exposes them. No referrer or country data is collected.
- **Email verification.** `verified` is always `false`; tracked in backend issue #36.
- **Token refresh or logout endpoints, password reset, account deletion, changing email, custom short codes, search or filtering, total counts.**

## Updating openapi.json

`openapi.json` is converted from the backend's generated Swagger 2 file, then
adjusted so response fields are required and `next_cursor` is nullable (the
Swagger generator marks nothing as required). After a backend API change:

```bash
npx swagger2openapi@7.0.8 ../url-shortener/docs/swagger.json -o docs/openapi.json
node scripts/fix-openapi.mjs docs/openapi.json
npm run gen:api
```
