/**
 * Levels Mode View: Endless campaign with auto-generated progression,
 * boss levels, par times, star calculations, prefetching, and persistence.
 */

import React, { useState, useEffect, useReducer, useRef, useCallback, useMemo } from 'react'
import { Board } from '../board/Board'
import { NumberPad } from '../board/NumberPad'
import { LevelMap } from './LevelMap'
import { LevelCompletionModal } from './LevelCompletionModal'
import { playReducer, createInitialPlayState } from '../../reducers/playReducer'
import { sudokuWorker } from '../../worker/sudokuWorkerClient'
import { storage } from '../../storage/db'
import { tabSync } from '../../storage/sync'
import type { ValidatedLevelRecord } from '../../storage/validation'
import type { TraceSolveResult } from '../../types'
import { ReplayEngine, type ReplayFrame } from '../../solver/replayEngine'
import { SolverPlayback } from '../solver/SolverPlayback'
import {
  Play,
  Pause,
  Lightbulb,
  CheckCircle,
  Eye,
  RotateCcw,
  RotateCw,
  Eraser,
  Crown,
  Flame,
  Star,
  Home,
} from 'lucide-react'

export interface LevelsViewProps {
  onWatchSolver?: (puzzle: string) => void
  returnToMapSignal?: number
}

export const LevelsView: React.FC<LevelsViewProps> = ({
  onWatchSolver: _onWatchSolver,
  returnToMapSignal,
}) => {
  const [viewMode, setViewMode] = useState<'map' | 'play'>('map')
  const [currentLevelNumber, setCurrentLevelNumber] = useState<number>(1)
  const [currentRecord, setCurrentRecord] = useState<ValidatedLevelRecord | null>(null)
  const [allLevels, setAllLevels] = useState<ValidatedLevelRecord[]>([])
  const [highestUnlocked, setHighestUnlocked] = useState<number>(1)

  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [hintMessage, setHintMessage] = useState<string | null>(null)

  // In-level Watch Solver mode state
  const [levelSubMode, setLevelSubMode] = useState<'play' | 'solver'>('play')
  const [levelSolverType, setLevelSolverType] = useState<'smart' | 'naive'>('smart')
  const lastLevelSolvedPuzzleRef = useRef<string>('')
  const lastLevelSolvedTypeRef = useRef<'smart' | 'naive'>('smart')
  const [levelTraceResult, setLevelTraceResult] = useState<TraceSolveResult | null>(null)
  const [isSolverTracing, setIsSolverTracing] = useState<boolean>(false)
  const [levelStepIndex, setLevelStepIndex] = useState<number>(0)
  const [isSolverPlaying, setIsSolverPlaying] = useState<boolean>(false)
  const [solverSpeed, setSolverSpeed] = useState<number>(2)
  const [solverError, setSolverError] = useState<string | null>(null)

  // Tracking and scroll refs
  // winProcessedForSessionRef stores the gameSessionId for which the win modal
  // was already shown. The win useEffect fires only when state.gameSessionId
  // differs from this — i.e. exactly once per game session, never on stale state.
  const winProcessedForSessionRef = useRef<number>(-1)
  const boardContainerRef = useRef<HTMLDivElement | null>(null)

  // Modals & Warnings
  const [showCompletionModal, setShowCompletionModal] = useState<boolean>(false)
  const [starsEarned, setStarsEarned] = useState<number>(1)
  const [isNewBest, setIsNewBest] = useState<boolean>(false)
  const [showRestartConfirm, setShowRestartConfirm] = useState<boolean>(false)
  const [showQuitConfirm, setShowQuitConfirm] = useState<boolean>(false)
  const [isLockedByOtherTab, setIsLockedByOtherTab] = useState<boolean>(false)
  const keepPlayingBtnRef = useRef<HTMLButtonElement | null>(null)
  const cancelQuitBtnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (showRestartConfirm) {
      setTimeout(() => {
        keepPlayingBtnRef.current?.focus()
      }, 30)
    }
  }, [showRestartConfirm])

  useEffect(() => {
    if (showQuitConfirm) {
      setTimeout(() => {
        cancelQuitBtnRef.current?.focus()
      }, 30)
    }
  }, [showQuitConfirm])

  // External signal from Navbar brand/tabs to return to map
  useEffect(() => {
    if (returnToMapSignal && returnToMapSignal > 0 && viewMode === 'play') {
      setShowQuitConfirm(true)
    }
  }, [returnToMapSignal, viewMode])

  // Overall Stats
  const [totalStars, setTotalStars] = useState<number>(0)
  const [levelsSolved, setLevelsSolved] = useState<number>(0)
  const [streakDays, setStreakDays] = useState<number>(0)

  const [state, dispatch] = useReducer(
    playReducer,
    createInitialPlayState('.'.repeat(81), '1'.repeat(81))
  )

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefetchCache = useRef<Map<number, ValidatedLevelRecord>>(new Map())

  // Refresh level records & stats from storage
  const refreshStorageData = useCallback(async () => {
    const levels = await storage.getAllLevels()
    setAllLevels(levels)

    let maxUnlocked = 1
    let starsSum = 0
    let solvedCount = 0

    for (const l of levels) {
      if (l.status !== 'locked') {
        maxUnlocked = Math.max(maxUnlocked, l.level)
      }
      if (l.status === 'completed') {
        solvedCount++
        if (l.stars !== 3) {
          l.stars = 3
          storage.saveLevel(l).catch(() => {})
        }
        starsSum += 3
      }
    }
    setHighestUnlocked(maxUnlocked)
    setTotalStars(starsSum)
    setLevelsSolved(solvedCount)

    const stats = await storage.getStats()
    setStreakDays(stats.currentStreakDays)

    return { levels, maxUnlocked }
  }, [])

  // Initial load
  useEffect(() => {
    async function init() {
      const { maxUnlocked } = await refreshStorageData()
      setCurrentLevelNumber(maxUnlocked)
      setIsLoading(false)
    }
    init()

    // Multi-tab sync listeners
    const unsubCollision = tabSync.onCollision(() => {
      setIsLockedByOtherTab(true)
    })
    const unsubProgress = tabSync.onProgressUpdate(() => {
      refreshStorageData()
    })

    return () => {
      unsubCollision()
      unsubProgress()
    }
  }, [refreshStorageData])

  // Start / Open a specific level
  const startLevel = async (lvlNum: number) => {
    setIsLoading(true)
    setHintMessage(null)
    setShowCompletionModal(false)
    setIsLockedByOtherTab(false)
    setLevelSubMode('play')
    setLevelTraceResult(null)
    setLevelStepIndex(0)
    setIsSolverPlaying(false)
    setSolverError(null)

    tabSync.lockLevel(lvlNum)

    try {
      // 1. Check if record already saved in storage
      let record = await storage.getLevel(lvlNum)
      if (!record) {
        // Check prefetch cache
        if (prefetchCache.current.has(lvlNum)) {
          record = prefetchCache.current.get(lvlNum)!
        } else {
          // Generate via worker
          const generated = await sudokuWorker.generateLevel(lvlNum)
          record = {
            level: generated.level,
            world: generated.world,
            difficulty: generated.difficulty,
            puzzle: generated.puzzle,
            solution: generated.solution,
            clues: generated.clues,
            effort_score: generated.effort_score,
            par_time_seconds: generated.par_time_seconds,
            is_boss: generated.is_boss,
            seed: generated.seed,
            generator_version: generated.generator_version,
            status: lvlNum === 1 ? 'unlocked' : 'locked',
            attempts: 0,
            fallback: generated.fallback,
          }
        }
        await storage.saveLevel(record)
      }

      // Update status to in_progress if not completed
      if (record.status !== 'completed') {
        record.status = 'in_progress'
      }
      record.attempts++
      await storage.saveLevel(record)

      setCurrentRecord(record)
      setCurrentLevelNumber(lvlNum)

      // 2. Check for in-progress game save state
      // Only restore if level is NOT already completed (avoid re-triggering win on completed replay)
      const savedGame = record.status !== 'completed' ? await storage.getGame(lvlNum) : null
      if (savedGame && savedGame.cells.some((v) => v !== 0)) {
        dispatch({
          type: 'RESTORE_SAVED_GAME',
          givens: savedGame.givens,
          solution: record.solution,
          cells: savedGame.cells,
          notes: savedGame.notes,
          history: savedGame.history,
          redoStack: savedGame.redoStack,
          elapsedMs: savedGame.elapsedMs,
          mistakes: savedGame.mistakes,
          hints: savedGame.hints,
        })
      } else {
        dispatch({
          type: 'RESET_GAME',
          givens: record.puzzle,
          solution: record.solution,
        })
      }

      setViewMode('play')

      // 3. Background prefetch next 2 levels (N+1 and N+2)
      prefetchNextLevels(lvlNum + 1, 2)
    } catch (err) {
      console.error(`Failed to start level ${lvlNum}:`, err)
    } finally {
      setIsLoading(false)
    }
  }

  // Prefetch levels in background
  const prefetchNextLevels = async (startLvl: number, count: number) => {
    try {
      for (let lvl = startLvl; lvl < startLvl + count; lvl++) {
        if (!prefetchCache.current.has(lvl)) {
          const res = await sudokuWorker.generateLevel(lvl)
          prefetchCache.current.set(lvl, {
            level: res.level,
            world: res.world,
            difficulty: res.difficulty,
            puzzle: res.puzzle,
            solution: res.solution,
            clues: res.clues,
            effort_score: res.effort_score,
            par_time_seconds: res.par_time_seconds,
            is_boss: res.is_boss,
            seed: res.seed,
            generator_version: res.generator_version,
            status: 'locked',
            attempts: 0,
            fallback: res.fallback,
          })
        }
      }
    } catch (e) {
      console.warn('Background prefetch notice:', e)
    }
  }

  // Timer interval
  useEffect(() => {
    if (viewMode !== 'play' || state.isPaused || state.isSolved || isLoading) return

    const timer = setInterval(() => {
      dispatch({ type: 'TICK_TIMER', deltaMs: 1000 })
    }, 1000)

    return () => clearInterval(timer)
  }, [viewMode, state.isPaused, state.isSolved, isLoading])

  // Autosave game
  useEffect(() => {
    if (viewMode !== 'play' || isLoading || state.isSolved || !currentRecord) return

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)

    autoSaveTimerRef.current = setTimeout(() => {
      storage
        .saveGame({
          levelId: currentLevelNumber,
          givens: state.givens,
          cells: state.cells,
          notes: state.notes,
          history: state.history,
          redoStack: state.redoStack,
          elapsedMs: state.elapsedMs,
          mistakes: state.mistakes,
          hints: state.hintsUsed,
          updatedAt: Date.now(),
        })
        .catch(() => {})
    }, 300)

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [state.cells, state.notes, state.elapsedMs, state.mistakes, state.hintsUsed, viewMode, isLoading, state.isSolved, currentRecord, currentLevelNumber])

  // Handle Win Completion
  // Fires at most once per game session (guarded by gameSessionId).
  // Never fires while loading.
  useEffect(() => {
    // Gate: must be solved, must have a record, must NOT be loading
    if (!state.isSolved || !currentRecord || isLoading) return
    // Gate: the level record must match the currently displayed board
    if (currentRecord.level !== currentLevelNumber) return
    // Idempotency gate: only process each game session once
    if (winProcessedForSessionRef.current === state.gameSessionId) return

    // Mark this session as processed immediately to block any re-render re-fires
    winProcessedForSessionRef.current = state.gameSessionId

    const isSolver = state.solvedBySolver
    const prevBestTime = currentRecord.best_time_ms ?? Infinity

    // Level done = 3 stars, not done = 0 stars
    const stars = 3
    const newBest = !isSolver && state.elapsedMs < prevBestTime

    setStarsEarned(stars)
    setIsNewBest(newBest)

    const timeMs = Math.max(0, state.elapsedMs)
    // Update level record: level completed is always 3 stars
    const updatedRecord: ValidatedLevelRecord = {
      ...currentRecord,
      status: 'completed',
      best_time_ms: isSolver ? currentRecord.best_time_ms : Math.min(prevBestTime, timeMs),
      stars: 3,
      mistakes_best: isSolver
        ? currentRecord.mistakes_best
        : Math.min(currentRecord.mistakes_best ?? Infinity, state.mistakes),
      hints_best: isSolver
        ? currentRecord.hints_best
        : Math.min(currentRecord.hints_best ?? Infinity, state.hintsUsed),
      completed_at: currentRecord.completed_at || new Date().toISOString(),
    }

    storage.saveLevel(updatedRecord).then(async () => {
      // Unlock level N+1
      const nextLvlNum = currentLevelNumber + 1
      let nextLvl = await storage.getLevel(nextLvlNum)
      if (!nextLvl) {
        if (prefetchCache.current.has(nextLvlNum)) {
          nextLvl = prefetchCache.current.get(nextLvlNum)!
          nextLvl.status = 'unlocked'
        } else {
          const gen = await sudokuWorker.generateLevel(nextLvlNum)
          nextLvl = {
            level: gen.level,
            world: gen.world,
            difficulty: gen.difficulty,
            puzzle: gen.puzzle,
            solution: gen.solution,
            clues: gen.clues,
            effort_score: gen.effort_score,
            par_time_seconds: gen.par_time_seconds,
            is_boss: gen.is_boss,
            seed: gen.seed,
            generator_version: gen.generator_version,
            status: 'unlocked',
            attempts: 0,
            fallback: gen.fallback,
          }
        }
      } else if (nextLvl.status === 'locked') {
        nextLvl.status = 'unlocked'
      }
      await storage.saveLevel(nextLvl)

      // Clear in-progress game save
      await storage.deleteGame(currentLevelNumber)

      // Update user stats and streak only if appropriate (don't count solver solve for streak or fastest time)
      if (!isSolver) {
        const stats = await storage.getStats()
        stats.totalSolved++
        stats.totalTimeMs += state.elapsedMs
        stats.solvedByDifficulty[currentRecord.difficulty]++

        const todayStr = new Date().toISOString().slice(0, 10)
        if (stats.lastPlayedDate !== todayStr) {
          stats.currentStreakDays++
          stats.bestStreakDays = Math.max(stats.bestStreakDays, stats.currentStreakDays)
          stats.lastPlayedDate = todayStr
        }
        await storage.saveStats(stats)
      }

      tabSync.broadcastProgressUpdated()
      await refreshStorageData()

      setShowCompletionModal(true)
    })
  // NOTE: showCompletionModal intentionally excluded from deps — it is an OUTPUT,
  // not a trigger. winProcessedForSessionRef provides the idempotency guarantee.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isSolved, state.solvedBySolver, state.gameSessionId, currentRecord, currentLevelNumber,
      state.mistakes, state.hintsUsed, state.elapsedMs, isLoading, refreshStorageData])


  // Hints
  const handleGetHint = async () => {
    if (state.isSolved || state.isPaused) return
    try {
      const gridStr = state.cells.map((v) => (v === 0 ? '.' : String(v))).join('')
      const h = await sudokuWorker.hint(gridStr)
      if (h.technique !== 'none') {
        dispatch({
          type: 'APPLY_HINT',
          cell: h.cell,
          value: h.value,
        })
        setHintMessage(`[${h.technique.replace('_', ' ')}] ${h.explanation}`)
      } else {
        setHintMessage('No hints needed!')
      }
    } catch {
      setHintMessage('Hint unavailable.')
    }
  }

  // In-level solver replay engine
  const levelEngine = useMemo(() => {
    if (!levelTraceResult || levelTraceResult.events.length === 0) return null
    return new ReplayEngine(levelTraceResult.events, 100)
  }, [levelTraceResult])

  const levelCurrentFrame: ReplayFrame | null = useMemo(() => {
    if (!levelEngine) return null
    return levelEngine.getFrame(levelStepIndex)
  }, [levelEngine, levelStepIndex])

  const handleSwitchToPlay = () => {
    setLevelSubMode('play')
    setLevelTraceResult(null)
    setLevelStepIndex(0)
    setIsSolverPlaying(false)
    setSolverError(null)
  }

  const handleEditDigit = (digit: number) => {
    setLevelTraceResult(null)
    setLevelStepIndex(0)
    setIsSolverPlaying(false)
    setSolverError(null)
    dispatch({ type: 'SET_DIGIT', digit })
  }

  const handleClearCell = () => {
    setLevelTraceResult(null)
    setLevelStepIndex(0)
    setIsSolverPlaying(false)
    setSolverError(null)
    dispatch({ type: 'CLEAR_CELL' })
  }

  const handleUndo = () => {
    setLevelTraceResult(null)
    setLevelStepIndex(0)
    setIsSolverPlaying(false)
    setSolverError(null)
    dispatch({ type: 'UNDO' })
  }

  const handleRedo = () => {
    setLevelTraceResult(null)
    setLevelStepIndex(0)
    setIsSolverPlaying(false)
    setSolverError(null)
    dispatch({ type: 'REDO' })
  }

  // Verify if current solver replay frame exactly matches the puzzle solution
  const isBoardAtSolution = useMemo(() => {
    if (!levelCurrentFrame?.cells || levelCurrentFrame.cells.length !== 81) return false
    const cells = levelCurrentFrame.cells
    if (levelTraceResult?.solution && levelTraceResult.solution.length === 81) {
      const sol = levelTraceResult.solution
      return cells.every((c, i) => c.value > 0 && c.value === Number(sol[i]))
    }
    return cells.every((c) => c.value >= 1 && c.value <= 9)
  }, [levelTraceResult, levelCurrentFrame])

  // Derived boolean: solver must be fully finished and playback at final solution
  const solverFinished = useMemo(() => {
    if (
      !levelTraceResult ||
      !levelTraceResult.success ||
      !levelTraceResult.solution ||
      isSolverTracing ||
      isSolverPlaying ||
      Boolean(solverError)
    ) {
      return false
    }
    const maxStep = (levelTraceResult.events.length ?? 0) - 1
    if (maxStep < 0 || levelStepIndex < maxStep) {
      return false
    }
    return isBoardAtSolution
  }, [
    levelTraceResult,
    isSolverTracing,
    isSolverPlaying,
    solverError,
    levelStepIndex,
    isBoardAtSolution,
  ])

  const isSolverReadyToSubmit = useMemo(() => {
    return Boolean(
      levelTraceResult?.success &&
      !isSolverTracing &&
      !solverError &&
      (solverFinished || isBoardAtSolution)
    )
  }, [levelTraceResult, isSolverTracing, solverError, solverFinished, isBoardAtSolution])


  // Open / Switch to Solver Mode inside the level
  const handleOpenSolver = async (type: 'smart' | 'naive' = 'smart') => {
    setLevelSubMode('solver')
    setLevelSolverType(type)
    setLevelStepIndex(0)
    setIsSolverPlaying(false)
    setSolverError(null)
    setTimeout(() => {
      boardContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
    if (
      !levelTraceResult ||
      lastLevelSolvedPuzzleRef.current !== currentRecord?.puzzle ||
      lastLevelSolvedTypeRef.current !== type
    ) {
      if (currentRecord) {
        setIsSolverTracing(true)
        lastLevelSolvedPuzzleRef.current = currentRecord.puzzle
        lastLevelSolvedTypeRef.current = type
        try {
          const res =
            type === 'naive'
              ? await sudokuWorker.solveNaiveWithTrace(currentRecord.puzzle, 20000)
              : await sudokuWorker.solveWithTrace(currentRecord.puzzle, 'propagate', 50000)
          if (res.ok && res.solution) {
            setLevelTraceResult(res)
            setLevelStepIndex(0)
            setSolverError(null)
          } else {
            setLevelTraceResult(res.events?.length ? res : null)
            setSolverError(res.error || 'Solver failed to find a solution')
          }
        } catch (e: any) {
          console.error('Failed to trace level solver:', e)
          setLevelTraceResult(null)
          setSolverError(e?.message || 'Solver error')
        } finally {
          setIsSolverTracing(false)
        }
      }
    }
  }

  // Playback timer for in-level solver
  useEffect(() => {
    if (!isSolverPlaying || !levelEngine || !levelTraceResult) return
    const maxStep = levelTraceResult.events.length - 1
    if (levelStepIndex >= maxStep) {
      setIsSolverPlaying(false)
      return
    }
    const timer = setTimeout(() => {
      setLevelStepIndex((prev) => {
        const next = Math.min(maxStep, prev + 1)
        if (next >= maxStep) {
          setIsSolverPlaying(false)
        }
        return next
      })
    }, Math.max(20, 1000 / solverSpeed))
    return () => clearTimeout(timer)
  }, [isSolverPlaying, levelEngine, levelTraceResult, levelStepIndex, solverSpeed])

  // Submit Level directly with Solver Solution
  const handleSubmitLevelInSolver = () => {
    if (!levelTraceResult?.success) return
    if (levelTraceResult.events?.length > 0) {
      setLevelStepIndex(levelTraceResult.events.length - 1)
    }
    setLevelSubMode('play')
    dispatch({ type: 'FILL_SOLUTION' })
  }

  const getLevelExplanationBreakdown = (event: any) => {
    if (!event) return { title: 'READY', coordinate: '', detail: 'Analyzing puzzle logic…' }
    const r = event.cell !== undefined ? Math.floor(event.cell / 9) + 1 : null
    const c = event.cell !== undefined ? (event.cell % 9) + 1 : null
    const coord = r !== null && c !== null ? `R${r}C${c}${event.value !== undefined ? ` = ${event.value}` : ''}` : ''

    switch (event.type) {
      case 'init':
        return { title: 'INITIAL BOARD', coordinate: '', detail: 'Board initialized with given clues.' }
      case 'single': {
        const tech = event.technique === 'naked_single' ? 'NAKED SINGLE' : 'HIDDEN SINGLE'
        const detail =
          event.technique === 'naked_single'
            ? `R${r}C${c} can only contain ${event.value}. The remaining candidates are eliminated by its peers.`
            : `Digit ${event.value} can only be placed at R${r}C${c} in its unit.`
        return { title: tech, coordinate: coord, detail }
      }
      case 'eliminate':
        return {
          title: 'CANDIDATE ELIMINATION',
          coordinate: `R${r}C${c} ≠ ${event.digit}`,
          detail: `Eliminated candidate ${event.digit} from peer constraints.`,
        }
      case 'branch':
        return {
          title: 'SEARCH BRANCH',
          coordinate: `R${r}C${c} ?= ${event.chosen}`,
          detail: `Multiple candidates remain. Exploring candidate ${event.chosen} at depth ${event.depth}.`,
        }
      case 'contradiction':
        return { title: 'CONTRADICTION', coordinate: coord, detail: 'Invalid cell state encountered. Reverting hypothesis.' }
      case 'backtrack':
        return { title: 'BACKTRACK', coordinate: coord, detail: 'Unwinding hypothesis search tree.' }
      case 'place':
        return {
          title: 'NAIVE PLACEMENT',
          coordinate: `R${r}C${c} = ${event.digit}`,
          detail: `Trying digit ${event.digit} in cell R${r}C${c}.`,
        }
      case 'conflict': {
        const peerDesc = event.with && event.with.length > 0 ? ` (conflicts with ${event.with.length} peer cell${event.with.length > 1 ? 's' : ''})` : ''
        return {
          title: 'NAIVE CONFLICT',
          coordinate: `R${r}C${c} ⤬ ${event.digit}`,
          detail: `Digit ${event.digit} conflicts with existing digit in its row, column, or box${peerDesc}.`,
        }
      }
      default:
        return { title: 'LOGIC ANALYSIS', coordinate: coord, detail: 'Evaluating grid constraints.' }
    }
  }

  // Restart level
  const handleRestartLevel = () => {
    setShowRestartConfirm(false)
    setShowCompletionModal(false)
    setLevelSubMode('play')
    setLevelTraceResult(null)
    setLevelStepIndex(0)
    setIsSolverPlaying(false)
    setSolverError(null)
    if (currentRecord) {
      storage.deleteGame(currentLevelNumber).catch(() => {})
      // RESET_GAME bumps gameSessionId in the reducer, so winProcessedForSessionRef
      // will no longer match and the win handler correctly won't fire for old state
      dispatch({
        type: 'RESET_GAME',
        givens: currentRecord.puzzle,
        solution: currentRecord.solution,
      })
    }
  }

  const formatTimer = (ms: number) => {
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // Keyboard shortcut 'L' to open level map
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      if (e.key === 'l' || e.key === 'L') {
        if (viewMode === 'play') {
          setShowQuitConfirm(true)
        } else {
          setViewMode('play')
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode])

  if (viewMode === 'map') {
    return (
      <div className="campaign-map-wrapper">
        {/* Campaign Banner Header */}
        <div className="campaign-banner-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Star size={20} color="var(--color-star)" fill="var(--color-star)" />
              <span className="tabular-nums" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                {totalStars}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Stars</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle size={20} color="var(--color-success)" />
              <span className="tabular-nums" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                {levelsSolved}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Solved</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Flame size={20} color="var(--color-guess-4)" />
              <span className="tabular-nums" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                {streakDays}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Day Streak</span>
            </div>
          </div>

          <button
            onClick={() => startLevel(highestUnlocked)}
            style={{
              padding: '10px 20px',
              backgroundColor: 'var(--color-player)',
              color: '#FFFFFF',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 700,
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
          >
            <Play size={18} fill="#FFFFFF" />
            <span>Continue Level {highestUnlocked}</span>
          </button>
        </div>

        <LevelMap
          levels={allLevels}
          highestUnlockedLevel={highestUnlocked}
          currentLevelNumber={currentLevelNumber}
          onSelectLevel={(lvl) => startLevel(lvl)}
        />
      </div>
    )
  }

  // Inside Level Play View
  return (
    <div className="game-view-container">
      <div className="game-layout-grid">
        {/* Left Column: Board Section (Board + NumberPad in play mode, Board in solver mode) */}
        <div className="game-board-section">
          {levelSubMode === 'play' && (
            <>
              {state.isPaused ? (
                <div
                  style={{
                    aspectRatio: '1 / 1',
                    width: '100%',
                    maxWidth: 'min(100%, 72vh)',
                    margin: '0 auto',
                    backgroundColor: 'var(--bg-surface)',
                    border: '3px solid var(--border-box)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                  }}
                >
                  <Pause size={48} color="var(--text-muted)" />
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Level Paused</h3>
                  <button
                    onClick={() => dispatch({ type: 'SET_PAUSED', paused: false })}
                    style={{
                      padding: '8px 24px',
                      backgroundColor: 'var(--color-player)',
                      color: '#fff',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 600,
                    }}
                  >
                    Resume
                  </button>
                </div>
              ) : (
                <Board
                  cells={state.cells}
                  givens={state.givens}
                  notes={state.notes}
                  selectedIndex={state.selectedIndex}
                  conflicts={state.highlightConflicts ? state.conflicts : new Set()}
                  onSelectCell={(idx) => dispatch({ type: 'SELECT_CELL', index: idx })}
                  onSetDigit={handleEditDigit}
                  onClearCell={handleClearCell}
                  onToggleNotesMode={() => dispatch({ type: 'TOGGLE_NOTES_MODE' })}
                />
              )}

              <NumberPad
                cells={state.cells}
                notesMode={state.notesMode}
                canUndo={state.history.length > 0}
                canRedo={state.redoStack.length > 0}
                onSelectDigit={handleEditDigit}
                onClear={handleClearCell}
                onToggleNotes={() => dispatch({ type: 'TOGGLE_NOTES_MODE' })}
                onUndo={handleUndo}
                onRedo={handleRedo}
                disabled={state.isPaused || state.isSolved || isLoading}
              />
            </>
          )}

          {levelSubMode === 'solver' && (
            <div ref={boardContainerRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
              {isSolverTracing && (
                <div
                  className="ui-card"
                  style={{
                    padding: '48px 24px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    aspectRatio: '1 / 1',
                    width: '100%',
                    maxWidth: 'min(100%, 72vh)',
                  }}
                >
                  <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>Tracing Solver Logic...</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Running Python constraint propagation in Web Worker
                  </div>
                </div>
              )}

              {!isSolverTracing && levelCurrentFrame && (
                <Board
                  cells={levelCurrentFrame.cells.map((c) => c.value)}
                  givens={currentRecord?.puzzle || ''}
                  notes={levelCurrentFrame.cells.map((c) => c.candidates)}
                  cellTypes={levelCurrentFrame.cells.map((c) => c.type)}
                  guessDepths={levelCurrentFrame.cells.map((c) => c.guessDepth)}
                  highlightCell={levelCurrentFrame.highlightCell}
                  highlightUnit={levelCurrentFrame.highlightUnit}
                  eliminations={levelCurrentFrame.eliminations}
                  conflictWithCells={levelCurrentFrame.conflictWithCells}
                  backtrackCell={levelCurrentFrame.backtrackCell}
                  readOnly={true}
                />
              )}

              {!isSolverTracing && !levelCurrentFrame && currentRecord && (
                <Board
                  cells={currentRecord.puzzle.split('').map((ch) => (ch === '.' || ch === '0' ? 0 : parseInt(ch, 10)))}
                  givens={currentRecord.puzzle}
                  notes={Array(81).fill([])}
                  cellTypes={currentRecord.puzzle.split('').map((ch) => (ch !== '.' && ch !== '0' ? 'given' : 'empty'))}
                  guessDepths={Array(81).fill(0)}
                  readOnly={true}
                />
              )}
            </div>
          )}
        </div>

        {/* Right Column: Side Panel (sticky on desktop, contents on mobile) */}
        <div className="game-side-panel">
          {/* Header Section */}
          <div className="panel-header-section">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                backgroundColor: 'var(--bg-surface)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setShowQuitConfirm(true)}
                  title="Quit game to campaign map (Press L)"
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-base)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Home size={16} />
                  <span>Quit to Map</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowQuitConfirm(true)}
                  title="Quit to Map"
                  aria-label={`Level ${currentLevelNumber}, click to quit to map`}
                  className="level-title-btn"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px 8px',
                    margin: '-4px 0',
                    borderRadius: 'var(--radius-sm)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span
                      className="level-title-text"
                      style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', transition: 'color 0.15s ease' }}
                    >
                      Level {currentLevelNumber}
                    </span>
                    {currentRecord?.is_boss && <Crown size={14} color="var(--color-star)" />}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    World {currentRecord?.world} • {currentRecord?.difficulty}
                  </span>
                </button>
              </div>

              {/* Timer & Par Time */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div>
                  <span
                    className="tabular-nums"
                    style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}
                  >
                    {formatTimer(state.elapsedMs)}
                  </span>
                  {currentRecord && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>
                      Par: {formatTimer(currentRecord.par_time_seconds * 1000)}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => dispatch({ type: 'SET_PAUSED', paused: !state.isPaused })}
                  aria-label={state.isPaused ? 'Resume level' : 'Pause level'}
                  style={{ padding: '6px', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  {state.isPaused ? <Play size={18} /> : <Pause size={18} />}
                </button>

                <button
                  onClick={() => setShowRestartConfirm(true)}
                  aria-label="Restart level"
                  title="Restart level"
                  style={{
                    padding: '6px',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <RotateCcw size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Sub-Mode Tabs Section */}
          <div className="panel-tabs-section">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div className="ui-segmented" role="tablist">
                <button
                  role="tab"
                  aria-selected={levelSubMode === 'play'}
                  className={`ui-segmented-item ${levelSubMode === 'play' ? 'active' : ''}`}
                  onClick={handleSwitchToPlay}
                >
                  <span>Play Level</span>
                </button>
                <button
                  role="tab"
                  aria-selected={levelSubMode === 'solver' && levelSolverType === 'smart'}
                  className={`ui-segmented-item ${levelSubMode === 'solver' && levelSolverType === 'smart' ? 'active' : ''}`}
                  onClick={() => handleOpenSolver('smart')}
                >
                  <Eye size={15} />
                  <span>Watch Solver</span>
                </button>
                <button
                  role="tab"
                  aria-selected={levelSubMode === 'solver' && levelSolverType === 'naive'}
                  className={`ui-segmented-item ${levelSubMode === 'solver' && levelSolverType === 'naive' ? 'active' : ''}`}
                  onClick={() => handleOpenSolver('naive')}
                >
                  <Eye size={15} />
                  <span>Naive (red)</span>
                </button>
              </div>

              {levelSubMode === 'play' && (
                <button
                  onClick={handleGetHint}
                  disabled={state.isPaused || state.isSolved || isLoading}
                  className="ui-btn ui-btn-outline"
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: 'var(--color-logic)',
                  }}
                >
                  <Lightbulb size={16} />
                  <span>Get Hint</span>
                </button>
              )}
            </div>
          </div>

          {/* Desktop Actions Bar: Undo, Redo, Erase (hidden on mobile, visible on desktop >=1000px) */}
          {levelSubMode === 'play' && (
            <div className="desktop-action-bar ui-card" style={{ padding: '14px', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-arcade)', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
                ACTIONS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', width: '100%' }}>
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={!state.history.length || state.isPaused || state.isSolved || isLoading}
                  aria-label="Undo move"
                  className="ui-btn ui-btn-outline"
                  style={{
                    minHeight: '44px',
                    padding: '8px 6px',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.78rem',
                    letterSpacing: '0.04em',
                    opacity: state.history.length && !state.isPaused && !state.isSolved && !isLoading ? 1 : 0.35,
                    cursor: state.history.length ? 'pointer' : 'not-allowed',
                  }}
                >
                  <RotateCcw size={16} />
                  <span>UNDO</span>
                </button>

                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={!state.redoStack.length || state.isPaused || state.isSolved || isLoading}
                  aria-label="Redo move"
                  className="ui-btn ui-btn-outline"
                  style={{
                    minHeight: '44px',
                    padding: '8px 6px',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.78rem',
                    letterSpacing: '0.04em',
                    opacity: state.redoStack.length && !state.isPaused && !state.isSolved && !isLoading ? 1 : 0.35,
                    cursor: state.redoStack.length ? 'pointer' : 'not-allowed',
                  }}
                >
                  <RotateCw size={16} />
                  <span>REDO</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearCell}
                  disabled={state.isPaused || state.isSolved || isLoading}
                  aria-label="Erase selected cell"
                  className="ui-btn ui-btn-outline"
                  style={{
                    minHeight: '44px',
                    padding: '8px 6px',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.78rem',
                    letterSpacing: '0.04em',
                    cursor: !state.isPaused && !state.isSolved && !isLoading ? 'pointer' : 'not-allowed',
                  }}
                >
                  <Eraser size={16} />
                  <span>ERASE</span>
                </button>
              </div>
            </div>
          )}

          {/* Alerts Section */}
          <div className="panel-alerts-section">
            {isLockedByOtherTab && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'var(--color-guess-4-bg)',
                  color: 'var(--color-guess-4)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <span>This level is open in another tab.</span>
                <button
                  onClick={() => tabSync.takeOverLevel(currentLevelNumber)}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: 'var(--color-player)',
                    color: '#fff',
                    borderRadius: '4px',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                  }}
                >
                  Take Over Here
                </button>
              </div>
            )}

            {hintMessage && levelSubMode === 'play' && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'var(--color-logic-bg)',
                  color: 'var(--color-logic)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                }}
              >
                {hintMessage}
              </div>
            )}
          </div>

          {/* Solver Playback Section */}
          {levelSubMode === 'solver' && !isSolverTracing && levelCurrentFrame && (
            <div className="panel-playback-section">
              {(() => {
                const expl = getLevelExplanationBreakdown(levelTraceResult?.events[levelStepIndex])
                return (
                  <SolverPlayback
                    isPlaying={isSolverPlaying}
                    isTracing={isSolverTracing}
                    isSolved={Boolean(levelTraceResult?.success && (solverFinished || isBoardAtSolution))}
                    canStepBack={levelStepIndex > 0}
                    canStepForward={levelTraceResult ? levelStepIndex < levelTraceResult.events.length - 1 : false}
                    speed={solverSpeed}
                    solverType={levelSolverType}
                    tries={levelCurrentFrame.stats.tries}
                    backtracks={levelCurrentFrame.stats.backtracks}
                    explanationTitle={expl.title}
                    explanationCoordinate={expl.coordinate}
                    explanationDetail={expl.detail}
                    onTogglePlay={() => setIsSolverPlaying(!isSolverPlaying)}
                    onStepBackward={() => {
                      setIsSolverPlaying(false)
                      setLevelStepIndex((prev) => Math.max(0, prev - 1))
                    }}
                    onStepForward={() => {
                      setIsSolverPlaying(false)
                      if (levelTraceResult) {
                        setLevelStepIndex((prev) => Math.min(levelTraceResult.events.length - 1, prev + 1))
                      }
                    }}
                    onChangeSpeed={(s) => setSolverSpeed(s)}
                  />
                )
              })()}
            </div>
          )}

          {/* Footer Section: Submit Level button in solver mode */}
          {levelSubMode === 'solver' && (
            <div className="panel-footer-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', alignItems: 'center' }}>
              <button
                onClick={handleSubmitLevelInSolver}
                disabled={!isSolverReadyToSubmit}
                title={!isSolverReadyToSubmit ? 'Watch solver finish to submit' : 'Submit Level'}
                aria-disabled={!isSolverReadyToSubmit}
                className="ui-btn ui-btn-success"
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  fontSize: '1rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: 'var(--shadow-md)',
                  opacity: !isSolverReadyToSubmit ? 0.45 : 1,
                  cursor: !isSolverReadyToSubmit ? 'not-allowed' : 'pointer',
                }}
              >
                <CheckCircle size={20} />
                <span>Submit Level</span>
              </button>
              {!isSolverReadyToSubmit && (
                <span
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                    fontWeight: 500,
                  }}
                >
                  Watch solver finish to submit
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Restart Level Confirmation Modal */}
      {showRestartConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="restart-dialog-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              setShowRestartConfirm(false)
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--bg-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 100,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              width: '100%',
              maxWidth: '420px',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3 id="restart-dialog-title" style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', textAlign: 'center' }}>
              Restart Level {currentLevelNumber}?
            </h3>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--text-secondary)', margin: 0, textAlign: 'center' }}>
              This will reset the current board and timer. Your best completion records will be preserved.
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '4px' }}>
              <button
                ref={keepPlayingBtnRef}
                type="button"
                onClick={() => setShowRestartConfirm(false)}
                className="ui-btn ui-btn-secondary"
                style={{
                  padding: '8px 24px',
                  minHeight: '38px',
                  fontSize: '0.85rem',
                  flex: 1,
                }}
              >
                Keep Playing
              </button>

              <button
                type="button"
                onClick={handleRestartLevel}
                className="ui-btn ui-btn-danger"
                style={{
                  padding: '8px 24px',
                  minHeight: '38px',
                  fontSize: '0.85rem',
                  flex: 1,
                }}
              >
                Restart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quit to Map Confirmation Modal */}
      {showQuitConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quit-dialog-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              setShowQuitConfirm(false)
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--bg-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 100,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              width: '100%',
              maxWidth: '420px',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3 id="quit-dialog-title" style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', textAlign: 'center' }}>
              Quit to Map?
            </h3>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--text-secondary)', margin: 0, textAlign: 'center' }}>
              Do you want to quit like that? Your current progress on Level {currentLevelNumber} is safely saved, so you can jump right back in anytime.
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '4px' }}>
              <button
                ref={cancelQuitBtnRef}
                type="button"
                onClick={() => setShowQuitConfirm(false)}
                className="ui-btn ui-btn-secondary"
                style={{
                  padding: '8px 24px',
                  minHeight: '38px',
                  fontSize: '0.85rem',
                  flex: 1,
                }}
              >
                Keep Playing
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowQuitConfirm(false)
                  setViewMode('map')
                }}
                className="ui-btn ui-btn-primary"
                style={{
                  padding: '8px 24px',
                  minHeight: '38px',
                  fontSize: '0.85rem',
                  flex: 1,
                }}
              >
                Quit to Map
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Level Completion Modal */}
      {currentRecord && (
        <LevelCompletionModal
          isOpen={showCompletionModal}
          levelNumber={currentLevelNumber}
          starsEarned={starsEarned}
          elapsedMs={state.elapsedMs}
          parTimeSeconds={currentRecord.par_time_seconds}
          mistakes={state.mistakes}
          hintsUsed={state.hintsUsed}
          isNewBest={isNewBest}
          solvedBySolver={state.solvedBySolver}
          onNextLevel={() => startLevel(currentLevelNumber + 1)}
          onReplay={() => handleRestartLevel()}
          onOpenMap={() => {
            setShowCompletionModal(false)
            setViewMode('map')
          }}
        />
      )}
    </div>
  )
}
