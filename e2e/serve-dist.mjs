// Serves dist/ like Vercel would: the headers and rewrites from vercel.json,
// with the API origin in connect-src swapped for a local one. Used by
// `npm run e2e:prod` to test the production build under the real CSP.
//
//   node e2e/serve-dist.mjs            # http://localhost:4173
//   PORT=4173 E2E_API_ORIGIN=http://localhost:8086 node e2e/serve-dist.mjs
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs"
import http from "node:http"
import path from "node:path"

const root = path.resolve("dist")
const port = Number(process.env.PORT ?? 4173)
const apiOrigin = process.env.E2E_API_ORIGIN ?? "http://localhost:8086"
const vercel = JSON.parse(readFileSync("vercel.json", "utf8"))

if (!existsSync(path.join(root, "index.html"))) {
  console.error("dist/index.html is missing; run npm run build first")
  process.exit(1)
}

// vercel.json uses path-to-regexp; only plain regex sources are supported here.
function matcher(source) {
  if (source.includes(":")) throw new Error(`Unsupported vercel.json source: ${source}`)
  return new RegExp(`^${source}$`)
}

function localCsp(value) {
  return value
    .split(";")
    .map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/)
      if (name !== "connect-src") return directive.trim()
      return [name, ...sources.map((s) => (/^https?:\/\//.test(s) ? apiOrigin : s))].join(" ")
    })
    .join("; ")
}

const headerRules = (vercel.headers ?? []).map((rule) => ({
  test: matcher(rule.source),
  headers: rule.headers.map(({ key, value }) =>
    key.toLowerCase() === "content-security-policy" ? { key, value: localCsp(value) } : { key, value }
  ),
}))
const rewrites = (vercel.rewrites ?? []).map((r) => ({ test: matcher(r.source), destination: r.destination }))

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
}

function fileFor(urlPath) {
  const file = path.join(root, decodeURIComponent(urlPath))
  if (!file.startsWith(root + path.sep) && file !== root) return null
  return existsSync(file) && statSync(file).isFile() ? file : null
}

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost")
    for (const rule of headerRules) {
      if (rule.test.test(pathname)) for (const { key, value } of rule.headers) res.setHeader(key, value)
    }

    // Like Vercel: a matching file wins, otherwise the rewrites apply.
    let file = fileFor(pathname)
    if (!file) {
      const rewrite = rewrites.find((r) => r.test.test(pathname))
      if (rewrite) file = fileFor(rewrite.destination)
    }
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found")
      return
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    })
    createReadStream(file).pipe(res)
  })
  .listen(port, () => {
    const csp = headerRules.flatMap((r) => r.headers).find((h) => h.key.toLowerCase() === "content-security-policy")
    console.log(`Serving dist/ on http://localhost:${port}`)
    console.log(`CSP: ${csp?.value ?? "(none)"}`)
  })
