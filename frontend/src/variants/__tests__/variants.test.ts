/**
 * Variant system unit tests — new VariantConfig architecture.
 * Sections: metadata, constraints, decorations.
 */

import { describe, it, expect } from 'vitest'
import {
  MAIN_DIAGONAL,
  ANTI_DIAGONAL,
  VARIANTS,
  getVariant,
  getDecoratedCells,
  getCellDecorations,
  buildVariantPeerMap,
  type VariantId,
} from '../index'
import { computeConflicts } from '../../reducers/playReducer'

describe('Variant system', () => {
  // -----------------------------------------------------------------------
  describe('Classic variant', () => {
    const classic = VARIANTS.classic

    it('metadata: id=classic, available=true', () => {
      expect(classic.metadata.id).toBe('classic')
      expect(classic.metadata.available).toBe(true)
      expect(classic.metadata.name.length).toBeGreaterThan(0)
    })
    it('constraints.solver is empty', () => {
      expect(classic.constraints.solver).toHaveLength(0)
    })
    it('constraints.validation is empty', () => {
      expect(classic.constraints.validation).toHaveLength(0)
    })
    it('decorations is empty', () => {
      expect(classic.decorations).toHaveLength(0)
    })
    it('getDecoratedCells returns empty set', () => {
      expect(getDecoratedCells(classic).size).toBe(0)
    })
    it('getCellDecorations returns [] for every cell', () => {
      for (let i = 0; i < 81; i++) {
        expect(getCellDecorations(classic, i)).toHaveLength(0)
      }
    })
    it('buildVariantPeerMap returns null (no extra peers)', () => {
      expect(buildVariantPeerMap(classic)).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  describe('Diagonal cell index correctness', () => {
    it('MAIN_DIAGONAL has 9 unique indices where row === col', () => {
      expect(MAIN_DIAGONAL).toHaveLength(9)
      expect(new Set(MAIN_DIAGONAL).size).toBe(9)
      for (let r = 0; r < 9; r++) {
        const idx = MAIN_DIAGONAL[r]
        expect(Math.floor(idx / 9)).toBe(r)
        expect(idx % 9).toBe(r)
      }
    })
    it('ANTI_DIAGONAL has 9 unique indices where row + col === 8', () => {
      expect(ANTI_DIAGONAL).toHaveLength(9)
      expect(new Set(ANTI_DIAGONAL).size).toBe(9)
      for (let r = 0; r < 9; r++) {
        const idx = ANTI_DIAGONAL[r]
        const row = Math.floor(idx / 9)
        const col = idx % 9
        expect(row).toBe(r)
        expect(row + col).toBe(8)
      }
    })
    it('center cell R5C5 (index 40) is on both diagonals', () => {
      expect(MAIN_DIAGONAL).toContain(40)
      expect(ANTI_DIAGONAL).toContain(40)
    })
    it('all diagonal indices are in 0..80', () => {
      for (const idx of [...MAIN_DIAGONAL, ...ANTI_DIAGONAL]) {
        expect(idx).toBeGreaterThanOrEqual(0)
        expect(idx).toBeLessThanOrEqual(80)
      }
    })
  })

  // -----------------------------------------------------------------------
  describe('Diagonal variant config', () => {
    const diag = getVariant('diagonal')

    it('metadata: id=diagonal, available=true', () => {
      expect(diag.metadata.id).toBe('diagonal')
      expect(diag.metadata.available).toBe(true)
      expect(diag.metadata.difficultyModifier).toBe('slightly-harder')
    })

    describe('constraints', () => {
      it('solver has 2 groups (main + anti diagonals)', () => {
        expect(diag.constraints.solver).toHaveLength(2)
        expect(diag.constraints.solver[0].cells).toEqual(MAIN_DIAGONAL)
        expect(diag.constraints.solver[1].cells).toEqual(ANTI_DIAGONAL)
      })
      it('validation mirrors solver (same cells)', () => {
        expect(diag.constraints.validation).toHaveLength(2)
        expect(diag.constraints.validation[0].cells).toEqual(MAIN_DIAGONAL)
        expect(diag.constraints.validation[1].cells).toEqual(ANTI_DIAGONAL)
      })
      it('each group has a non-empty label', () => {
        for (const g of [...diag.constraints.solver, ...diag.constraints.validation]) {
          expect(g.label.length).toBeGreaterThan(0)
        }
      })
    })

    describe('decorations', () => {
      it('has 2 decorations (diagonal-main + diagonal-anti)', () => {
        expect(diag.decorations).toHaveLength(2)
        const kinds = diag.decorations.map((d) => d.kind)
        expect(kinds).toContain('diagonal-main')
        expect(kinds).toContain('diagonal-anti')
      })
      it('decoration cells match diagonal indices', () => {
        const main = diag.decorations.find((d) => d.kind === 'diagonal-main')!
        const anti = diag.decorations.find((d) => d.kind === 'diagonal-anti')!
        expect(main.cells).toEqual(MAIN_DIAGONAL)
        expect(anti.cells).toEqual(ANTI_DIAGONAL)
      })
      it('each decoration has a CSS color string', () => {
        for (const d of diag.decorations) {
          expect(typeof d.color).toBe('string')
          expect(d.color.length).toBeGreaterThan(0)
        }
      })
    })

    describe('helper functions', () => {
      it('getDecoratedCells: 17 unique cells (9+9-1 shared center)', () => {
        expect(getDecoratedCells(diag).size).toBe(17)
      })
      it('getCellDecorations: center (R5C5) has both kinds', () => {
        const d = getCellDecorations(diag, 40)
        expect(d).toContain('diagonal-main')
        expect(d).toContain('diagonal-anti')
      })
      it('getCellDecorations: R1C1 (0) only diagonal-main', () => {
        const d = getCellDecorations(diag, 0)
        expect(d).toContain('diagonal-main')
        expect(d).not.toContain('diagonal-anti')
      })
      it('getCellDecorations: R1C9 (8) only diagonal-anti', () => {
        const d = getCellDecorations(diag, 8)
        expect(d).toContain('diagonal-anti')
        expect(d).not.toContain('diagonal-main')
      })
      it('getCellDecorations: off-diagonal R1C2 (1) is empty', () => {
        expect(getCellDecorations(diag, 1)).toHaveLength(0)
      })
      it('buildVariantPeerMap: each diagonal cell has 16 extra peers', () => {
        const map = buildVariantPeerMap(diag)
        expect(map).not.toBeNull()
        // Center cell (40) is on BOTH diagonals → its peer set has 8+8-1 = 15 extra peers
        // (the -1 is because it's in both groups, union deduplicates)
        const centerPeers = map!.get(40)!
        // 9 from main (minus self) + 9 from anti (minus self) - 1 shared center = 16... but center itself excluded
        // main has 9 cells, center excluded → 8; anti has 9 cells, center excluded → 8; overlap between them
        // depends on intersection of the two diagonals (only center=40, which is self, already excluded)
        // So center peer count = 8 + 8 = 16 from diag groups
        expect(centerPeers.size).toBe(16)
      })
      it('buildVariantPeerMap: R1C1 (0) has 8 extra diagonal peers', () => {
        const map = buildVariantPeerMap(diag)!
        const peers = map.get(0)!
        // Main diagonal only: 9 cells - self = 8 peers
        expect(peers.size).toBe(8)
      })
    })
  })

  // -----------------------------------------------------------------------
  describe('Windoku (Hyper Sudoku) config', () => {
    const windoku = getVariant('windoku')

    it('metadata: id=windoku, available=true', () => {
      expect(windoku.metadata.id).toBe('windoku')
      expect(windoku.metadata.available).toBe(true)
      expect(windoku.metadata.name).toContain('Windoku')
    })

    it('has 4 window constraint groups', () => {
      expect(windoku.constraints.solver).toHaveLength(4)
      expect(windoku.constraints.validation).toHaveLength(4)
      for (const g of windoku.constraints.solver) {
        expect(g.cells).toHaveLength(9)
      }
    })

    it('getDecoratedCells returns all 36 window cells', () => {
      const cells = getDecoratedCells(windoku)
      expect(cells.size).toBe(36)
      // Cell 10 (R2C2) is in top-left window
      expect(cells.has(10)).toBe(true)
      // Cell 0 (R1C1) is not in any window
      expect(cells.has(0)).toBe(false)
    })

    it('buildVariantPeerMap builds extra peers for window cells', () => {
      const map = buildVariantPeerMap(windoku)
      expect(map).not.toBeNull()
      // Cell 10 should have 8 peers within its window
      const peers = map!.get(10)!
      expect(peers.size).toBe(8)
    })
  })

  // -----------------------------------------------------------------------
  describe('Center Dot and Asterisk configs', () => {
    it('Center Dot has 9 cells and correct metadata', () => {
      const cd = getVariant('center-dot')
      expect(cd.metadata.available).toBe(true)
      expect(cd.constraints.solver).toHaveLength(1)
      expect(cd.constraints.solver[0].cells).toHaveLength(9)
      expect(getDecoratedCells(cd).size).toBe(9)
    })

    it('Asterisk has 9 cells and correct metadata', () => {
      const ast = getVariant('asterisk')
      expect(ast.metadata.available).toBe(true)
      expect(ast.constraints.solver).toHaveLength(1)
      expect(ast.constraints.solver[0].cells).toHaveLength(9)
      expect(getDecoratedCells(ast).size).toBe(9)
    })
  })

  // -----------------------------------------------------------------------
  describe('Girandola and Disjoint Groups configs', () => {
    it('Girandola has 9 cells and correct metadata', () => {
      const g = getVariant('girandola')
      expect(g.metadata.available).toBe(true)
      expect(g.constraints.solver).toHaveLength(1)
      expect(g.constraints.solver[0].cells).toHaveLength(9)
      expect(getDecoratedCells(g).size).toBe(9)
      // Check pinwheel includes corners and center
      expect(g.constraints.solver[0].cells).toContain(0)
      expect(g.constraints.solver[0].cells).toContain(8)
      expect(g.constraints.solver[0].cells).toContain(40)
      expect(g.constraints.solver[0].cells).toContain(72)
      expect(g.constraints.solver[0].cells).toContain(80)
    })

    it('Disjoint Groups has 9 groups of 9 cells (81 total)', () => {
      const dj = getVariant('disjoint')
      expect(dj.metadata.available).toBe(true)
      expect(dj.constraints.solver).toHaveLength(9)
      for (const group of dj.constraints.solver) {
        expect(group.cells).toHaveLength(9)
      }
      expect(getDecoratedCells(dj).size).toBe(81)
      const map = buildVariantPeerMap(dj)
      expect(map).not.toBeNull()
      // Cell 0 should have 8 peers sharing top-left position in other boxes
      expect(map!.get(0)!.size).toBe(8)
    })
  })

  // -----------------------------------------------------------------------
  describe('Variant registry completeness', () => {
    it('VARIANTS contains all 7 variants', () => {
      const keys = Object.keys(VARIANTS)
      expect(keys).toContain('classic')
      expect(keys).toContain('diagonal')
      expect(keys).toContain('windoku')
      expect(keys).toContain('center-dot')
      expect(keys).toContain('asterisk')
      expect(keys).toContain('girandola')
      expect(keys).toContain('disjoint')
    })
    it.each([
      'classic',
      'diagonal',
      'windoku',
      'center-dot',
      'asterisk',
      'girandola',
      'disjoint',
    ] as VariantId[])(
      'variant %s roundtrips via getVariant',
      (id) => {
        const v = getVariant(id)
        expect(v.metadata.id).toBe(id)
      }
    )
  })

  // -----------------------------------------------------------------------
  describe('Variant Conflict Detection per Variant', () => {
    it('detects diagonal conflicts without row/col/box sharing', () => {
      const diagConfig = getVariant('diagonal')
      const groups = diagConfig.constraints.validation.map((g) => g.cells)

      // Cell 0 (R1C1) and Cell 80 (R9C9) do not share row, col, or box
      const cells = new Array(81).fill(0)
      cells[0] = 5
      cells[80] = 5

      expect(computeConflicts(cells, [])).toEqual(new Set())
      const conflicts = computeConflicts(cells, groups)
      expect(conflicts.has(0)).toBe(true)
      expect(conflicts.has(80)).toBe(true)

      // Anti-diagonal: Cell 8 (R1C9) and Cell 72 (R9C1)
      const antiCells = new Array(81).fill(0)
      antiCells[8] = 9
      antiCells[72] = 9
      expect(computeConflicts(antiCells, [])).toEqual(new Set())
      const antiConflicts = computeConflicts(antiCells, groups)
      expect(antiConflicts.has(8)).toBe(true)
      expect(antiConflicts.has(72)).toBe(true)
    })

    it('detects Windoku window conflicts across different rows/cols/boxes', () => {
      const windokuConfig = getVariant('windoku')
      const groups = windokuConfig.constraints.validation.map((g) => g.cells)

      // Cell 10 (R2C2, box 0) and Cell 30 (R4C4, box 4) share Top-Left Window
      const cells = new Array(81).fill(0)
      cells[10] = 7
      cells[30] = 7

      expect(computeConflicts(cells, [])).toEqual(new Set())
      const conflicts = computeConflicts(cells, groups)
      expect(conflicts.has(10)).toBe(true)
      expect(conflicts.has(30)).toBe(true)
    })

    it('detects Center Dot conflicts across different boxes', () => {
      const cdConfig = getVariant('center-dot')
      const groups = cdConfig.constraints.validation.map((g) => g.cells)

      // Cell 10 (R2C2, box 0) and Cell 70 (R8C8, box 8) both in Center Dot group
      const cells = new Array(81).fill(0)
      cells[10] = 3
      cells[70] = 3

      expect(computeConflicts(cells, [])).toEqual(new Set())
      const conflicts = computeConflicts(cells, groups)
      expect(conflicts.has(10)).toBe(true)
      expect(conflicts.has(70)).toBe(true)
    })

    it('detects Asterisk conflicts across different boxes', () => {
      const astConfig = getVariant('asterisk')
      const groups = astConfig.constraints.validation.map((g) => g.cells)

      // Cell 20 (R3C3, box 0) and Cell 60 (R7C7, box 8) both in Asterisk group
      const cells = new Array(81).fill(0)
      cells[20] = 4
      cells[60] = 4

      expect(computeConflicts(cells, [])).toEqual(new Set())
      const conflicts = computeConflicts(cells, groups)
      expect(conflicts.has(20)).toBe(true)
      expect(conflicts.has(60)).toBe(true)
    })

    it('detects Girandola conflicts across corners and center', () => {
      const girConfig = getVariant('girandola')
      const groups = girConfig.constraints.validation.map((g) => g.cells)

      // Cell 0 (R1C1, box 0) and Cell 80 (R9C9, box 8) both in Girandola pinwheel
      const cells = new Array(81).fill(0)
      cells[0] = 9
      cells[80] = 9

      expect(computeConflicts(cells, [])).toEqual(new Set())
      const conflicts = computeConflicts(cells, groups)
      expect(conflicts.has(0)).toBe(true)
      expect(conflicts.has(80)).toBe(true)
    })

    it('detects Disjoint Groups conflicts across identical box offsets', () => {
      const djConfig = getVariant('disjoint')
      const groups = djConfig.constraints.validation.map((g) => g.cells)

      // Cell 0 (R1C1, box 0) and Cell 30 (R4C4, box 4) share top-left box offset
      const cells = new Array(81).fill(0)
      cells[0] = 2
      cells[30] = 2

      expect(computeConflicts(cells, [])).toEqual(new Set())
      const conflicts = computeConflicts(cells, groups)
      expect(conflicts.has(0)).toBe(true)
      expect(conflicts.has(30)).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  describe('Solved Variant Puzzle Validation', () => {
    const SOLVED_PUZZLES: Record<VariantId, string> = {
      classic:
        '482369175931752486756148923673981254195427368824635791267514839549873612318296547',
      diagonal:
        '482369175931752486756148923673981254195427368824635791267514839549873612318296547',
      windoku:
        '498321657365847192127965438531476829872519346649283715756132984283794561914658273',
      'center-dot':
        '498321657365974281127568394842159763651743928973682415286435179514297836739816542',
      asterisk:
        '498321657365487129127695483819276534236854791754913862941538276572169348683742915',
      girandola:
        '472351986361892745859647312234185697986473521715926438197538264623714859548269173',
      disjoint:
        '467352189129867453835149267216978534784531692593426718641793825978215346352684971',
    }

    it.each([
      'classic',
      'diagonal',
      'windoku',
      'center-dot',
      'asterisk',
      'girandola',
      'disjoint',
    ] as VariantId[])(
      'solved %s puzzle passes validation with 0 conflicts',
      (variantId) => {
        const config = getVariant(variantId)
        const groups = config.constraints.validation.map((g) => g.cells)
        const gridStr = SOLVED_PUZZLES[variantId]
        const cells = gridStr.split('').map(Number)

        expect(cells).toHaveLength(81)
        expect(cells.every((d) => d >= 1 && d <= 9)).toBe(true)

        // Standard + Variant conflict check must yield 0 conflicts
        const conflicts = computeConflicts(cells, groups)
        expect(conflicts.size).toBe(0)

        // Verify each variant group has exactly 1-9
        for (const g of config.constraints.validation) {
          const vals = g.cells.map((idx) => cells[idx]).sort((a, b) => a - b)
          expect(vals).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
        }
      }
    )

    it('violating a variant constraint causes validation failure', () => {
      const config = getVariant('windoku')
      const groups = config.constraints.validation.map((g) => g.cells)
      const cells = SOLVED_PUZZLES.windoku.split('').map(Number)

      // Top-Left window cells: [10, 11, 12, 19, 20, 21, 28, 29, 30]
      // Swap two values within window that also break the window unique set
      // (e.g. set cell 10 to same value as cell 30)
      const originalVal10 = cells[10]
      cells[10] = cells[30]

      const conflicts = computeConflicts(cells, groups)
      expect(conflicts.size).toBeGreaterThan(0)
      expect(conflicts.has(10)).toBe(true)
      expect(conflicts.has(30)).toBe(true)

      // Restore
      cells[10] = originalVal10
      expect(computeConflicts(cells, groups).size).toBe(0)
    })
  })
})
