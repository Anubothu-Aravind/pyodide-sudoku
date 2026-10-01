/**
 * Memoized Sudoku Cell component for 60fps board rendering.
 * Supports player input, live 3x3 candidate pencil marks, guess depth ramp,
 * conflict flashing, and distinct visual states for all trace event types.
 */

import React from 'react'

export interface CellProps {
  index: number
  row: number
  col: number
  value: number // 0 if empty
  candidates: number[] // 1-9
  type: 'given' | 'player' | 'logic' | 'guess' | 'empty' | 'conflict'
  guessDepth?: number
  isSelected: boolean
  isPeer: boolean
  isSameDigit: boolean
  hasConflict: boolean
  isConflictWith?: boolean
  isBacktracked?: boolean
  isEliminated?: boolean
  eliminatedDigits?: number[]
  isHighlighted?: boolean
  isUnitHighlighted?: boolean
  isDiagonalMain?: boolean
  isDiagonalAnti?: boolean
  isDecorated?: boolean
  decorationKind?: string | null
  onClick: (index: number) => void
}

export const Cell: React.FC<CellProps> = React.memo(
  ({
    index,
    row,
    col,
    value,
    candidates,
    type,
    guessDepth = 0,
    isSelected,
    isPeer,
    isSameDigit,
    hasConflict,
    isConflictWith = false,
    isBacktracked = false,
    eliminatedDigits = [],
    isHighlighted,
    isUnitHighlighted,
    isDiagonalMain = false,
    isDiagonalAnti = false,
    isDecorated = false,
    decorationKind = null,
    onClick,
  }) => {
    // Determine borders for 3x3 box outlines
    const borderRight = (col + 1) % 3 === 0 && col < 8 ? '2px solid var(--border-box)' : '1px solid var(--border-cell)'
    const borderBottom = (row + 1) % 3 === 0 && row < 8 ? '2px solid var(--border-box)' : '1px solid var(--border-cell)'

    const isZeroCandContradiction = value === 0 && candidates.length === 0 && (isHighlighted || hasConflict)

    // Variant decoration base tint — sits below all other states
    const isTinted = isDiagonalMain || isDiagonalAnti || isDecorated

    // Compute cell background
    let bg = isTinted ? 'var(--diagonal-cell-bg)' : 'var(--bg-surface)'
    if (type === 'conflict' || isZeroCandContradiction) {
      bg = 'var(--danger-bg)'
    } else if (hasConflict) {
      bg = 'var(--color-conflict-bg)'
    } else if (isBacktracked) {
      bg = 'rgba(239, 68, 68, 0.15)'
    } else if (isSelected) {
      bg = 'var(--color-selected)'
    } else if (isSameDigit && value !== 0) {
      bg = 'var(--color-same-digit)'
    } else if (isHighlighted) {
      bg = 'var(--color-selected)'
    } else if (isUnitHighlighted) {
      bg = 'rgba(13, 148, 136, 0.12)'
    } else if (isPeer) {
      bg = isTinted ? 'var(--diagonal-peer-bg)' : 'var(--color-peer-highlight)'
    }

    // Clean digit colors (given vs player/solved vs conflict vs danger)
    let digitColor = 'var(--text-primary)'
    if (type === 'conflict') {
      digitColor = 'var(--danger)'
    } else if (hasConflict) {
      digitColor = 'var(--color-conflict)'
    } else if (type === 'given') {
      digitColor = 'var(--color-given)'
    } else if (type === 'player') {
      digitColor = 'var(--color-player)'
    } else if (type === 'logic') {
      digitColor = 'var(--color-logic)'
    } else if (type === 'guess') {
      digitColor = 'var(--color-player)'
    }

    // Accessible ARIA label
    let ariaLabel = `Row ${row + 1}, column ${col + 1}`
    if (value !== 0) {
      ariaLabel += `, value ${value}`
      if (type === 'conflict') ariaLabel += ', conflict'
      else if (type === 'given') ariaLabel += ', given clue'
      else if (type === 'logic') ariaLabel += ', logic deduced'
      else if (type === 'guess') ariaLabel += `, guessed at depth ${guessDepth}`
    } else if (candidates.length > 0) {
      ariaLabel += `, candidates: ${candidates.join(', ')}`
    } else {
      ariaLabel += ', empty'
    }
    if (hasConflict) ariaLabel += ', conflict'

    const cellOutline = isConflictWith
      ? '2px solid var(--danger)'
      : type === 'conflict' || isZeroCandContradiction
      ? '2px solid var(--danger)'
      : isBacktracked
      ? '2px dashed var(--danger)'
      : isSelected
      ? '2px solid var(--color-selected-border)'
      : 'none'

    return (
      <div
        role="gridcell"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-selected={isSelected}
        onClick={() => onClick(index)}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          borderRight,
          borderBottom,
          cursor: 'pointer',
          userSelect: 'none',
          outline: cellOutline,
          outlineOffset: '-2px',
          zIndex: isConflictWith || type === 'conflict' || isZeroCandContradiction ? 3 : isSelected ? 2 : 1,
          transition: 'background-color 0.1s ease',
        }}
        className={`sudoku-cell ${type === 'given' ? 'given' : ''} ${isHighlighted ? 'anim-pulse' : ''} ${hasConflict ? 'anim-conflict' : ''} ${decorationKind ? `cell-${decorationKind}` : ''}`.trim()}
      >
        {value !== 0 ? (
          <span
            className="cell-value tabular-nums"
            style={{
              fontSize: 'clamp(1.2rem, 3.8vw, 2.2rem)',
              fontWeight: type === 'given' ? 700 : 600,
              color: digitColor,
              lineHeight: 1,
              position: 'relative',
            }}
          >
            {value}
          </span>
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gridTemplateRows: 'repeat(3, 1fr)',
              padding: '1px',
              overflow: 'hidden',
            }}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => {
              const isPresent = candidates.includes(digit)
              const isEliminated = eliminatedDigits.includes(digit)

              return (
                <div
                  key={digit}
                  className="candidate tabular-nums"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'clamp(0.5rem, 1.3vw, 0.75rem)',
                    fontWeight: 500,
                    color: isEliminated ? 'var(--danger)' : 'var(--color-notes)',
                    textDecoration: isEliminated ? 'line-through' : 'none',
                    opacity: isPresent ? 1 : isEliminated ? 0.6 : 0,
                    lineHeight: 1,
                  }}
                >
                  {digit}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }
)
