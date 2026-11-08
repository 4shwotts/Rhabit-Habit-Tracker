// Every main page at phone and tablet sizes, with touch switched on. Pages scroll
// downwards on a small screen, so the rule checked here is that nothing runs off
// the sides, where it couldn't be reached.
/* global document -- used inside page.evaluate, which runs in the browser */
import { test, expect } from '@playwright/test'
import { resetRateLimits, signUpAndVerify, completeSetup } from './helpers.js'

const SCREENS = [
  { name: 'small phone', width: 320, height: 568 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'sideways phone', width: 844, height: 390 },
  { name: 'tablet', width: 768, height: 1024 }
]

// anything people read or press that crosses the sides of the screen
async function expectNothingOffScreen(page, where) {
  await page.waitForLoadState('networkidle')
  const problems = await page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const parts = [...document.querySelectorAll('button, input, a, h1, h2, p, label, [role=timer]')]
    const offScreen = parts.filter(el => {
      if (el.closest('[aria-hidden="true"]')) return false // the sign-up form's bot trap
      const box = el.getBoundingClientRect()
      return box.width > 0 && (box.left < -1 || box.right > width + 1)
    })
    return offScreen.map(el => `${el.tagName.toLowerCase()}.${el.className}: ${el.textContent.slice(0, 30)}`)
  })
  expect(problems, `off-screen on ${where}`).toEqual([])
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(sideways, `${where} scrolls sideways`).toBeLessThanOrEqual(0)
}

// the page itself doesn't scroll, which keeps Safari's toolbars and the corners still
async function expectNoScrolling(page, selector) {
  const extra = await page.locator(selector).evaluate(el => el.scrollHeight - el.clientHeight)
  expect(extra, `${selector} scrolls`).toBeLessThanOrEqual(0)
}

// pop-ups close with a tap outside them; there's always a strip of screen left
// above a pop-up for that, below the demo banner when there is one
async function closePopUp(page) {
  const banner = page.locator('.demo-banner')
  const top = await banner.count() ? (await banner.boundingBox()).height : 0
  await page.locator('.modal-overlay').click({ position: { x: 4, y: top + 4 } })
}

// the demo banner sits above `selector`, never over it
async function expectBelowBanner(page, selector) {
  const banner = await page.locator('.demo-banner').boundingBox()
  const element = await page.locator(selector).first().boundingBox()
  expect(element.y, `${selector} is under the demo banner`).toBeGreaterThanOrEqual(banner.y + banner.height)
}

for (const { name, width, height } of SCREENS) {
  test.describe(name, () => {
    test.use({ viewport: { width, height }, isMobile: true, hasTouch: true })

    test(`every main page fits a ${width}x${height} screen`, async ({ page, request }) => {
      await resetRateLimits(request)

      await page.goto('/login')
      await expect(page.locator('#login-email')).toBeVisible()
      await expectNothingOffScreen(page, 'login')

      await page.goto('/signup')
      await expect(page.locator('#signup-email')).toBeVisible()
      await expectNothingOffScreen(page, 'sign-up')

      await signUpAndVerify(page, request)
      await expectNothingOffScreen(page, 'setup')

      await completeSetup(page)
      await expectNothingOffScreen(page, 'home')

      // upright, Home fits the screen, as it does on desktop
      if (height >= width) await expectNoScrolling(page, '.home-page')

      const settingsButton = page.locator('.home-icon-btn').first()

      await settingsButton.click()
      await expect(page.locator('.settings-box')).toBeVisible()
      await expectNothingOffScreen(page, 'settings')
      await closePopUp(page)
      await expect(page.locator('.settings-box')).toHaveCount(0)

      await page.locator('.home-icon-btn').nth(1).click()
      await page.waitForURL('**/goals')
      await expect(page.locator('.goal-name')).toHaveCount(1)
      await expectNothingOffScreen(page, 'goals')

      // however long the list gets, it scrolls inside the file frame
      for (let goals = 2; goals <= 8; goals++) {
        await page.getByRole('button', { name: /add goal/i }).click()
        await expect(page.locator('.goal-row-wrap')).toHaveCount(goals)
      }
      await expectNothingOffScreen(page, 'goals with eight pathways')
      if (height >= width) await expectNoScrolling(page, '.goals-page')
      const lastRow = page.locator('.goal-row-wrap').last()
      await lastRow.scrollIntoViewIfNeeded()
      // and nothing shows below the frame's drawn bottom line, 97.5% of the way down its box
      const frame = await page.locator('.goals-filebox-wrap').boundingBox()
      const frameLine = frame.y + frame.height * 0.975
      const visibleBottom = await page.locator('.goals-scroll-area').evaluate(el => el.getBoundingClientRect().bottom)
      expect(visibleBottom).toBeLessThanOrEqual(frameLine + 1)
      const lastGoal = await lastRow.boundingBox()
      expect(lastGoal.y + lastGoal.height).toBeLessThanOrEqual(frameLine + 1)

      await page.getByRole('button', { name: 'Open goal tasks' }).first().click()
      await expect(page.locator('.expanded-goal-box .task-row').first()).toBeVisible()
      await expectNothingOffScreen(page, 'goal tasks')
      await closePopUp(page)
      await expect(page.locator('.expanded-goal-box')).toHaveCount(0)
    })

    test(`the demo fits a ${width}x${height} screen`, async ({ page, request }) => {
      await resetRateLimits(request)

      await page.goto('/login')
      await expect(page.getByRole('button', { name: 'Try the demo' })).toBeVisible()
      await expectNothingOffScreen(page, 'login with the demo button')

      await page.getByRole('button', { name: 'Try the demo' }).click()
      await page.waitForURL('**/home')
      await expect(page.locator('.home-task-row')).toHaveCount(3)
      await expectNothingOffScreen(page, 'demo home')
      await expectBelowBanner(page, '.home-clock')
      await expectBelowBanner(page, '.home-icon-btn')

      await page.locator('.home-icon-btn').first().click()
      await expect(page.getByRole('button', { name: 'End demo' })).toBeVisible()
      await expectNothingOffScreen(page, 'demo settings')
      await closePopUp(page)
      await expect(page.locator('.settings-box')).toHaveCount(0)

      await page.locator('.home-icon-btn').nth(1).click()
      await page.waitForURL('**/goals')
      await expect(page.locator('.goal-name')).toHaveCount(3)
      await expectNothingOffScreen(page, 'demo goals')
      await expectBelowBanner(page, '.goals-home-btn')
    })
  })
}
