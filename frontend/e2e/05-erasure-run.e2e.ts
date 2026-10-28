import { ORG, PASSWORD, expect, loggedIn, openOrg, shot, test } from './helpers.ts'

// The grace period is 7 days, so this runs in two phases around a manual step (see e2e/README.md):
//   E2E_PHASE=request  the owner requests deletion
//   (set the request's executeAfter to now in the e2e database, restart the API: its startup job runs the erasure)
//   E2E_PHASE=done     the organisation is gone for everyone, accounts still work
test.describe.serial('erasure runs (ADR-029, ADR-031)', () => {
  test('phase request: the owner schedules the deletion', async ({ page }) => {
    test.skip(process.env.E2E_PHASE !== 'request')
    await loggedIn(page, 'owner')
    const id = await openOrg(page)
    await page.goto(`/org/${id}/settings`)
    await page.getByLabel('Confirm with your password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Request deletion' }).click()
    await expect(page.getByText(/Deletion is scheduled for/)).toBeVisible()
    await shot(page, '40-erasure-scheduled')
  })

  test('phase done: the organisation is gone for owner and member, and their accounts still work', async ({ page }) => {
    test.skip(process.env.E2E_PHASE !== 'done')
    await loggedIn(page, 'owner')
    await page.goto('/feed')
    await expect(page.getByText('You are not in any organisation yet.')).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(ORG) })).toHaveCount(0)
    await shot(page, '41-owner-after-erasure')
    await page.context().clearCookies()
    await loggedIn(page, 'member')
    await page.goto('/feed')
    await expect(page.getByText('You are not in any organisation yet.')).toBeVisible()
    await shot(page, '42-member-after-erasure')
  })
})
