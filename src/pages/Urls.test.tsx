import { screen, waitFor, within } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ShortLink } from "@/api/urls"
import { setToken } from "@/lib/auth"
import { alice, link } from "@/test/fixtures"
import { makeToken } from "@/test/jwt"
import { renderApp } from "@/test/render-app"
import { API, server } from "@/test/server"

const table = () => within(screen.getByRole("table"))

/** Serves `links` newest first in pages of `limit`, like GET /urls. */
function serveLinks(links: ShortLink[]) {
  const requests: URL[] = []
  server.use(
    http.get(`${API}/urls`, ({ request }) => {
      const url = new URL(request.url)
      requests.push(url)
      const limit = Number(url.searchParams.get("limit") ?? 50)
      const cursor = url.searchParams.get("cursor")
      const sorted = [...links].sort((a, b) => b.id - a.id)
      const start = cursor ? sorted.findIndex((l) => l.id < Number(cursor)) : 0
      const items = start === -1 ? [] : sorted.slice(start, start + limit)
      const more = start !== -1 && start + limit < sorted.length
      return HttpResponse.json({ items, next_cursor: more ? String(items.at(-1)!.id) : null })
    })
  )
  return requests
}

beforeEach(() => {
  setToken(makeToken())
  server.use(http.get(`${API}/users/me`, () => HttpResponse.json(alice)))
})

describe("Links page", () => {
  it("lists links with short URL, target and actions", async () => {
    serveLinks([link(1), link(2, { url: "https://example.org/very/long/target" })])
    renderApp("/urls")

    const rows = await screen.findAllByRole("row")
    expect(rows).toHaveLength(3) // header + 2
    const first = within(rows[1])
    expect(first.getByText("https://sho.rt/code2xx")).toBeInTheDocument()
    expect(first.getByRole("link", { name: "https://example.org/very/long/target" })).toHaveAttribute(
      "rel",
      "noopener noreferrer"
    )
    const open = first.getByRole("link", { name: "Open https://sho.rt/code2xx" })
    expect(open).toHaveAttribute("href", "https://sho.rt/code2xx")
    expect(open).toHaveAttribute("target", "_blank")
    expect(first.getByRole("button", { name: "Edit https://sho.rt/code2xx" })).toBeInTheDocument()
    expect(first.getByRole("button", { name: "QR code for https://sho.rt/code2xx" })).toBeInTheDocument()
    expect(first.getByRole("button", { name: "Delete https://sho.rt/code2xx" })).toBeInTheDocument()
  })

  it("doesn't render non-http targets as links", async () => {
    serveLinks([link(1, { url: "javascript:alert(1)" })])
    renderApp("/urls")
    expect(await screen.findByText("javascript:alert(1)")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "javascript:alert(1)" })).not.toBeInTheDocument()
  })

  it("shows an empty state", async () => {
    serveLinks([])
    renderApp("/urls")
    expect(await screen.findByRole("button", { name: "Create your first link" })).toBeInTheDocument()
  })

  it("loads more across two pages", async () => {
    const all = Array.from({ length: 25 }, (_, i) => link(i + 1))
    const requests = serveLinks(all)
    const { user } = renderApp("/urls")

    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(21))
    expect(requests[0].searchParams.get("limit")).toBe("20")
    expect(requests[0].searchParams.has("cursor")).toBe(false)

    await user.click(screen.getByRole("button", { name: "Load more" }))
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(26))
    expect(requests[1].searchParams.get("cursor")).toBe("6")
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument()
  })

  it("creates a link and refreshes the list", async () => {
    const links = [link(1)]
    serveLinks(links)
    let body: unknown
    server.use(
      http.post(`${API}/urls`, async ({ request }) => {
        body = await request.json()
        const created = link(2, { url: "https://example.com/new" })
        links.push(created)
        return HttpResponse.json(created, { status: 201 })
      })
    )
    const { user } = renderApp("/urls")

    await user.click(await screen.findByRole("button", { name: "Create link" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("Target URL"), "  https://example.com/new ")
    await user.click(within(dialog).getByRole("button", { name: "Create" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(body).toEqual({ url: "https://example.com/new" })
    await waitFor(() => expect(table().getByText("https://sho.rt/code2xx")).toBeInTheDocument())
  })

  it("validates the target URL before submitting", async () => {
    serveLinks([link(1)])
    const { user } = renderApp("/urls")
    await user.click(await screen.findByRole("button", { name: "Create link" }))
    const dialog = await screen.findByRole("dialog")

    await user.type(within(dialog).getByLabelText("Target URL"), "https://sho.rt/abc")
    await user.click(within(dialog).getByRole("button", { name: "Create" }))
    expect(await within(dialog).findByText("URL can't point to a short link")).toBeInTheDocument()

    await user.clear(within(dialog).getByLabelText("Target URL"))
    await user.type(within(dialog).getByLabelText("Target URL"), "https://me:secret@example.com")
    await user.click(within(dialog).getByRole("button", { name: "Create" }))
    expect(
      await within(dialog).findByText("URL must not contain a username or password")
    ).toBeInTheDocument()
  })

  it("shows the rate-limit message on 429 when creating", async () => {
    serveLinks([link(1)])
    server.use(
      http.post(`${API}/urls`, () =>
        HttpResponse.json({ error: "Too many requests, please try again later" }, { status: 429 })
      )
    )
    const { user } = renderApp("/urls")
    await user.click(await screen.findByRole("button", { name: "Create link" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("Target URL"), "https://example.com/x")
    await user.click(within(dialog).getByRole("button", { name: "Create" }))

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Too many attempts, try again later"
    )
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("edits a link's target", async () => {
    const links = [link(1)]
    serveLinks(links)
    let request: { id: string; body: unknown } | undefined
    server.use(
      http.put(`${API}/urls/:id`, async ({ params, request: req }) => {
        const body = (await req.json()) as { url: string }
        request = { id: String(params.id), body }
        links[0] = { ...links[0], url: body.url }
        return HttpResponse.json(links[0])
      })
    )
    const { user } = renderApp("/urls")

    await user.click(await screen.findByRole("button", { name: "Edit https://sho.rt/code1xx" }))
    const dialog = await screen.findByRole("dialog")
    const input = within(dialog).getByLabelText("Target URL")
    expect(input).toHaveValue("https://example.com/page/1")
    await user.clear(input)
    await user.type(input, "https://example.org/new")
    await user.click(within(dialog).getByRole("button", { name: "Save" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(request).toEqual({ id: "1", body: { url: "https://example.org/new" } })
    expect(await screen.findByRole("link", { name: "https://example.org/new" })).toBeInTheDocument()
  })

  it("deletes a link only after confirmation", async () => {
    const links = [link(1), link(2)]
    serveLinks(links)
    const deleted: string[] = []
    server.use(
      http.delete(`${API}/urls/:id`, ({ params }) => {
        deleted.push(String(params.id))
        links.splice(links.findIndex((l) => l.id === Number(params.id)), 1)
        return new HttpResponse(null, { status: 204 })
      })
    )
    const { user } = renderApp("/urls")

    await user.click(await screen.findByRole("button", { name: "Delete https://sho.rt/code2xx" }))
    let dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(deleted).toEqual([])

    await user.click(screen.getByRole("button", { name: "Delete https://sho.rt/code2xx" }))
    dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent("https://sho.rt/code2xx")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(deleted).toEqual(["2"])
    await waitFor(() => expect(table().queryByText("https://sho.rt/code2xx")).not.toBeInTheDocument())
    expect(table().getByText("https://sho.rt/code1xx")).toBeInTheDocument()
  })

  it("copies the short URL", async () => {
    serveLinks([link(1)])
    const { user } = renderApp("/urls")
    const writeText = vi.spyOn(navigator.clipboard, "writeText")
    await user.click(await screen.findByRole("button", { name: "Copy https://sho.rt/code1xx" }))
    expect(writeText).toHaveBeenCalledWith("https://sho.rt/code1xx")
    expect(await screen.findByText("Copied to clipboard")).toBeInTheDocument()
  })

  it("shows a QR code for the short URL", async () => {
    serveLinks([link(1)])
    const { user } = renderApp("/urls")
    await user.click(await screen.findByRole("button", { name: "QR code for https://sho.rt/code1xx" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("img", { name: "QR code for https://sho.rt/code1xx" })).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: /Download PNG/ })).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: /Download SVG/ })).toBeInTheDocument()
  })

  it("shows a generic error with retry on 500", async () => {
    let fail = true
    server.use(
      http.get(`${API}/urls`, () =>
        fail
          ? HttpResponse.json({ error: "Failed to list URLs: pq timeout" }, { status: 500 })
          : HttpResponse.json({ items: [link(1)], next_cursor: null })
      )
    )
    const { user } = renderApp("/urls")
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument()
    expect(screen.queryByText(/pq timeout/)).not.toBeInTheDocument()

    fail = false
    await user.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(table().getByText("https://sho.rt/code1xx")).toBeInTheDocument())
  })
})
