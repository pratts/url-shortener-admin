# url-shortener-admin

Admin panel for **TidyLnk**, a URL shortener. Users register, log in, create
short links, edit a link's target, delete links, and manage their profile.

The backend lives in a separate repo (`pratts/url-shortener`, Go). This repo is
only the browser UI. **The API contract is [`docs/API.md`](docs/API.md)**, with
schemas in [`docs/openapi.json`](docs/openapi.json). Read `docs/API.md` before
touching anything that calls the API; never guess endpoints, fields or status
codes.

## Current state and the rewrite

The existing code is a Create React App project (react-scripts, MUI, Axios,
crypto-js) deployed on Railway via Docker and Caddy. It is being **rewritten in
place** on the stack below. Treat the old code as a reference for features only.

Problems in the old code that must not carry over:
- **It SHA-256-hashes the password in the browser before sending it**
  (`src/services/api.ts`). Remove it. Passwords go to the API exactly as typed,
  over HTTPS; the backend hashes them with bcrypt.
- It keeps the token in `localStorage`; use `sessionStorage` (see Auth).
- It types URL IDs as `string`; they are numbers.
- It uses outdated endpoint shapes (e.g. `GET /urls` returning an array). The
  API returns `{items, next_cursor}` now.
- URL editing was disabled; the API supports it (`PUT /urls/{id}`), so bring it
  back.

Remove when the rewrite is done: `react-scripts` and CRA files (`public/index.html`,
`src/react-app-env.d.ts`, `reportWebVitals`, `setupTests`, `App.test.tsx`,
`logo.svg`), `@mui/*`, `@emotion/*`, `axios`, `crypto-js`, and the Railway/Docker
setup (`Dockerfile`, `Dockerfile.railway`, `Caddyfile`, `docker-compose.yml`,
`.dockerignore`), which Vercel replaces. Also remove `README.old.md`, and rewrite
`README.md` for the new setup.

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
├── lib/            # auth.ts (token storage), utils.ts, validation.ts (Zod schemas)
├── pages/          # Login.tsx, Register.tsx, Urls.tsx, Profile.tsx, NotFound.tsx
├── routes.tsx      # router definition and the auth guard
├── types/api.ts    # GENERATED; don't edit
└── main.tsx
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
- **401 on any authenticated request:** clear the token, clear the query cache,
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
- **target URL:** an absolute `http`/`https` URL with a host (use `new URL()`), no username/password, at most 2048 characters, and not on the short-link host (compare the host from any `short_url`, or `VITE_SHORT_URL_HOST`).
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
  (`style-src 'unsafe-inline'` is needed for the inline style attributes Radix uses for positioning.) Also set `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
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
npm run typecheck    # tsc --noEmit
npm test             # vitest run
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
- Add a GitHub Actions workflow running lint, typecheck, tests and build on every PR.

## Out of scope for now

Don't build these; the API doesn't support them (see `docs/API.md`, "Not
available yet"): click analytics or charts, email verification, password reset,
refresh tokens, account deletion, changing email, custom short codes, search,
filters, total counts.

## Working agreements

- Keep changes small and in focused commits; one feature per PR.
- Before calling something done, run `npm run lint`, `npm run typecheck`,
  `npm test` and `npm run build`, and report the results honestly.
- If `docs/API.md` and the backend's real behaviour disagree, stop and say so;
  don't work around it silently.
