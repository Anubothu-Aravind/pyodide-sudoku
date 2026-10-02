import { test, expect } from '@playwright/test'

const ARTIFACT_DIR = '/home/aravind/.gemini/antigravity-ide/brain/4e26ec1f-0369-4309-af5a-763dc6830a8d'

test.describe('Mobile & Desktop Cookie Banner Positioning', () => {
  test('Cookie banner shows on top on mobile and at bottom on desktop', async ({ page, context }) => {
    // 1. Mobile Viewport (390 x 844) with fresh state
    await context.clearCookies()
    await page.addInitScript(() => {
      localStorage.removeItem('sudoku_cookie_consent')
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#levels')
    await page.waitForSelector('.mobile-cookie-slot .cookie-consent-banner', { timeout: 15000 })
    await page.waitForTimeout(500)

    // Verify mobile cookie banner is rendered on top (y == 0)
    const mobileBanner = page.locator('.mobile-cookie-slot .cookie-consent-banner')
    await expect(mobileBanner).toBeVisible()
    const mobileBox = await mobileBanner.boundingBox()
    expect(mobileBox).not.toBeNull()
    expect(mobileBox!.y).toBe(0)

    // Capture mobile top banner screenshot
    await page.screenshot({ path: `${ARTIFACT_DIR}/mobile_cookie_banner_on_top.png` })

    // Test ACCEPT on mobile
    const acceptBtn = mobileBanner.getByRole('button', { name: 'ACCEPT' })
    await acceptBtn.click()
    await page.waitForTimeout(300)
    await expect(mobileBanner).not.toBeVisible()

    // 2. Desktop Viewport (1280 x 800) with fresh state
    await page.addInitScript(() => {
      localStorage.removeItem('sudoku_cookie_consent')
    })
    await page.goto('/#levels')
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.waitForSelector('.desktop-cookie-slot .cookie-consent-banner', { timeout: 15000 })
    await page.waitForTimeout(500)

    const desktopBanner = page.locator('.desktop-cookie-slot .cookie-consent-banner')
    await expect(desktopBanner).toBeVisible()
    const desktopBox = await desktopBanner.boundingBox()
    expect(desktopBox).not.toBeNull()
    // On desktop, it should be below content (y > 300)
    expect(desktopBox!.y).toBeGreaterThan(300)

    await page.screenshot({ path: `${ARTIFACT_DIR}/desktop_cookie_banner_on_bottom.png` })
  })

  test('All 9 numberpad digits are fully visible on mobile screens', async ({ page }) => {
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/play')
      await page.waitForSelector('.sudoku-board', { timeout: 25000 })
      await page.waitForTimeout(500)

      const buttons = page.locator('button[aria-label^="Enter digit"]')
      await expect(buttons).toHaveCount(9)

      const box9 = await buttons.last().boundingBox()
      expect(box9).not.toBeNull()
      // Entire button 9 must fit inside viewport width without clipping
      expect(box9!.x + box9!.width).toBeLessThanOrEqual(width)
      expect(box9!.x).toBeGreaterThan(0)
    }
  })
})
