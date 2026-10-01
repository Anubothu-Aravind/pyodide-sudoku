import { describe, it, expect, beforeEach } from 'vitest'
import { storage } from '../db'
import { calculateStars, validateImportJson, applyImport } from '../exportImport'
import type { ValidatedLevelRecord } from '../validation'

describe('Storage Layer & Export/Import', () => {
  beforeEach(async () => {
    await storage.clearAll()
  })

  it('calculates 3 stars for any completed level', () => {
    const parSeconds = 300 // 5 minutes
    expect(calculateStars(0, 0, 299000, parSeconds)).toBe(3)
    expect(calculateStars(0, 0, 301000, parSeconds)).toBe(3)
    expect(calculateStars(1, 0, 120000, parSeconds)).toBe(3)
    expect(calculateStars(3, 4, 999999, parSeconds)).toBe(3)
  })

  it('saves and retrieves level records accurately', async () => {
    const level1: ValidatedLevelRecord = {
      level: 1,
      world: 1,
      difficulty: 'beginner',
      puzzle: '.'.repeat(81),
      solution: '1'.repeat(81),
      clues: 40,
      effort_score: 12.5,
      par_time_seconds: 240,
      is_boss: false,
      seed: 'lvl-1-v1',
      generator_version: 1,
      status: 'completed',
      best_time_ms: 180000,
      stars: 3,
      mistakes_best: 0,
      hints_best: 0,
      attempts: 1,
    }

    await storage.saveLevel(level1)
    const fetched = await storage.getLevel(1)
    expect(fetched).toEqual(level1)
  })

  it('validates import JSON and generates accurate preview', () => {
    const validJson = JSON.stringify({
      schemaVersion: 1,
      generatorVersion: 1,
      exportedAt: new Date().toISOString(),
      levels: [
        {
          level: 1,
          world: 1,
          difficulty: 'beginner',
          puzzle: '.'.repeat(81),
          solution: '1'.repeat(81),
          clues: 40,
          effort_score: 12.5,
          par_time_seconds: 240,
          is_boss: false,
          seed: 'lvl-1-v1',
          generator_version: 1,
          status: 'completed',
          stars: 3,
          best_time_ms: 150000,
          attempts: 1,
        },
      ],
      stats: {
        totalSolved: 1,
        totalTimeMs: 150000,
        currentStreakDays: 1,
        bestStreakDays: 1,
        lastPlayedDate: '2026-09-30',
        solvedByDifficulty: { beginner: 1, easy: 0, medium: 0, hard: 0, expert: 0 },
        fastestByDifficulty: { beginner: 150000, easy: 0, medium: 0, hard: 0, expert: 0 },
      },
      settings: {
        theme: 'dark',
        highlightConflicts: true,
        autoRemoveNotes: true,
        quietScreenReader: false,
        soundEnabled: true,
      },
    })

    const result = validateImportJson(validJson)
    expect(result.success).toBe(true)
    expect(result.preview?.levelsCount).toBe(1)
    expect(result.preview?.totalStars).toBe(3)
    expect(result.preview?.completedLevels).toBe(1)

    // Corrupted JSON
    const corruptedResult = validateImportJson('{ invalid json')
    expect(corruptedResult.success).toBe(false)
  })

  it('merges level progress preserving best stars and times', async () => {
    const existingLevel: ValidatedLevelRecord = {
      level: 2,
      world: 1,
      difficulty: 'beginner',
      puzzle: '.'.repeat(81),
      solution: '2'.repeat(81),
      clues: 42,
      effort_score: 13.0,
      par_time_seconds: 240,
      is_boss: false,
      seed: 'lvl-2-v1',
      generator_version: 1,
      status: 'completed',
      stars: 2,
      best_time_ms: 200000,
      attempts: 2,
    }
    await storage.saveLevel(existingLevel)

    const importedData = {
      schemaVersion: 1,
      generatorVersion: 1,
      exportedAt: new Date().toISOString(),
      levels: [
        {
          ...existingLevel,
          stars: 3, // better stars!
          best_time_ms: 170000, // faster time!
          attempts: 1,
        },
      ],
      stats: {
        totalSolved: 5,
        totalTimeMs: 500000,
        currentStreakDays: 2,
        bestStreakDays: 2,
        lastPlayedDate: '2026-09-30',
        solvedByDifficulty: { beginner: 5, easy: 0, medium: 0, hard: 0, expert: 0 },
        fastestByDifficulty: { beginner: 170000, easy: 0, medium: 0, hard: 0, expert: 0 },
      },
      settings: {
        theme: 'light' as const,
        highlightConflicts: false,
        autoRemoveNotes: false,
        quietScreenReader: true,
        soundEnabled: false,
      },
    }

    await applyImport(importedData, 'merge')

    const merged = await storage.getLevel(2)
    expect(merged?.stars).toBe(3)
    expect(merged?.best_time_ms).toBe(170000)
    expect(merged?.attempts).toBe(2) // max of attempts
  })

  it('allows saving and retrieving a level completed with 0 stars', async () => {
    const level8: ValidatedLevelRecord = {
      level: 8,
      world: 1,
      difficulty: 'easy',
      puzzle: '.'.repeat(81),
      solution: '1'.repeat(81),
      clues: 36,
      effort_score: 25.0,
      par_time_seconds: 300,
      is_boss: false,
      seed: 'lvl-8-v1',
      generator_version: 1,
      status: 'completed',
      best_time_ms: undefined,
      stars: 0,
      mistakes_best: undefined,
      hints_best: undefined,
      attempts: 1,
      completed_at: new Date().toISOString(),
    }

    await storage.saveLevel(level8)
    const fetched = await storage.getLevel(8)
    expect(fetched).not.toBeNull()
    expect(fetched?.status).toBe('completed')
    expect(fetched?.stars).toBe(0)
  })

  it('preserves 3 stars and best time when a solver submit occurs on an already completed level', async () => {
    const existingLevel: ValidatedLevelRecord = {
      level: 8,
      world: 1,
      difficulty: 'easy',
      puzzle: '.'.repeat(81),
      solution: '1'.repeat(81),
      clues: 36,
      effort_score: 25.0,
      par_time_seconds: 300,
      is_boss: false,
      seed: 'lvl-8-v1',
      generator_version: 1,
      status: 'completed',
      best_time_ms: 120000,
      stars: 3,
      mistakes_best: 0,
      hints_best: 0,
      attempts: 1,
      completed_at: new Date().toISOString(),
    }
    await storage.saveLevel(existingLevel)

    // Solver submit simulation on existing level
    const prevBestTime = existingLevel.best_time_ms ?? Infinity
    const prevBestStars = existingLevel.stars ?? 0
    const isSolver = true

    const updatedRecord: ValidatedLevelRecord = {
      ...existingLevel,
      status: 'completed',
      best_time_ms: isSolver ? existingLevel.best_time_ms : Math.min(prevBestTime, 999999),
      stars: isSolver ? prevBestStars : Math.max(prevBestStars, 0),
      mistakes_best: isSolver ? existingLevel.mistakes_best : 0,
      hints_best: isSolver ? existingLevel.hints_best : 0,
      completed_at: existingLevel.completed_at || new Date().toISOString(),
    }
    await storage.saveLevel(updatedRecord)

    const saved = await storage.getLevel(8)
    expect(saved?.stars).toBe(3)
    expect(saved?.best_time_ms).toBe(120000)
    expect(saved?.mistakes_best).toBe(0)
  })
})

