/**
 * Variant Info Popover / Tooltip component.
 * Displays a one-line rule and a clean visual mini 9x9 example
 * of the marked constraint cells for the selected Sudoku variant.
 */

import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import {
  type VariantId,
  VARIANTS,
  MAIN_DIAGONAL,
  ANTI_DIAGONAL,
  WINDOKU_ALL_CELLS,
  CENTER_DOT_CELLS,
  ASTERISK_CELLS,
  GIRANDOLA_CELLS,
  DISJOINT_GROUPS,
} from '../../variants'

export interface VariantInfoPopoverProps {
  variantId: VariantId
  onClose: () => void
}

const VARIANT_RULES: Record<
  VariantId,
  { rule: string; markedCells: Set<number> }
> = {
  classic: {
    rule: 'Fill every row, column, and 3×3 box with digits 1–9 without repeating.',
    markedCells: new Set(),
  },
  diagonal: {
    rule: 'Both main diagonals (top-left to bottom-right and top-right to bottom-left) must contain 1–9.',
    markedCells: new Set([...MAIN_DIAGONAL, ...ANTI_DIAGONAL]),
  },
  windoku: {
    rule: 'Four extra 3×3 shaded window regions must each contain digits 1–9 without repeating.',
    markedCells: new Set(WINDOKU_ALL_CELLS),
  },
  'center-dot': {
    rule: 'The center cell of each 3×3 box forms an extra 9-cell group containing digits 1–9.',
    markedCells: new Set(CENTER_DOT_CELLS),
  },
  asterisk: {
    rule: 'The 9 marked asterisk cells must contain digits 1–9 without repeating.',
    markedCells: new Set(ASTERISK_CELLS),
  },
  girandola: {
    rule: 'The 9 pinwheel cells (4 corners, 4 edge centers, center) must contain digits 1–9.',
    markedCells: new Set(GIRANDOLA_CELLS),
  },
  disjoint: {
    rule: 'Cells in identical relative positions across all 3×3 boxes must contain digits 1–9.',
    // Highlight group 0 (top-left cells) as the representative mini example
    markedCells: new Set(DISJOINT_GROUPS[0]),
  },
}

export const VariantInfoPopover: React.FC<VariantInfoPopoverProps> = ({
  variantId,
  onClose,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null)
  const variant = VARIANTS[variantId]
  const info = VARIANT_RULES[variantId]

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={`${variant.metadata.name} Rules`}
      className="anim-pop ui-card"
      style={{
        position: 'absolute',
        top: 'calc(100% + 8px)',
        right: 0,
        zIndex: 50,
        width: '280px',
        maxWidth: 'calc(100vw - 32px)',
        boxSizing: 'border-box',
        padding: '14px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--accent-blue)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.9rem',
            fontWeight: 700,
            color: 'var(--accent-blue)',
          }}
        >
          {variant.metadata.name}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close variant info"
          className="ui-btn ui-btn-outline"
          style={{
            padding: '3px',
            minHeight: '24px',
            minWidth: '24px',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* One-line Rule */}
      <p
        style={{
          margin: 0,
          fontSize: '0.78rem',
          lineHeight: 1.35,
          color: 'var(--text-high)',
        }}
      >
        {info.rule}
      </p>

      {/* Mini 9x9 Example Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
        <span
          style={{
            fontSize: '0.7rem',
            fontFamily: 'var(--font-arcade)',
            color: 'var(--text-secondary)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          Marked Cells
        </span>

        <div
          role="grid"
          aria-label={`Mini grid showing marked cells for ${variant.metadata.name}`}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(9, 12px)',
            gridTemplateRows: 'repeat(9, 12px)',
            gap: '1px',
            backgroundColor: 'var(--border-cell)',
            border: '2px solid var(--border-box)',
            padding: '1px',
            borderRadius: '2px',
          }}
        >
          {Array.from({ length: 81 }).map((_, idx) => {
            const row = Math.floor(idx / 9)
            const col = idx % 9
            const isMarked = info.markedCells.has(idx)
            const isBoxRight = col === 2 || col === 5
            const isBoxBottom = row === 2 || row === 5

            return (
              <div
                key={idx}
                role="gridcell"
                aria-label={isMarked ? `Marked cell row ${row + 1}, col ${col + 1}` : `Row ${row + 1}, col ${col + 1}`}
                style={{
                  width: '12px',
                  height: '12px',
                  backgroundColor: isMarked ? 'var(--accent-blue)' : 'var(--bg-surface)',
                  opacity: isMarked ? 0.9 : 0.45,
                  borderRight: isBoxRight ? '1px solid var(--border-box)' : undefined,
                  borderBottom: isBoxBottom ? '1px solid var(--border-box)' : undefined,
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
