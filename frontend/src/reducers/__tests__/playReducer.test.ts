import { describe, it, expect } from 'vitest'
import { playReducer, createInitialPlayState } from '../playReducer'

describe('playReducer', () => {
  const givens = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79'
  const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'

  it('initializes board with locked givens and empty cells', () => {
    const state = createInitialPlayState(givens, solution)
    expect(state.cells[0]).toBe(5)
    expect(state.cells[1]).toBe(3)
    expect(state.cells[2]).toBe(0)
    expect(state.conflicts.size).toBe(0)
    expect(state.isSolved).toBe(false)
  })

  it('selects cells and places digits on empty cells', () => {
    let state = createInitialPlayState(givens, solution)
    state = playReducer(state, { type: 'SELECT_CELL', index: 2 })
    expect(state.selectedIndex).toBe(2)

    // Place correct digit 4
    state = playReducer(state, { type: 'SET_DIGIT', digit: 4 })
    expect(state.cells[2]).toBe(4)
    expect(state.history).toHaveLength(1)
  })

  it('locks givens from being edited or cleared', () => {
    let state = createInitialPlayState(givens, solution)
    state = playReducer(state, { type: 'SELECT_CELL', index: 0 }) // cell 0 is given 5

    state = playReducer(state, { type: 'SET_DIGIT', digit: 9 })
    expect(state.cells[0]).toBe(5) // unchanged

    state = playReducer(state, { type: 'CLEAR_CELL' })
    expect(state.cells[0]).toBe(5) // unchanged
  })

  it('handles notes mode and auto-removes notes from peers upon placement', () => {
    let state = createInitialPlayState(givens, solution, true) // autoRemoveNotes = true

    // Add note 4 to cell 2 and peer cell 3
    state = playReducer(state, { type: 'SELECT_CELL', index: 2 })
    state = playReducer(state, { type: 'TOGGLE_NOTES_MODE' })
    state = playReducer(state, { type: 'SET_DIGIT', digit: 4 })
    expect(state.notes[2]).toEqual([4])

    state = playReducer(state, { type: 'SELECT_CELL', index: 3 })
    state = playReducer(state, { type: 'SET_DIGIT', digit: 4 })
    expect(state.notes[3]).toEqual([4])

    // Switch back to normal value mode and place 4 in cell 2
    state = playReducer(state, { type: 'TOGGLE_NOTES_MODE' })
    state = playReducer(state, { type: 'SELECT_CELL', index: 2 })
    state = playReducer(state, { type: 'SET_DIGIT', digit: 4 })

    // Cell 2 has placed 4, its notes cleared
    expect(state.cells[2]).toBe(4)
    expect(state.notes[2]).toEqual([])
    // Peer cell 3 should have note 4 auto-removed!
    expect(state.notes[3]).toEqual([])
  })

  it('detects live row, col, and box conflicts', () => {
    let state = createInitialPlayState(givens, solution)
    // Row 0 already contains 5 at index 0
    // Try placing 5 at index 2 (row 0, col 2)
    state = playReducer(state, { type: 'SELECT_CELL', index: 2 })
    state = playReducer(state, { type: 'SET_DIGIT', digit: 5 })

    expect(state.conflicts.has(0)).toBe(true)
    expect(state.conflicts.has(2)).toBe(true)
  })

  it('supports undo and redo of cell placements and notes', () => {
    let state = createInitialPlayState(givens, solution)
    state = playReducer(state, { type: 'SELECT_CELL', index: 2 })
    state = playReducer(state, { type: 'SET_DIGIT', digit: 4 })
    expect(state.cells[2]).toBe(4)

    // Undo
    state = playReducer(state, { type: 'UNDO' })
    expect(state.cells[2]).toBe(0)
    expect(state.redoStack).toHaveLength(1)

    // Redo
    state = playReducer(state, { type: 'REDO' })
    expect(state.cells[2]).toBe(4)
    expect(state.redoStack).toHaveLength(0)
  })

  it('tracks mistakes and detects win condition', () => {
    let state = createInitialPlayState(givens, solution)
    state = playReducer(state, { type: 'SELECT_CELL', index: 2 })

    // Wrong digit (solution at index 2 is 4)
    state = playReducer(state, { type: 'SET_DIGIT', digit: 9 })
    expect(state.mistakes).toBe(1)
  })

  it('handles FILL_SOLUTION by marking solvedBySolver=true and isSolved=true', () => {
    let state = createInitialPlayState(givens, solution)
    expect(state.solvedBySolver).toBe(false)
    expect(state.isSolved).toBe(false)

    state = playReducer(state, { type: 'FILL_SOLUTION' })
    expect(state.isSolved).toBe(true)
    expect(state.solvedBySolver).toBe(true)
    expect(state.conflicts.size).toBe(0)
    expect(state.cells[2]).toBe(4)
  })

  it('resets solvedBySolver to false and bumps session on RESET_GAME', () => {
    let state = createInitialPlayState(givens, solution)
    state = playReducer(state, { type: 'FILL_SOLUTION' })
    expect(state.solvedBySolver).toBe(true)

    const prevSession = state.gameSessionId
    state = playReducer(state, { type: 'RESET_GAME', givens, solution })
    expect(state.solvedBySolver).toBe(false)
    expect(state.isSolved).toBe(false)
    expect(state.gameSessionId).toBe(prevSession + 1)
  })

  it('resets solvedBySolver to false and bumps session on RESTORE_SAVED_GAME', () => {
    let state = createInitialPlayState(givens, solution)
    state = playReducer(state, { type: 'FILL_SOLUTION' })
    expect(state.solvedBySolver).toBe(true)

    const prevSession = state.gameSessionId
    state = playReducer(state, {
      type: 'RESTORE_SAVED_GAME',
      givens,
      solution,
      cells: new Array(81).fill(0),
      notes: Array.from({ length: 81 }, () => []),
      history: [],
      redoStack: [],
      elapsedMs: 5000,
      mistakes: 0,
      hints: 0,
    })
    expect(state.solvedBySolver).toBe(false)
    expect(state.isSolved).toBe(false)
    expect(state.gameSessionId).toBe(prevSession + 1)
  })
})

