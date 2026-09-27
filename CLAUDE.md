# url-shortener-admin

Admin panel for **TidyLnk**, a URL shortener. Users register, log in, create
short links, edit a link's target, delete links, and manage their profile.

The backend lives in a separate repo (`pratts/url-shortener`, Go). This repo is
only the browser UI. **The API contract is [`docs/API.md`](docs/API.md)**, with
schemas in [`docs/openapi.json`](docs/openapi.json). Read `docs/API.md` before
touching anything that calls the API; never guess endpoints, fields or status
codes.

## How the app is built

A Vite + React single-page app, served by Vercel as static files. The old
Create React App / MUI / Axios code was rewritten in place (PR #1) and is gone;
git history has it if you ever need it.

- **Startup** (`main.tsx`): creates the TanStack Query client and the router,
  connects session handling to both (`app.ts`), and renders `Providers`
  (query client, theme, toasts) around `RouterProvider`.
- **Routing** (`routes.tsx`): `createBrowserRouter` in library mode. Guards are
  route loaders: private routes redirect to `/login?next=…` without a token,
  and `/login` redirects away when logged in. Every page and the private layout
  are lazy-loaded chunks, so the main chunk holds only the runtime.
- **API** (`api/`): `client.ts` wraps `fetch` (base URL, token header, JSON,
  `ApiError`, 204s, the 401 hook); `auth.ts`, `users.ts` and `urls.ts` are thin
  typed endpoint functions over the generated `types/api.ts`.
- **Session** (`lib/auth.ts`, `lib/session.ts`): the token lives in
  `sessionStorage` behind `lib/auth.ts`. `endSession()` clears it, leaves the
  private pages and drops the query cache; it runs on logout, when the JWT
  `exp` passes (a timer in the private layout), and on any 401 from an
  authenticated request, including one sent after the token vanished from
  storage.
- **Data** (`hooks/`): TanStack Query hooks. Links use `useInfiniteQuery`;
  mutations restart the list from the first page. Profile updates write the
  response into the cached `/users/me`.
- **Forms**: React Hook Form + Zod schemas from `lib/validation.ts`; server
  errors are mapped onto fields or the form by `lib/forms.ts`.
- **Theme**: `components/theme-provider.tsx` plus `public/theme-init.js`, which
  applies the saved or system theme before React renders.

## Deliberate deviations

Places where the code differs from what this file or the tools' defaults would
suggest, on purpose:

- **TypeScript 5.9, not 6.x.** `openapi-typescript` (which generates
  `src/types/api.ts`) only supports TypeScript 5.
- **A small theme provider and `public/theme-init.js` instead of
  `next-themes`.** shadcn's `sonner` component uses `next-themes`, which injects
  an inline `<script>`; the CSP (`script-src 'self'`) blocks it. The external
  init script avoids a flash of the wrong theme without `'unsafe-inline'`.
- **React Router 8 in library mode.** It is the current major version and still
  offers `createBrowserRouter` + `RouterProvider` without the framework.
- **`npm run typecheck` is `tsc -b --noEmit`.** The root `tsconfig.json` only
  references `tsconfig.app.json`, `tsconfig.node.json` and `tsconfig.e2e.json`;
  plain `tsc --noEmit` checks no files at all.
- **`npm run build` fails without `VITE_API_BASE_URL`.** The API client throws
  at startup when it is missing; at build time the bundler treated that throw as
  unconditional and dropped the rest of the app, so a build without the
  variable "succeeded" but could only throw. `vite.config.ts` stops the build
  instead.
- **zod runs in jitless mode** (`z.config({ jitless: true })` in
  `lib/validation.ts`). zod v4 otherwise calls `Function("")` to decide whether
  it may compile validators, which the CSP reports as a `script-src` violation.
  Jitless mode never calls it, so the CSP needs no `'unsafe-eval'`.
- **The target-URL rule compares hostnames, not host and port.** The backend
  rejects any target on the short-link hostname whatever the port (with short
  links on `localhost:8085`, every `localhost` target is refused), so the
  client does the same.
- **Extra `lib/` files beyond the layout below:** `session.ts` (ending a session
  needs the router and query cache, registered at startup, which avoids import
  cycles), `forms.ts` (one place that maps `ApiError` fields onto React Hook
  Form), and `query-client.ts` (retry rules: only network errors and 5xx).

## Stack (decided; don't substitute alternatives)

| Concern | Choice |
|---|---|
| Build | Vite + React + TypeScript (`strict: true`) |
| UI | shadcn/ui (Tailwind CSS, Radix), Lucide icons. Components live in `src/components/ui/` and are edited freely. Use shadcn blocks for the sidebar layout and login forms. |
| Routing | React Router (library mode, `createBrowserRouter`). **Not** TanStack Router, not a framework. |
| Server state | TanStack Query |
| Forms | React Hook Form + Zod |
| HTTP | A small wrapper around `fetch`. **No Axios.** |
| API types | Generated with `openapi-typescript` from `docs/openapi.json` into `src/types/api.ts`. Never hand-write API types. |
| QR codes | `qrcode.react`, generated in the browser |
| Tests | Vitest + Testing Library + MSW |
| Hosting | Vercel (static SPA) |

Don't add other state libraries (Redux, Zustand), CSS-in-JS, or a component
library besides shadcn/ui without asking.

## Layout

```
src/
├── api/            # client.ts (fetch wrapper), auth.ts, urls.ts, users.ts
├── components/
│   ├── ui/         # shadcn components
│   ├── app-sidebar.tsx
│   ├── url-table.tsx
│   ├── url-form-dialog.tsx
│   └── qr-code-dialog.tsx
├── hooks/          # use-auth.ts, use-urls.ts (TanStack Query hooks)
├── lib/            # auth.ts (token storage), session.ts, forms.ts, query-client.ts,
│                   # utils.ts, validation.ts (Zod schemas)
├── pages/          # Login.tsx, Register.tsx, Urls.tsx, Profile.tsx, NotFound.tsx (+ tests)
├── test/           # MSW server, fixtures, render-app.tsx harness
├── routes.tsx      # router definition and the auth guards
├── app.ts          # wires session handling to the router and query client
├── types/api.ts    # GENERATED; don't edit
└── main.tsx
e2e/                # Playwright tests against a live backend (not in CI)
docs/               # API.md, openapi.json
scripts/            # fix-openapi.mjs
```

## Routes

| Path | Auth | Page |
|---|---|---|
| `/login` | public (redirect to `/urls` if already logged in) | Email + password |
| `/register` | public | Email, name, password (+ confirm, client-side only). On success, log in with the same credentials, then go to `/urls`. |
| `/urls` | required | Links table: create, edit target, delete (with confirmation), copy short URL, open, QR code, "Load more" |
| `/profile` | required | Change name; change password (current + new + confirm) |
| `/` | | Redirect to `/urls` |
| `*` | | Not found |

The private routes share a layout with the sidebar (Links, Profile, Log out) and
the user's name/email.

## API client rules

- Base URL from `import.meta.env.VITE_API_BASE_URL`, e.g.
  `http://localhost:8086/api/v1`. Fail loudly at startup if it's missing.
- Only send `Authorization: Bearer <token>` when a token exists. Only set
  `Content-Type: application/json` when there is a body.
- Parse errors into one type:
  `ApiError { status: number; message: string; fields?: Record<string, string> }`,
  from the body `{ error, fields? }` (see `docs/API.md`, "Errors").
- 204 responses have no body; don't parse them.
- **401 on any authenticated request** (everything except login and register,
  even if no token was left to send): clear the token, clear the query cache,
  redirect to `/login?next=<current path>`. On `POST /users/login`, a 401 is just
  "Invalid email or password".
- 429: show "Too many attempts, try again later". Response headers such as
  `Retry-After` aren't readable cross-origin, so don't depend on them.
- 5xx and network errors: generic message plus retry; never show raw server
  text for 5xx.

## Auth

- After login, store the token in **`sessionStorage`** (key
  `tidylnk.token`). Keep it behind `lib/auth.ts` (`getToken`, `setToken`,
  `clearToken`) so the storage can change later.
- Decode the JWT payload (base64url, no library) to read `exp`. Log out when it
  passes (a timer), and treat an expired token as absent on load. Still handle
  401. Tokens last 1 hour and **there is no refresh endpoint**.
- Logging out is client-side only: clear the token and query cache, go to
  `/login`.
- `GET /users/me` provides the current user; cache it with TanStack Query.

## Data fetching

- Links list: `useInfiniteQuery` on `GET /urls?limit=20&cursor=…`, with
  `getNextPageParam: (page) => page.next_cursor ?? undefined`. Show a "Load
  more" button while there is a next page. No page numbers and no total count
  (the API has neither).
- After create, update or delete, invalidate the links query (it restarts from
  the first page). Optimistic updates aren't needed.
- Profile updates: update the cached `/users/me` data from the response.

## Forms and validation

Mirror the backend rules in Zod (`lib/validation.ts`) so users get messages
before submitting, and still map server `fields` errors onto inputs with
`setError`:
- **email:** a valid address, at most 254 characters (trim before sending).
- **name:** 1–100 characters after trimming.
- **password:** 8–72 **bytes**. Check with `new TextEncoder().encode(pw).length`, not `.length`.
- **target URL:** an absolute `http`/`https` URL with a host (use `new URL()`), no username/password, at most 2048 characters, and not on the short-link hostname (from any `short_url`, or `VITE_SHORT_URL_HOST`). Compare **hostnames, ignoring ports**, as the backend does.
- Map server errors: 409 on register goes to `email`; 403 on password change goes to `current_password`; the `name: "or password is required"` message becomes a form-level error.

## UI details

- **Links table columns:** short URL (monospace, with copy and open buttons), target URL (truncated, full value in a tooltip), created date (local time, relative + absolute on hover), actions (edit, QR, delete).
- **Copy** uses `navigator.clipboard.writeText` and shows a toast (the shadcn `sonner` component).
- **Open** links use `target="_blank" rel="noopener noreferrer"`. Opening a short link counts as a click, which is expected. Never fetch short URLs in the background.
- **QR dialog:** the SVG from `short_url`, plus "Download PNG" (render to canvas, then `toDataURL`) and "Download SVG".
- **Empty state** on `/urls` with a "Create your first link" button.
- **Theme:** light and dark, following the system with a toggle. Keep the shadcn defaults unless asked.
- **Accessibility:** every icon button needs an `aria-label`; dialogs trap focus (Radix does this); forms are usable with the keyboard.

## Security

- **No `dangerouslySetInnerHTML`**, and no rendering of server strings as HTML.
- Only render target URLs as links if their protocol is `http:` or `https:`.
- **Content-Security-Policy** via `vercel.json` headers. It must include the API origin in `connect-src`, and must not allow `'unsafe-inline'` or `'unsafe-eval'` for scripts:
  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://api.tidylnk.com;
  frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
  ```
  (`style-src 'unsafe-inline'` is needed for the inline style attributes Radix uses for positioning, and for the styles sonner injects.) Keep scripts external: the theme is applied by `public/theme-init.js`, and zod runs jitless (see "Deliberate deviations"). `npm run e2e:prod` fails on any CSP violation. Also set `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- No analytics or third-party scripts.

## Configuration

`.env.example`:
```
VITE_API_BASE_URL=http://localhost:8086/api/v1
VITE_SHORT_URL_HOST=localhost:8085
```
Only `VITE_*` values reach the browser, and they are public: never put
secrets in them. The backend must list the panel's origin in `CORS_ORIGINS`
(e.g. `http://localhost:5173` for development, `https://admin.tidylnk.com` in
production).

## Commands

```bash
npm run dev          # Vite dev server on http://localhost:5173
npm run build        # tsc -b && vite build
npm run lint         # eslint
npm run typecheck    # tsc -b --noEmit (see "Deliberate deviations")
npm test             # vitest run (unit and component tests, src/ only)
npm run e2e          # Playwright against the dev server and a live backend
npm run e2e:prod     # Playwright against the production build, with the CSP
npm run gen:api      # openapi-typescript docs/openapi.json -o src/types/api.ts
```
Commit `src/types/api.ts`. After the backend API changes, follow "Updating
openapi.json" in `docs/API.md`, then run `npm run gen:api` and fix the type errors.

## Deployment (Vercel)

`vercel.json` holds the SPA rewrite (all paths to `/index.html`) and the
security headers above. Set `VITE_API_BASE_URL` and `VITE_SHORT_URL_HOST` in
the Vercel project settings. Preview deployments call whichever API those
variables point to, and that API's `CORS_ORIGINS` must include the preview
origin; otherwise previews can't call it.

## Testing

- Unit-test `lib/` (token handling, JWT `exp` parsing, Zod schemas including the byte-length password rule, `ApiError` parsing).
- Component tests with MSW handlers that follow `docs/API.md` exactly (status codes and bodies), covering:
  - login success and failure, and redirect on 401
  - register: field errors and 409
  - links: list, "Load more" across two pages, create, edit, delete with confirmation, and a 429 on create
  - profile: 403 on a wrong current password
- The GitHub Actions workflow runs lint, typecheck, unit tests and build on every PR, and fails if `src/types/api.ts` is stale.

### End-to-end tests (`e2e/`)

Playwright against the **real backend**, no mocks. Not in CI (it needs a live
backend); run it locally before merging changes to API calls, auth, or the CSP.

1. Start the backend (admin API `:8086`, redirect `:8085`) with
   `CORS_ORIGINS=http://localhost:5173,http://localhost:4173`.
2. `npx playwright install chromium` (once).
3. `cp .env.example .env` (gitignored; never commit it), then `npm run dev`, and
   `npm run e2e` in another shell. `E2E_BASE_URL` and `E2E_API_URL` override
   the defaults.
4. `npm run e2e:prod` builds against the local API, serves `dist/` on `:4173`
   with the headers from `vercel.json` (only `connect-src` is pointed at the
   local API), and runs the same suite, failing on any CSP violation.

Every test fails on console errors, CORS errors, failed requests and 4xx/5xx
responses it doesn't declare with `guard.allow(status, url)`.

**Rate limits.** Every attempt counts, whatever its status, including requests
from scripts or manual testing: **5 registrations per hour per IP** (201, 400
and 409 alike), 20 logins per 15 minutes per IP plus 5 failed per email, and
**30 link creations per minute per user**. The suite records every such
request in `e2e/.state/state.json` (gitignored), keeps one attempt of each
budget spare, waits for the window instead of exceeding a budget, and stops at
the first 429. It registers a user only if it has none (or with
`E2E_NEW_USER=1`), reuses it and its token afterwards, and creates only
page size + 1 links. If you send limited requests outside the suite, add them
to the state file or wait them out. Never clear Redis to
get around a limit; wait for the window to pass. Delete test users afterwards
with `DELETE FROM users WHERE email LIKE 'e2e-%@example.com';` (links and
clicks cascade).

## Out of scope for now

Don't build these; the API doesn't support them (see `docs/API.md`, "Not
available yet"): click analytics or charts, email verification, password reset,
refresh tokens, account deletion, changing email, custom short codes, search,
filters, total counts.

## Working agreements

- Keep changes small and in focused commits.
- **One feature per PR, from now on.** The rewrite landed as a single PR (#1)
  because its commits depended on each other; that was the exception.
- Before calling something done, run `npm run lint`, `npm run typecheck`,
  `npm test` and `npm run build`, and report the results honestly. For changes
  to API calls, auth or the CSP, also run `npm run e2e` and `npm run e2e:prod`
  against a local backend.
- If `docs/API.md` and the backend's real behaviour disagree, stop and say so;
  don't work around it silently.
