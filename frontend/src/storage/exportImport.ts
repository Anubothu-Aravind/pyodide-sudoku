/**
 * Export and Import logic for user progress, levels, stats, and settings.
 * Includes preview generation, schema validation, star calculation, and merge/replace algorithms.
 */

import { storage, DB_VERSION, GENERATOR_VERSION } from './db'
import {
  ExportDataSchema,
  type ValidatedExportData,
  type ValidatedLevelRecord,
  type ValidatedUserStats,
} from './validation'

export interface ImportPreview {
  valid: boolean
  levelsCount: number
  completedLevels: number
  totalStars: number
  currentStreak: number
  highestLevel: number
  error?: string
}

export function calculateStars(
  _mistakes?: number,
  _hints?: number,
  _timeMs?: number,
  _parTimeSeconds?: number
): number {
  return 3
}

export async function exportProgress(): Promise<string> {
  const levels = await storage.getAllLevels()
  const stats = await storage.getStats()
  const settings = await storage.getSettings()

  const exportObj: ValidatedExportData = {
    schemaVersion: DB_VERSION,
    generatorVersion: GENERATOR_VERSION,
    exportedAt: new Date().toISOString(),
    levels,
    stats,
    settings,
  }

  return JSON.stringify(exportObj, null, 2)
}

export function validateImportJson(jsonString: string): {
  success: boolean
  data?: ValidatedExportData
  preview?: ImportPreview
  error?: string
} {
  try {
    const raw = JSON.parse(jsonString)
    const result = ExportDataSchema.safeParse(raw)

    if (!result.success) {
      return {
        success: false,
        error: `Validation error: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
      }
    }

    const data = result.data
    const completed = data.levels.filter((l) => l.status === 'completed')
    const totalStars = completed.reduce((sum, l) => sum + (l.stars || 0), 0)
    const highestLevel = data.levels.reduce((max, l) => Math.max(max, l.level), 1)

    const preview: ImportPreview = {
      valid: true,
      levelsCount: data.levels.length,
      completedLevels: completed.length,
      totalStars,
      currentStreak: data.stats.currentStreakDays,
      highestLevel,
    }

    return {
      success: true,
      data,
      preview,
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Invalid JSON format: ${err?.message || String(err)}`,
    }
  }
}

export async function applyImport(
  data: ValidatedExportData,
  mode: 'replace' | 'merge'
): Promise<void> {
  if (mode === 'replace') {
    await storage.clearAll()

    // Write all imported levels
    for (const lvl of data.levels) {
      await storage.saveLevel(lvl)
    }
    await storage.saveStats(data.stats)
    await storage.saveSettings(data.settings)
    return
  }

  // --- MERGE MODE ---
  const currentLevels = await storage.getAllLevels()
  const currentLevelMap = new Map<number, ValidatedLevelRecord>()
  for (const l of currentLevels) {
    currentLevelMap.set(l.level, l)
  }

  for (const impLvl of data.levels) {
    const existing = currentLevelMap.get(impLvl.level)
    if (!existing) {
      await storage.saveLevel(impLvl)
      continue
    }

    // Merge individual level records: pick best result
    const merged = mergeLevelRecords(existing, impLvl)
    await storage.saveLevel(merged)
  }

  // Merge stats: keep best streak and higher total solved
  const currentStats = await storage.getStats()
  const mergedStats = mergeUserStats(currentStats, data.stats)
  await storage.saveStats(mergedStats)
}

function mergeLevelRecords(
  a: ValidatedLevelRecord,
  b: ValidatedLevelRecord
): ValidatedLevelRecord {
  // If only one is completed, keep completed
  if (a.status === 'completed' && b.status !== 'completed') return a
  if (b.status === 'completed' && a.status !== 'completed') return b

  if (a.status !== 'completed' && b.status !== 'completed') {
    // If either is unlocked or in_progress, prefer higher status
    const statusPriority = { locked: 0, unlocked: 1, in_progress: 2, completed: 3 }
    const bestStatus = statusPriority[a.status] >= statusPriority[b.status] ? a.status : b.status
    return {
      ...a,
      status: bestStatus,
      attempts: Math.max(a.attempts, b.attempts),
    }
  }

  // Both are completed: compare stars and time
  const aStars = a.stars ?? 0
  const bStars = b.stars ?? 0

  let chosen = a
  if (bStars > aStars) {
    chosen = b
  } else if (bStars === aStars) {
    const aTime = a.best_time_ms ?? Infinity
    const bTime = b.best_time_ms ?? Infinity
    chosen = bTime < aTime ? b : a
  }

  const res: ValidatedLevelRecord = {
    ...chosen,
    attempts: Math.max(a.attempts, b.attempts),
  }

  const mList = [a.mistakes_best, b.mistakes_best].filter((v): v is number => v !== undefined)
  if (mList.length > 0) {
    res.mistakes_best = Math.min(...mList)
  }

  const hList = [a.hints_best, b.hints_best].filter((v): v is number => v !== undefined)
  if (hList.length > 0) {
    res.hints_best = Math.min(...hList)
  }

  return res
}

function mergeUserStats(
  a: ValidatedUserStats,
  b: ValidatedUserStats
): ValidatedUserStats {
  const difficulties = ['beginner', 'easy', 'medium', 'hard', 'expert'] as const
  const solvedByDiff = { ...a.solvedByDifficulty }
  const fastestByDiff = { ...a.fastestByDifficulty }

  for (const diff of difficulties) {
    solvedByDiff[diff] = Math.max(a.solvedByDifficulty[diff] || 0, b.solvedByDifficulty[diff] || 0)
    const tA = a.fastestByDifficulty[diff] || 0
    const tB = b.fastestByDifficulty[diff] || 0
    if (tA === 0) fastestByDiff[diff] = tB
    else if (tB === 0) fastestByDiff[diff] = tA
    else fastestByDiff[diff] = Math.min(tA, tB)
  }

  return {
    totalSolved: Math.max(a.totalSolved, b.totalSolved),
    totalTimeMs: Math.max(a.totalTimeMs, b.totalTimeMs),
    currentStreakDays: Math.max(a.currentStreakDays, b.currentStreakDays),
    bestStreakDays: Math.max(a.bestStreakDays, b.bestStreakDays),
    lastPlayedDate: [a.lastPlayedDate, b.lastPlayedDate]
      .filter(Boolean)
      .sort()
      .pop() || null,
    solvedByDifficulty: solvedByDiff,
    fastestByDifficulty: fastestByDiff,
  }
}
