import { test, expect } from '@playwright/test'

const ARTIFACT_DIR = '/home/aravind/.gemini/antigravity-ide/brain/19c1013f-32ec-46c1-a8ce-0894b8cf1cd2'

test.describe('Responsive Layout & Screenshot Verification', () => {
  // Campaign Map Screenshots
  const mapViewports = [
    { name: 'campaign_390px', width: 390, height: 844 },
    { name: 'campaign_768px', width: 768, height: 1024 },
    { name: 'campaign_1280px', width: 1280, height: 800 },
    { name: 'campaign_1920px', width: 1920, height: 1080 },
  ]

  for (const vp of mapViewports) {
    test(`Campaign Map at ${vp.width}px (${vp.name})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/#levels')
      await page.waitForSelector('.campaign-worlds-grid', { timeout: 15000 })
      await page.waitForTimeout(600) // allow smooth scroll to complete

      // Verify no horizontal scrollbar
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth
      })
      expect(hasHorizontalScroll).toBe(false)

      await page.screenshot({
        path: `${ARTIFACT_DIR}/${vp.name}.png`,
        fullPage: false,
      })
    })
  }

  // Viewports for Free Play and Level Views
  const gameViewports = [
    { name: '390x844', width: 390, height: 844 },
    { name: '768x1024', width: 768, height: 1024 },
    { name: '1280x720', width: 1280, height: 720 },
    { name: '1366x768', width: 1366, height: 768 },
    { name: '1920x1080', width: 1920, height: 1080 },
  ]

  // Free Play: Play Mode & Solver Mode
  for (const vp of gameViewports) {
    test(`Free Play at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/play')
      await page.waitForSelector('.sudoku-board', { timeout: 25000 })
      await page.waitForTimeout(400)

      // Check no horizontal scrollbar in play mode
      const hasHScrollPlay = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth
      })
      expect(hasHScrollPlay).toBe(false)

      await page.screenshot({
        path: `${ARTIFACT_DIR}/freeplay_play_${vp.name}.png`,
        fullPage: false,
      })

      // Switch to Watch Solver
      const watchSolverTab = page.locator('button[role="tab"]:has-text("Watch Solver")')
      await watchSolverTab.click()
      await page.waitForSelector('.panel-playback-section', { timeout: 15000 })
      await page.waitForTimeout(400)

      // Check no horizontal scrollbar in solver mode
      const hasHScrollSolver = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth
      })
      expect(hasHScrollSolver).toBe(false)

      // At 1366x768, verify board and playback controls are fully in viewport
      if (vp.width >= 1000) {
        const boardVisible = await page.locator('.sudoku-board').isVisible()
        const playbackVisible = await page.locator('.panel-playback-section').isVisible()
        expect(boardVisible).toBe(true)
        expect(playbackVisible).toBe(true)

        // Verify board bottom is within viewport height
        const boardBox = await page.locator('.sudoku-board').boundingBox()
        if (boardBox) {
          expect(boardBox.y + boardBox.height).toBeLessThanOrEqual(vp.height + 50)
        }
      }

      await page.screenshot({
        path: `${ARTIFACT_DIR}/freeplay_solver_${vp.name}.png`,
        fullPage: false,
      })
    })
  }

  // Level View: Play Mode & Solver Mode
  for (const vp of gameViewports) {
    test(`Level View at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/#levels')
      await page.waitForSelector('.campaign-worlds-grid', { timeout: 15000 })

      // Click Continue Level 1 or level 1 tile
      const continueBtn = page.locator('button:has-text("Continue Level 1")')
      if (await continueBtn.isVisible()) {
        await continueBtn.click()
      } else {
        await page.locator('button[aria-label*="Level 1"]').first().click()
      }

      await page.waitForSelector('.sudoku-board', { timeout: 15000 })
      await page.waitForTimeout(300)

      // Check no horizontal scrollbar in play mode
      const hasHScrollPlay = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth
      })
      expect(hasHScrollPlay).toBe(false)

      await page.screenshot({
        path: `${ARTIFACT_DIR}/level_play_${vp.name}.png`,
        fullPage: false,
      })

      // Switch to Watch Solver
      const watchSolverTab = page.locator('button[role="tab"]:has-text("Watch Solver")')
      await watchSolverTab.click()
      await page.waitForSelector('.panel-playback-section', { timeout: 15000 })
      await page.waitForTimeout(400)

      // Check no horizontal scrollbar in solver mode
      const hasHScrollSolver = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth
      })
      expect(hasHScrollSolver).toBe(false)

      // Verify submit button is present in solver mode
      const submitBtn = page.locator('button:has-text("Submit Level")')
      await expect(submitBtn).toBeVisible()

      await page.screenshot({
        path: `${ARTIFACT_DIR}/level_solver_${vp.name}.png`,
        fullPage: false,
      })
    })
  }

  test('confirm Submit disabled until solver finishes, and solver plays through', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 })
    await page.goto('/')
    await page.locator('button[aria-label*="Level 1"]').first().click()
    await page.waitForSelector('.sudoku-board', { timeout: 15000 })

    // Open solver
    const watchSolverTab = page.locator('button[role="tab"]:has-text("Watch Solver")')
    await watchSolverTab.click()

    // Solver playback controls appear
    const playbackSection = page.locator('.panel-playback-section')
    await expect(playbackSection).toBeVisible({ timeout: 20000 })

    const playPauseBtn = playbackSection.locator('button[aria-label*="play" i], button[aria-label*="pause" i]').first()
    await expect(playPauseBtn).toBeVisible()

    // Initially, submit button should be disabled because the solver hasn't finished yet
    const submitBtn = page.locator('button:has-text("Submit Level")')
    await expect(submitBtn).toBeDisabled()

    // Set speed to 50x for fast playback
    const speed50xBtn = playbackSection.locator('button:has-text("50×")')
    await speed50xBtn.click()

    // Start playback and wait for solver to finish
    await playPauseBtn.click()

    // Submit button becomes enabled once solver finishes
    await expect(submitBtn).toBeEnabled({ timeout: 20000 })

    // Click submit level
    await submitBtn.click()

    // Completion modal should appear with 3 stars awarded
    await expect(page.getByRole('heading', { name: /Level 1 Complete/i })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/3 stars awarded/i)).toBeVisible()
  })
})
