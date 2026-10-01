/**
 * Arcade-style Number Pad component.
 * Features:
 * - Large touch targets (min 44px)
 * - Custom arcade styling with Russo One & Arcade Classic
 * - Action buttons (Undo, Redo, Erase, Notes)
 * - Digits 1-9
 */

import React from 'react'
import { RotateCcw, RotateCw, Eraser } from 'lucide-react'

export interface NumberPadProps {
  cells: number[]
  notesMode?: boolean
  canUndo: boolean
  canRedo: boolean
  onSelectDigit: (digit: number) => void
  onClear: () => void
  onToggleNotes?: () => void
  onUndo: () => void
  onRedo: () => void
  disabled?: boolean
}

export const NumberPad: React.FC<NumberPadProps> = ({
  cells,
  notesMode: _notesMode,
  canUndo,
  canRedo,
  onSelectDigit,
  onClear,
  onToggleNotes: _onToggleNotes,
  onUndo,
  onRedo,
  disabled = false,
}) => {
  // Count placed instances of each digit 1-9
  const counts: Record<number, number> = {}
  for (let d = 1; d <= 9; d++) counts[d] = 0
  for (const v of cells) {
    if (v >= 1 && v <= 9) counts[v]++
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%',
        maxWidth: '500px',
        margin: '14px auto 0',
      }}
    >
      {/* Action controls row: UNDO, REDO, ERASE (visible on mobile <1000px; on desktop moved to side panel) */}
      <div className="mobile-action-bar">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo || disabled}
          aria-label="Undo move"
          className="ui-btn ui-btn-outline"
          style={{
            minHeight: '44px',
            padding: '8px 6px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontFamily: 'var(--font-display)',
            fontSize: '0.78rem',
            letterSpacing: '0.04em',
            opacity: canUndo && !disabled ? 1 : 0.35,
          }}
        >
          <RotateCcw size={16} />
          <span>UNDO</span>
        </button>

        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo || disabled}
          aria-label="Redo move"
          className="ui-btn ui-btn-outline"
          style={{
            minHeight: '44px',
            padding: '8px 6px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontFamily: 'var(--font-display)',
            fontSize: '0.78rem',
            letterSpacing: '0.04em',
            opacity: canRedo && !disabled ? 1 : 0.35,
          }}
        >
          <RotateCw size={16} />
          <span>REDO</span>
        </button>

        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          aria-label="Erase selected cell"
          className="ui-btn ui-btn-outline"
          style={{
            minHeight: '44px',
            padding: '8px 6px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontFamily: 'var(--font-display)',
            fontSize: '0.78rem',
            letterSpacing: '0.04em',
          }}
        >
          <Eraser size={16} />
          <span>ERASE</span>
        </button>
      </div>

      {/* Digit buttons 1-9 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(9, 1fr)',
          gap: '6px',
        }}
      >
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => {
          const placedCount = counts[digit]
          const isComplete = placedCount >= 9
          const remaining = Math.max(0, 9 - placedCount)

          return (
            <button
              key={digit}
              type="button"
              onClick={() => onSelectDigit(digit)}
              disabled={disabled}
              aria-label={`Enter digit ${digit}, ${remaining} remaining`}
              className="ui-btn"
              style={{
                minHeight: '52px',
                padding: '4px 2px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isComplete ? 'var(--bg-subtle)' : 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                opacity: isComplete ? 0.35 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease-in-out',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.35rem',
                  fontWeight: 700,
                  color: isComplete ? 'var(--text-muted)' : 'var(--accent-blue)',
                  lineHeight: 1,
                }}
              >
                {digit}
              </span>
              <span
                className="tabular-nums"
                style={{
                  fontSize: '0.62rem',
                  color: 'var(--text-secondary)',
                  marginTop: '3px',
                }}
              >
                {isComplete ? '✓' : remaining}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
