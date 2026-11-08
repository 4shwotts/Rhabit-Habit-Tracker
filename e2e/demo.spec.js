// The one-click demo, end to end: a visitor tries it from the login page,
// completes a day, ends the demo (which deletes it), and in a second visit
// watches a fast demo window run out into a penalty.
//
// Demo windows last 3 minutes, so the test-only rewind route (routes/testSupport.js)
// moves the window's start back instead of waiting.
import { test, expect } from '@playwright/test'
import { resetRateLimits, xpText, actionButton } from './helpers.js'

// clicks "Try the demo" and checks it lands on Home, in demo mode
async function startDemo(page) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await page.waitForURL('**/home')
  await expect(page.getByRole('region', { name: 'Demo mode' }))
    .toContainText('Demo mode: this account is temporary and resets after 24 hours.')
  await expect(page.locator('.home-task-row')).toHaveCount(3)
}

// as if today's window had started `seconds` earlier
async function rewindWindow(page, seconds) {
  const res = await page.request.post('/api/test/rewind-window', { data: { seconds } })
  expect(res.ok()).toBe(true)
}

async function accountExists(request, email) {
  const res = await request.get(`/api/test/user-exists?email=${encodeURIComponent(email)}`)
  return (await res.json()).exists
}

test.beforeEach(async ({ request }) => {
  await resetRateLimits(request)
})

test('try the demo, complete the day, then end the demo and it is gone', async ({ page, request }) => {
  await startDemo(page)
  // the seeded account: level 4, part-way through the bar, one task already ticked
  await expect(page.locator('.home-level-text')).toHaveText('Level: 4')
  await expect(xpText(page)).toHaveText('55/100XP')
  await expect(page.locator('.home-task-row.checked')).toHaveCount(1)

  // tick the other two
  const unticked = page.locator('.home-task-row:not(.checked)')
  for (let i = 0; i < 2; i++) {
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/check') && r.ok()),
      unticked.first().click()
    ])
  }
  await expect(page.locator('.home-task-row.checked')).toHaveCount(3)

  // confirm opens a minute into a demo window
  await expect(actionButton(page)).toHaveText(/^Confirm in/)
  await rewindWindow(page, 61)
  await page.reload()
  await expect(actionButton(page)).toHaveText('Confirm Tasks Done')
  await actionButton(page).click()
  await expect(page.getByText('+45XP')).toBeVisible()
  await expect(page.locator('.home-level-text')).toHaveText('Level: 5') // 55 + 45 fills the bar

  // ending the demo deletes the account and returns to the login page
  const email = (await (await page.request.get('/api/auth/me')).json()).user.email
  expect(email).toMatch(/@demo\.invalid$/)
  await page.locator('.home-icon-btn').first().click()
  await page.getByRole('button', { name: 'End demo' }).click()
  await page.waitForURL('**/login')
  await expect(page.getByRole('region', { name: 'Demo mode' })).toHaveCount(0)
  expect(await accountExists(request, email)).toBe(false)
  expect((await page.request.get('/api/auth/me')).status()).toBe(401)
})

test('a demo window runs out in minutes and the penalty starts', async ({ page }) => {
  await startDemo(page)
  // 5 seconds of the 3-minute window left
  await rewindWindow(page, 175)
  await page.reload()

  await expect(page.locator('.penalty-box')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.penalty-task-title')).not.toBeEmpty()
  // a 2-minute demo penalty, not the hour a real account gets
  await expect(page.locator('.penalty-timer')).toHaveText(/^0[12]:[0-5]\d$/)
  await expect(page.locator('.penalty-confirm-btn')).toBeDisabled()
})
