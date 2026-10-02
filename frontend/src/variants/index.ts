/**
 * Sudoku variant configuration — reusable constraint framework.
 *
 * Architecture:
 *   VariantConfig
 *     ├── metadata   — id, name, description, difficulty, availability
 *     ├── constraints
 *     │     ├── solver      — extra all-different groups for the Python solver
 *     │     └── validation  — same groups used for live client-side conflict detection
 *     └── decorations       — board/cell rendering (shading, lines, etc.)
 *
 * This separation matters for complex variants (Killer, Thermo, Jigsaw):
 *   • constraints govern game rules and move legality.
 *   • decorations govern pixels — they can change freely without affecting rules.
 *   • metadata governs discovery and variant selection UI.
 *
 * Adding a new variant:
 *   1. Add VariantId to the union.
 *   2. Add an entry to VARIANTS with the three sections.
 *   3. Expose any extra solver groups to the Python layer via constraints.py.
 */

// ---------------------------------------------------------------------------
// VariantId — extend as new variants ship
// ---------------------------------------------------------------------------

export type VariantId = 'classic' | 'diagonal' | 'windoku' | 'center-dot' | 'asterisk' | 'girandola' | 'disjoint'

export const VARIANT_SYMBOLS: Record<VariantId, string> = {
  classic: '',
  diagonal: '',
  windoku: '',
  'center-dot': '',
  asterisk: '',
  girandola: '',
  disjoint: '',
}

// ---------------------------------------------------------------------------
// Constraint groups (game rules)
// ---------------------------------------------------------------------------

/**
 * An extra all-different constraint group: cell indices that must each hold a
 * unique digit (1–9). Mirrors the Python `ConstraintGroup` in constraints.py.
 */
export interface ConstraintGroup {
  /** Human-readable label shown in the rule summary / tutorial */
  label: string
  /** Flat cell indices (0 = R1C1, 80 = R9C9, row-major) */
  cells: number[]
}

export interface VariantConstraints {
  /**
   * Extra all-different groups passed to the Python solver on generation/trace.
   */
  solver: ConstraintGroup[]
  /**
   * Extra all-different groups used for live conflict detection in the browser.
   */
  validation: ConstraintGroup[]
}

// ---------------------------------------------------------------------------
// Board decorations (rendering, separate from rules)
// ---------------------------------------------------------------------------

export type DecorationKind =
  | 'diagonal-main' // top-left → bottom-right
  | 'diagonal-anti' // top-right → bottom-left
  | 'window' // Windoku 3x3 shaded windows
  | 'center-dot' // Center dot cells
  | 'asterisk' // Asterisk cells
  | 'girandola' // Girandola pinwheel cells
  | 'disjoint' // Disjoint groups offset cells

export interface BoardDecoration {
  kind: DecorationKind
  /** Cell indices covered by this decoration */
  cells: number[]
  /** CSS color for the background tint */
  color: string
}

// ---------------------------------------------------------------------------
// Variant metadata (UI / discovery)
// ---------------------------------------------------------------------------

export interface VariantMetadata {
  id: VariantId
  name: string
  description: string
  /** How hard is this variant vs Classic at the same difficulty tier? */
  difficultyModifier: 'same' | 'slightly-harder' | 'harder' | 'much-harder'
  /** Whether this variant is available for selection in the UI */
  available: boolean
}

// ---------------------------------------------------------------------------
// Full variant config
// ---------------------------------------------------------------------------

export interface VariantConfig {
  metadata: VariantMetadata
  constraints: VariantConstraints
  decorations: BoardDecoration[]
}

// ---------------------------------------------------------------------------
// Precomputed constraint cell indices
// ---------------------------------------------------------------------------

/** Main diagonal: R1C1 → R9C9 (row === col) */
export const MAIN_DIAGONAL: number[] = Array.from({ length: 9 }, (_, r) => r * 9 + r)
// [0, 10, 20, 30, 40, 50, 60, 70, 80]

/** Anti-diagonal: R1C9 → R9C1 (row + col === 8) */
export const ANTI_DIAGONAL: number[] = Array.from({ length: 9 }, (_, r) => r * 9 + (8 - r))
// [8, 16, 24, 32, 40, 48, 56, 64, 72]

/** Windoku (Hyper Sudoku) window cell indices (four 3x3 shaded windows) */
export const WINDOKU_TL: number[] = [10, 11, 12, 19, 20, 21, 28, 29, 30]
export const WINDOKU_TR: number[] = [14, 15, 16, 23, 24, 25, 32, 33, 34]
export const WINDOKU_BL: number[] = [46, 47, 48, 55, 56, 57, 64, 65, 66]
export const WINDOKU_BR: number[] = [50, 51, 52, 59, 60, 61, 68, 69, 70]
export const WINDOKU_ALL_CELLS: number[] = [...WINDOKU_TL, ...WINDOKU_TR, ...WINDOKU_BL, ...WINDOKU_BR]

/** Center Dot cell indices (9 box center cells) */
export const CENTER_DOT_CELLS: number[] = [10, 13, 16, 37, 40, 43, 64, 67, 70]

/** Asterisk cell indices (9 asterisk pattern cells) */
export const ASTERISK_CELLS: number[] = [13, 20, 24, 37, 40, 43, 56, 60, 67]

/** Girandola cell indices (4 corners, 4 edge centers, center cell) */
export const GIRANDOLA_CELLS: number[] = [0, 8, 13, 37, 40, 43, 67, 72, 80]

/** Disjoint Groups cell indices (cells in identical relative positions within 3x3 boxes) */
export const DISJOINT_GROUPS: number[][] = Array.from({ length: 9 }, (_, g) => {
  const rr = Math.floor(g / 3)
  const rc = g % 3
  const cells: number[] = []
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      cells.push((br * 3 + rr) * 9 + (bc * 3 + rc))
    }
  }
  return cells
})
export const DISJOINT_ALL_CELLS: number[] = Array.from({ length: 81 }, (_, i) => i)

// ---------------------------------------------------------------------------
// Variant registry
// ---------------------------------------------------------------------------

export const VARIANTS: Record<VariantId, VariantConfig> = {
  classic: {
    metadata: {
      id: 'classic',
      name: 'Classic Sudoku',
      description: 'Fill every row, column, and 3×3 box with the digits 1–9 without repeating.',
      difficultyModifier: 'same',
      available: true,
    },
    constraints: {
      solver: [],
      validation: [],
    },
    decorations: [],
  },

  diagonal: {
    metadata: {
      id: 'diagonal',
      name: 'Diagonal Sudoku',
      description:
        'Classic rules plus both main diagonals must also contain each of 1–9 exactly once.',
      difficultyModifier: 'slightly-harder',
      available: true,
    },
    constraints: {
      solver: [
        { label: 'Main diagonal', cells: MAIN_DIAGONAL },
        { label: 'Anti-diagonal', cells: ANTI_DIAGONAL },
      ],
      validation: [
        { label: 'Main diagonal', cells: MAIN_DIAGONAL },
        { label: 'Anti-diagonal', cells: ANTI_DIAGONAL },
      ],
    },
    decorations: [
      {
        kind: 'diagonal-main',
        cells: MAIN_DIAGONAL,
        color: 'rgba(78, 161, 255, 0.10)',
      },
      {
        kind: 'diagonal-anti',
        cells: ANTI_DIAGONAL,
        color: 'rgba(78, 161, 255, 0.10)',
      },
    ],
  },

  windoku: {
    metadata: {
      id: 'windoku',
      name: 'Windoku (Hyper)',
      description:
        'Classic rules plus four extra shaded 3×3 window regions must each contain 1–9 without repeating.',
      difficultyModifier: 'harder',
      available: true,
    },
    constraints: {
      solver: [
        { label: 'Top-Left Window', cells: WINDOKU_TL },
        { label: 'Top-Right Window', cells: WINDOKU_TR },
        { label: 'Bottom-Left Window', cells: WINDOKU_BL },
        { label: 'Bottom-Right Window', cells: WINDOKU_BR },
      ],
      validation: [
        { label: 'Top-Left Window', cells: WINDOKU_TL },
        { label: 'Top-Right Window', cells: WINDOKU_TR },
        { label: 'Bottom-Left Window', cells: WINDOKU_BL },
        { label: 'Bottom-Right Window', cells: WINDOKU_BR },
      ],
    },
    decorations: [
      {
        kind: 'window',
        cells: WINDOKU_ALL_CELLS,
        color: 'rgba(78, 161, 255, 0.10)',
      },
    ],
  },

  'center-dot': {
    metadata: {
      id: 'center-dot',
      name: 'Center Dot Sudoku',
      description:
        'Classic rules plus the center cell of each 3×3 box forms an extra 9-cell group containing digits 1–9.',
      difficultyModifier: 'slightly-harder',
      available: true,
    },
    constraints: {
      solver: [{ label: 'Center Dot Group', cells: CENTER_DOT_CELLS }],
      validation: [{ label: 'Center Dot Group', cells: CENTER_DOT_CELLS }],
    },
    decorations: [
      {
        kind: 'center-dot',
        cells: CENTER_DOT_CELLS,
        color: 'rgba(78, 161, 255, 0.12)',
      },
    ],
  },

  asterisk: {
    metadata: {
      id: 'asterisk',
      name: 'Asterisk Sudoku',
      description:
        'Classic rules plus the 9 marked asterisk cells must contain digits 1–9 exactly once.',
      difficultyModifier: 'slightly-harder',
      available: true,
    },
    constraints: {
      solver: [{ label: 'Asterisk Group', cells: ASTERISK_CELLS }],
      validation: [{ label: 'Asterisk Group', cells: ASTERISK_CELLS }],
    },
    decorations: [
      {
        kind: 'asterisk',
        cells: ASTERISK_CELLS,
        color: 'rgba(78, 161, 255, 0.12)',
      },
    ],
  },

  girandola: {
    metadata: {
      id: 'girandola',
      name: 'Girandola Sudoku',
      description:
        'Classic rules plus the 9 pinwheel cells (4 corners, 4 edge centers, and center cell) must contain 1–9 without repeating.',
      difficultyModifier: 'slightly-harder',
      available: true,
    },
    constraints: {
      solver: [{ label: 'Girandola Pinwheel', cells: GIRANDOLA_CELLS }],
      validation: [{ label: 'Girandola Pinwheel', cells: GIRANDOLA_CELLS }],
    },
    decorations: [
      {
        kind: 'girandola',
        cells: GIRANDOLA_CELLS,
        color: 'rgba(78, 161, 255, 0.12)',
      },
    ],
  },

  disjoint: {
    metadata: {
      id: 'disjoint',
      name: 'Disjoint Groups Sudoku',
      description:
        'Classic rules plus cells in the same relative position within their 3×3 boxes (e.g. all top-left cells) must each contain 1–9.',
      difficultyModifier: 'harder',
      available: true,
    },
    constraints: {
      solver: DISJOINT_GROUPS.map((group, idx) => ({
        label: `Disjoint Group ${idx + 1}`,
        cells: group,
      })),
      validation: DISJOINT_GROUPS.map((group, idx) => ({
        label: `Disjoint Group ${idx + 1}`,
        cells: group,
      })),
    },
    decorations: [
      {
        kind: 'disjoint',
        cells: DISJOINT_ALL_CELLS,
        color: 'rgba(78, 161, 255, 0.04)',
      },
    ],
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getVariant(id: VariantId): VariantConfig {
  return VARIANTS[id]
}

/**
 * All cell indices that have at least one decoration in this variant.
 * Used by Board to decide which cells get the tint background.
 */
export function getDecoratedCells(config: VariantConfig): Set<number> {
  const cells = new Set<number>()
  for (const deco of config.decorations) {
    for (const c of deco.cells) cells.add(c)
  }
  return cells
}

/**
 * Which DecorationKind(s) apply to a specific cell index.
 * Used by Cell to determine which CSS class / background to apply.
 */
export function getCellDecorations(
  config: VariantConfig,
  cellIdx: number
): DecorationKind[] {
  return config.decorations
    .filter((d) => d.cells.includes(cellIdx))
    .map((d) => d.kind)
}

/**
 * Build the flat Set<number> peer map for live conflict detection.
 * For each cell, maps cellIdx → Set<peerIdx> augmented with variant peers.
 * Classic returns undefined (caller falls back to standard peer check).
 */
export function buildVariantPeerMap(
  config: VariantConfig
): Map<number, Set<number>> | null {
  if (config.constraints.validation.length === 0) return null

  const map = new Map<number, Set<number>>()

  for (const group of config.constraints.validation) {
    const { cells } = group
    for (const cellA of cells) {
      if (!map.has(cellA)) map.set(cellA, new Set())
      for (const cellB of cells) {
        if (cellA !== cellB) map.get(cellA)!.add(cellB)
      }
    }
  }

  return map
}
