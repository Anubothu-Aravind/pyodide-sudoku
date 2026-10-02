/**
 * Non-intrusive Cookie Consent Banner.
 * Section 23:
 * "We use essential cookies to keep your game experience working. [ ACCEPT ] [ SETTINGS ]"
 * Remembers consent in localStorage and does not cover gameplay controls.
 */

import React, { useState } from 'react'

export interface CookieBannerProps {
  onOpenSettings: () => void
  onAccept?: () => void
  visible?: boolean
}

export const CookieBanner: React.FC<CookieBannerProps> = ({
  onOpenSettings,
  onAccept,
  visible: controlledVisible,
}) => {
  const [internalVisible, setInternalVisible] = useState<boolean>(() => {
    if (controlledVisible !== undefined) return false
    try {
      return !localStorage.getItem('sudoku_cookie_consent')
    } catch {
      return false
    }
  })

  const isVisible = controlledVisible !== undefined ? controlledVisible : internalVisible

  const handleAccept = () => {
    try {
      localStorage.setItem('sudoku_cookie_consent', 'accepted')
    } catch {
      // Ignore
    }
    setInternalVisible(false)
    onAccept?.()
  }

  if (!isVisible) return null

  return (
    <aside
      aria-label="Cookie consent"
      className="cookie-consent-banner no-print"
      style={{
        zIndex: 40,
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '0.78rem',
          color: 'var(--text-high)',
          margin: 0,
          textAlign: 'center',
        }}
      >
        We use essential cookies to keep your game experience working.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          onClick={handleAccept}
          className="ui-btn ui-btn-primary"
          style={{
            padding: '4px 12px',
            minHeight: '32px',
            fontSize: '0.72rem',
            fontWeight: 700,
          }}
        >
          ACCEPT
        </button>

        <button
          type="button"
          onClick={() => {
            handleAccept()
            onOpenSettings()
          }}
          className="ui-btn ui-btn-outline"
          style={{
            padding: '4px 12px',
            minHeight: '32px',
            fontSize: '0.72rem',
            fontWeight: 600,
          }}
        >
          SETTINGS
        </button>
      </div>
    </aside>
  )
}
