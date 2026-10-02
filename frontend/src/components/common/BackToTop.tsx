/**
 * Back to Top Floating Button.
 * Section 24:
 * Appears when page is scrolled > 300px.
 * Smooth scroll, respects reduced-motion preferences, does not block the board.
 */

import React, { useState, useEffect } from 'react'
import { ArrowUp } from 'lucide-react'

export const BackToTop: React.FC = () => {
  const [show, setShow] = useState<boolean>(false)

  useEffect(() => {
    const handleScroll = () => {
      setShow(window.scrollY > 300)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToTop = () => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    })
  }

  if (!show) return null

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll back to top"
      title="Back to Top"
      className="ui-btn ui-btn-outline"
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '42px',
        height: '42px',
        minHeight: '42px',
        minWidth: '42px',
        padding: 0,
        borderRadius: 'var(--radius-sm)',
        boxShadow: 'var(--shadow-md)',
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid var(--accent-blue)',
      }}
    >
      <ArrowUp size={20} color="var(--accent-blue)" />
    </button>
  )
}
