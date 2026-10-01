/**
 * Common Sudoku, Level, and Trace types for the web application.
 */

export type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert'

export interface LevelSpec {
  level: number
  world: number
  index_in_world: number
  difficulty: Difficulty
  min_clues: number
  max_clues: number
  target_clues: number
  min_effort: number
  max_effort: number
  symmetric: boolean
  seed: string
  is_boss: boolean
}

export interface LevelRecord {
  level: number
  world: number
  difficulty: Difficulty
  puzzle: string
  solution: string
  clues: number
  effort_score: number
  par_time_seconds: number
  is_boss: boolean
  seed: string
  generator_version: number
  status: 'locked' | 'unlocked' | 'in_progress' | 'completed'
  best_time_ms?: number
  stars?: number
  mistakes_best?: number
  hints_best?: number
  attempts: number
  completed_at?: string
  fallback?: boolean
}

export interface GameSaveState {
  levelId: number | 'free'
  givens: string
  cells: number[]
  notes: number[][] // 81 arrays of pencil mark numbers 1-9
  history: { cells: number[]; notes: number[][] }[]
  redoStack: { cells: number[]; notes: number[][] }[]
  elapsedMs: number
  mistakes: number
  hints: number
  updatedAt: number
}

export interface UserStats {
  totalSolved: number
  totalTimeMs: number
  currentStreakDays: number
  bestStreakDays: number
  lastPlayedDate: string | null
  solvedByDifficulty: Record<Difficulty, number>
  fastestByDifficulty: Record<Difficulty, number>
}

export interface UserSettings {
  theme: 'system' | 'light' | 'dark'
  highlightConflicts: boolean
  autoRemoveNotes: boolean
  quietScreenReader: boolean
  soundEnabled: boolean
}

// Trace event types matching Python sudoku.trace
export type TraceEventType =
  | 'init'
  | 'naked_single'
  | 'hidden_single'
  | 'eliminate'
  | 'branch'
  | 'contradiction'
  | 'backtrack'
  | 'solution'
  | 'done'
  | 'place'
  | 'conflict'

export interface BaseTraceEvent {
  type: TraceEventType
  event_type: TraceEventType
  explanation: string
}

export interface InitTraceEvent extends BaseTraceEvent {
  type: 'init'
  givens: string
  candidates: number[][]
}

export interface SingleTraceEvent extends BaseTraceEvent {
  type: 'naked_single' | 'hidden_single'
  cell: number
  cell_rc: [number, number]
  digit: number
  unit_type?: 'row' | 'col' | 'box'
  unit_index?: number
  depth: number
}

export interface EliminateTraceEvent extends BaseTraceEvent {
  type: 'eliminate'
  removals: [number, number][] // [cell_idx, digit]
  depth: number
}

export interface BranchTraceEvent extends BaseTraceEvent {
  type: 'branch'
  cell: number
  cell_rc: [number, number]
  candidates: number[]
  chosen_digit: number
  depth: number
}

export interface ContradictionTraceEvent extends BaseTraceEvent {
  type: 'contradiction'
  cell: number | null
  cell_rc: [number, number] | null
  unit_type: string | null
  unit_index: number | null
  digit: number | null
  reason: string
  depth: number
}

export interface BacktrackTraceEvent extends BaseTraceEvent {
  type: 'backtrack'
  cell?: number
  cell_rc?: [number, number]
  to_depth?: number
  undone_count?: number
}

export interface PlaceTraceEvent extends BaseTraceEvent {
  type: 'place'
  cell: number
  digit: number
  cell_rc?: [number, number]
}

export interface ConflictTraceEvent extends BaseTraceEvent {
  type: 'conflict'
  cell: number
  digit: number
  with: number[]
  cell_rc?: [number, number]
}

export interface SolutionTraceEvent extends BaseTraceEvent {
  type: 'solution'
  grid: string
}

export interface DoneTraceEvent extends BaseTraceEvent {
  type: 'done'
  stats: {
    nodes_expanded: number
    backtracks: number
    max_depth: number
    naked_singles?: number
    hidden_singles?: number
    effort_score?: number
    time_elapsed_seconds: number
    tries?: number
  }
  solution_count: number
}

export type TraceEvent =
  | InitTraceEvent
  | SingleTraceEvent
  | EliminateTraceEvent
  | BranchTraceEvent
  | ContradictionTraceEvent
  | BacktrackTraceEvent
  | SolutionTraceEvent
  | DoneTraceEvent
  | PlaceTraceEvent
  | ConflictTraceEvent

export interface TraceSolveResult {
  ok: boolean
  success: boolean
  mode: 'propagate' | 'naive' | 'naive_backtrack' | 'diagonal'
  variant?: 'classic' | 'diagonal'
  solution: string | null
  is_solvable: boolean
  stats: {
    nodes_expanded: number
    backtracks: number
    max_depth: number
    time_elapsed_seconds: number
    tries?: number
    [key: string]: any
  }
  truncated: boolean
  events: TraceEvent[]
  gave_up?: boolean
  error?: string
}

export interface HintResult {
  ok: boolean
  success: boolean
  technique: 'naked_single' | 'hidden_single' | 'reveal' | 'none'
  cell: [number, number]
  value: number
  explanation: string
  error?: string
}
