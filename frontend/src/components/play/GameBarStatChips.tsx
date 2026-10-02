import React from 'react'

export interface GameBarStatChipsProps {
  subMode: 'play' | 'solver'
  solverType?: 'smart' | 'naive'
  mistakes: number
  hintsUsed: number
  stepIndex?: number
  totalSteps?: number
  tries?: number
  backtracks?: number
}

export const GameBarStatChips: React.FC<GameBarStatChipsProps> = React.memo(
  ({ subMode, mistakes, hintsUsed }) => {
    // In Solver Mode: hide stat chips entirely for a clean, non-simulation header
    if (subMode === 'solver') {
      return null
    }

    // In Play Mode: render Player Mistakes and Hints chips
    return (
      <>
        <span
          className={`stat-chip ${mistakes > 0 ? 'conflict' : ''}`}
          aria-label={`Mistakes: ${mistakes}`}
          aria-live="off"
          title={`Mistakes: ${mistakes}`}
        >
          <span className="stat-chip-label-desktop">Mistakes: </span>
          <span className="stat-chip-label-short">M: </span>
          <span className="stat-chip-val tabular-nums">{mistakes}</span>
        </span>

        <span
          className="stat-chip"
          aria-label={`Hints used: ${hintsUsed}`}
          aria-live="off"
          title={`Hints used: ${hintsUsed}`}
        >
          <span className="stat-chip-label-desktop">Hints: </span>
          <span className="stat-chip-label-short">H: </span>
          <span className="stat-chip-val tabular-nums">{hintsUsed}</span>
        </span>
      </>
    )
  }
)

GameBarStatChips.displayName = 'GameBarStatChips'
