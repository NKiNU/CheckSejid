import type { Page } from '@playwright/test'
import { ORG, expect, openOrg, sessions, shot, test } from './helpers.ts'

// Public discovery and following (ADR-019) as reworked in the 2026-10-28 screens and follow fixes.
test.describe.serial('public discovery and following', () => {
  let as: Record<'owner' | 'viewer', Page>
  let close: () => Promise<unknown>
  test.beforeAll(async ({ browser }) => ({ as, close } = await sessions(browser, 'owner', 'viewer')))
  test.afterAll(() => close())

  async function setVisibility(label: string) {
    const id = await openOrg(as.owner)
    await as.owner.goto(`/org/${id}/settings`)
    await as.owner.getByLabel('Visibility').selectOption({ label })
    await as.owner.reload()
    await expect(as.owner.getByLabel('Visibility')).toHaveValue(label.startsWith('Public') ? 'PUBLIC' : 'PRIVATE')
  }

  test('a private organisation is not discoverable', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('No organisations found.')).toBeVisible()
    await shot(page, '30-discover-private-hidden')
  })

  test('the owner makes it public; anyone can then find it without logging in', async ({ page }) => {
    await setVisibility('Public — anyone can find and view it')
    await page.goto('/')
    await expect(page.getByRole('button', { name: new RegExp(ORG) })).toBeVisible()
    await shot(page, '31-discover-public')
    await page.getByRole('button', { name: new RegExp(ORG) }).click()
    await expect(page.getByRole('heading', { name: ORG })).toBeVisible()
    await expect(page.getByText('No upcoming events.')).toBeVisible()
    await shot(page, '32-public-org-page')
  })

  test('a logged-in user follows it, sees it in the feed, then unfollows', async () => {
    const page = as.viewer
    await page.goto('/')
    await page.getByRole('button', { name: new RegExp(ORG) }).click()
    await page.getByRole('button', { name: 'Follow', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Unfollow' })).toBeVisible()
    await shot(page, '33-following')
    await page.goto('/feed')
    // the feed panel only appears once followed organisations have published content (none yet)
    await expect(page.getByRole('heading', { name: 'My organisations' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'From organisations you follow' })).toHaveCount(0)
    await shot(page, '34-feed-no-content-yet')
    await page.goto('/')
    await page.getByRole('button', { name: new RegExp(ORG) }).click()
    await page.getByRole('button', { name: 'Unfollow' }).click()
    await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeVisible()
  })

  test('making it private again hides it from discovery', async ({ page }) => {
    await setVisibility('Private — internal only')
    await page.goto('/')
    await expect(page.getByText('No organisations found.')).toBeVisible()
  })
})
