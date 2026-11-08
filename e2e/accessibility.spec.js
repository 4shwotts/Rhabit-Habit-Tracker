// Accessibility scan (axe-core, WCAG 2.1 A and AA) of the main pages. Any
// violation fails the test. The list is in the HTML report and in
// test-results/accessibility.json.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import { resetRateLimits, signUpAndVerify, completeSetup } from './helpers.js'

const results = []

async function scan(page, name, testInfo) {
  // let the page settle (fonts, the first data load) before scanning
  await page.waitForLoadState('networkidle')
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const summary = violations.map(v => ({
    page: name, impact: v.impact, rule: v.id, description: v.help, elements: v.nodes.length, help: v.helpUrl,
    examples: v.nodes.slice(0, 3).map(n => n.target.join(' '))
  }))
  results.push(...summary)
  await testInfo.attach(`axe-${name}`, { body: JSON.stringify(violations, null, 2), contentType: 'application/json' })
}

test('accessibility scan of login, sign-up, setup, Home, Goals and demo mode', async ({ page, request, browser }, testInfo) => {
  await resetRateLimits(request)

  // the login page includes the "Try the demo" button
  await page.goto('/login')
  await expect(page.locator('#login-email')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try the demo' })).toBeVisible()
  await scan(page, 'login', testInfo)

  await page.goto('/signup')
  await expect(page.locator('#signup-email')).toBeVisible()
  await scan(page, 'sign-up', testInfo)

  await signUpAndVerify(page, request)
  await scan(page, 'setup', testInfo)

  await completeSetup(page)
  await scan(page, 'home', testInfo)

  await page.locator('.home-icon-btn').nth(1).click()
  await page.waitForURL('**/goals')
  await expect(page.locator('.goal-name')).toHaveCount(1)
  await scan(page, 'goals', testInfo)

  // demo mode, in a separate browser: Home with the banner, and Settings
  const demo = await (await browser.newContext()).newPage()
  await demo.goto('/login')
  await demo.getByRole('button', { name: 'Try the demo' }).click()
  await demo.waitForURL('**/home')
  await expect(demo.getByRole('region', { name: 'Demo mode' })).toBeVisible()
  await scan(demo, 'demo home', testInfo)
  await demo.locator('.home-icon-btn').first().click()
  await expect(demo.getByRole('button', { name: 'End demo' })).toBeVisible()
  await scan(demo, 'demo settings', testInfo)
  await demo.context().close()

  // the full list, worst first, for the write-up
  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 }
  results.sort((a, b) => order[a.impact] - order[b.impact] || a.page.localeCompare(b.page))
  fs.mkdirSync('test-results', { recursive: true })
  fs.writeFileSync('test-results/accessibility.json', JSON.stringify(results, null, 2))
  console.log(`\nAccessibility: ${results.length} violation(s)`)
  for (const r of results) console.log(`  [${r.impact}] ${r.page}: ${r.rule} (${r.elements}) - ${r.description}`)
  expect(results).toEqual([])
})
