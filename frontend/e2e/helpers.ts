import { devices, test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

// The e2e API runs with TRUST_PROXY=1, so each test presents its own client IP and gets its own rate-limit quota
// (login is 10 per 15 min per IP). Without this the suite would lock itself out.
export const test = base.extend({
  page: async ({ page }, provide) => {
    const n = () => Math.floor(Math.random() * 250) + 1
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `10.${n()}.${n()}.${n()}` })
    await provide(page)
  },
})
export { expect }

// Login is also limited per email (10 per 15 min), so each run seeds its own users: E2E_RUN=<suffix>.
export const RUN = process.env.E2E_RUN ?? ''
export const email = (who: string) => `${who}${RUN}@e2e.test`

export const PASSWORD = 'e2e-Passw0rd-123'
export const ORG = 'E2E Masjid'

export const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true })

export async function login(page: Page, who: string, password = PASSWORD) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email(who))
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

export async function loggedIn(page: Page, who: string) {
  await login(page, who)
  await expect(page).not.toHaveURL(/\/login/)
}

// Opens the e2e organisation from "My organisations" and returns its id.
export async function openOrg(page: Page) {
  await page.goto('/feed')
  await page.getByRole('link', { name: new RegExp(ORG) }).first().click()
  await page.waitForURL(/\/org\/[0-9a-f-]{36}/)
  return /\/org\/([0-9a-f-]{36})/.exec(page.url())![1]!
}

// One logged-in page per user for a whole spec file: login is limited to 10 per 15 min per email, so tests share sessions.
export async function sessions<T extends string>(browser: Browser, ...who: T[]) {
  const out = {} as Record<T, Page>
  const contexts: BrowserContext[] = []
  for (const w of who) {
    const ctx = await browser.newContext({ ...devices['Pixel 7'], baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5174' })
    const n = () => Math.floor(Math.random() * 250) + 1
    await ctx.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${n()}.${n()}.${n()}` })
    const page = await ctx.newPage()
    await loggedIn(page, w)
    out[w] = page
    contexts.push(ctx)
  }
  return { as: out, close: () => Promise.all(contexts.map((c) => c.close())) }
}
