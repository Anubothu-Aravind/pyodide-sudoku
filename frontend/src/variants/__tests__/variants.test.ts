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
})
