import { test, expect } from '@playwright/test'
import * as path from 'path'

const ARTIFACT_DIR = '/home/aravind/.gemini/antigravity-ide/brain/19c1013f-32ec-46c1-a8ce-0894b8cf1cd2'

test.describe('Candidate Sync & Restart Dialog E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Sudoku/i)
  })

  test('Restart confirmation dialog has readable buttons with high contrast and Esc handling', async ({ page }) => {
    // Open Level 1 from Campaign Map
    const level1Btn = page.getByRole('button', { name: /^Level 1,/i })
    await expect(level1Btn).toBeVisible({ timeout: 20000 })
    await level1Btn.click()

    // Board appears
    await expect(page.locator('.sudoku-board')).toBeVisible({ timeout: 25000 })

    // Click Restart button
    const restartTrigger = page.getByRole('button', { name: /Restart level/i })
    await expect(restartTrigger).toBeVisible()
    await restartTrigger.click()

    // Dialog appears
    const dialog = page.getByRole('dialog', { name: /Restart Level 1\?/i })
    await expect(dialog).toBeVisible({ timeout: 5000 })

    const keepPlayingBtn = dialog.getByRole('button', { name: /Keep Playing/i })
    const restartBtn = dialog.getByRole('button', { name: /^Restart$/i })

    await expect(keepPlayingBtn).toBeVisible()
    await expect(restartBtn).toBeVisible()

    // Verify initial focus is on "Keep Playing"
    await expect(keepPlayingBtn).toBeFocused()

    // Capture screenshot of the dialog in dark mode
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'restart_dialog_dark.png') })

    // Test Esc closes the dialog
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    // Reopen dialog and test Restart button execution
    await restartTrigger.click()
    await expect(dialog).toBeVisible()
    await restartBtn.click()
    await expect(dialog).toHaveCount(0)

    // Verify board is fully visible and not blank
    const board = page.locator('.sudoku-board')
    await expect(board).toBeVisible()
    const cells = page.locator('.sudoku-cell')
    await expect(cells).toHaveCount(81)
  })

  test('Restart from solver mode returns to Play Level with full board (no blank screen)', async ({ page }) => {
    // Open Level 1
    const level1Btn = page.getByRole('button', { name: /^Level 1,/i })
    await expect(level1Btn).toBeVisible({ timeout: 20000 })
    await level1Btn.click()

    await expect(page.locator('.sudoku-board')).toBeVisible({ timeout: 25000 })

    // Switch to Watch Solver mode
    const solverTab = page.getByRole('tab', { name: /Watch Solver/i })
    await expect(solverTab).toBeVisible()
    await solverTab.click()

    // Wait for solver controls to load
    await expect(page.getByText(/SOLVER PLAYBACK/i).first()).toBeVisible({ timeout: 35000 })

    // Click Restart button while in solver mode
    const restartTrigger = page.getByRole('button', { name: /Restart level/i })
    await expect(restartTrigger).toBeVisible()
    await restartTrigger.click()

    const dialog = page.getByRole('dialog', { name: /Restart Level 1\?/i })
    await expect(dialog).toBeVisible()

    // Click Restart in dialog
    const restartBtn = dialog.getByRole('button', { name: /^Restart$/i })
    await restartBtn.click()

    // Dialog closes
    await expect(dialog).toHaveCount(0)

    // Verify view returns to Play Level (Play Level tab active)
    const playTab = page.getByRole('tab', { name: /Play Level/i })
    await expect(playTab).toHaveClass(/active/)

    // Board must be fully rendered with all 81 cells visible (NOT empty / blank screen!)
    const board = page.locator('.sudoku-board')
    await expect(board).toBeVisible()
    const cells = page.locator('.sudoku-cell')
    await expect(cells).toHaveCount(81)

    // Verify clues are present
    const givens = page.locator('.sudoku-cell.given')
    const givenCount = await givens.count()
    expect(givenCount).toBeGreaterThan(0)
  })

  test('Candidate pencil marks visibly update and shrink as solver progresses', async ({ page }) => {
    // Navigate to Free Play
    await page.goto('/play?diff=easy&seed=test-candidates-0')
    await expect(page.locator('.sudoku-board')).toBeVisible({ timeout: 25000 })
    await expect(page.locator('.sudoku-cell.given').first()).toBeVisible({ timeout: 25000 })

    // Switch to Watch Solver
    const watchSolverTab = page.getByRole('tab', { name: /Watch Solver/i })
    await expect(watchSolverTab).toBeVisible()
    await watchSolverTab.click()

    // Wait for solver playback ready
    await expect(page.getByText(/SOLVER PLAYBACK/i).first()).toBeVisible({ timeout: 35000 })

    // Capture initial candidates screenshot at step 0
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'candidates_step_0.png') })

    // Count initial total candidate pencil marks rendered
    const initialCandidateMarks = await page.locator('.candidate:not([style*="opacity: 0"])').count()
    expect(initialCandidateMarks).toBeGreaterThan(20)

    // Step forward 5 times
    const nextBtn = page.getByRole('button', { name: /Next step/i })
    for (let i = 0; i < 5; i++) {
      if (await nextBtn.isEnabled()) {
        await nextBtn.click()
        await page.waitForTimeout(100)
      }
    }

    // Capture mid-playback screenshot
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'candidates_mid_playback.png') })

    // Candidate pencil marks should have updated/shrunk
    const midCandidateMarks = await page.locator('.candidate:not([style*="opacity: 0"])').count()
    expect(midCandidateMarks).toBeLessThan(initialCandidateMarks)
  })

  test('Free Play Reset button opens confirmation dialog, Cancel preserves state, Reset clears board', async ({ page }) => {
    // Navigate to Free Play
    await page.goto('/play?diff=easy&seed=test-free-reset-1')
    await expect(page.locator('.sudoku-board')).toBeVisible({ timeout: 25000 })

    // Find Reset button in Free Play header
    const resetTrigger = page.getByRole('button', { name: /Reset puzzle/i })
    await expect(resetTrigger).toBeVisible()

    // Select first empty cell and enter digit 5
    const emptyCell = page.locator('.sudoku-cell:not(.given)').first()
    await emptyCell.click()
    const num5Btn = page.getByRole('button', { name: /^Enter digit 5/i })
    await num5Btn.click()
    await expect(emptyCell.locator('.cell-value')).toHaveText('5')

    // Click Reset button -> Confirmation dialog appears, board has NOT changed
    await resetTrigger.click()
    const dialog = page.getByRole('dialog', { name: /Reset puzzle\?/i })
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(emptyCell.locator('.cell-value')).toHaveText('5')

    // Verify dialog content and centering
    const title = dialog.locator('#reset-dialog-title')
    await expect(title).toHaveText('Reset puzzle?')
    await expect(title).toHaveCSS('text-align', 'center')

    const desc = dialog.locator('p')
    await expect(desc).toHaveText('Your current progress on this puzzle will be cleared. This action cannot be undone.')
    await expect(desc).toHaveCSS('text-align', 'center')

    const cancelBtn = dialog.getByRole('button', { name: /Cancel/i })
    const confirmResetBtn = dialog.getByRole('button', { name: /^Reset$/i })
    await expect(cancelBtn).toBeVisible()
    await expect(confirmResetBtn).toBeVisible()

    // Verify focus moves to Cancel button
    await expect(cancelBtn).toBeFocused()

    // Test Esc closes dialog and preserves board
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(emptyCell.locator('.cell-value')).toHaveText('5')

    // Reopen dialog and test Cancel button preserves board
    await resetTrigger.click()
    await expect(dialog).toBeVisible()
    await cancelBtn.click()
    await expect(dialog).toHaveCount(0)
    await expect(emptyCell.locator('.cell-value')).toHaveText('5')

    // Reopen dialog and confirm Reset -> board resets and digit is cleared
    await resetTrigger.click()
    await expect(dialog).toBeVisible()
    await confirmResetBtn.click()
    await expect(dialog).toHaveCount(0)
    await expect(emptyCell.locator('.cell-value')).toHaveCount(0)

    // Test variant preservation: select Diagonal
    const variantSelect = page.locator('select[title="Sudoku variant"]')
    await variantSelect.selectOption('diagonal')
    await page.waitForTimeout(600)
    const cell0 = page.locator('[role="gridcell"]').first()
    await expect(cell0).toHaveCSS('background-color', /rgba\((78,\s*161,\s*255,\s*0\.07|29,\s*78,\s*216,\s*0\.06)\)/)

    // Enter digit in diagonal mode
    const diagEmptyCell = page.locator('.sudoku-cell:not(.given)').first()
    await diagEmptyCell.click()
    await num5Btn.click()
    await expect(diagEmptyCell.locator('.cell-value')).toHaveText('5')

    // Click Reset and confirm
    await resetTrigger.click()
    await expect(dialog).toBeVisible()
    await confirmResetBtn.click()
    await expect(dialog).toHaveCount(0)

    // Verify board cleared, but variant remains Diagonal
    await expect(diagEmptyCell.locator('.cell-value')).toHaveCount(0)
    await expect(variantSelect).toHaveValue('diagonal')
    await expect(cell0).toHaveCSS('background-color', /rgba\((78,\s*161,\s*255,\s*0\.07|29,\s*78,\s*216,\s*0\.06)\)/)
  })
})
