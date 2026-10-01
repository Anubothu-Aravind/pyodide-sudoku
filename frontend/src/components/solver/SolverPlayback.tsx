/**
 * Custom Sudoku Solver Playback Component.
 * Pure game interface: no step counters, no timeline scrubbers, no internal algorithm metrics.
 * Layout:
 *   [ ◀ Previous ]  [ ▶ / ❚❚ Play/Pause ]  [ ▶ Next ]
 *   Speed: 1×  2×  5×  10×  50×
 *   Status: "ANALYZING PUZZLE…" / "SOLVED" / "READY"
 *   Concise Explanation Card (Technique, Cell, Reasoning)
 */

import React from 'react'
import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react'

export interface SolverPlaybackProps {
  isPlaying: boolean
  isTracing?: boolean
  isSolved: boolean
  canStepBack: boolean
  canStepForward: boolean
  speed: number
  explanationTitle?: string
  explanationDetail?: string
  explanationCoordinate?: string
  solverType?: 'smart' | 'naive'
  tries?: number
  backtracks?: number
  onTogglePlay: () => void
  onStepBackward: () => void
  onStepForward: () => void
  onChangeSpeed: (speed: number) => void
}

export const SolverPlayback: React.FC<SolverPlaybackProps> = ({
  isPlaying,
  isTracing = false,
  isSolved,
  canStepBack,
  canStepForward,
  speed,
  explanationTitle,
  explanationDetail,
  explanationCoordinate,
  solverType = 'smart',
  tries,
  backtracks,
  onTogglePlay,
  onStepBackward,
  onStepForward,
  onChangeSpeed,
}) => {
  // Determine status line text
  let statusText = 'READY'
  if (isTracing) {
    statusText = 'ANALYZING PUZZLE…'
  } else if (isSolved) {
    statusText = 'SOLVED'
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%',
        maxWidth: '500px',
        margin: '0 auto',
      }}
    >
      {/* Solver Playback Control Card */}
      <div
        className="ui-card"
        style={{
          padding: '14px 18px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        {/* Header & Subtle Status */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.85rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-high)',
            }}
          >
            SOLVER PLAYBACK
          </span>
          <span
            style={{
              fontFamily: 'var(--font-arcade)',
              fontSize: '0.8rem',
              letterSpacing: '0.06em',
              color: isSolved ? 'var(--accent-blue)' : 'var(--text-secondary)',
            }}
          >
            {statusText}
          </span>
        </div>

        {/* Primary Transport Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            width: '100%',
            padding: '4px 0',
          }}
        >
          {/* Previous (Secondary) */}
          <button
            type="button"
            onClick={onStepBackward}
            disabled={!canStepBack}
            aria-label="Previous step"
            title="Previous Step"
            className="ui-btn ui-btn-outline"
            style={{
              minWidth: '56px',
              minHeight: '48px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
            }}
          >
            <ChevronLeft size={22} color="var(--text-high)" />
            <span
              style={{
                fontSize: '0.62rem',
                fontFamily: 'var(--font-display)',
                color: 'var(--text-secondary)',
                letterSpacing: '0.04em',
              }}
            >
              PREV
            </span>
          </button>

          {/* Play/Pause (Visually Dominant) */}
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause solver playback' : 'Play solver playback'}
            title={isPlaying ? 'Pause' : 'Play'}
            className="ui-btn ui-btn-primary"
            style={{
              minWidth: '130px',
              minHeight: '52px',
              padding: '10px 24px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              backgroundColor: isPlaying ? 'var(--bg-deep)' : 'var(--accent-blue)',
              color: isPlaying ? 'var(--accent-blue)' : 'var(--bg-deep)',
              border: '2px solid var(--accent-blue)',
              boxShadow: isPlaying ? '0 0 16px rgba(78, 161, 255, 0.35)' : 'none',
              transform: isPlaying ? 'scale(1.02)' : 'scale(1)',
              transition: 'all 0.15s ease-in-out',
            }}
          >
            {isPlaying ? (
              <>
                <Pause size={22} fill="currentColor" />
                <span style={{ fontSize: '0.95rem', fontFamily: 'var(--font-display)' }}>PAUSE</span>
              </>
            ) : (
              <>
                <Play size={22} fill="currentColor" />
                <span style={{ fontSize: '0.95rem', fontFamily: 'var(--font-display)' }}>PLAY</span>
              </>
            )}
          </button>

          {/* Next (Secondary) */}
          <button
            type="button"
            onClick={onStepForward}
            disabled={!canStepForward}
            aria-label="Next step"
            title="Next Step"
            className="ui-btn ui-btn-outline"
            style={{
              minWidth: '56px',
              minHeight: '48px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
            }}
          >
            <ChevronRight size={22} color="var(--text-high)" />
            <span
              style={{
                fontSize: '0.62rem',
                fontFamily: 'var(--font-display)',
                color: 'var(--text-secondary)',
                letterSpacing: '0.04em',
              }}
            >
              NEXT
            </span>
          </button>
        </div>

        {/* Tries and Backtracks counters for Naive solver */}
        {solverType === 'naive' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '24px',
              width: '100%',
              padding: '6px 12px',
              backgroundColor: 'var(--bg-base)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-arcade)', color: 'var(--text-secondary)' }}>
                TRIES:
              </span>
              <span style={{ fontSize: '0.9rem', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--accent-blue)' }}>
                {tries ?? 0}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-arcade)', color: 'var(--text-secondary)' }}>
                BACKTRACKS:
              </span>
              <span style={{ fontSize: '0.9rem', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--danger)' }}>
                {backtracks ?? 0}
              </span>
            </div>
          </div>
        )}

        {/* Speed Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            width: '100%',
            paddingTop: '8px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <span
            style={{
              fontSize: '0.72rem',
              fontFamily: 'var(--font-display)',
              color: 'var(--text-muted)',
              marginRight: '4px',
              letterSpacing: '0.05em',
            }}
          >
            SPEED:
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[1, 2, 5, 10, 50].map((s) => {
              const isSelected = speed === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChangeSpeed(s)}
                  className="ui-btn"
                  style={{
                    minWidth: '38px',
                    minHeight: '34px',
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                    fontFamily: 'var(--font-arcade)',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: isSelected ? 'var(--accent-blue)' : 'var(--bg-subtle)',
                    color: isSelected ? 'var(--bg-deep)' : 'var(--text-secondary)',
                    border: isSelected ? '1px solid var(--accent-blue)' : '1px solid var(--border-subtle)',
                    fontWeight: 700,
                  }}
                >
                  {s}×
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Concise Solver Explanation Card */}
      {(explanationTitle || explanationDetail) && (
        <div
          className="ui-card"
          style={{
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            minHeight: '92px',
            justifyContent: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.85rem',
                color: 'var(--accent-blue)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              {explanationTitle || 'SOLVER LOGIC'}
            </span>
            {explanationCoordinate && (
              <span
                style={{
                  fontFamily: 'var(--font-arcade)',
                  fontSize: '0.78rem',
                  color: 'var(--text-high)',
                }}
              >
                {explanationCoordinate}
              </span>
            )}
          </div>
          {explanationDetail && (
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.85rem',
                color: 'var(--text-high)',
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              {explanationDetail}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
