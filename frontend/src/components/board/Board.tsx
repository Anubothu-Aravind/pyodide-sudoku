/**
 * 9x9 Sudoku Board Component.
 * Supports keyboard navigation (arrows, digits 1-9, backspace/del, 'n' for notes),
 * peer cell highlights, same digit highlights, 3x3 box outlines, and 60fps rendering.
 */

import React, { useEffect, useCallback } from 'react'
import { Cell } from './Cell'
import type { VariantConfig } from '../../variants'

export interface BoardProps {
  cells: number[]
  givens: string
  notes?: number[][]
  cellTypes?: Array<'given' | 'player' | 'logic' | 'guess' | 'empty' | 'conflict'>
  guessDepths?: number[]
  selectedIndex?: number | null
  conflicts?: Set<number>
  highlightCell?: number | null
  highlightUnit?: { type: 'row' | 'col' | 'box'; index: number } | null
  eliminations?: [number, number][]
  conflictWithCells?: number[]
  backtrackCell?: number | null
  variantConfig?: VariantConfig | null
  onSelectCell?: (index: number) => void
  onSetDigit?: (digit: number) => void
  onClearCell?: () => void
  onToggleNotesMode?: () => void
  readOnly?: boolean
}

export const Board: React.FC<BoardProps> = ({
  cells,
  givens,
  notes = [],
  cellTypes,
  guessDepths,
  selectedIndex = null,
  conflicts = new Set(),
  highlightCell = null,
  highlightUnit = null,
  eliminations = [],
  conflictWithCells = [],
  backtrackCell = null,
  variantConfig = null,
  onSelectCell,
  onSetDigit,
  onClearCell,
  onToggleNotesMode,
  readOnly = false,
}) => {
  // Compute selected row, col, box, and digit
  const selectedRow = selectedIndex !== null ? Math.floor(selectedIndex / 9) : null
  const selectedCol = selectedIndex !== null ? selectedIndex % 9 : null
  const selectedBox =
    selectedRow !== null && selectedCol !== null ? Math.floor(selectedRow / 3) * 3 + Math.floor(selectedCol / 3) : null
  const selectedDigit = selectedIndex !== null ? cells[selectedIndex] : 0

  // Pre-compute decoration sets and kind map from variant config
  const { diagMainSet, diagAntiSet, decoratedSet, decoKindMap } = React.useMemo(() => {
    const main = new Set<number>()
    const anti = new Set<number>()
    const deco = new Set<number>()
    const kindMap = new Map<number, string>()

    if (variantConfig) {
      for (const d of variantConfig.decorations) {
        for (const c of d.cells) {
          deco.add(c)
          kindMap.set(c, d.kind)
          if (d.kind === 'diagonal-main') main.add(c)
          if (d.kind === 'diagonal-anti') anti.add(c)
        }
      }
    }
    return { diagMainSet: main, diagAntiSet: anti, decoratedSet: deco, decoKindMap: kindMap }
  }, [variantConfig])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (readOnly || selectedIndex === null) return

      const r = Math.floor(selectedIndex / 9)
      const c = selectedIndex % 9

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const next = ((r - 1 + 9) % 9) * 9 + c
        onSelectCell?.(next)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = ((r + 1) % 9) * 9 + c
        onSelectCell?.(next)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const next = r * 9 + ((c - 1 + 9) % 9)
        onSelectCell?.(next)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        const next = r * 9 + ((c + 1) % 9)
        onSelectCell?.(next)
      } else if (e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        onSetDigit?.(parseInt(e.key, 10))
      } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        e.preventDefault()
        onClearCell?.()
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        onToggleNotesMode?.()
      }
    },
    [readOnly, selectedIndex, onSelectCell, onSetDigit, onClearCell, onToggleNotesMode]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div
      role="grid"
      aria-label="Sudoku 9x9 board"
      className="sudoku-board"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(9, 1fr)',
        gridTemplateRows: 'repeat(9, 1fr)',
        aspectRatio: '1 / 1',
        margin: '0 auto',
        border: '3px solid var(--border-box)',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--bg-surface)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: 81 }).map((_, idx) => {
        const row = Math.floor(idx / 9)
        const col = idx % 9
        const box = Math.floor(row / 3) * 3 + Math.floor(col / 3)

        const val = cells[idx] || 0
        const isGiven = givens[idx] !== '.' && givens[idx] !== '0'
        const cellType = cellTypes ? cellTypes[idx] : isGiven ? 'given' : val !== 0 ? 'player' : 'empty'
        const guessDepth = guessDepths ? guessDepths[idx] : 0

        const isSelected = selectedIndex === idx
        const isPeer = selectedIndex !== null && (row === selectedRow || col === selectedCol || box === selectedBox)
        const isSameDigit = selectedDigit !== 0 && val === selectedDigit
        const hasConflict = conflicts.has(idx)

        // Trace highlights
        const isHighlighted = highlightCell === idx
        let isUnitHighlighted = false
        if (highlightUnit) {
          if (highlightUnit.type === 'row' && row === highlightUnit.index) isUnitHighlighted = true
          else if (highlightUnit.type === 'col' && col === highlightUnit.index) isUnitHighlighted = true
          else if (highlightUnit.type === 'box' && box === highlightUnit.index) isUnitHighlighted = true
        }

        const cellEliminations = eliminations.filter(([c]) => c === idx).map(([, d]) => d)
        const isConflictWith = conflictWithCells.includes(idx)
        const isBacktracked = backtrackCell === idx

        return (
          <Cell
            key={idx}
            index={idx}
            row={row}
            col={col}
            value={val}
            candidates={notes[idx] || []}
            type={cellType}
            guessDepth={guessDepth}
            isSelected={isSelected}
            isPeer={isPeer}
            isSameDigit={isSameDigit}
            hasConflict={hasConflict}
            isConflictWith={isConflictWith}
            isBacktracked={isBacktracked}
            eliminatedDigits={cellEliminations}
            isHighlighted={isHighlighted}
            isUnitHighlighted={isUnitHighlighted}
            isDiagonalMain={diagMainSet.has(idx)}
            isDiagonalAnti={diagAntiSet.has(idx)}
            isDecorated={decoratedSet.has(idx)}
            decorationKind={decoKindMap.get(idx) || null}
            onClick={(cellIdx) => onSelectCell?.(cellIdx)}
          />
        )
      })}
    </div>
  )
}
