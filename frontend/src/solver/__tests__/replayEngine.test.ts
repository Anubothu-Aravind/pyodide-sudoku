import { describe, it, expect } from 'vitest'
import { ReplayEngine } from '../replayEngine'
import type { TraceEvent, InitTraceEvent, SingleTraceEvent, BranchTraceEvent, BacktrackTraceEvent, SolutionTraceEvent } from '../../types'

describe('ReplayEngine', () => {
  const dummyGivens = '1' + '.'.repeat(80)
  const sampleEvents: TraceEvent[] = [
    {
      type: 'init',
      event_type: 'init',
      explanation: 'Puzzle initialized',
      givens: dummyGivens,
      candidates: Array(81).fill([2, 3, 4, 5, 6, 7, 8, 9]),
    } as InitTraceEvent,
    {
      type: 'naked_single',
      event_type: 'naked_single',
      explanation: 'Naked single at R1C2',
      cell: 1,
      cell_rc: [0, 1],
      digit: 2,
      depth: 0,
    } as SingleTraceEvent,
    {
      type: 'eliminate',
      event_type: 'eliminate',
      explanation: 'Peer elimination',
      removals: [[2, 2], [3, 2]],
      depth: 0,
    },
    {
      type: 'branch',
      event_type: 'branch',
      explanation: 'Branch guess 3 at R1C3',
      cell: 2,
      cell_rc: [0, 2],
      candidates: [3, 4],
      chosen_digit: 3,
      depth: 1,
    } as BranchTraceEvent,
    {
      type: 'contradiction',
      event_type: 'contradiction',
      explanation: 'Dead end detected',
      cell: 3,
      cell_rc: [0, 3],
      unit_type: 'row',
      unit_index: 0,
      digit: null,
      reason: 'No candidates remaining',
      depth: 1,
    },
    {
      type: 'backtrack',
      event_type: 'backtrack',
      explanation: 'Backtrack to depth 0',
      to_depth: 0,
      undone_count: 1,
    } as BacktrackTraceEvent,
    {
      type: 'naked_single',
      event_type: 'naked_single',
      explanation: 'Alternative naked single',
      cell: 2,
      cell_rc: [0, 2],
      digit: 4,
      depth: 0,
    } as SingleTraceEvent,
  ]

  it('computes initial frame accurately', () => {
    const engine = new ReplayEngine(sampleEvents)
    const frame0 = engine.getFrame(0)
    expect(frame0.stepIndex).toBe(0)
    expect(frame0.cells[0].value).toBe(1)
    expect(frame0.cells[0].type).toBe('given')
    expect(frame0.cells[1].value).toBe(0)
    expect(frame0.cells[1].candidates).toEqual([2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('state at step N equals folding events 0..N', () => {
    const engine = new ReplayEngine(sampleEvents)

    // At step 1: cell 1 should have digit 2 placed via logic
    const frame1 = engine.getFrame(1)
    expect(frame1.cells[1].value).toBe(2)
    expect(frame1.cells[1].type).toBe('logic')
    expect(frame1.stats.logicPlacements).toBe(1)

    // At step 3: cell 2 has guessed value 3
    const frame3 = engine.getFrame(3)
    expect(frame3.cells[2].value).toBe(3)
    expect(frame3.cells[2].type).toBe('guess')
    expect(frame3.cells[2].guessDepth).toBe(1)
    expect(frame3.stats.branches).toBe(1)
    expect(frame3.decisionStack).toHaveLength(1)
    expect(frame3.decisionStack[0].chosenDigit).toBe(3)

    // At step 5: backtrack should revert cell 2 to empty
    const frame5 = engine.getFrame(5)
    expect(frame5.cells[2].value).toBe(0)
    expect(frame5.cells[2].type).toBe('empty')
    expect(frame5.decisionStack).toHaveLength(0)

    // At step 6: cell 2 has placed value 4
    const frame6 = engine.getFrame(6)
    expect(frame6.cells[2].value).toBe(4)
    expect(frame6.cells[2].type).toBe('logic')
  })

  it('keyframe seek equals sequential replay', () => {
    // Generate a long event stream to cross keyframe boundary (interval = 3)
    const longEvents: TraceEvent[] = [sampleEvents[0]]
    for (let i = 1; i <= 20; i++) {
      longEvents.push({
        type: 'eliminate',
        event_type: 'eliminate',
        explanation: `Elimination step ${i}`,
        removals: [[(i % 70) + 10, (i % 9) + 1]],
        depth: 0,
      })
    }

    const engineKeyframed = new ReplayEngine(longEvents, 3) // keyframe every 3 events
    const engineSequential = new ReplayEngine(longEvents, 999) // only 1 initial keyframe

    for (let step = 0; step < longEvents.length; step++) {
      const frameA = engineKeyframed.getFrame(step)
      const frameB = engineSequential.getFrame(step)

      expect(frameA.stepIndex).toBe(frameB.stepIndex)
      expect(frameA.stats).toEqual(frameB.stats)
      expect(frameA.cells.map((c) => c.candidates)).toEqual(frameB.cells.map((c) => c.candidates))
      expect(frameA.cells.map((c) => c.value)).toEqual(frameB.cells.map((c) => c.value))
    }
  })

  it('backward step is the inverse of forward step', () => {
    const engine = new ReplayEngine(sampleEvents)

    const frameForward = engine.getFrame(3)
    const frameNext = engine.getFrame(4)
    expect(frameNext).toBeDefined()
    const frameBack = engine.getFrame(3)

    expect(frameBack.cells.map((c) => c.value)).toEqual(frameForward.cells.map((c) => c.value))
    expect(frameBack.cells.map((c) => c.candidates)).toEqual(frameForward.cells.map((c) => c.candidates))
    expect(frameBack.decisionStack).toEqual(frameForward.decisionStack)
  })

  it('correctly tracks jump markers for branches and backtracks', () => {
    const engine = new ReplayEngine(sampleEvents)
    expect(engine.branchIndices).toEqual([3])
    expect(engine.contradictionIndices).toEqual([4])
    expect(engine.backtrackIndices).toEqual([5])

    expect(engine.nextBranchIndex(0)).toBe(3)
    expect(engine.nextBranchIndex(3)).toBe(3) // no further branch
    expect(engine.nextBacktrackIndex(0)).toBe(5)
  })

  describe('Naive Backtracking Events', () => {
    const naiveEvents: TraceEvent[] = [
      {
        type: 'init',
        event_type: 'init',
        explanation: 'Puzzle initialized',
        givens: '1' + '.'.repeat(80),
        candidates: Array(81).fill([1, 2, 3, 4, 5, 6, 7, 8, 9]),
      } as InitTraceEvent,
      {
        type: 'conflict',
        event_type: 'conflict',
        cell: 1,
        digit: 1,
        with: [0],
        explanation: 'Conflict with given',
      },
      {
        type: 'place',
        event_type: 'place',
        cell: 1,
        digit: 2,
        explanation: 'Place 2 at R1C2',
      },
      {
        type: 'conflict',
        event_type: 'conflict',
        cell: 2,
        digit: 2,
        with: [1],
        explanation: 'Conflict with R1C2',
      },
      {
        type: 'backtrack',
        event_type: 'backtrack',
        cell: 1,
        explanation: 'Backtrack cell R1C2',
      },
    ]

    it('correctly handles conflict events with red outline cells and stats', () => {
      const engine = new ReplayEngine(naiveEvents)
      const frame1 = engine.getFrame(1)

      expect(frame1.cells[1].value).toBe(1)
      expect(frame1.cells[1].type).toBe('conflict')
      expect(frame1.conflictWithCells).toEqual([0])
      expect(frame1.stats.tries).toBe(1)
      expect(frame1.highlightCell).toBe(1)
    })

    it('reverts temporary conflict on the subsequent step', () => {
      const engine = new ReplayEngine(naiveEvents)
      const frame2 = engine.getFrame(2)

      // Cell 1 should now be placed with 2 (not conflict 1)
      expect(frame2.cells[1].value).toBe(2)
      expect(frame2.cells[1].type).toBe('logic')
      expect(frame2.conflictWithCells).toEqual([])
      expect(frame2.stats.tries).toBe(2)
    })

    it('handles backtrack event by clearing cell and tracking stats', () => {
      const engine = new ReplayEngine(naiveEvents)
      const frame4 = engine.getFrame(4)

      expect(frame4.cells[1].value).toBe(0)
      expect(frame4.cells[1].type).toBe('empty')
      expect(frame4.backtrackCell).toBe(1)
      expect(frame4.stats.backtracks).toBe(1)
      expect(frame4.stats.tries).toBe(3) // 2 conflicts + 1 place
    })
  })

  describe('Candidate Sync and Recalculation', () => {
    it('after each placement event, no peer of the placed cell lists that digit as a candidate', () => {
      const engine = new ReplayEngine(sampleEvents)

      // Step 1: naked single placing 2 at R1C2 (index 1)
      const frame1 = engine.getFrame(1)
      expect(frame1.cells[1].value).toBe(2)
      expect(frame1.cells[1].candidates).toEqual([])

      // Peers of index 1 (same row 0, same col 1, same box 0)
      for (let i = 0; i < 81; i++) {
        if (i === 1) continue
        const r = Math.floor(i / 9)
        const c = i % 9
        const b = Math.floor(r / 3) * 3 + Math.floor(c / 3)
        const isPeer = r === 0 || c === 1 || b === 0
        if (isPeer && frame1.cells[i].value === 0) {
          expect(frame1.cells[i].candidates).not.toContain(2)
        }
      }
    })

    it('Prev then Next gives identical frames', () => {
      const engine = new ReplayEngine(sampleEvents)

      const frame3First = engine.getFrame(3)
      const frame2 = engine.getFrame(2)
      expect(frame2.stepIndex).toBe(2)

      const frame3Second = engine.getFrame(3)
      expect(frame3Second.cells.map((c) => c.value)).toEqual(frame3First.cells.map((c) => c.value))
      expect(frame3Second.cells.map((c) => c.candidates)).toEqual(frame3First.cells.map((c) => c.candidates))
      expect(frame3Second.stats).toEqual(frame3First.stats)
    })

    it('after a backtrack, candidates equal those of the frame before the branch', () => {
      const engine = new ReplayEngine(sampleEvents)

      // Step 2 is before the branch at step 3
      const frameBeforeBranch = engine.getFrame(2)
      // Step 5 is the backtrack reverting the branch
      const frameAfterBacktrack = engine.getFrame(5)

      // Cell 2 was empty at step 2, branched at step 3, and backtracked at step 5
      expect(frameAfterBacktrack.cells[2].value).toBe(0)
      expect(frameAfterBacktrack.cells[2].candidates).toEqual(frameBeforeBranch.cells[2].candidates)

      // All cells' candidates should match pre-branch candidates
      expect(frameAfterBacktrack.cells.map((c) => c.candidates)).toEqual(
        frameBeforeBranch.cells.map((c) => c.candidates)
      )
    })

    it('final frame: no candidates anywhere, board equals the solution', () => {
      const solutionStr = '123456789456789123789123456231564897564897231897231564312645978645978312978312645'
      const eventsWithSolution: TraceEvent[] = [
        ...sampleEvents,
        {
          type: 'solution',
          event_type: 'solution',
          explanation: 'Solved puzzle',
          grid: solutionStr,
        } as SolutionTraceEvent,
      ]

      const engine = new ReplayEngine(eventsWithSolution)
      const finalFrame = engine.getFrame(eventsWithSolution.length - 1)

      const boardStr = finalFrame.cells.map((c) => c.value).join('')
      expect(boardStr).toBe(solutionStr)

      // No candidates anywhere
      for (let i = 0; i < 81; i++) {
        expect(finalFrame.cells[i].candidates).toEqual([])
      }
    })
  })
})
