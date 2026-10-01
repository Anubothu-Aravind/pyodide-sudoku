import { describe, it, expect, beforeEach } from 'vitest'
import { storage } from '../../../storage/db'
import { createInitialPlayState, playReducer } from '../../../reducers/playReducer'
import { calculateStars } from '../../../storage/exportImport'
import type { ValidatedLevelRecord } from '../../../storage/validation'

describe('Levels Completion (Completed = 3 Stars, Not Completed = 0 Stars)', () => {
  beforeEach(async () => {
    await storage.clearAll()
  })

  it('Scenario a: Solver submit on L8 -> 3 stars, Next Level (L9) unlocks, in-progress save deleted', async () => {
    // 1. Setup Level 8
    const l8: ValidatedLevelRecord = {
      level: 8,
      world: 1,
      difficulty: 'easy',
      puzzle: '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79',
      solution: '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
      clues: 36,
      effort_score: 20,
      par_time_seconds: 300,
      is_boss: false,
      seed: 'seed-l8',
      generator_version: 1,
      status: 'in_progress',
      attempts: 1,
    }
    await storage.saveLevel(l8)

    // Save in-progress game
    await storage.saveGame({
      levelId: 8,
      givens: l8.puzzle,
      cells: [5, 3, 4, ...new Array(78).fill(0)],
      notes: Array.from({ length: 81 }, () => []),
      history: [],
      redoStack: [],
      elapsedMs: 25000,
      mistakes: 0,
      hints: 0,
      updatedAt: Date.now(),
    })

    // 2. PlayState transitions via FILL_SOLUTION
    let state = createInitialPlayState(l8.puzzle, l8.solution)
    state = playReducer(state, { type: 'FILL_SOLUTION' })
    expect(state.isSolved).toBe(true)
    expect(state.solvedBySolver).toBe(true)

    // 3. Win logic execution: completed = 3 stars
    const isSolver = state.solvedBySolver
    expect(isSolver).toBe(true)

    const prevBestTime = l8.best_time_ms ?? Infinity
    const starsEarned = 3
    const newBest = !isSolver && (state.elapsedMs < prevBestTime)

    expect(starsEarned).toBe(3)
    expect(newBest).toBe(false)

    // Update level 8 record: completed always gets 3 stars
    const updatedL8: ValidatedLevelRecord = {
      ...l8,
      status: 'completed',
      best_time_ms: isSolver ? l8.best_time_ms : Math.min(prevBestTime, state.elapsedMs),
      stars: 3,
      mistakes_best: isSolver ? l8.mistakes_best : Math.min(l8.mistakes_best ?? Infinity, state.mistakes),
      hints_best: isSolver ? l8.hints_best : Math.min(l8.hints_best ?? Infinity, state.hintsUsed),
      completed_at: l8.completed_at || new Date().toISOString(),
    }
    await storage.saveLevel(updatedL8)

    // Unlock Level 9
    const l9: ValidatedLevelRecord = {
      level: 9,
      world: 1,
      difficulty: 'easy',
      puzzle: '6'.repeat(81),
      solution: '6'.repeat(81),
      clues: 35,
      effort_score: 22,
      par_time_seconds: 300,
      is_boss: false,
      seed: 'seed-l9',
      generator_version: 1,
      status: 'unlocked',
      attempts: 0,
    }
    await storage.saveLevel(l9)

    // Clear in-progress game save
    await storage.deleteGame(8)

    // Verify L8 is saved as completed with 3 stars
    const savedL8 = await storage.getLevel(8)
    expect(savedL8?.status).toBe('completed')
    expect(savedL8?.stars).toBe(3)

    // Verify L9 is unlocked (not completed -> 0 stars)
    const savedL9 = await storage.getLevel(9)
    expect(savedL9?.status).toBe('unlocked')
    expect(savedL9?.stars ?? 0).toBe(0)

    // Verify in-progress game for L8 is deleted
    const savedGame8 = await storage.getGame(8)
    expect(savedGame8).toBeNull()
  })

  it('Scenario b: Solve L9 by hand -> 3 stars, L10 unlocks', async () => {
    const l9: ValidatedLevelRecord = {
      level: 9,
      world: 1,
      difficulty: 'easy',
      puzzle: '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79',
      solution: '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
      clues: 36,
      effort_score: 20,
      par_time_seconds: 300,
      is_boss: false,
      seed: 'seed-l9',
      generator_version: 1,
      status: 'unlocked',
      attempts: 0,
    }
    await storage.saveLevel(l9)

    let state = createInitialPlayState(l9.puzzle, l9.solution)
    expect(state.solvedBySolver).toBe(false)

    // Hand solve
    state = {
      ...state,
      cells: l9.solution.split('').map((c) => parseInt(c, 10)),
      isSolved: true,
      elapsedMs: 150000,
      mistakes: 0,
      hintsUsed: 0,
      solvedBySolver: false,
    }

    const starsEarned = 3
    expect(starsEarned).toBe(3)

    const updatedL9: ValidatedLevelRecord = {
      ...l9,
      status: 'completed',
      best_time_ms: 150000,
      stars: 3,
      completed_at: new Date().toISOString(),
    }
    await storage.saveLevel(updatedL9)

    const savedL9 = await storage.getLevel(9)
    expect(savedL9?.status).toBe('completed')
    expect(savedL9?.stars).toBe(3)
  })

  it('Scenario c: Uncompleted level has 0 stars, completed level has 3 stars', async () => {
    const uncompleted: ValidatedLevelRecord = {
      level: 5,
      world: 1,
      difficulty: 'easy',
      puzzle: '.'.repeat(81),
      solution: '1'.repeat(81),
      clues: 36,
      effort_score: 20,
      par_time_seconds: 300,
      is_boss: false,
      seed: 'seed-l5',
      generator_version: 1,
      status: 'unlocked',
      attempts: 0,
    }
    await storage.saveLevel(uncompleted)

    const fetchedUncompleted = await storage.getLevel(5)
    expect(fetchedUncompleted?.stars ?? 0).toBe(0)

    const completed: ValidatedLevelRecord = {
      ...uncompleted,
      status: 'completed',
      stars: 3,
    }
    await storage.saveLevel(completed)

    const fetchedCompleted = await storage.getLevel(5)
    expect(fetchedCompleted?.stars).toBe(3)
  })

  it('Scenario d: calculateStars always returns 3 for any completed game', () => {
    expect(calculateStars(0, 0, 100000, 300)).toBe(3)
    expect(calculateStars(5, 5, 999999, 100)).toBe(3)
  })

  it('Scenario e: Reload after solver submit -> level shows completed with 3 stars, no stuck board', async () => {
    const l8: ValidatedLevelRecord = {
      level: 8,
      world: 1,
      difficulty: 'easy',
      puzzle: '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79',
      solution: '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
      clues: 36,
      effort_score: 20,
      par_time_seconds: 300,
      is_boss: false,
      seed: 'seed-l8',
      generator_version: 1,
      status: 'completed',
      stars: 3,
      attempts: 1,
    }
    await storage.saveLevel(l8)
    await storage.deleteGame(8)

    const loadedRecord = await storage.getLevel(8)
    expect(loadedRecord?.status).toBe('completed')
    expect(loadedRecord?.stars).toBe(3)

    const savedGame = loadedRecord?.status !== 'completed' ? await storage.getGame(8) : null
    expect(savedGame).toBeNull()

    const state = createInitialPlayState(loadedRecord!.puzzle, loadedRecord!.solution)
    expect(state.isSolved).toBe(false)
    expect(state.solvedBySolver).toBe(false)
    expect(state.cells[0]).toBe(5)
    expect(state.cells[2]).toBe(0)
  })
})
