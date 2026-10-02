/**
 * Zod validation schemas for all storage records and export/import formats.
 */

import { z } from 'zod'

export const DifficultySchema = z.enum(['beginner', 'easy', 'medium', 'hard', 'expert'])

export const LevelStatusSchema = z.enum(['locked', 'unlocked', 'in_progress', 'completed'])

export const LevelRecordSchema = z.object({
  level: z.number().int().positive(),
  world: z.number().int().positive(),
  difficulty: DifficultySchema,
  puzzle: z.string().length(81),
  solution: z.string().length(81),
  clues: z.number().int().min(17).max(81),
  effort_score: z.number(),
  par_time_seconds: z.number().positive(),
  is_boss: z.boolean(),
  seed: z.string(),
  generator_version: z.number().int().positive(),
  status: LevelStatusSchema,
  best_time_ms: z.number().min(0).optional(),
  stars: z.number().int().min(0).max(3).optional(),
  mistakes_best: z.number().int().min(0).optional(),
  hints_best: z.number().int().min(0).optional(),
  attempts: z.number().int().min(0),
  completed_at: z.string().optional(),
  fallback: z.boolean().optional(),
})

export const GameSaveStateSchema = z.object({
  levelId: z.union([z.number().int().positive(), z.literal('free')]),
  givens: z.string().length(81),
  cells: z.array(z.number().int().min(0).max(9)).length(81),
  notes: z.array(z.array(z.number().int().min(1).max(9))).length(81),
  history: z.array(
    z.object({
      cells: z.array(z.number().int().min(0).max(9)).length(81),
      notes: z.array(z.array(z.number().int().min(1).max(9))).length(81),
    })
  ),
  redoStack: z.array(
    z.object({
      cells: z.array(z.number().int().min(0).max(9)).length(81),
      notes: z.array(z.array(z.number().int().min(1).max(9))).length(81),
    })
  ),
  elapsedMs: z.number().min(0),
  mistakes: z.number().int().min(0),
  hints: z.number().int().min(0),
  updatedAt: z.number().positive(),
})

export const UserStatsSchema = z.object({
  totalSolved: z.number().int().min(0),
  totalTimeMs: z.number().min(0),
  currentStreakDays: z.number().int().min(0),
  bestStreakDays: z.number().int().min(0),
  lastPlayedDate: z.string().nullable(),
  solvedByDifficulty: z.record(DifficultySchema, z.number().int().min(0)),
  fastestByDifficulty: z.record(DifficultySchema, z.number().int().min(0)),
})

export const UserSettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  highlightConflicts: z.boolean(),
  autoRemoveNotes: z.boolean(),
  quietScreenReader: z.boolean(),
  soundEnabled: z.boolean(),
  showRemainingCounts: z.boolean().default(false),
  enableHints: z.boolean().default(true),
})

export const SolverHistoryItemSchema = z.object({
  id: z.string(),
  puzzle: z.string().length(81),
  timestamp: z.number().positive(),
})

export const ExportDataSchema = z.object({
  schemaVersion: z.number().int().positive(),
  generatorVersion: z.number().int().positive(),
  exportedAt: z.string(),
  levels: z.array(LevelRecordSchema),
  stats: UserStatsSchema,
  settings: UserSettingsSchema,
})

export type ValidatedLevelRecord = z.infer<typeof LevelRecordSchema>
export type ValidatedGameSaveState = z.infer<typeof GameSaveStateSchema>
export type ValidatedUserStats = z.infer<typeof UserStatsSchema>
export type ValidatedUserSettings = z.infer<typeof UserSettingsSchema>
export type ValidatedExportData = z.infer<typeof ExportDataSchema>
