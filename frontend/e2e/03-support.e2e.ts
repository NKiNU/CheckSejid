import type { Page } from '@playwright/test'
import { ORG, expect, openOrg, sessions, shot, test } from './helpers.ts'

// Phase 13B (ADR-030, ADR-032): a platform admin asks, the owner decides, access is read-only and audited.
test.describe.serial('support access', () => {
  let as: Record<'admin' | 'owner' | 'member', Page>
  let close: () => Promise<unknown>
  test.beforeAll(async ({ browser }) => ({ as, close } = await sessions(browser, 'admin', 'owner', 'member')))
  test.afterAll(() => close())

  test('the admin files a request with a reason', async () => {
    let page = as.admin
    await page.goto('/support')
    await expect(page.getByRole('heading', { name: 'Support access' })).toBeVisible()
    await shot(page, '20-support-admin-empty')
    await page.getByLabel('Organisation').selectOption({ label: ORG })
    await page.getByLabel('Reason').fill('Owner reported the members list is wrong')
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByText('Owner reported the members list is wrong')).toBeVisible()
    await shot(page, '21-support-admin-requested')
  })

  test('a second open request for the same organisation is refused', async () => {
    let page = as.admin
    await page.goto('/support')
    await page.getByLabel('Organisation').selectOption({ label: ORG })
    await page.getByLabel('Reason').fill('duplicate request')
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByRole('alert').first()).toBeVisible()
  })

  test('the owner is notified and sees the request in settings', async () => {
    let page = as.owner
    await page.goto('/notifications')
    await expect(page.getByText('Support access requested')).toBeVisible()
    const id = await openOrg(page)
    await page.goto(`/org/${id}/settings`)
    await expect(page.getByRole('button', { name: 'Approve for 1 hour' })).toBeVisible()
    await shot(page, '22-support-owner-pending')
  })

  test('the owner approves; the admin can then open the organisation read-only', async () => {
    let page = as.owner
    const id = await openOrg(page)
    await page.goto(`/org/${id}/settings`)
    await page.getByRole('button', { name: 'Approve for 1 hour' }).click()
    await expect(page.getByRole('button', { name: 'End access now' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Extend by 1 hour' })).toBeVisible()
    await shot(page, '23-support-owner-approved')
    page = as.admin
    await page.goto('/support')
    await expect(page.getByText(/Ends /)).toBeVisible()
    await shot(page, '24-support-admin-granted')
    await page.getByRole('link', { name: 'Open organisation' }).click()
    await page.waitForURL(/\/org\/[0-9a-f-]{36}/)
    // the granted admin should actually see the organisation they were let into
    await expect(page.getByRole('heading', { name: ORG, level: 1 })).toBeVisible({ timeout: 10_000 })
    await shot(page, '25-support-admin-in-org')
  })

  test('the owner ends access; the admin is locked out and the log shows what happened', async () => {
    let page = as.owner
    const id = await openOrg(page)
    await page.goto(`/org/${id}/settings`)
    await page.getByRole('button', { name: 'End access now' }).click()
    await expect(page.getByRole('button', { name: 'End access now' })).toHaveCount(0)
    for (const entry of ['Access requested', 'Access approved', 'Access ended by owner']) {
      await expect(page.getByText(entry).first()).toBeVisible()
    }
    await shot(page, '26-support-owner-log')
    page = as.admin
    await page.goto(`/org/${id}/members`)
    await shot(page, '27-support-admin-after-end')
    await expect(page.getByText('E2E member')).toHaveCount(0)
  })

  test('the owner can deny a new request', async () => {
    let page = as.admin
    await page.goto('/support')
    await page.getByLabel('Organisation').selectOption({ label: ORG })
    await page.getByLabel('Reason').fill('second visit')
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByText('second visit')).toBeVisible()
    page = as.owner
    const id = await openOrg(page)
    await page.goto(`/org/${id}/settings`)
    await page.getByRole('button', { name: 'Deny' }).click()
    await expect(page.getByText('Request denied').first()).toBeVisible()
    await shot(page, '28-support-owner-denied')
  })

  test('a normal user cannot use the platform support screen', async () => {
    let page = as.member
    await page.goto('/support')
    await shot(page, '29-support-non-admin')
    // The form is still rendered (finding: it could be hidden), but the API refuses and lists no organisations.
    await expect(page.getByText('You do not have permission to do this.')).toBeVisible()
    await expect(page.getByLabel('Organisation').locator('option')).toHaveCount(1)
  })
})
