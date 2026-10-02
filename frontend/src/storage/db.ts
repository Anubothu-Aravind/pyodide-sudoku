/**
 * IndexedDB storage layer using `idb` with migrations, schema validation,
 * corruption quarantine, and in-memory/localStorage fallback.
 */

import { openDB, type IDBPDatabase } from 'idb'
import {
  LevelRecordSchema,
  GameSaveStateSchema,
  UserStatsSchema,
  UserSettingsSchema,
  type ValidatedLevelRecord,
  type ValidatedGameSaveState,
  type ValidatedUserStats,
  type ValidatedUserSettings,
} from './validation'

export const DB_NAME = 'sudoku_db'
export const DB_VERSION = 1
export const GENERATOR_VERSION = 1

export const DEFAULT_SETTINGS: ValidatedUserSettings = {
  theme: 'system',
  highlightConflicts: true,
  autoRemoveNotes: true,
  quietScreenReader: false,
  soundEnabled: true,
  showRemainingCounts: false,
  enableHints: true,
}

export const DEFAULT_STATS: ValidatedUserStats = {
  totalSolved: 0,
  totalTimeMs: 0,
  currentStreakDays: 0,
  bestStreakDays: 0,
  lastPlayedDate: null,
  solvedByDifficulty: {
    beginner: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    expert: 0,
  },
  fastestByDifficulty: {
    beginner: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    expert: 0,
  },
}

class StorageManager {
  private dbPromise: Promise<IDBPDatabase | null> | null = null
  private isStorageAvailable: boolean = true
  private memFallback = new Map<string, Map<any, any>>()

  constructor() {
    this.memFallback.set('meta', new Map())
    this.memFallback.set('levels', new Map())
    this.memFallback.set('games', new Map())
    this.memFallback.set('stats', new Map())
    this.memFallback.set('settings', new Map())
    this.memFallback.set('solverHistory', new Map())
    this.memFallback.set('quarantine', new Map())
  }

  private async getDB(): Promise<IDBPDatabase | null> {
    if (!this.isStorageAvailable) return null
    if (this.dbPromise) return this.dbPromise

    try {
      if (typeof window === 'undefined' || !window.indexedDB) {
        this.isStorageAvailable = false
        return null
      }

      this.dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, _newVersion, transaction) {
          // Schema Migration Chain: v0 -> v1
          if (oldVersion < 1) {
            db.createObjectStore('meta')
            db.createObjectStore('levels', { keyPath: 'level' })
            db.createObjectStore('games', { keyPath: 'levelId' })
            db.createObjectStore('stats')
            db.createObjectStore('settings')
            db.createObjectStore('solverHistory', { keyPath: 'id' })
            db.createObjectStore('quarantine', { autoIncrement: true })

            // Initialize meta
            const metaStore = transaction.objectStore('meta')
            metaStore.put(
              {
                schemaVersion: DB_VERSION,
                createdAt: new Date().toISOString(),
                generatorVersion: GENERATOR_VERSION,
              },
              'schema'
            )
          }
        },
      })

      const db = await this.dbPromise
      return db
    } catch (err) {
      console.warn('IndexedDB unavailable or blocked. Falling back to in-memory storage.', err)
      this.isStorageAvailable = false
      return null
    }
  }

  public get storageAvailable(): boolean {
    return this.isStorageAvailable
  }

  // --- SETTINGS ---
  public async getSettings(): Promise<ValidatedUserSettings> {
    const db = await this.getDB()
    if (!db) {
      const val = this.memFallback.get('settings')?.get('user_settings')
      return val ? { ...DEFAULT_SETTINGS, ...val } : { ...DEFAULT_SETTINGS }
    }
    const val = await db.get('settings', 'user_settings')
    if (!val) return { ...DEFAULT_SETTINGS }
    const parsed = UserSettingsSchema.safeParse(val)
    if (parsed.success) return parsed.data
    // Quarantined bad record
    await this.quarantineRecord('settings', 'user_settings', val, parsed.error.message)
    return { ...DEFAULT_SETTINGS }
  }

  public async saveSettings(settings: ValidatedUserSettings): Promise<void> {
    const parsed = UserSettingsSchema.parse(settings)
    const db = await this.getDB()
    if (!db) {
      this.memFallback.get('settings')?.set('user_settings', parsed)
      return
    }
    await db.put('settings', parsed, 'user_settings')
  }

  // --- STATS ---
  public async getStats(): Promise<ValidatedUserStats> {
    const db = await this.getDB()
    if (!db) {
      const val = this.memFallback.get('stats')?.get('user_stats')
      return val ? { ...DEFAULT_STATS, ...val } : { ...DEFAULT_STATS }
    }
    const val = await db.get('stats', 'user_stats')
    if (!val) return { ...DEFAULT_STATS }
    const parsed = UserStatsSchema.safeParse(val)
    if (parsed.success) return parsed.data
    await this.quarantineRecord('stats', 'user_stats', val, parsed.error.message)
    return { ...DEFAULT_STATS }
  }

  public async saveStats(stats: ValidatedUserStats): Promise<void> {
    const parsed = UserStatsSchema.parse(stats)
    const db = await this.getDB()
    if (!db) {
      this.memFallback.get('stats')?.set('user_stats', parsed)
      return
    }
    await db.put('stats', parsed, 'user_stats')
  }

  // --- LEVELS ---
  public async getLevel(levelNumber: number): Promise<ValidatedLevelRecord | null> {
    const db = await this.getDB()
    let val: any
    if (!db) {
      val = this.memFallback.get('levels')?.get(levelNumber)
    } else {
      val = await db.get('levels', levelNumber)
    }
    if (!val) return null

    const parsed = LevelRecordSchema.safeParse(val)
    if (parsed.success) return parsed.data

    await this.quarantineRecord('levels', levelNumber, val, parsed.error.message)
    return null
  }

  public async getAllLevels(): Promise<ValidatedLevelRecord[]> {
    const db = await this.getDB()
    let all: any[]
    if (!db) {
      all = Array.from(this.memFallback.get('levels')?.values() || [])
    } else {
      all = await db.getAll('levels')
    }

    const valid: ValidatedLevelRecord[] = []
    for (const item of all) {
      const parsed = LevelRecordSchema.safeParse(item)
      if (parsed.success) {
        valid.push(parsed.data)
      } else {
        await this.quarantineRecord('levels', item?.level || 'unknown', item, parsed.error.message)
      }
    }
    return valid.sort((a, b) => a.level - b.level)
  }

  public async saveLevel(record: ValidatedLevelRecord): Promise<void> {
    const parsed = LevelRecordSchema.parse(record)
    const db = await this.getDB()
    if (!db) {
      this.memFallback.get('levels')?.set(parsed.level, parsed)
      return
    }
    await db.put('levels', parsed)

    // Request persistent storage on first level completion
    if (parsed.status === 'completed' && typeof navigator !== 'undefined' && navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {})
    }
  }

  // --- IN-PROGRESS GAMES ---
  public async getGame(levelId: number | 'free'): Promise<ValidatedGameSaveState | null> {
    const db = await this.getDB()
    let val: any
    if (!db) {
      val = this.memFallback.get('games')?.get(levelId)
    } else {
      val = await db.get('games', levelId)
    }
    if (!val) return null

    const parsed = GameSaveStateSchema.safeParse(val)
    if (parsed.success) return parsed.data

    await this.quarantineRecord('games', levelId, val, parsed.error.message)
    return null
  }

  public async saveGame(gameState: ValidatedGameSaveState): Promise<void> {
    const parsed = GameSaveStateSchema.parse(gameState)
    const db = await this.getDB()
    if (!db) {
      this.memFallback.get('games')?.set(parsed.levelId, parsed)
      return
    }
    await db.put('games', parsed)
  }

  public async deleteGame(levelId: number | 'free'): Promise<void> {
    const db = await this.getDB()
    if (!db) {
      this.memFallback.get('games')?.delete(levelId)
      return
    }
    await db.delete('games', levelId)
  }

  // --- SOLVER HISTORY ---
  public async addSolverHistory(puzzle: string): Promise<void> {
    const item = {
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      puzzle,
      timestamp: Date.now(),
    }
    const db = await this.getDB()
    if (!db) {
      this.memFallback.get('solverHistory')?.set(item.id, item)
      return
    }
    await db.put('solverHistory', item)

    // Limit to latest 20 items
    const all = await db.getAll('solverHistory')
    if (all.length > 20) {
      all.sort((a, b) => a.timestamp - b.timestamp)
      const toDelete = all.slice(0, all.length - 20)
      for (const d of toDelete) {
        await db.delete('solverHistory', d.id)
      }
    }
  }

  public async getSolverHistory(): Promise<{ id: string; puzzle: string; timestamp: number }[]> {
    const db = await this.getDB()
    let all: any[]
    if (!db) {
      all = Array.from(this.memFallback.get('solverHistory')?.values() || [])
    } else {
      all = await db.getAll('solverHistory')
    }
    return all.sort((a, b) => b.timestamp - a.timestamp)
  }

  // --- QUARANTINE & RESET ---
  private async quarantineRecord(storeName: string, key: any, rawData: any, reason: string): Promise<void> {
    console.warn(`Quarantining corrupted record in '${storeName}' (key: ${key}):`, reason)
    const record = {
      storeName,
      key,
      rawData,
      reason,
      quarantinedAt: new Date().toISOString(),
    }
    const db = await this.getDB()
    if (!db) {
      this.memFallback.get('quarantine')?.set(`${storeName}_${key}`, record)
      return
    }
    try {
      await db.add('quarantine', record)
    } catch (e) {
      console.error('Failed to write quarantine entry:', e)
    }
  }

  public async clearAll(): Promise<void> {
    const db = await this.getDB()
    if (!db) {
      for (const map of this.memFallback.values()) {
        map.clear()
      }
      return
    }
    const storeNames = ['levels', 'games', 'stats', 'settings', 'solverHistory', 'quarantine']
    const tx = db.transaction(storeNames as any, 'readwrite')
    for (const s of storeNames) {
      await tx.objectStore(s as any).clear()
    }
    await tx.done
  }
}

export const storage = new StorageManager()
