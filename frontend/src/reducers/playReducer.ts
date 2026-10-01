/**
 * Reducer for Play and Levels interactive game state.
 * Manages board values, notes (pencil marks), cell selection, undo/redo history,
 * conflict calculation, auto-removing peer notes, mistake counting, and timer.
 *
 * KEY INVARIANT: isSolved may only transition false→true inside SET_DIGIT,
 * APPLY_HINT, and FILL_SOLUTION. RESET_GAME and RESTORE_SAVED_GAME always
 * produce isSolved=false, even if the loaded cells happen to be fully filled.
 * This prevents stale-state completion re-fires on level transitions.
 *
 * gameSessionId increments on every RESET_GAME and RESTORE_SAVED_GAME.
 * Callers store this in a ref and compare to debounce win callbacks to
 * exactly the current game session.
 */

export interface PlayCellState {
  index: number
  row: number
  col: number
  box: number
  value: number // 0 for empty
  isGiven: boolean
  notes: number[] // digits 1..9
  hasConflict: boolean
}

export interface PlayHistoryItem {
  cells: number[]
  notes: number[][]
}

export interface PlayState {
  givens: string
  solution: string
  cells: number[] // 81 integers 0-9
  notes: number[][] // 81 arrays of integers 1-9
  selectedIndex: number | null
  notesMode: boolean
  history: PlayHistoryItem[]
  redoStack: PlayHistoryItem[]
  conflicts: Set<number>
  mistakes: number
  hintsUsed: number
  isSolved: boolean
  isPaused: boolean
  elapsedMs: number
  autoRemoveNotes: boolean
  highlightConflicts: boolean
  /** Increments on every RESET_GAME / RESTORE_SAVED_GAME.
   *  Use it as a "session token" to detect stale win callbacks. */
  gameSessionId: number
  /** True when the puzzle solution was filled by the automated level solver. */
  solvedBySolver: boolean
  /**
   * Extra all-different groups injected by the active variant (e.g. diagonal cells).
   * Used by computeConflicts and getPeerIndices so conflict detection is variant-aware.
   * Classic: []. Diagonal: [MAIN_DIAGONAL, ANTI_DIAGONAL].
   */
  extraConflictGroups: ReadonlyArray<ReadonlyArray<number>>
}

export type PlayAction =
  | { type: 'SELECT_CELL'; index: number | null }
  | { type: 'SET_DIGIT'; digit: number }
  | { type: 'CLEAR_CELL' }
  | { type: 'TOGGLE_NOTES_MODE' }
  | { type: 'TOGGLE_NOTE'; digit: number }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'APPLY_HINT'; cell: [number, number]; value: number }
  | { type: 'TICK_TIMER'; deltaMs: number }
  | { type: 'SET_PAUSED'; paused: boolean }
  | { type: 'SET_SETTINGS'; autoRemoveNotes?: boolean; highlightConflicts?: boolean }
  | { type: 'RESET_GAME'; givens: string; solution: string }
  | { type: 'FILL_SOLUTION' }
  | { type: 'SET_VARIANT_GROUPS'; groups: ReadonlyArray<ReadonlyArray<number>> }
  | {
      type: 'RESTORE_SAVED_GAME'
      givens: string
      solution: string
      cells: number[]
      notes: number[][]
      history: PlayHistoryItem[]
      redoStack: PlayHistoryItem[]
      elapsedMs: number
      mistakes: number
      hints: number
    }

export function computeConflicts(
  cells: number[],
  extraGroups: ReadonlyArray<ReadonlyArray<number>> = []
): Set<number> {
  const conflicts = new Set<number>()

  // Helper: scan one all-different group
  const scanGroup = (indices: ArrayLike<number>) => {
    const seen = new Map<number, number>()
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i]
      const val = cells[idx]
      if (val !== 0) {
        if (seen.has(val)) {
          conflicts.add(idx)
          conflicts.add(seen.get(val)!)
        } else {
          seen.set(val, idx)
        }
      }
    }
  }

  // Standard rows
  for (let r = 0; r < 9; r++) {
    const row = Array.from({ length: 9 }, (_, c) => r * 9 + c)
    scanGroup(row)
  }

  // Standard columns
  for (let c = 0; c < 9; c++) {
    const col = Array.from({ length: 9 }, (_, r) => r * 9 + c)
    scanGroup(col)
  }

  // Standard 3×3 boxes
  for (let b = 0; b < 9; b++) {
    const br = Math.floor(b / 3) * 3
    const bc = (b % 3) * 3
    const box: number[] = []
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++)
        box.push((br + dr) * 9 + (bc + dc))
    scanGroup(box)
  }

  // Extra variant groups (diagonal, windoku, etc.)
  for (const group of extraGroups) {
    scanGroup(group)
  }

  return conflicts
}

export function getPeerIndices(idx: number, extraGroups: ReadonlyArray<ReadonlyArray<number>> = []): number[] {
  const peers = new Set<number>()
  const r = Math.floor(idx / 9)
  const c = idx % 9
  const br = Math.floor(r / 3) * 3
  const bc = Math.floor(c / 3) * 3

  for (let i = 0; i < 9; i++) {
    peers.add(r * 9 + i) // row
    peers.add(i * 9 + c) // col
  }

  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      peers.add((br + dr) * 9 + (bc + dc))
    }
  }

  // Extra variant peers
  for (const group of extraGroups) {
    if (group.includes(idx)) {
      for (const peer of group) peers.add(peer)
    }
  }

  peers.delete(idx)
  return Array.from(peers)
}

export function createInitialPlayState(
  givens: string,
  solution: string,
  autoRemoveNotes: boolean = true,
  highlightConflicts: boolean = true,
  sessionId: number = 0
): PlayState {
  const cells = new Array(81).fill(0)
  const notes: number[][] = Array.from({ length: 81 }, () => [])

  for (let i = 0; i < 81; i++) {
    const ch = givens[i]
    if (ch && ch !== '.' && ch !== '0') {
      cells[i] = parseInt(ch, 10)
    }
  }

  const conflicts = computeConflicts(cells)

  return {
    givens,
    solution,
    cells,
    notes,
    selectedIndex: null,
    notesMode: false,
    history: [],
    redoStack: [],
    conflicts,
    mistakes: 0,
    hintsUsed: 0,
    isSolved: false,
    isPaused: false,
    elapsedMs: 0,
    autoRemoveNotes,
    highlightConflicts,
    gameSessionId: sessionId,
    solvedBySolver: false,
    extraConflictGroups: [],
  }
}

export function playReducer(state: PlayState, action: PlayAction): PlayState {
  switch (action.type) {
    case 'SELECT_CELL':
      return {
        ...state,
        selectedIndex: action.index,
      }

    case 'TOGGLE_NOTES_MODE':
      return {
        ...state,
        notesMode: !state.notesMode,
      }

    case 'SET_PAUSED':
      return {
        ...state,
        isPaused: action.paused,
      }

    case 'TICK_TIMER':
      if (state.isPaused || state.isSolved) return state
      return {
        ...state,
        elapsedMs: state.elapsedMs + action.deltaMs,
      }

    case 'SET_SETTINGS':
      return {
        ...state,
        autoRemoveNotes: action.autoRemoveNotes ?? state.autoRemoveNotes,
        highlightConflicts: action.highlightConflicts ?? state.highlightConflicts,
      }

    case 'CLEAR_CELL': {
      if (state.selectedIndex === null || state.isSolved || state.isPaused) return state
      const idx = state.selectedIndex
      if (state.givens[idx] !== '.' && state.givens[idx] !== '0') return state // given cell locked

      if (state.cells[idx] === 0 && state.notes[idx].length === 0) return state

      // Push to history
      const historyItem: PlayHistoryItem = {
        cells: [...state.cells],
        notes: state.notes.map((n) => [...n]),
      }

      const nextCells = [...state.cells]
      nextCells[idx] = 0

      const nextNotes = state.notes.map((n) => [...n])
      nextNotes[idx] = []

      const nextConflicts = computeConflicts(nextCells, state.extraConflictGroups)

      return {
        ...state,
        cells: nextCells,
        notes: nextNotes,
        history: [...state.history, historyItem],
        redoStack: [],
        conflicts: nextConflicts,
      }
    }

    case 'SET_DIGIT': {
      if (state.selectedIndex === null || state.isSolved || state.isPaused) return state
      const idx = state.selectedIndex
      if (state.givens[idx] !== '.' && state.givens[idx] !== '0') return state // given cell locked

      const digit = action.digit
      if (digit < 1 || digit > 9) return state

      // Handle notes mode input
      if (state.notesMode) {
        const historyItem: PlayHistoryItem = {
          cells: [...state.cells],
          notes: state.notes.map((n) => [...n]),
        }

        const nextNotes = state.notes.map((n) => [...n])
        const currentNotes = nextNotes[idx]
        if (currentNotes.includes(digit)) {
          nextNotes[idx] = currentNotes.filter((d) => d !== digit)
        } else {
          nextNotes[idx] = [...currentNotes, digit].sort((a, b) => a - b)
        }

        return {
          ...state,
          notes: nextNotes,
          history: [...state.history, historyItem],
          redoStack: [],
        }
      }

      // Value mode: place digit
      if (state.cells[idx] === digit) return state

      const historyItem: PlayHistoryItem = {
        cells: [...state.cells],
        notes: state.notes.map((n) => [...n]),
      }

      const nextCells = [...state.cells]
      nextCells[idx] = digit

      const nextNotes = state.notes.map((n) => [...n])
      nextNotes[idx] = [] // clear notes in placed cell

      // Auto-remove notes from peers if enabled
      if (state.autoRemoveNotes) {
        const peers = getPeerIndices(idx, state.extraConflictGroups)
        for (const p of peers) {
          nextNotes[p] = nextNotes[p].filter((d) => d !== digit)
        }
      }

      const nextConflicts = computeConflicts(nextCells, state.extraConflictGroups)

      // Mistake tracking: placing digit that conflicts or differs from solution
      let nextMistakes = state.mistakes
      if (state.solution && state.solution.length === 81 && state.solution[idx] !== String(digit)) {
        nextMistakes++
      }

      // Check win condition: all 81 cells filled and 0 conflicts
      // Guard against vacuous truth: require exactly 81 cells
      const isComplete = nextCells.length === 81 && nextCells.every((v) => v !== 0)
      const isSolved = isComplete && nextConflicts.size === 0

      return {
        ...state,
        cells: nextCells,
        notes: nextNotes,
        history: [...state.history, historyItem],
        redoStack: [],
        conflicts: nextConflicts,
        mistakes: nextMistakes,
        isSolved,
      }
    }

    case 'TOGGLE_NOTE': {
      if (state.selectedIndex === null || state.isSolved || state.isPaused) return state
      const idx = state.selectedIndex
      if (state.givens[idx] !== '.' && state.givens[idx] !== '0') return state

      const digit = action.digit
      const historyItem: PlayHistoryItem = {
        cells: [...state.cells],
        notes: state.notes.map((n) => [...n]),
      }

      const nextNotes = state.notes.map((n) => [...n])
      const current = nextNotes[idx]
      if (current.includes(digit)) {
        nextNotes[idx] = current.filter((d) => d !== digit)
      } else {
        nextNotes[idx] = [...current, digit].sort((a, b) => a - b)
      }

      return {
        ...state,
        notes: nextNotes,
        history: [...state.history, historyItem],
        redoStack: [],
      }
    }

    case 'UNDO': {
      if (state.history.length === 0 || state.isSolved || state.isPaused) return state
      const previous = state.history[state.history.length - 1]
      const nextHistory = state.history.slice(0, state.history.length - 1)

      const redoItem: PlayHistoryItem = {
        cells: [...state.cells],
        notes: state.notes.map((n) => [...n]),
      }

      const nextConflicts = computeConflicts(previous.cells, state.extraConflictGroups)

      return {
        ...state,
        cells: [...previous.cells],
        notes: previous.notes.map((n) => [...n]),
        history: nextHistory,
        redoStack: [...state.redoStack, redoItem],
        conflicts: nextConflicts,
      }
    }

    case 'REDO': {
      if (state.redoStack.length === 0 || state.isSolved || state.isPaused) return state
      const nextItem = state.redoStack[state.redoStack.length - 1]
      const nextRedo = state.redoStack.slice(0, state.redoStack.length - 1)

      const historyItem: PlayHistoryItem = {
        cells: [...state.cells],
        notes: state.notes.map((n) => [...n]),
      }

      const nextConflicts = computeConflicts(nextItem.cells, state.extraConflictGroups)

      return {
        ...state,
        cells: [...nextItem.cells],
        notes: nextItem.notes.map((n) => [...n]),
        history: [...state.history, historyItem],
        redoStack: nextRedo,
        conflicts: nextConflicts,
      }
    }

    case 'APPLY_HINT': {
      if (state.isSolved || state.isPaused || !action.cell) return state
      let idx = 0
      if (Array.isArray(action.cell) && action.cell.length >= 2) {
        idx = action.cell[0] * 9 + action.cell[1]
      } else if (typeof action.cell === 'number') {
        idx = action.cell
      } else {
        return state
      }
      if (idx < 0 || idx >= 81) return state
      if (state.givens[idx] !== '.' && state.givens[idx] !== '0') return state

      const historyItem: PlayHistoryItem = {
        cells: [...state.cells],
        notes: state.notes.map((n) => [...n]),
      }

      const nextCells = [...state.cells]
      nextCells[idx] = action.value

      const nextNotes = state.notes.map((n) => [...n])
      nextNotes[idx] = []

      if (state.autoRemoveNotes) {
        const peers = getPeerIndices(idx, state.extraConflictGroups)
        for (const p of peers) {
          nextNotes[p] = nextNotes[p].filter((d) => d !== action.value)
        }
      }

      const nextConflicts = computeConflicts(nextCells, state.extraConflictGroups)
      const isComplete = nextCells.length === 81 && nextCells.every((v) => v !== 0)
      const isSolved = isComplete && nextConflicts.size === 0

      return {
        ...state,
        cells: nextCells,
        notes: nextNotes,
        selectedIndex: idx,
        history: [...state.history, historyItem],
        redoStack: [],
        conflicts: nextConflicts,
        hintsUsed: state.hintsUsed + 1,
        isSolved,
      }
    }

    case 'RESET_GAME': {
      const nextState = createInitialPlayState(
        action.givens,
        action.solution,
        state.autoRemoveNotes,
        state.highlightConflicts,
        state.gameSessionId + 1
      )
      // Preserve the active variant groups across difficulty/seed changes
      return { ...nextState, extraConflictGroups: state.extraConflictGroups }
    }

    case 'FILL_SOLUTION': {
      // Solver-submit path: sets isSolved=true and solvedBySolver=true
      if (!state.solution || state.solution.length !== 81) return state
      const solutionCells = state.solution.split('').map((ch) => parseInt(ch, 10))
      return {
        ...state,
        cells: solutionCells,
        notes: Array.from({ length: 81 }, () => []),
        conflicts: new Set(),
        isSolved: true,
        solvedBySolver: true,
      }
    }

    case 'RESTORE_SAVED_GAME': {
      // IMPORTANT: Never sets isSolved=true even if cells happen to be fully filled.
      // Completion must only occur via player moves (SET_DIGIT, APPLY_HINT).
      const conflicts = computeConflicts(action.cells, state.extraConflictGroups)

      return {
        ...state,
        givens: action.givens,
        solution: action.solution,
        cells: [...action.cells],
        notes: action.notes.map((n) => [...n]),
        history: [...action.history],
        redoStack: [...action.redoStack],
        elapsedMs: action.elapsedMs,
        mistakes: action.mistakes,
        hintsUsed: action.hints,
        conflicts,
        isSolved: false, // never true from a restore — only user moves set this
        solvedBySolver: false,
        gameSessionId: state.gameSessionId + 1, // bump session
      }
    }

    case 'SET_VARIANT_GROUPS':
      // Re-scan current cells with the new constraint groups
      return {
        ...state,
        extraConflictGroups: action.groups,
        conflicts: computeConflicts(state.cells, action.groups),
      }

    default:
      return state
  }
}
