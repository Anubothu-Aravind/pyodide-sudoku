/**
 * Custom Sudoku Game Navigation Bar.
 * Layout:
 *   [S] SUDOKU (Pyodide Logic Engine)  |  CAMPAIGN  FREE PLAY  |  ★ 27  ⚙
 * Clickable logo returns to campaign/home screen.
 */

import React from 'react'
import { Settings } from 'lucide-react'

export type AppMode = 'levels' | 'play'

export interface NavbarProps {
  currentMode: AppMode
  onSelectMode: (mode: AppMode) => void
  totalStars: number
  streakDays?: number
  onOpenSettings: () => void
}

export const Navbar: React.FC<NavbarProps> = ({
  currentMode,
  onSelectMode,
  totalStars,
  onOpenSettings,
}) => {
  return (
    <header
      className="no-print"
      style={{
        backgroundColor: 'var(--bg-deep)',
        borderBottom: '2px solid var(--border-subtle)',
        padding: '10px 16px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
      }}
    >
      <div
        style={{
          maxWidth: '1100px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        {/* Brand / Logo - Clickable to return Home/Campaign */}
        <div
          onClick={() => onSelectMode('levels')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              onSelectMode('levels')
            }
          }}
          title="Return Home (Campaign)"
          aria-label="Sudoku Home"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--accent-blue)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--bg-deep)',
              fontWeight: 900,
              fontSize: '1.25rem',
              fontFamily: 'var(--font-display)',
              boxShadow: '0 0 10px rgba(78, 161, 255, 0.4)',
            }}
          >
            S
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.15rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                lineHeight: 1,
                color: 'var(--text-high)',
              }}
            >
              SUDOKU
            </span>
            <span
              style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '0.68rem',
                color: 'var(--accent-blue)',
                letterSpacing: '0.04em',
                marginTop: '3px',
              }}
            >
              PYODIDE LOGIC ENGINE
            </span>
          </div>
        </div>

        {/* Functional Navigation Tabs: CAMPAIGN, FREE PLAY */}
        <nav
          style={{
            display: 'flex',
            gap: '6px',
            backgroundColor: 'var(--bg-surface)',
            padding: '4px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => onSelectMode('levels')}
            aria-selected={currentMode === 'levels'}
            className="ui-btn"
            style={{
              padding: '6px 16px',
              minHeight: '38px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: currentMode === 'levels' ? 'var(--accent-blue)' : 'transparent',
              color: currentMode === 'levels' ? 'var(--bg-deep)' : 'var(--text-secondary)',
              border: currentMode === 'levels' ? '1px solid var(--accent-blue)' : '1px solid transparent',
              fontWeight: 700,
              fontSize: '0.8rem',
              letterSpacing: '0.06em',
              boxShadow: currentMode === 'levels' ? '0 0 10px rgba(78, 161, 255, 0.3)' : 'none',
            }}
          >
            CAMPAIGN
          </button>

          <button
            type="button"
            onClick={() => onSelectMode('play')}
            aria-selected={currentMode === 'play'}
            className="ui-btn"
            style={{
              padding: '6px 16px',
              minHeight: '38px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: currentMode === 'play' ? 'var(--accent-blue)' : 'transparent',
              color: currentMode === 'play' ? 'var(--bg-deep)' : 'var(--text-secondary)',
              border: currentMode === 'play' ? '1px solid var(--accent-blue)' : '1px solid transparent',
              fontWeight: 700,
              fontSize: '0.8rem',
              letterSpacing: '0.06em',
              boxShadow: currentMode === 'play' ? '0 0 10px rgba(78, 161, 255, 0.3)' : 'none',
            }}
          >
            FREE PLAY
          </button>
        </nav>

        {/* Global Progress Stars & Settings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            title={`${totalStars} Stars Earned`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'var(--font-arcade)',
              fontSize: '0.88rem',
              color: 'var(--accent-blue)',
            }}
          >
            <span>★</span>
            <span className="tabular-nums" style={{ color: 'var(--text-high)' }}>
              {totalStars}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open settings"
            title="Settings"
            className="ui-btn ui-btn-outline"
            style={{
              padding: '8px',
              minHeight: '38px',
              minWidth: '38px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-high)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Settings size={18} />
          </button>
        </div>
      </div>
    </header>
  )
}
