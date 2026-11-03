// The main things a player does, end to end in a real browser. The test API
// runs with the 30-second test timers, so a whole day fits in a test.
import { test, expect } from '@playwright/test'
import {
  PASSWORD, uniqueEmail, linkToken, resetRateLimits, startNewDay, logIn, signUpAndVerify,
  newPlayer, xpText, actionButton
} from './helpers.js'

test.beforeEach(async ({ request }) => {
  await resetRateLimits(request)
})

// starts the day, ticks every task (waiting for each tick to save) and confirms
async function completeTheDay(page) {
  await page.locator('.home-start-btn').click()
  const rows = page.locator('.home-task-row')
  for (let i = 0; i < 3; i++) {
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/check') && r.ok()),
      rows.nth(i).click()
    ])
  }
  // confirm unlocks 10 seconds into the window with the test timers
  await expect(actionButton(page)).toHaveText('Confirm Tasks Done', { timeout: 20_000 })
  await actionButton(page).click()
}

test('full loop: sign up, set up, complete a day, and the XP is still there after logging back in', async ({ page, request }) => {
  const email = await newPlayer(page, request)
  await expect(xpText(page)).toHaveText('0/100XP')

  await completeTheDay(page)
  await expect(page.getByText('+15XP')).toBeVisible()
  await expect(xpText(page)).toHaveText('15/100XP')

  // log out from Settings
  await page.locator('.home-icon-btn').first().click()
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.waitForURL('**/login')

  await logIn(page, email)
  await page.waitForURL('**/home')
  await expect(xpText(page)).toHaveText('15/100XP')
  await expect(page.locator('.home-tasks-done')).toBeVisible()
})

test('wrong password, then resetting a forgotten password', async ({ page, request }) => {
  const email = await signUpAndVerify(page, request, uniqueEmail('forgetful'))
  await page.locator('.setup-logout').click()
  await page.waitForURL('**/login')

  await logIn(page, email, 'not-my-password')
  await expect(page.locator('.auth-error')).toHaveText('Invalid email or password')

  await page.getByRole('link', { name: 'Forgotten your password?' }).click()
  await page.fill('#forgot-email', email)
  await page.click('button[type=submit]')
  await expect(page.locator('.auth-message')).toContainText('reset link is on its way')

  await page.goto(`/reset-password?token=${encodeURIComponent(await linkToken(request, email))}`)
  await page.fill('#reset-password', 'my-brand-new-password')
  await page.fill('#reset-confirm', 'my-brand-new-password')
  await page.click('button[type=submit]')
  await expect(page.getByRole('link', { name: 'Log in with your new password' })).toBeVisible()

  await logIn(page, email, PASSWORD)
  await expect(page.locator('.auth-error')).toHaveText('Invalid email or password')
  await logIn(page, email, 'my-brand-new-password')
  await page.waitForURL('**/setup')
})

// Guards the section 1 regression: when the window runs out with tasks
// unticked, the penalty must be asked for exactly once and the pop-up must
// appear; when the penalty then runs out it must be failed exactly once.
test('a missed window starts a penalty, and a missed penalty costs XP', async ({ page, request }) => {
  const email = await newPlayer(page, request, 'slacker')
  await completeTheDay(page) // day one: earn 15 XP so there is some to lose
  await expect(xpText(page)).toHaveText('15/100XP')

  await startNewDay(request, email)
  await page.reload()
  await expect(page.locator('.home-start-btn')).toHaveText('Start Tasks')

  const calls = { trigger: 0, fail: 0 }
  page.on('request', r => {
    if (r.url().endsWith('/api/daily/penalty/trigger')) calls.trigger++
    if (r.url().endsWith('/api/daily/penalty/fail')) calls.fail++
  })

  // start, tick nothing, and let the 30-second window run out
  await page.locator('.home-start-btn').click()
  await expect(page.locator('.penalty-box')).toBeVisible({ timeout: 45_000 })
  await expect(page.locator('.penalty-task-title')).not.toBeEmpty()
  await expect(page.locator('.penalty-confirm-btn')).toBeDisabled()
  expect(calls.trigger).toBe(1)

  // leave the 30-second penalty to run out too
  await expect(page.getByText(/failed on the penalty task/)).toBeVisible({ timeout: 50_000 })
  await expect(page.locator('.penalty-box')).toHaveCount(0)
  await expect(xpText(page)).toHaveText('0/100XP')
  expect(calls).toEqual({ trigger: 1, fail: 1 })

  // and it stays settled after a reload
  await page.reload()
  await expect(xpText(page)).toHaveText('0/100XP')
  await expect(page.locator('.home-start-btn')).toHaveCount(0)
})

test('goals: add, rename and delete a goal pathway', async ({ page, request }) => {
  await newPlayer(page, request, 'planner')
  await page.locator('.home-icon-btn').nth(1).click()
  await page.waitForURL('**/goals')
  const names = page.locator('.goal-name')
  await expect(names).toHaveText(['Fitness:'])

  await page.locator('.add-goal-btn').click()
  await expect(names).toHaveText(['Fitness:', 'Goal Pathway 2:'])

  await page.getByText('Goal Pathway 2:').click()
  await page.locator('input.goal-name-input').fill('Reading')
  await page.locator('input.goal-name-input').press('Enter')
  await expect(names).toHaveText(['Fitness:', 'Reading:'])
  await page.reload()
  await expect(names).toHaveText(['Fitness:', 'Reading:'])

  await page.locator('.goal-row-content', { hasText: 'Reading:' }).getByRole('button', { name: 'Delete goal' }).click()
  await expect(names).toHaveText(['Fitness:'])
  await page.reload()
  await expect(names).toHaveText(['Fitness:'])
})
