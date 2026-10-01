/**
 * Level Completion / Success Modal.
 * Clean arcade victory card conforming to Section 18:
 *   SOLVED
 *   [S]
 *   PUZZLE COMPLETE
 *   02:41
 *   NO MISTAKES
 *   [ NEXT LEVEL → ]
 *   [ CAMPAIGN ]
 */

import React, { useEffect } from 'react'
import { ArrowRight, Map } from 'lucide-react'

export interface LevelCompletionModalProps {
  isOpen: boolean
  levelNumber: number
  starsEarned?: number
  elapsedMs: number
  parTimeSeconds: number
  mistakes: number
  hintsUsed: number
  isNewBest: boolean
  solvedBySolver?: boolean
  onNextLevel: () => void
  onReplay: () => void
  onOpenMap: () => void
}

export const LevelCompletionModal: React.FC<LevelCompletionModalProps> = ({
  isOpen,
  levelNumber,
  elapsedMs,
  mistakes,
  onNextLevel,
  onOpenMap,
}) => {
  // Support Escape key to close/return to map
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenMap()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onOpenMap])

  if (!isOpen) return null

  const formatTimer = (ms: number) => {
    const totalSec = Math.floor(ms / 1000)
    const m = Math.floor(totalSec / 60)
    const s = totalSec % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="victory-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 100,
      }}
    >
      <div
        className="anim-pop ui-card"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '2px solid var(--accent-blue)',
          borderRadius: 'var(--radius-md)',
          padding: '32px 24px',
          width: '100%',
          maxWidth: '400px',
          textAlign: 'center',
          boxShadow: '0 0 30px rgba(0, 0, 0, 0.8), 0 0 15px rgba(78, 161, 255, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        {/* Title */}
        <h2
          id="victory-title"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.7rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--accent-blue)',
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          SOLVED
          <span style={{ display: 'block', fontSize: '1rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Level {levelNumber} Complete
          </span>
        </h2>

        {/* Arcade Badge */}
        <div
          style={{
            width: '54px',
            height: '54px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--accent-blue)',
            color: 'var(--bg-deep)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            boxShadow: '0 0 16px rgba(78, 161, 255, 0.5)',
          }}
        >
          S
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.05rem',
            letterSpacing: '0.06em',
            color: 'var(--text-high)',
            textTransform: 'uppercase',
          }}
        >
          PUZZLE COMPLETE
        </div>

        {/* Timer display */}
        <div
          className="tabular-nums"
          style={{
            fontFamily: 'var(--font-arcade)',
            fontSize: '2rem',
            color: 'var(--accent-blue)',
            letterSpacing: '0.04em',
            margin: '2px 0',
          }}
        >
          {formatTimer(elapsedMs)}
        </div>

        {/* Mistake feedback */}
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '0.85rem',
            letterSpacing: '0.06em',
            color: mistakes === 0 ? 'var(--text-high)' : 'var(--text-secondary)',
            textTransform: 'uppercase',
          }}
        >
          {mistakes === 0 ? 'NO MISTAKES' : `${mistakes} MISTAKE${mistakes !== 1 ? 'S' : ''}`}
        </div>

        <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-arcade)', color: 'var(--accent-blue)' }}>
          ★★★ 3 stars awarded
        </div>

        {/* Primary Action Button: NEXT LEVEL */}
        <button
          type="button"
          onClick={onNextLevel}
          className="ui-btn ui-btn-primary"
          style={{
            width: '100%',
            padding: '14px 20px',
            fontSize: '1rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginTop: '8px',
          }}
        >
          <span>NEXT LEVEL ({levelNumber + 1})</span>
          <ArrowRight size={18} />
        </button>

        {/* Secondary Action: CAMPAIGN */}
        <button
          type="button"
          onClick={onOpenMap}
          className="ui-btn ui-btn-outline"
          style={{
            width: '100%',
            padding: '10px 16px',
            fontSize: '0.85rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <Map size={16} />
          <span>CAMPAIGN</span>
        </button>
      </div>
    </div>
  )
}
