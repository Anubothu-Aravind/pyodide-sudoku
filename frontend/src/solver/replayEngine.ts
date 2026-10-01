/**
 * Pure Functional Replay Engine for Solver Traces.
 *
 * Computes exact board state, candidate sets, decision stacks, search trees,
 * and highlights at step N. Uses keyframing (every 200 events) for O(k) scrubbing.
 */

import type {
  TraceEvent,
  InitTraceEvent,
  SingleTraceEvent,
  EliminateTraceEvent,
  BranchTraceEvent,
  ContradictionTraceEvent,
  BacktrackTraceEvent,
  SolutionTraceEvent,
  PlaceTraceEvent,
  ConflictTraceEvent,
} from '../types'

export interface CellState {
  index: number
  row: number
  col: number
  value: number // 0 if empty
  candidates: number[] // remaining candidates (1-9)
  type: 'given' | 'logic' | 'guess' | 'empty' | 'conflict'
  guessDepth: number
}

export interface DecisionItem {
  depth: number
  cell: number
  chosenDigit: number
  candidates: number[]
  stepIndex: number
}

export interface SearchTreeNode {
  id: string
  depth: number
  cell: number
  chosenDigit: number
  candidates: number[]
  stepIndex: number
  status: 'active' | 'dead_end' | 'success'
  children: SearchTreeNode[]
  parentId?: string
}

export interface ReplayStats {
  logicPlacements: number
  guessedPlacements: number
  branches: number
  contradictions: number
  backtracks: number
  tries: number
  currentDepth: number
  maxDepth: number
  elapsedSteps: number
}

export interface ReplayFrame {
  stepIndex: number
  event: TraceEvent
  cells: CellState[]
  highlightCell: number | null
  highlightUnit: { type: 'row' | 'col' | 'box'; index: number } | null
  eliminations: [number, number][]
  conflictWithCells: number[]
  backtrackCell: number | null
  currentDepth: number
  maxDepthReached: number
  stats: ReplayStats
  decisionStack: DecisionItem[]
  searchTree: SearchTreeNode
}

// Precomputed lookup tables for 81 cells
const CELL_ROW = new Uint8Array(81)
const CELL_COL = new Uint8Array(81)
const CELL_BOX = new Uint8Array(81)
const CELL_PEERS: number[][] = Array.from({ length: 81 }, () => [])

for (let i = 0; i < 81; i++) {
  const r = Math.floor(i / 9)
  const c = i % 9
  const b = Math.floor(r / 3) * 3 + Math.floor(c / 3)
  CELL_ROW[i] = r
  CELL_COL[i] = c
  CELL_BOX[i] = b
}

for (let i = 0; i < 81; i++) {
  const peers = new Set<number>()
  const r = CELL_ROW[i]
  const c = CELL_COL[i]
  const b = CELL_BOX[i]
  for (let j = 0; j < 81; j++) {
    if (j !== i && (CELL_ROW[j] === r || CELL_COL[j] === c || CELL_BOX[j] === b)) {
      peers.add(j)
    }
  }
  CELL_PEERS[i] = Array.from(peers)
}

export class ReplayEngine {
  public readonly events: TraceEvent[]
  public readonly totalSteps: number
  private readonly keyframeInterval: number
  private keyframes = new Map<number, ReplayFrame>()
  private frameCache = new Map<number, ReplayFrame>()
  public readonly branchIndices: number[] = []
  public readonly contradictionIndices: number[] = []
  public readonly backtrackIndices: number[] = []
  public solvedIndex: number = -1

  constructor(events: TraceEvent[], keyframeInterval: number = 200) {
    this.events = events
    this.totalSteps = events.length
    this.keyframeInterval = keyframeInterval

    // Precompute index markers for timeline scrubbing
    for (let i = 0; i < events.length; i++) {
      const type = events[i].type
      if (type === 'branch') this.branchIndices.push(i)
      else if (type === 'contradiction') this.contradictionIndices.push(i)
      else if (type === 'backtrack') this.backtrackIndices.push(i)
      else if (type === 'solution' && this.solvedIndex === -1) this.solvedIndex = i
    }

    if (events.length > 0) {
      // Build initial keyframe (step 0)
      const initialFrame = this.buildInitialFrame(events[0])
      this.computeCandidatesForFrame(initialFrame)
      this.keyframes.set(0, this.cloneFrame(initialFrame))
      this.frameCache.set(0, this.cloneFrame(initialFrame))
    }
  }

  /**
   * Recomputes each empty cell's candidates directly from that frame's cell values
   * using bitmasks: digits 1-9 not present in the cell's row, column, or box.
   * Placed cells have no candidates.
   */
  public computeCandidatesForFrame(frame: ReplayFrame): void {
    const rowMask = new Uint16Array(9)
    const colMask = new Uint16Array(9)
    const boxMask = new Uint16Array(9)

    for (let i = 0; i < 81; i++) {
      const val = frame.cells[i].value
      if (val > 0) {
        const bit = 1 << val
        rowMask[CELL_ROW[i]] |= bit
        colMask[CELL_COL[i]] |= bit
        boxMask[CELL_BOX[i]] |= bit
      }
    }

    let zeroCandCell: number | null = null

    for (let i = 0; i < 81; i++) {
      const cell = frame.cells[i]
      if (cell.value > 0) {
        cell.candidates = []
      } else {
        const used = rowMask[CELL_ROW[i]] | colMask[CELL_COL[i]] | boxMask[CELL_BOX[i]]
        const cands: number[] = []
        for (let d = 1; d <= 9; d++) {
          if ((used & (1 << d)) === 0) {
            cands.push(d)
          }
        }
        cell.candidates = cands
        if (cands.length === 0 && zeroCandCell === null) {
          zeroCandCell = i
        }
      }
    }

    // Contradiction frames: a cell with zero candidates is highlighted in red
    if (frame.event.type === 'contradiction') {
      const ev = frame.event as ContradictionTraceEvent
      if (zeroCandCell !== null) {
        frame.highlightCell = zeroCandCell
      } else if (ev.cell !== null && ev.cell !== undefined) {
        frame.highlightCell = ev.cell
      }
    }
  }

  private buildInitialFrame(initEvent: TraceEvent): ReplayFrame {
    const cells: CellState[] = []
    const ev = initEvent as InitTraceEvent

    for (let i = 0; i < 81; i++) {
      const row = Math.floor(i / 9)
      const col = i % 9
      const char = ev.givens ? ev.givens[i] : '.'
      const val = char !== '.' && char !== '0' ? parseInt(char, 10) : 0

      let cand: number[] = []
      if (val === 0) {
        if (ev.candidates && ev.candidates[i]) {
          cand = [...ev.candidates[i]]
        } else {
          cand = [1, 2, 3, 4, 5, 6, 7, 8, 9]
        }
      }

      cells.push({
        index: i,
        row,
        col,
        value: val,
        candidates: cand,
        type: val !== 0 ? 'given' : 'empty',
        guessDepth: 0,
      })
    }

    const rootTree: SearchTreeNode = {
      id: 'root',
      depth: 0,
      cell: -1,
      chosenDigit: 0,
      candidates: [],
      stepIndex: 0,
      status: 'active',
      children: [],
    }

    return {
      stepIndex: 0,
      event: initEvent,
      cells,
      highlightCell: null,
      highlightUnit: null,
      eliminations: [],
      conflictWithCells: [],
      backtrackCell: null,
      currentDepth: 0,
      maxDepthReached: 0,
      stats: {
        logicPlacements: 0,
        guessedPlacements: 0,
        branches: 0,
        contradictions: 0,
        backtracks: 0,
        tries: 0,
        currentDepth: 0,
        maxDepth: 0,
        elapsedSteps: 0,
      },
      decisionStack: [],
      searchTree: rootTree,
    }
  }

  private cloneFrame(frame: ReplayFrame): ReplayFrame {
    return {
      stepIndex: frame.stepIndex,
      event: frame.event,
      cells: frame.cells.map((c) => ({
        ...c,
        candidates: [...c.candidates],
      })),
      highlightCell: frame.highlightCell,
      highlightUnit: frame.highlightUnit ? { ...frame.highlightUnit } : null,
      eliminations: [...frame.eliminations],
      conflictWithCells: [...(frame.conflictWithCells || [])],
      backtrackCell: frame.backtrackCell,
      currentDepth: frame.currentDepth,
      maxDepthReached: frame.maxDepthReached,
      stats: { ...frame.stats },
      decisionStack: frame.decisionStack.map((d) => ({
        ...d,
        candidates: [...d.candidates],
      })),
      searchTree: JSON.parse(JSON.stringify(frame.searchTree)),
    }
  }

  /**
   * Transition state from step k to step k+1 by applying events[k+1].
   */
  public applyEvent(frame: ReplayFrame, event: TraceEvent, stepIndex: number): ReplayFrame {
    frame.stepIndex = stepIndex
    frame.event = event
    frame.highlightCell = null
    frame.highlightUnit = null
    frame.eliminations = []
    frame.stats.elapsedSteps = stepIndex

    // Clear temporary conflict state from preceding step
    for (const c of frame.cells) {
      if (c.type === 'conflict') {
        c.value = 0
        c.type = 'empty'
      }
    }
    frame.conflictWithCells = []
    frame.backtrackCell = null

    const type = event.type

    switch (type) {
      case 'place': {
        const ev = event as PlaceTraceEvent
        const idx = ev.cell
        frame.highlightCell = idx
        frame.cells[idx].value = ev.digit
        frame.cells[idx].type = 'logic'
        frame.cells[idx].candidates = []
        frame.stats.tries++
        frame.stats.logicPlacements++
        for (const p of CELL_PEERS[idx]) {
          if (frame.cells[p].value === 0) {
            frame.eliminations.push([p, ev.digit])
          }
        }
        break
      }

      case 'conflict': {
        const ev = event as ConflictTraceEvent
        const idx = ev.cell
        frame.highlightCell = idx
        frame.cells[idx].value = ev.digit
        frame.cells[idx].type = 'conflict'
        frame.conflictWithCells = [...(ev.with || [])]
        frame.stats.tries++
        frame.stats.contradictions++
        break
      }

      case 'naked_single': {
        const ev = event as SingleTraceEvent
        const idx = ev.cell
        frame.highlightCell = idx
        frame.cells[idx].value = ev.digit
        frame.cells[idx].type = 'logic'
        frame.cells[idx].guessDepth = ev.depth
        frame.cells[idx].candidates = []
        frame.stats.logicPlacements++
        for (const p of CELL_PEERS[idx]) {
          if (frame.cells[p].value === 0) {
            frame.eliminations.push([p, ev.digit])
          }
        }
        break
      }

      case 'hidden_single': {
        const ev = event as SingleTraceEvent
        const idx = ev.cell
        frame.highlightCell = idx
        if (ev.unit_type && ev.unit_index !== undefined) {
          frame.highlightUnit = { type: ev.unit_type, index: ev.unit_index }
        }
        frame.cells[idx].value = ev.digit
        frame.cells[idx].type = 'logic'
        frame.cells[idx].guessDepth = ev.depth
        frame.cells[idx].candidates = []
        frame.stats.logicPlacements++
        for (const p of CELL_PEERS[idx]) {
          if (frame.cells[p].value === 0) {
            frame.eliminations.push([p, ev.digit])
          }
        }
        break
      }

      case 'eliminate': {
        const ev = event as EliminateTraceEvent
        frame.eliminations = [...ev.removals]
        for (const [cellIdx, digit] of ev.removals) {
          const c = frame.cells[cellIdx]
          c.candidates = c.candidates.filter((d) => d !== digit)
        }
        break
      }

      case 'branch': {
        const ev = event as BranchTraceEvent
        const idx = ev.cell
        frame.highlightCell = idx
        frame.currentDepth = ev.depth
        frame.maxDepthReached = Math.max(frame.maxDepthReached, ev.depth)
        frame.stats.currentDepth = ev.depth
        frame.stats.maxDepth = frame.maxDepthReached
        frame.stats.branches++
        frame.stats.guessedPlacements++

        frame.cells[idx].value = ev.chosen_digit
        frame.cells[idx].type = 'guess'
        frame.cells[idx].guessDepth = ev.depth
        frame.cells[idx].candidates = []

        for (const p of CELL_PEERS[idx]) {
          if (frame.cells[p].value === 0) {
            frame.eliminations.push([p, ev.chosen_digit])
          }
        }

        // Push to decision stack
        const decision: DecisionItem = {
          depth: ev.depth,
          cell: idx,
          chosenDigit: ev.chosen_digit,
          candidates: [...ev.candidates],
          stepIndex,
        }
        frame.decisionStack.push(decision)

        // Add to search tree
        const node: SearchTreeNode = {
          id: `node_${stepIndex}_${idx}_${ev.chosen_digit}`,
          depth: ev.depth,
          cell: idx,
          chosenDigit: ev.chosen_digit,
          candidates: [...ev.candidates],
          stepIndex,
          status: 'active',
          children: [],
        }
        this.addTreeNode(frame.searchTree, node, ev.depth)
        break
      }

      case 'contradiction': {
        const ev = event as ContradictionTraceEvent
        frame.stats.contradictions++
        if (ev.cell !== null && ev.cell !== undefined) {
          frame.highlightCell = ev.cell
        }
        if (ev.unit_type && ev.unit_index !== null && ev.unit_index !== undefined) {
          frame.highlightUnit = {
            type: ev.unit_type as 'row' | 'col' | 'box',
            index: ev.unit_index,
          }
        }
        // Mark current active tree branch as dead end
        this.markCurrentTreeDeadEnd(frame.searchTree)
        break
      }

      case 'backtrack': {
        const ev = event as BacktrackTraceEvent
        frame.stats.backtracks++
        if (ev.cell !== undefined) {
          const idx = ev.cell
          frame.cells[idx].value = 0
          frame.cells[idx].type = 'empty'
          frame.cells[idx].candidates = []
          frame.highlightCell = idx
          frame.backtrackCell = idx
        } else {
          const targetDepth = ev.to_depth ?? 0
          frame.currentDepth = targetDepth
          frame.stats.currentDepth = targetDepth

          // Pop decision stack down to target depth
          while (frame.decisionStack.length > 0 && frame.decisionStack[frame.decisionStack.length - 1].depth > targetDepth) {
            const popped = frame.decisionStack.pop()
            if (popped) {
              // Revert cell
              frame.cells[popped.cell].value = 0
              frame.cells[popped.cell].type = 'empty'
              frame.cells[popped.cell].guessDepth = 0
            }
          }
        }
        break
      }

      case 'solution': {
        const ev = event as SolutionTraceEvent
        if (ev.grid && ev.grid.length === 81) {
          for (let i = 0; i < 81; i++) {
            const val = Number(ev.grid[i])
            if (val > 0) {
              frame.cells[i].value = val
              if (frame.cells[i].type === 'empty') {
                frame.cells[i].type = 'logic'
              }
              frame.cells[i].candidates = []
            }
          }
        }
        // Mark all winning branches as success
        this.markCurrentTreeSuccess(frame.searchTree)
        break
      }

      case 'done': {
        break
      }
    }

    return frame
  }

  private addTreeNode(root: SearchTreeNode, newNode: SearchTreeNode, targetDepth: number): void {
    if (targetDepth === 1) {
      newNode.parentId = root.id
      root.children.push(newNode)
      return
    }

    // Traverse to the latest active child at depth - 1
    let curr = root
    while (curr.children.length > 0) {
      const activeChild = [...curr.children].reverse().find((c) => c.status === 'active') || curr.children[curr.children.length - 1]
      if (activeChild.depth === targetDepth - 1) {
        newNode.parentId = activeChild.id
        activeChild.children.push(newNode)
        return
      }
      curr = activeChild
    }
    // Fallback if no matching depth parent found
    newNode.parentId = curr.id
    curr.children.push(newNode)
  }

  private markCurrentTreeDeadEnd(root: SearchTreeNode): void {
    let curr = root
    while (curr.children.length > 0) {
      const activeChild = [...curr.children].reverse().find((c) => c.status === 'active')
      if (!activeChild) break
      curr = activeChild
    }
    if (curr !== root) {
      curr.status = 'dead_end'
    }
  }

  private markCurrentTreeSuccess(root: SearchTreeNode): void {
    let curr = root
    curr.status = 'success'
    while (curr.children.length > 0) {
      const activeChild = [...curr.children].reverse().find((c) => c.status === 'active')
      if (!activeChild) break
      activeChild.status = 'success'
      curr = activeChild
    }
  }

  /**
   * Get the ReplayFrame at targetStepIndex using keyframe seek.
   */
  public getFrame(targetStepIndex: number): ReplayFrame {
    if (this.totalSteps === 0) {
      throw new Error('Cannot get frame from empty trace')
    }

    const step = Math.max(0, Math.min(targetStepIndex, this.totalSteps - 1))

    if (this.frameCache.has(step)) {
      return this.frameCache.get(step)!
    }

    // Find nearest preceding keyframe
    const keyframeStep = Math.floor(step / this.keyframeInterval) * this.keyframeInterval

    let baseFrame: ReplayFrame
    if (this.keyframes.has(keyframeStep)) {
      baseFrame = this.cloneFrame(this.keyframes.get(keyframeStep)!)
    } else {
      // Find the highest available keyframe below step
      let highestKey = 0
      for (const k of this.keyframes.keys()) {
        if (k <= step && k > highestKey) {
          highestKey = k
        }
      }
      baseFrame = this.cloneFrame(this.keyframes.get(highestKey)!)
      // Replay up to keyframeStep and cache intermediate keyframes
      for (let s = highestKey + 1; s <= keyframeStep; s++) {
        baseFrame = this.applyEvent(baseFrame, this.events[s], s)
        if (s % this.keyframeInterval === 0) {
          this.keyframes.set(s, this.cloneFrame(baseFrame))
        }
      }
    }

    // Advance from keyframeStep to step
    let currentFrame = baseFrame
    for (let s = baseFrame.stepIndex + 1; s <= step; s++) {
      currentFrame = this.applyEvent(currentFrame, this.events[s], s)
      if (s % this.keyframeInterval === 0 && !this.keyframes.has(s)) {
        this.keyframes.set(s, this.cloneFrame(currentFrame))
      }
    }

    this.computeCandidatesForFrame(currentFrame)
    const cached = this.cloneFrame(currentFrame)
    this.frameCache.set(step, cached)
    return currentFrame
  }

  /**
   * Jump to next branch event.
   */
  public nextBranchIndex(currentStep: number): number {
    const next = this.branchIndices.find((idx) => idx > currentStep)
    return next !== undefined ? next : currentStep
  }

  /**
   * Jump to next contradiction event.
   */
  public nextContradictionIndex(currentStep: number): number {
    const next = this.contradictionIndices.find((idx) => idx > currentStep)
    return next !== undefined ? next : currentStep
  }

  /**
   * Jump to next backtrack event.
   */
  public nextBacktrackIndex(currentStep: number): number {
    const next = this.backtrackIndices.find((idx) => idx > currentStep)
    return next !== undefined ? next : currentStep
  }
}
