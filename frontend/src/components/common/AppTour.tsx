/**
 * AppTour – Driver.js guided walkthrough.
 *
 * Shows automatically on first visit (localStorage key 'sudoku_tour_seen').
 * Can be triggered manually (e.g. from Settings) via the exported helper.
 */

import { useEffect, useRef } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

const TOUR_SEEN_KEY = 'sudoku_tour_seen'

export function hasSeenTour(): boolean {
  try {
    return !!localStorage.getItem(TOUR_SEEN_KEY)
  } catch {
    return false
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, '1')
  } catch {}
}

export function resetTour(): void {
  try {
    localStorage.removeItem(TOUR_SEEN_KEY)
  } catch {}
}

function buildDriver(onDone: () => void) {
  return driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    overlayOpacity: 0.6,
    smoothScroll: true,
    stagePadding: 6,
    popoverClass: 'sudoku-tour-popover',
    progressText: '{{current}} / {{total}}',
    nextBtnText: 'Next →',
    prevBtnText: '← Back',
    doneBtnText: 'Got it!',
    onDestroyStarted: () => {
      onDone()
    },
    steps: [
      {
        popover: {
          title: 'Welcome to Sudoku!',
          description:
            'This quick tour shows you the main features. You can skip it at any time or replay it from Settings.',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '#nav-campaign-btn',
        popover: {
          title: 'Campaign Mode',
          description:
            'Play through hand-crafted levels with increasing difficulty. Earn stars and climb the leaderboard!',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '#nav-freeplay-btn',
        popover: {
          title: 'Free Play Mode',
          description:
            'Generate endless puzzles with custom seeds, pick your difficulty, and choose from 7 variants (Diagonal, Windoku, Disjoint…)',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '#nav-settings-btn',
        popover: {
          title: 'Settings',
          description:
            'Customize the theme, toggle hints, set conflict highlighting, and manage your progress data here.',
          side: 'bottom',
          align: 'end',
        },
      },
      {
        element: '#nav-streak-badge',
        popover: {
          title: 'Streak & Stars',
          description:
            'Your daily streak and total star count are shown here. Keep playing every day to grow your streak!',
          side: 'bottom',
          align: 'end',
        },
      },
    ],
  })
}

interface AppTourProps {
  /** When true, auto-start on first visit (unless already seen). */
  autoStart?: boolean
  /** External trigger: bump this to manually launch the tour. */
  triggerCount?: number
}

export function AppTour({ autoStart = true, triggerCount = 0 }: AppTourProps) {
  const driverRef = useRef<ReturnType<typeof driver> | null>(null)

  const startTour = () => {
    if (driverRef.current) {
      driverRef.current.destroy()
    }
    const d = buildDriver(() => {
      markTourSeen()
    })
    driverRef.current = d
    d.drive()
  }

  // Auto-start on mount if first visit
  useEffect(() => {
    if (!autoStart) return
    if (hasSeenTour()) return

    // Small delay so the DOM is fully painted
    const timer = setTimeout(startTour, 800)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  // Manual trigger (bump triggerCount from outside)
  useEffect(() => {
    if (triggerCount <= 0) return
    startTour()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerCount])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      driverRef.current?.destroy()
    }
  }, [])

  return null
}
