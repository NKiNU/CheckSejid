import type { Page } from '@playwright/test'
import { ORG, PASSWORD, expect, openOrg, sessions, shot, test } from './helpers.ts'

// Phase 13A (ADR-029, ADR-031): retention choice, organisation and account erasure requests with grace period.
test.describe.serial('erasure', () => {
  let as: Record<'owner' | 'member' | 'viewer', Page>
  let close: () => Promise<unknown>
  test.beforeAll(async ({ browser }) => ({ as, close } = await sessions(browser, 'owner', 'member', 'viewer')))
  test.afterAll(() => close())

  test('owner chooses a retention period and it persists', async () => {
    const page = as.owner
    const id = await openOrg(page)
    await page.goto(`/org/${id}/settings`)
    const retention = page.getByLabel('Keep an encrypted archive')
    await expect(retention).toBeVisible()
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/retention') && r.request().method() === 'PUT' && r.ok()),
      retention.selectOption({ label: '3 years' }),
    ])
    await page.reload()
    await expect(page.getByLabel('Keep an encrypted archive')).toHaveValue('3')
    await shot(page, '10-retention-3-years')
  })

  test('a wrong password is refused, then the right one schedules deletion with a cancel button', async () => {
    const page = as.owner
    const id = await openOrg(page)
    await page.goto(`/org/${id}/settings`)
    const card = page // one password field and one Request deletion button on this page
    await card.getByLabel('Confirm with your password').fill('definitely-wrong-123')
    await card.getByRole('button', { name: 'Request deletion' }).click()
    await expect(page.getByRole('alert').first()).toBeVisible()
    await shot(page, '11-erasure-wrong-password')
    await card.getByLabel('Confirm with your password').fill(PASSWORD)
    await card.getByRole('button', { name: 'Request deletion' }).click()
    await expect(page.getByText(/Deletion is scheduled for/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel deletion' })).toBeVisible()
    await shot(page, '12-erasure-pending')
  })

  test('retention cannot be changed while a deletion is pending (409)', async () => {
    const page = as.owner
    const id = await openOrg(page)
    await page.goto(`/org/${id}/settings`)
    await page.getByLabel('Keep an encrypted archive').selectOption({ label: '5 years' })
    await expect(page.getByRole('alert').first()).toBeVisible()
    await shot(page, '13-retention-blocked-while-pending')
  })

  test('a member is notified, and has no delete controls', async () => {
    const page = as.member
    await page.goto('/notifications')
    await expect(page.getByText('Deletion of this organisation was requested')).toBeVisible()
    await shot(page, '14-member-notified')
    const id = await openOrg(page)
    await page.goto(`/org/${id}/settings`)
    await expect(page.getByRole('heading', { name: 'Delete this organisation' })).toHaveCount(0)
  })

  test('the owner cancels during the grace period; members are told', async () => {
    const page = as.owner
    const id = await openOrg(page)
    await page.goto(`/org/${id}/settings`)
    await page.getByRole('button', { name: 'Cancel deletion' }).click()
    await expect(page.getByRole('button', { name: 'Request deletion' })).toBeVisible()
    await shot(page, '15-erasure-cancelled')
    await as.member.goto('/notifications')
    await expect(as.member.getByText('Deletion of this organisation was cancelled')).toBeVisible()
  })

  test('an organisation owner cannot delete their account (they must delete or hand over the organisation)', async () => {
    const page = as.owner
    await page.goto('/account/delete')
    await page.getByLabel('Confirm with your password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Request deletion' }).click()
    await expect(page.getByRole('alert').first()).toBeVisible()
    await expect(page.getByText(/Deletion is scheduled/)).toHaveCount(0)
    await shot(page, '16-owner-cannot-delete-account')
  })

  test('a user with no organisation can request account deletion and cancel it', async () => {
    const page = as.viewer
    await page.goto('/account/delete')
    await shot(page, '17-account-delete-form')
    await page.getByLabel('Confirm with your password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Request deletion' }).click()
    await expect(page.getByText(/Deletion is scheduled for/)).toBeVisible()
    await shot(page, '18-account-delete-pending')
    await page.getByRole('button', { name: 'Cancel deletion' }).click()
    await expect(page.getByRole('button', { name: 'Request deletion' })).toBeVisible()
  })

  test('the header shows the same organisation after all that (nothing was deleted)', async () => {
    const page = as.owner
    await page.goto('/feed')
    await expect(page.getByRole('link', { name: new RegExp(ORG) }).first()).toBeVisible()
  })
})
