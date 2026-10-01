import { test, expect } from '@playwright/test'

test.describe('Sudoku Web App E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => console.log(`[BROWSER LOG] ${msg.type()}: ${msg.text()}`))
    page.on('pageerror', (err) => console.log(`[BROWSER ERROR] ${err.message}`))
    await page.goto('/')
    await expect(page).toHaveTitle(/Sudoku/i)
  })

  test('default view is Levels mode with World 1 unlocked', async ({ page }) => {
    // Check that Campaign Map header is visible
    await expect(page.getByRole('heading', { name: /Campaign Map/i })).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('heading', { name: /World 1/i })).toBeVisible()

    // Level 1 button on map
    const level1Btn = page.getByRole('button', { name: /^Level 1,/i })
    await expect(level1Btn).toBeVisible()

    // Click Level 1 to enter play mode
    await level1Btn.click()

    // Board should appear with 81 cells
    const board = page.locator('.sudoku-board')
    await expect(board).toBeVisible({ timeout: 45000 })
    const cells = page.locator('.sudoku-cell')
    await expect(cells).toHaveCount(81)

    // Back to map button
    const backBtn = page.getByRole('button', { name: 'Quit to Map', exact: true })
    await expect(backBtn).toBeVisible()
    await backBtn.click()

    // Confirm modal
    const confirmBtn = page.getByRole('dialog').getByRole('button', { name: /Quit to Map/i })
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click()

    // Back on map
    await expect(page.getByRole('heading', { name: /Campaign Map/i })).toBeVisible()
  })

  test('Free Play mode supports difficulty change, notes, and undo/redo', async ({ page }) => {
    // Switch to Free Play tab
    const freePlayTab = page.getByRole('navigation').getByRole('button', { name: /Free Play/i })
    await freePlayTab.click()

    // Wait for board
    const board = page.locator('.sudoku-board')
    await expect(board).toBeVisible({ timeout: 25000 })
    const cells = page.locator('.sudoku-cell')
    await expect(cells).toHaveCount(81)

    // Find an empty cell (no .given class) and select it
    const emptyCell = page.locator('.sudoku-cell:not(.given)').first()
    await emptyCell.click()

    // Toggle Notes mode via 'n' shortcut
    await page.keyboard.press('n')

    // Press digit '5' via numberpad
    const num5Btn = page.getByRole('button', { name: /^Enter digit 5/i })
    await num5Btn.click()

    // In notes mode, candidate 5 should be displayed
    const candidate5 = emptyCell.locator('.candidate:has-text("5")')
    await expect(candidate5).toBeVisible()

    // Toggle Notes off via 'n' shortcut
    await page.keyboard.press('n')

    // Place digit 5 as value
    await num5Btn.click()
    await expect(emptyCell.locator('.cell-value')).toHaveText('5')

    // Click Undo
    const undoBtn = page.getByRole('button', { name: /Undo/i }).first()
    await undoBtn.click()

    // Value should be cleared back to candidate note
    await expect(emptyCell.locator('.cell-value')).toHaveCount(0)
    await expect(candidate5).toBeVisible()
  })

  test('Free Play mode integrates Watch Solver and compares Naive solver', async ({ page }) => {
    // Switch to Free Play tab via navbar
    const freePlayTab = page.getByRole('navigation').getByRole('button', { name: /Free Play/i })
    await freePlayTab.click()

    // Wait for board to load
    await expect(page.locator('.sudoku-board')).toBeVisible({ timeout: 25000 })

    // Click "Watch Solver" sub-tab in segmented control
    const watchSolverTab = page.getByRole('tab', { name: /Watch Solver/i })
    await expect(watchSolverTab).toBeVisible()
    await watchSolverTab.click()

    // Wait for solver execution to finish: SOLVER PLAYBACK controls appear when solveResult is ready
    await expect(page.getByText(/SOLVER PLAYBACK/i).first()).toBeVisible({ timeout: 45000 })

    // Step forward button is enabled
    const stepForwardBtn = page.getByRole('button', { name: /Next step/i })
    await expect(stepForwardBtn).toBeEnabled()
    await stepForwardBtn.click()

    // Compare Naive Backtracking
    const compareBtn = page.getByRole('button', { name: /Compare Naive/i })
    await expect(compareBtn).toBeVisible({ timeout: 20000 })
    await compareBtn.click()

    // Modal should appear
    await expect(page.getByRole('heading', { name: /Compare: Propagation vs Naive Search/i })).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('columnheader', { name: /With Propagation & MRV/i })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /Naive Backtracking/i })).toBeVisible()

    // Close modal
    const closeBtn = page.getByRole('button', { name: /Close comparison modal/i })
    await closeBtn.click()
    await expect(page.getByRole('heading', { name: /Compare: Propagation vs Naive Search/i })).toHaveCount(0)
  })

  test('URL routing and Home navigation work between /levels and /play', async ({ page }) => {
    // Start at /
    await page.goto('/')
    await expect(page).toHaveURL(/\/levels/)

    // Navigate to Free Play
    await page.getByRole('navigation').getByRole('button', { name: /Free Play/i }).click()
    await expect(page).toHaveURL(/\/play/)

    // Click Home button inside Free Play
    const homeBtn = page.getByRole('button', { name: /Home/i }).first()
    await expect(homeBtn).toBeVisible()
    await homeBtn.click()

    // URL should be back to /levels and Campaign Map displayed
    await expect(page).toHaveURL(/\/levels/)
    await expect(page.getByRole('heading', { name: /Campaign Map/i })).toBeVisible()
  })

  test('golden puzzle determinism matches CPython output in browser Pyodide', async ({ page }) => {
    // Navigate to Free Play with golden seed
    await page.goto('/play?diff=beginner&seed=golden-seed-0')
    await expect(page.locator('.sudoku-board')).toBeVisible({ timeout: 25000 })

    // Verify cell 0 has value 8 (matches first digit of golden puzzle '815.2...')
    const cell0 = page.locator('.sudoku-cell').nth(0)
    await expect(cell0.locator('.cell-value')).toHaveText('8')
    const cell1 = page.locator('.sudoku-cell').nth(1)
    await expect(cell1.locator('.cell-value')).toHaveText('1')
    const cell2 = page.locator('.sudoku-cell').nth(2)
    await expect(cell2.locator('.cell-value')).toHaveText('5')
  })

  test('Levels mode: Watch Solver stays in level and Submit Level completes it', async ({ page }) => {
    // Open Level 1 from Campaign Map
    const level1Btn = page.getByRole('button', { name: /^Level 1,/i })
    await expect(level1Btn).toBeVisible({ timeout: 20000 })
    await level1Btn.click()

    // Board appears
    await expect(page.locator('.sudoku-board')).toBeVisible({ timeout: 25000 })

    // Switch to Watch Solver mode inside the level (segmented control)
    const solverTab = page.getByRole('tab', { name: /Watch Solver/i })
    await expect(solverTab).toBeVisible()
    await solverTab.click()

    // Submit Level button appears once solver trace loads
    const submitBtn = page.getByRole('button', { name: /Submit Level/i }).first()
    await expect(submitBtn).toBeVisible({ timeout: 35000 })

    // Solver playback controls appear
    await expect(page.getByText(/SOLVER PLAYBACK/i).first()).toBeVisible()

    // Verify submit button is disabled while at initial unsolved frame
    await expect(submitBtn).toBeDisabled()

    // Step solver to the end
    const nextBtn = page.locator('button[aria-label="Step forward in solver playback"], button:has-text("NEXT")').first()
    while (await nextBtn.isEnabled()) {
      await nextBtn.click()
    }

    // Now that board is solved, Submit Level is enabled
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // Level Completion Modal should appear
    await expect(page.getByRole('heading', { name: /Level 1 Complete/i })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/3 stars awarded/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Next Level/i })).toBeVisible()
  })
})

