import { test, expect } from '@playwright/test'

const ARTIFACT_DIR = '/home/aravind/.gemini/antigravity-ide/brain/4e26ec1f-0369-4309-af5a-763dc6830a8d'

test.describe('Light Mode Appearance Verification', () => {
  test('Verify Light Mode and capture screenshots', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/#levels')
    await page.waitForSelector('.campaign-worlds-grid', { timeout: 15000 })

    // Open Settings Modal
    const settingsBtn = page.locator('button[aria-label="Open settings"]')
    await settingsBtn.click()
    await page.waitForSelector('#settings-heading', { timeout: 5000 })

    // Switch to Light Mode
    const lightBtn = page.getByRole('button', { name: 'LIGHT', exact: true })
    await lightBtn.click()
    await page.waitForTimeout(300)

    // Verify data-theme attribute
    const themeAttr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    expect(themeAttr).toBe('light')

    // Screenshot settings modal in light mode
    await page.screenshot({ path: `${ARTIFACT_DIR}/light_mode_settings.png` })

    // Close Settings
    const closeBtn = page.locator('button[aria-label="Close settings"]')
    await closeBtn.click()
    await page.waitForTimeout(300)

    // Screenshot Campaign Map in light mode
    await page.screenshot({ path: `${ARTIFACT_DIR}/light_mode_campaign.png` })

    // Navigate to Free Play
    const freePlayNav = page.getByRole('button', { name: 'FREE PLAY' })
    await freePlayNav.click()
    await page.waitForSelector('.sudoku-board', { timeout: 20000 })
    await page.waitForTimeout(400)

    // Click a non-given cell
    const cell = page.locator('.sudoku-cell:not(.given)').first()
    if (await cell.count() > 0) {
      await cell.click()
      await page.waitForTimeout(200)
    }

    // Screenshot Sudoku Board in light mode
    await page.screenshot({ path: `${ARTIFACT_DIR}/light_mode_board.png` })

    // Switch to Solver Tab
    const solverTab = page.getByRole('button', { name: 'SOLVER' })
    if (await solverTab.count() > 0) {
      await solverTab.click()
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${ARTIFACT_DIR}/light_mode_solver.png` })
    }

    // Reset back to dark mode to keep tests isolated
    const settingsBtnReset = page.locator('button[aria-label="Open settings"]')
    if (await settingsBtnReset.count() > 0) {
      await settingsBtnReset.click()
      await page.waitForSelector('#settings-heading', { timeout: 5000 })
      const darkBtn = page.getByRole('button', { name: 'DARK', exact: true })
      await darkBtn.click()
      await page.waitForTimeout(300)
      const closeBtnReset = page.locator('button[aria-label="Close settings"]')
      await closeBtnReset.click()
      await page.waitForTimeout(200)
    }
  })
})
