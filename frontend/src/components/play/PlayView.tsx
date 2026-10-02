/**
 * Free Play Mode View.
 * Allows playing generated puzzles across 5 difficulties, custom seeds,
 * notes mode, undo/redo, conflict highlight, hint system, timer,
 * and integrated in-place Watch Solver with naive solver comparison.
 */

import React, { useEffect, useReducer, useState, useRef, useCallback, useMemo } from 'react'
import { Board } from '../board/Board'
import { NumberPad } from '../board/NumberPad'
import { playReducer, createInitialPlayState } from '../../reducers/playReducer'
import { sudokuWorker } from '../../worker/sudokuWorkerClient'
import { storage } from '../../storage/db'
import type { Difficulty, HintResult, TraceSolveResult } from '../../types'
import { ReplayEngine, type ReplayFrame } from '../../solver/replayEngine'
import { NaiveCompareModal } from '../solver/NaiveCompareModal'
import { SolverPlayback } from '../solver/SolverPlayback'
import { getVariant, VARIANTS, type VariantId } from '../../variants'
import { VariantInfoPopover } from './VariantInfoPopover'
import type { ValidatedUserSettings } from '../../storage/validation'
import {
  Play,
  Pause,
  Lightbulb,
  CheckCircle,
  Share2,
  RefreshCw,
  Eye,
  Award,
  Home,
  BarChart2,
  RotateCcw,
  RotateCw,
  Eraser,
  Info,
} from 'lucide-react'

export interface PlayViewProps {
  initialDifficulty?: Difficulty
  initialSeed?: string
  initialPuzzle?: string
  initialSubMode?: 'play' | 'solver'
  userSettings?: ValidatedUserSettings
  onWatchSolver?: (puzzle: string) => void
  onGoHome?: () => void
}

export const PlayView: React.FC<PlayViewProps> = ({
  initialDifficulty = 'medium',
  initialSeed,
  initialPuzzle,
  initialSubMode = 'play',
  userSettings,
  onWatchSolver: _onWatchSolver,
  onGoHome,
}) => {
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty)
  const [activeSeed, setActiveSeed] = useState<string>(initialSeed || `seed_${Math.random().toString(36).slice(2)}`)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [hintMessage, setHintMessage] = useState<string | null>(null)
  const [isCheckNotice, setIsCheckNotice] = useState<string | null>(null)
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false)
  const [showVariantInfo, setShowVariantInfo] = useState<boolean>(false)
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null)

  const showRemainingCounts = userSettings?.showRemainingCounts ?? false
  const enableHints = userSettings?.enableHints ?? true

  useEffect(() => {
    if (showResetConfirm) {
      cancelBtnRef.current?.focus()
    }
  }, [showResetConfirm])

  // Variant selection (persisted to localStorage for reload)
  const [variantId, setVariantId] = useState<VariantId>(() => {
    try {
      const saved = localStorage.getItem('sudoku_free_variant')
      if (saved && saved in VARIANTS) return saved as VariantId
    } catch {}
    return 'classic'
  })
  const variantConfig = useMemo(() => getVariant(variantId), [variantId])

  // Inject variant constraint groups into the reducer whenever variant changes
  useEffect(() => {
    const groups = variantConfig.constraints.validation.map((g) => g.cells)
    dispatch({ type: 'SET_VARIANT_GROUPS', groups })
  }, [variantConfig])

  // Sub-mode: play vs integrated solver
  const [subMode, setSubMode] = useState<'play' | 'solver'>(initialSubMode)
  const [solverType, setSolverType] = useState<'smart' | 'naive'>('smart')
  const [traceResult, setTraceResult] = useState<TraceSolveResult | null>(null)
  const [isSolverTracing, setIsSolverTracing] = useState<boolean>(false)
  const [stepIndex, setStepIndex] = useState<number>(0)
  const [isSolverPlaying, setIsSolverPlaying] = useState<boolean>(false)
  const [solverSpeed, setSolverSpeed] = useState<number>(2)

  // Naive solver comparison modal
  const [isCompareOpen, setIsCompareOpen] = useState<boolean>(false)
  const [isCompareLoading, setIsCompareLoading] = useState<boolean>(false)
  const [naiveStats, setNaiveStats] = useState<any | null>(null)

  const solverContainerRef = useRef<HTMLDivElement | null>(null)
  const lastSolvedGivensRef = useRef<string>('')
  const lastSolvedTypeRef = useRef<'smart' | 'naive'>('smart')

  const [state, dispatch] = useReducer(
    playReducer,
    createInitialPlayState(initialPuzzle || '.'.repeat(81), '1'.repeat(81))
  )

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Run solver trace on puzzle
  const runSolverTrace = useCallback(async (puzzleStr: string, type: 'smart' | 'naive' = 'smart') => {
    setIsSolverTracing(true)
    setIsSolverPlaying(false)
    try {
      const res =
        type === 'naive'
          ? await sudokuWorker.solveNaiveWithTrace(puzzleStr, 20000)
          : await sudokuWorker.solveWithTrace(puzzleStr, 'propagate', 50000)
      if (res.ok && res.events) {
        setTraceResult(res)
        setStepIndex(0)
        lastSolvedGivensRef.current = puzzleStr
        lastSolvedTypeRef.current = type
      }
    } catch (e) {
      console.error('Solver trace error:', e)
    } finally {
      setIsSolverTracing(false)
    }
  }, [])

  const subModeRef = useRef<'play' | 'solver'>(subMode)
  subModeRef.current = subMode
  const solverTypeRef = useRef<'smart' | 'naive'>(solverType)
  solverTypeRef.current = solverType

  // Switch to solver tab and trace
  const handleOpenSolver = (type: 'smart' | 'naive' = 'smart') => {
    setSubMode('solver')
    setSolverType(type)
    subModeRef.current = 'solver'
    solverTypeRef.current = type
    if (state.givens && state.givens.replace(/\./g, '').replace(/0/g, '').length > 0) {
      if (!traceResult || lastSolvedGivensRef.current !== state.givens || lastSolvedTypeRef.current !== type) {
        runSolverTrace(state.givens, type)
      }
    }
    setTimeout(() => {
      solverContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 100)
  }

  // Load new game or restore saved game
  const loadNewGame = useCallback(
    async (diff: Difficulty, seedStr: string, variant: VariantId = 'classic') => {
      setIsLoading(true)
      setHintMessage(null)
      setIsCheckNotice(null)
      setTraceResult(null)
      setStepIndex(0)
      setIsSolverPlaying(false)

      try {
        let puzzle: string, solution: string
        if (variant === 'diagonal') {
          const res = await sudokuWorker.generateDiagonalPuzzle(diff, seedStr, true)
          if (!res.ok) throw new Error(res.error || 'Diagonal generation failed')
          puzzle = res.puzzle
          solution = res.solution
        } else if (variant === 'windoku' || variant === 'center-dot' || variant === 'asterisk') {
          const res = await sudokuWorker.generateVariantPuzzle(variant, diff, seedStr, true)
          if (!res.ok) throw new Error(res.error || `${variant} generation failed`)
          puzzle = res.puzzle
          solution = res.solution
        } else {
          const res = await sudokuWorker.generate(diff, seedStr, true)
          puzzle = res.puzzle
          solution = res.solution
        }
        dispatch({
          type: 'RESET_GAME',
          givens: puzzle,
          solution,
        })
        if (subModeRef.current === 'solver') {
          runSolverTrace(puzzle, solverTypeRef.current)
        }
      } catch (err: any) {
        console.error('Failed to generate puzzle:', err)
      } finally {
        setIsLoading(false)
      }
    },
    [runSolverTrace]
  )

  // Reset current puzzle to initial givens
  const handleResetPuzzle = useCallback(() => {
    setShowResetConfirm(false)
    setHintMessage(null)
    setIsCheckNotice(null)
    setStepIndex(0)
    setIsSolverPlaying(false)
    storage.deleteGame('free').catch(() => {})
    dispatch({
      type: 'RESET_GAME',
      givens: state.givens,
      solution: state.solution,
    })
    if (subModeRef.current === 'solver') {
      runSolverTrace(state.givens, solverTypeRef.current)
    }
  }, [state.givens, state.solution, runSolverTrace])

  // Ensure solver traces when switched to solver or when givens update
  useEffect(() => {
    if (subMode === 'solver' && state.givens && state.givens.replace(/\./g, '').replace(/0/g, '').length > 0) {
      if (!traceResult || lastSolvedGivensRef.current !== state.givens || lastSolvedTypeRef.current !== solverType) {
        runSolverTrace(state.givens, solverType)
      }
    }
  }, [subMode, solverType, state.givens, traceResult, runSolverTrace])

  // Initialize or check for autosaved in-progress game
  useEffect(() => {
    async function init() {
      if (initialPuzzle) {
        dispatch({
          type: 'RESET_GAME',
          givens: initialPuzzle,
          solution: '',
        })
        setIsLoading(false)
        if (initialSubMode === 'solver') {
          runSolverTrace(initialPuzzle)
        }
        return
      }

      // Restore saved variant (read directly from localStorage to avoid stale closure)
      let savedVariant: VariantId = 'classic'
      try {
        const lsVariant = localStorage.getItem('sudoku_free_variant')
        if (lsVariant && lsVariant in VARIANTS) savedVariant = lsVariant as VariantId
      } catch {}

      const saved = await storage.getGame('free')
      if (saved && saved.cells.some((v) => v !== 0)) {
        // Restore saved game with the persisted variant active
        setVariantId(savedVariant)
        dispatch({
          type: 'RESTORE_SAVED_GAME',
          givens: saved.givens,
          solution: '',
          cells: saved.cells,
          notes: saved.notes,
          history: saved.history,
          redoStack: saved.redoStack,
          elapsedMs: saved.elapsedMs,
          mistakes: saved.mistakes,
          hints: saved.hints,
        })
        setIsLoading(false)
        if (initialSubMode === 'solver') {
          runSolverTrace(saved.givens)
        }
      } else {
        loadNewGame(difficulty, activeSeed, savedVariant)
      }
    }
    init()
  }, [])

  // Timer interval (ticks every 1000ms if not paused and not solved)
  useEffect(() => {
    if (state.isPaused || state.isSolved || isLoading) return

    const timer = setInterval(() => {
      dispatch({ type: 'TICK_TIMER', deltaMs: 1000 })
    }, 1000)

    return () => clearInterval(timer)
  }, [state.isPaused, state.isSolved, isLoading])

  // Pause timer when tab is hidden (Page Visibility API)
  useEffect(() => {
    if (state.isSolved || isLoading) return

    const handleVisibility = () => {
      if (document.hidden && !state.isPaused) {
        dispatch({ type: 'SET_PAUSED', paused: true })
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [state.isPaused, state.isSolved, isLoading])

  // Debounced autosave (300ms) on move and before unload
  useEffect(() => {
    if (isLoading || state.isSolved) return

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)

    autoSaveTimerRef.current = setTimeout(() => {
      // Persist variant alongside game state
      try { localStorage.setItem('sudoku_free_variant', variantId) } catch {}

      storage
        .saveGame({
          levelId: 'free',
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
  }, [state.cells, state.notes, state.elapsedMs, state.mistakes, state.hintsUsed, isLoading, state.isSolved, variantId])

  // Handle win completion (free play mode)
  // Guarded by gameSessionId to ensure it fires at most once per game session.
  const winProcessedForSessionRef = useRef<number>(-1)
  useEffect(() => {
    if (!state.isSolved) return
    if (winProcessedForSessionRef.current === state.gameSessionId) return
    winProcessedForSessionRef.current = state.gameSessionId

    storage.deleteGame('free').catch(() => {})
    storage
      .getStats()
      .then((stats) => {
        const nextStats = { ...stats }
        nextStats.totalSolved++
        nextStats.totalTimeMs += state.elapsedMs
        nextStats.solvedByDifficulty[difficulty]++
        const prevFastest = nextStats.fastestByDifficulty[difficulty] || 0
        if (prevFastest === 0 || state.elapsedMs < prevFastest) {
          nextStats.fastestByDifficulty[difficulty] = state.elapsedMs
        }
        storage.saveStats(nextStats)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isSolved, state.gameSessionId, difficulty, state.elapsedMs])

  // Memoized solver replay engine
  const engine = useMemo(() => {
    if (!traceResult || traceResult.events.length === 0) return null
    return new ReplayEngine(traceResult.events, 200)
  }, [traceResult])

  const currentFrame: ReplayFrame | null = useMemo(() => {
    if (!engine) return null
    return engine.getFrame(stepIndex)
  }, [engine, stepIndex])

  // Playback timer
  useEffect(() => {
    if (!isSolverPlaying || !engine || !traceResult) return
    const maxStep = traceResult.events.length - 1
    if (stepIndex >= maxStep) {
      setIsSolverPlaying(false)
      return
    }
    const timer = setTimeout(() => {
      setStepIndex((prev) => Math.min(maxStep, prev + 1))
    }, Math.max(20, 1000 / solverSpeed))
    return () => clearTimeout(timer)
  }, [isSolverPlaying, engine, traceResult, stepIndex, solverSpeed])

  // Naive comparison runner
  const handleRunNaiveCompare = async () => {
    if (!traceResult) return
    setIsCompareOpen(true)
    setIsCompareLoading(true)
    try {
      const res = await sudokuWorker.solveWithTrace(state.givens, 'naive', 50000)
      setNaiveStats(res.stats)
    } catch (e) {
      console.error('Naive compare error:', e)
    } finally {
      setIsCompareLoading(false)
    }
  }

  // Get hint from worker
  const handleGetHint = async () => {
    if (state.isSolved || state.isPaused) return
    try {
      const gridStr = state.cells.map((v) => (v === 0 ? '.' : String(v))).join('')
      const h: HintResult = await sudokuWorker.hint(gridStr)

      if (h.technique !== 'none') {
        dispatch({
          type: 'APPLY_HINT',
          cell: h.cell,
          value: h.value,
        })
        setHintMessage(`[${h.technique.replace('_', ' ')}] ${h.explanation}`)
      } else {
        setHintMessage(h.explanation || 'No hints needed!')
      }
    } catch {
      setHintMessage('Hint unavailable for current board state.')
    }
  }

  // Check puzzle validity
  const handleCheckPuzzle = async () => {
    const gridStr = state.cells.map((v) => (v === 0 ? '.' : String(v))).join('')
    const checkRes = await sudokuWorker.check(gridStr)
    if (!checkRes.valid) {
      setIsCheckNotice('Board has conflicts! Check highlighted red cells.')
    } else if (checkRes.solvable) {
      setIsCheckNotice('All filled cells are correct so far!')
    } else {
      setIsCheckNotice('Current placement makes puzzle unsolvable.')
    }
    setTimeout(() => setIsCheckNotice(null), 4000)
  }

  const handleShare = () => {
    const url = new URL(window.location.href)
    url.searchParams.set('diff', difficulty)
    url.searchParams.set('seed', activeSeed)
    navigator.clipboard.writeText(url.toString())
    setShareNotice('Share URL copied to clipboard!')
    setTimeout(() => setShareNotice(null), 3000)
  }

  const formatTimer = (ms: number) => {
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const getPlayExplanationBreakdown = (event: any) => {
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
      case 'place':
        return {
          title: 'NAIVE PLACEMENT',
          coordinate: `R${r}C${c} = ${event.digit}`,
          detail: `No conflict found. Placed ${event.digit} at R${r}C${c} and advancing to next empty cell.`,
        }
      case 'conflict':
        return {
          title: 'CONFLICT DETECTED',
          coordinate: `R${r}C${c} = ${event.digit}`,
          detail: `Conflict: digit ${event.digit} clashes with peer cell(s). Trying next digit.`,
        }
      case 'contradiction':
        return { title: 'CONTRADICTION', coordinate: coord, detail: 'Invalid cell state encountered. Reverting hypothesis.' }
      case 'backtrack':
        return {
          title: 'BACKTRACK',
          coordinate: coord,
          detail: event.cell !== undefined
            ? `All digits 1-9 exhausted at R${r}C${c}. Clearing cell and returning to previous cell.`
            : 'Unwinding hypothesis search tree.',
        }
      default:
        return { title: 'LOGIC ANALYSIS', coordinate: coord, detail: 'Evaluating grid constraints.' }
    }
  }

  return (
    <div className="game-view-container">
      <div className="game-layout-grid">
        {/* Left Column: Board Section (Board + NumberPad in play mode, Board in solver mode) */}
        <div className="game-board-section">
          {subMode === 'play' && (
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
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Game Paused</h3>
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
              ) : isLoading ? (
                <div
                  className="sudoku-board ui-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    aspectRatio: '1 / 1',
                    margin: '0 auto',
                    border: '3px solid var(--border-box)',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-surface)',
                    boxShadow: 'var(--shadow-md)',
                    gap: '12px',
                    width: '100%',
                    maxWidth: 'min(100%, min(64vh, 520px))',
                    padding: '24px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>Loading Puzzle...</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Generating Sudoku logic with Pyodide
                  </div>
                </div>
              ) : (
                <Board
                  cells={state.cells}
                  givens={state.givens}
                  notes={state.notes}
                  selectedIndex={state.selectedIndex}
                  conflicts={state.highlightConflicts ? state.conflicts : new Set()}
                  variantConfig={variantConfig}
                  onSelectCell={(idx) => dispatch({ type: 'SELECT_CELL', index: idx })}
                  onSetDigit={(digit) => dispatch({ type: 'SET_DIGIT', digit })}
                  onClearCell={() => dispatch({ type: 'CLEAR_CELL' })}
                  onToggleNotesMode={() => dispatch({ type: 'TOGGLE_NOTES_MODE' })}
                />
              )}

              <NumberPad
                cells={state.cells}
                notesMode={state.notesMode}
                canUndo={state.history.length > 0}
                canRedo={state.redoStack.length > 0}
                showRemainingCounts={showRemainingCounts}
                onSelectDigit={(digit) => dispatch({ type: 'SET_DIGIT', digit })}
                onClear={() => dispatch({ type: 'CLEAR_CELL' })}
                onToggleNotes={() => dispatch({ type: 'TOGGLE_NOTES_MODE' })}
                onUndo={() => dispatch({ type: 'UNDO' })}
                onRedo={() => dispatch({ type: 'REDO' })}
                disabled={state.isPaused || state.isSolved || isLoading}
              />
            </>
          )}

          {subMode === 'solver' && (
            <div ref={solverContainerRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
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

              {!isSolverTracing && currentFrame && (
                <Board
                  cells={currentFrame.cells.map((c) => c.value)}
                  givens={state.givens}
                  notes={currentFrame.cells.map((c) => c.candidates)}
                  cellTypes={currentFrame.cells.map((c) => c.type)}
                  guessDepths={currentFrame.cells.map((c) => c.guessDepth)}
                  highlightCell={currentFrame.highlightCell}
                  highlightUnit={currentFrame.highlightUnit}
                  eliminations={currentFrame.eliminations}
                  conflictWithCells={currentFrame.conflictWithCells}
                  backtrackCell={currentFrame.backtrackCell}
                  variantConfig={variantConfig}
                  readOnly={true}
                />
              )}

              {!isSolverTracing && !currentFrame && (
                <Board
                  cells={state.givens.split('').map((ch) => (ch === '.' || ch === '0' ? 0 : parseInt(ch, 10)))}
                  givens={state.givens}
                  notes={Array(81).fill([])}
                  cellTypes={state.givens.split('').map((ch) => (ch !== '.' && ch !== '0' ? 'given' : 'empty'))}
                  guessDepths={Array(81).fill(0)}
                  variantConfig={variantConfig}
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
              {/* Quit to Home & Difficulty Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {onGoHome && (
                  <button
                    onClick={onGoHome}
                    title="Quit to Home (Campaign Levels)"
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
                    <span>Home</span>
                  </button>
                )}

                <select
                  value={difficulty}
                  onChange={(e) => {
                    const d = e.target.value as Difficulty
                    setDifficulty(d)
                    const newSeed = `seed_${Math.random().toString(36).slice(2)}`
                    setActiveSeed(newSeed)
                    loadNewGame(d, newSeed, variantId)
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-base)',
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="beginner">Beginner</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                  <option value="expert">Expert</option>
                </select>

                {/* Variant selector with Info Popover */}
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <select
                    value={variantId}
                    onChange={(e) => {
                      const v = e.target.value as VariantId
                      setVariantId(v)
                      setShowVariantInfo(false)
                      try {
                        localStorage.setItem('sudoku_free_variant', v)
                      } catch {}
                      const newSeed = `seed_${Math.random().toString(36).slice(2)}`
                      setActiveSeed(newSeed)
                      loadNewGame(difficulty, newSeed, v)
                    }}
                    title="Sudoku variant"
                    style={{
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${variantId !== 'classic' ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                      backgroundColor: variantId !== 'classic' ? 'rgba(78,161,255,0.10)' : 'var(--bg-base)',
                      color: variantId !== 'classic' ? 'var(--accent-blue)' : 'var(--text-primary)',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      maxWidth: '145px',
                    }}
                  >
                    <option value="classic">Classic</option>
                    <option value="diagonal">Diagonal</option>
                    <option value="windoku">Windoku</option>
                    <option value="center-dot">Center Dot</option>
                    <option value="asterisk">Asterisk</option>
                    <option value="girandola">Girandola</option>
                    <option value="disjoint">Disjoint</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setShowVariantInfo((v) => !v)}
                    aria-label={`View rules for ${variantConfig.metadata.name}`}
                    title="Variant rules & marked cells"
                    className="ui-btn ui-btn-outline"
                    style={{
                      marginLeft: '4px',
                      padding: '6px 7px',
                      minHeight: '34px',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: variantId !== 'classic' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                      borderColor: showVariantInfo ? 'var(--accent-blue)' : undefined,
                    }}
                  >
                    <Info size={16} />
                  </button>

                  {showVariantInfo && (
                    <VariantInfoPopover
                      variantId={variantId}
                      onClose={() => setShowVariantInfo(false)}
                    />
                  )}
                </div>

                <button
                  onClick={() => {
                    const newSeed = `seed_${Math.random().toString(36).slice(2)}`
                    setActiveSeed(newSeed)
                    loadNewGame(difficulty, newSeed, variantId)
                  }}
                  title="Generate new random puzzle"
                  style={{
                    padding: '6px',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-secondary)',
                    minHeight: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={18} />
                </button>
              </div>

              {/* Timer & Pause */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  className="tabular-nums"
                  style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}
                >
                  {formatTimer(state.elapsedMs)}
                </span>
                <button
                  onClick={() => dispatch({ type: 'SET_PAUSED', paused: !state.isPaused })}
                  aria-label={state.isPaused ? 'Resume game' : 'Pause game'}
                  style={{
                    padding: '6px',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-secondary)',
                    minHeight: '36px',
                    cursor: 'pointer',
                  }}
                >
                  {state.isPaused ? <Play size={18} /> : <Pause size={18} />}
                </button>

                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  aria-label="Reset puzzle"
                  title="Reset puzzle"
                  style={{
                    padding: '6px',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-secondary)',
                    minHeight: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <RotateCcw size={18} />
                </button>
              </div>

              {/* Stats Summary: Mistakes & Hints */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span>
                  Mistakes:{' '}
                  <strong style={{ color: state.mistakes > 0 ? 'var(--color-conflict)' : 'inherit' }}>
                    {state.mistakes}
                  </strong>
                </span>
                <span>
                  Hints: <strong>{state.hintsUsed}</strong>
                </span>
              </div>
              {variantConfig && variantConfig.metadata.id !== 'classic' && (
                <div
                  style={{
                    backgroundColor: 'rgba(78, 161, 255, 0.08)',
                    border: '1px solid rgba(78, 161, 255, 0.25)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    lineHeight: 1.35,
                    color: 'var(--accent-blue)',
                    marginTop: '8px',
                    width: '100%',
                  }}
                >
                  <strong>{variantConfig.metadata.name}:</strong> {variantConfig.metadata.description}
                </div>
              )}
            </div>
          </div>

          {/* Sub-Mode Switcher: Play vs Watch Solver */}
          <div className="panel-tabs-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            <div className="ui-segmented" role="tablist">
              <button
                role="tab"
                aria-selected={subMode === 'play'}
                className={`ui-segmented-item ${subMode === 'play' ? 'active' : ''}`}
                onClick={() => setSubMode('play')}
              >
                <span>Play Mode</span>
              </button>
              <button
                role="tab"
                aria-selected={subMode === 'solver' && solverType === 'smart'}
                className={`ui-segmented-item ${subMode === 'solver' && solverType === 'smart' ? 'active' : ''}`}
                onClick={() => handleOpenSolver('smart')}
              >
                <Eye size={15} />
                <span>Watch Solver</span>
              </button>
              <button
                role="tab"
                aria-selected={subMode === 'solver' && solverType === 'naive'}
                className={`ui-segmented-item ${subMode === 'solver' && solverType === 'naive' ? 'active' : ''}`}
                onClick={() => handleOpenSolver('naive')}
              >
                <Eye size={15} />
                <span>Naive (red)</span>
              </button>
            </div>

            {subMode === 'solver' ? (
              <button
                onClick={handleRunNaiveCompare}
                disabled={!traceResult || isSolverTracing}
                className="ui-btn ui-btn-outline"
                style={{
                  width: '100%',
                  padding: '8px 14px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  minHeight: '40px',
                }}
              >
                <BarChart2 size={16} />
                <span>Compare Naive</span>
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                {enableHints && (
                  <button
                    onClick={handleGetHint}
                    disabled={state.isPaused || state.isSolved || isLoading}
                    className="ui-btn ui-btn-outline"
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      color: 'var(--color-logic)',
                      minHeight: '40px',
                    }}
                  >
                    <Lightbulb size={16} />
                    <span>Get Hint</span>
                  </button>
                )}
                <button
                  onClick={handleCheckPuzzle}
                  disabled={state.isPaused || state.isSolved || isLoading}
                  className="ui-btn ui-btn-outline"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    minHeight: '40px',
                  }}
                >
                  <CheckCircle size={16} />
                  <span>Check</span>
                </button>
                <button
                  onClick={handleShare}
                  title="Share puzzle link"
                  aria-label="Share puzzle link"
                  className="ui-btn ui-btn-outline"
                  style={{
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '40px',
                    minWidth: '44px',
                  }}
                >
                  <Share2 size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Desktop Actions Bar: Undo, Redo, Erase (hidden on mobile, visible on desktop >=1000px) */}
          {subMode === 'play' && (
            <div className="desktop-action-bar ui-card" style={{ padding: '14px', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-arcade)', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
                ACTIONS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', width: '100%' }}>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'UNDO' })}
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
                  onClick={() => dispatch({ type: 'REDO' })}
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
                  onClick={() => dispatch({ type: 'CLEAR_CELL' })}
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

          {/* Feedback alerts */}
          <div className="panel-alerts-section">
            {hintMessage && subMode === 'play' && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'var(--color-logic-bg)',
                  color: 'var(--color-logic)',
                  border: '1px solid var(--color-logic)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                }}
              >
                {hintMessage}
              </div>
            )}

            {isCheckNotice && subMode === 'play' && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                }}
              >
                {isCheckNotice}
              </div>
            )}

            {shareNotice && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'var(--color-player-bg)',
                  color: 'var(--color-player)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                }}
              >
                {shareNotice}
              </div>
            )}
          </div>

          {/* Solver Playback Section */}
          {subMode === 'solver' && !isSolverTracing && currentFrame && (
            <div className="panel-playback-section">
              {(() => {
                const expl = getPlayExplanationBreakdown(traceResult?.events[stepIndex])
                const maxStep = (traceResult?.events.length ?? 0) - 1
                const isSolved = Boolean(traceResult?.success && maxStep >= 0 && stepIndex >= maxStep)
                return (
                  <SolverPlayback
                    isPlaying={isSolverPlaying}
                    isTracing={isSolverTracing}
                    isSolved={isSolved}
                    canStepBack={stepIndex > 0}
                    canStepForward={traceResult ? stepIndex < traceResult.events.length - 1 : false}
                    speed={solverSpeed}
                    solverType={solverType}
                    tries={currentFrame.stats.tries}
                    backtracks={currentFrame.stats.backtracks}
                    explanationTitle={expl.title}
                    explanationCoordinate={expl.coordinate}
                    explanationDetail={expl.detail}
                    onTogglePlay={() => setIsSolverPlaying(!isSolverPlaying)}
                    onStepBackward={() => {
                      setIsSolverPlaying(false)
                      setStepIndex((prev) => Math.max(0, prev - 1))
                    }}
                    onStepForward={() => {
                      setIsSolverPlaying(false)
                      if (traceResult) {
                        setStepIndex((prev) => Math.min(traceResult.events.length - 1, prev + 1))
                      }
                    }}
                    onChangeSpeed={(s) => setSolverSpeed(s)}
                  />
                )
              })()}
            </div>
          )}

          {/* Footer Section: Color & Candidates Guide / Legend */}
          {subMode === 'solver' && !isSolverTracing && currentFrame && (
            <div className="panel-footer-section">
              <div
                className="ui-card"
                style={{
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '0.8rem',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Color & Candidates Guide</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: '#FFFFFF', border: '1px solid var(--border-subtle)' }} />
                    <span>Given Clue</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: 'var(--color-logic)' }} />
                    <span>Logic Placed</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: 'var(--color-player)' }} />
                    <span>Guess D1</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: 'var(--color-guess-4)' }} />
                    <span>Guess D2+</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: 'var(--color-conflict)' }} />
                    <span>Contradiction</span>
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '6px' }}>
                  <strong>Small 3x3 numbers:</strong> Candidate pencilmarks showing all digits still mathematically valid for each cell.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Naive Solver Comparison Modal */}
      {traceResult && (
        <NaiveCompareModal
          isOpen={isCompareOpen}
          isLoading={isCompareLoading}
          onClose={() => setIsCompareOpen(false)}
          propagateStats={traceResult.stats}
          naiveStats={naiveStats}
        />
      )}

      {/* Reset Puzzle Confirmation Modal */}
      {showResetConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-dialog-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              setShowResetConfirm(false)
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
            <h3
              id="reset-dialog-title"
              style={{
                fontSize: '1.1rem',
                fontWeight: 700,
                margin: 0,
                color: 'var(--text-primary)',
                textAlign: 'center',
              }}
            >
              Reset puzzle?
            </h3>
            <p
              style={{
                fontSize: '0.9rem',
                lineHeight: 1.5,
                color: 'var(--text-secondary)',
                margin: 0,
                textAlign: 'center',
              }}
            >
              Your current progress on this puzzle will be cleared. This action cannot be undone.
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '4px' }}>
              <button
                ref={cancelBtnRef}
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="ui-btn ui-btn-secondary"
                style={{
                  padding: '8px 24px',
                  minHeight: '38px',
                  fontSize: '0.85rem',
                  flex: 1,
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleResetPuzzle}
                className="ui-btn ui-btn-danger"
                style={{
                  padding: '8px 24px',
                  minHeight: '38px',
                  fontSize: '0.85rem',
                  flex: 1,
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Win Modal */}
      {state.isSolved && (
        <div
          role="dialog"
          aria-modal="true"
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
            className="anim-pop"
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '28px',
              width: '100%',
              maxWidth: '440px',
              textAlign: 'center',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-success-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Award size={36} color="var(--color-success)" />
              </div>
            </div>

            <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Puzzle Solved!</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Congratulations! You completed the {difficulty} puzzle.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                padding: '12px',
                backgroundColor: 'var(--bg-base)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Time</span>
                <p className="tabular-nums" style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                  {formatTimer(state.elapsedMs)}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mistakes</span>
                <p className="tabular-nums" style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                  {state.mistakes}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hints</span>
                <p className="tabular-nums" style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                  {state.hintsUsed}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={() => {
                  const newSeed = `seed_${Math.random().toString(36).slice(2)}`
                  setActiveSeed(newSeed)
                  loadNewGame(difficulty, newSeed)
                }}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: 'var(--color-player)',
                  color: '#fff',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                }}
              >
                New Puzzle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
