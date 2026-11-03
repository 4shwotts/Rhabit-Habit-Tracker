// Shared steps for the end-to-end journeys, done the way a player would:
// through the real pages, with the emails read from the test API's outbox.
import { expect } from '@playwright/test'

export const PASSWORD = 'correct-horse-battery'

let counter = 0
export const uniqueEmail = prefix => `${prefix}.${Date.now()}.${++counter}@rhabit-tests.com`

// emails the test API has "sent" to `to`, newest last
export async function emailsTo(request, to) {
  const res = await request.get(`/api/test/emails?to=${encodeURIComponent(to)}`)
  return (await res.json()).emails
}

// the token from the newest emailed link to `to`
export async function linkToken(request, to) {
  const emails = await emailsTo(request, to)
  const match = emails.at(-1)?.text.match(/token=([^\s&]+)/)
  if (!match) throw new Error(`No emailed link for ${to}`)
  return decodeURIComponent(match[1])
}

// each journey starts with fresh rate limits (they're per IP, and every
// journey comes from the same machine)
export async function resetRateLimits(request) {
  await request.post('/api/test/reset-rate-limits')
}

// the next request from this player starts a brand new day
export async function startNewDay(request, email) {
  expect((await request.post('/api/test/new-day', { data: { email } })).ok()).toBe(true)
}

export async function logIn(page, email, password = PASSWORD) {
  await page.goto('/login')
  await page.fill('#login-email', email)
  await page.fill('#login-password', password)
  await page.click('button[type=submit]')
}

// sign up and verify through the pages; ends logged in, on the setup page
export async function signUpAndVerify(page, request, email = uniqueEmail('player')) {
  await page.goto('/signup')
  await page.fill('#signup-username', 'Tester')
  await page.fill('#signup-email', email)
  await page.fill('#signup-password', PASSWORD)
  await page.fill('#signup-confirm', PASSWORD)
  // the sign-up form only accepts submissions at least 3 seconds old (bot check)
  await page.waitForTimeout(3300)
  await page.click('button[type=submit]')
  await expect(page.getByRole('heading', { name: /check your inbox/i })).toBeVisible()

  await page.goto(`/verify-email?token=${encodeURIComponent(await linkToken(request, email))}`)
  await expect(page.getByRole('heading', { name: /email verified/i })).toBeVisible()

  await logIn(page, email)
  await page.waitForURL('**/setup')
  return email
}

// first-time setup: three tasks for each of levels 1 to 3; ends on Home
export async function completeSetup(page, goalName = 'Fitness') {
  for (const level of [1, 2, 3]) {
    await page.click(`button.level-tab:has-text("Level ${level}")`)
    for (let i = 1; i <= 3; i++) {
      await page.click('button.add-task-btn')
      const input = page.locator('input.task-edit-input:not([readonly])')
      await input.fill(`Level ${level} task ${i}`)
      await input.press('Tab')
    }
  }
  await page.fill('#setup-goal-name', goalName)
  // the start button asks to be pressed a second time to confirm
  await page.click('.start-btn')
  await page.click('.start-btn')
  await page.waitForURL('**/home')
  await expect(page.locator('.home-task-row')).toHaveCount(3)
}

// a brand new player who has finished setup and is on Home
export async function newPlayer(page, request, prefix = 'player') {
  const email = await signUpAndVerify(page, request, uniqueEmail(prefix))
  await completeSetup(page)
  return email
}

export const xpText = page => page.locator('.home-xp-text')
export const actionButton = page => page.locator('.home-action-area button')
