import { readFileSync } from "node:fs"
import type { Page } from "@playwright/test"
import { Api, expect, loginWithToken, targetUrl, test } from "./fixtures.ts"
import { acquire, currentUser } from "./state.ts"

test.describe.configure({ mode: "serial" })

// The panel loads 20 links per page (PAGE_SIZE in src/api/urls.ts); one more
// is enough to need "Load more", and creating links is rate limited
// (30 per minute per user).
const PAGE_SIZE = 20
const COUNT = PAGE_SIZE + 1

const target = targetUrl

const rows = (page: Page) => page.locator("tbody tr")

function row(page: Page, shortUrl: string) {
  return rows(page).filter({ has: page.getByText(shortUrl, { exact: true }) })
}

test.beforeAll(async ({ playwright }) => {
  // Start from an empty list so the counts below are exact.
  const request = await playwright.request.newContext()
  await new Api(request).deleteAllLinks()
  await request.dispose()
})

test(`create ${COUNT} links; Load more shows all of them once`, async ({ page, api, baseURL }) => {
  test.setTimeout(180_000)
  const { email } = currentUser()
  await loginWithToken(page, api)
  await expect(page.getByRole("button", { name: "Create your first link" })).toBeVisible()

  for (let i = 1; i <= COUNT; i++) {
    await page.getByRole("button", { name: i === 1 ? "Create your first link" : "Create link" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Target URL").fill(target(baseURL!, i))
    const created = page.waitForResponse((r) => r.url().endsWith("/urls") && r.request().method() === "POST")
    await acquire("create", email)
    await dialog.getByRole("button", { name: "Create" }).click()
    expect((await created).status()).toBe(201)
    await expect(dialog).toBeHidden()
  }

  await page.reload()
  await expect(rows(page)).toHaveCount(PAGE_SIZE)
  await page.getByRole("button", { name: "Load more" }).click()
  await expect(rows(page)).toHaveCount(COUNT)
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0)

  const shortUrls = await rows(page).locator("td:first-child .font-mono").allTextContents()
  const targets = await rows(page).locator("td:nth-child(2)").allTextContents()
  expect(new Set(shortUrls).size, "no duplicate rows").toBe(COUNT)
  expect(targets, "newest first, all present").toEqual(
    Array.from({ length: COUNT }, (_, i) => target(baseURL!, COUNT - i))
  )
})

test("edit a link's target; the short URL redirects to the new target", async ({ page, api, baseURL }) => {
  const [link] = await api.links()
  const newTarget = target(baseURL!, `edited-${Date.now()}`)
  await loginWithToken(page, api)

  await page.getByRole("button", { name: `Edit ${link.short_url}` }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByLabel("Target URL")).toHaveValue(link.url)
  await dialog.getByLabel("Target URL").fill(newTarget)
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog).toBeHidden()
  await expect(row(page, link.short_url).getByRole("link", { name: newTarget })).toBeVisible()

  // Fetched with an API request, not opened in the browser.
  expect(await api.resolveShortUrl(link.short_url)).toEqual({ status: 302, location: newTarget })
})

test("delete a link after confirming; its short URL returns 404", async ({ page, api }) => {
  const [, link] = await api.links()
  await loginWithToken(page, api)

  await page.getByRole("button", { name: `Delete ${link.short_url}` }).click()
  let confirm = page.getByRole("alertdialog")
  await expect(confirm).toContainText(link.short_url)
  await confirm.getByRole("button", { name: "Cancel" }).click()
  await expect(confirm).toBeHidden()
  await expect(row(page, link.short_url)).toHaveCount(1)

  await page.getByRole("button", { name: `Delete ${link.short_url}` }).click()
  confirm = page.getByRole("alertdialog")
  const deleted = page.waitForResponse((r) => r.url().endsWith(`/urls/${link.id}`))
  await confirm.getByRole("button", { name: "Delete" }).click()
  expect((await deleted).status()).toBe(204)
  await expect(confirm).toBeHidden()
  await expect(page.getByText("Link deleted")).toBeVisible()
  await expect(row(page, link.short_url)).toHaveCount(0)

  expect((await api.resolveShortUrl(link.short_url)).status).toBe(404)
  expect((await api.links()).map((l) => l.id)).not.toContain(link.id)
})

test("copy puts the short URL on the clipboard and shows a toast", async ({ page, api, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL })
  const [link] = await api.links()
  await loginWithToken(page, api)

  await page.getByRole("button", { name: `Copy ${link.short_url}` }).click()
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Copied to clipboard" })
  await expect(toast).toBeVisible()
  await expect(toast).toContainText(link.short_url)
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link.short_url)
})

test("open launches a new tab at the short URL, which lands on the target", async ({ page, api, context }) => {
  const [link] = await api.links()
  await loginWithToken(page, api)

  const opened: string[] = []
  context.on("request", (r) => {
    if (r.isNavigationRequest() && r.frame().page() !== page) opened.push(r.url())
  })
  const open = page.getByRole("link", { name: `Open ${link.short_url}` })
  await expect(open).toHaveAttribute("target", "_blank")
  await expect(open).toHaveAttribute("rel", "noopener noreferrer")

  const popupPromise = context.waitForEvent("page")
  await open.click()
  const popup = await popupPromise
  await popup.waitForURL(link.url)
  expect(opened[0], "the tab first loads the short URL").toBe(link.short_url)
  expect(popup.url()).toBe(link.url)
  await expect(page).toHaveURL(/\/urls$/) // the panel stays where it was
  await popup.close()
})

test("QR dialog; PNG and SVG downloads produce files", async ({ page, api }, testInfo) => {
  const [link] = await api.links()
  await loginWithToken(page, api)

  await page.getByRole("button", { name: `QR code for ${link.short_url}` }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("img", { name: `QR code for ${link.short_url}` })).toBeVisible()

  const svgDownload = page.waitForEvent("download")
  await dialog.getByRole("button", { name: "Download SVG" }).click()
  const svg = await svgDownload
  expect(svg.suggestedFilename()).toBe(`tidylnk-${link.short_code}.svg`)
  const svgPath = testInfo.outputPath(svg.suggestedFilename())
  await svg.saveAs(svgPath)
  const svgText = readFileSync(svgPath, "utf8")
  expect(svgText).toMatch(/^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  expect(svgText).toContain("<path")

  const pngDownload = page.waitForEvent("download")
  await dialog.getByRole("button", { name: "Download PNG" }).click()
  const png = await pngDownload
  expect(png.suggestedFilename()).toBe(`tidylnk-${link.short_code}.png`)
  const pngPath = testInfo.outputPath(png.suggestedFilename())
  await png.saveAs(pngPath)
  const bytes = readFileSync(pngPath)
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], "1024x1024").toEqual([1024, 1024])
})
