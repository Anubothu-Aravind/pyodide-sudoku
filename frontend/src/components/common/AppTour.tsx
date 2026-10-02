/**
 * AppTour – Driver.js guided walkthrough.
 *
 * Shows automatically on first visit (localStorage key 'sudoku_tour_seen').
 * Can be triggered manually (e.g. from Settings) via the exported helper.
 *
 * driver.js v1 quirks:
 *  - onDestroyStarted intercepts close but does NOT auto-close; must call destroy() manually.
 *  - No built-in skipBtnText; we inject a "Skip Tour" link via onHighlightStarted.
 */

import { useEffect, useRef } from 'react'
import { driver, type Driver } from 'driver.js'
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



const STEPS = [
  {
    popover: {
      title: 'Welcome to Sudoku!',
      description:
        'This quick tour shows you the main features. You can skip it at any time.',
      side: 'bottom' as const,
      align: 'center' as const,
    },
  },
  {
    element: '#nav-campaign-btn',
    popover: {
      title: 'Campaign Mode',
      description:
        'Play through hand-crafted levels with increasing difficulty. Earn stars and climb the leaderboard!',
      side: 'bottom' as const,
      align: 'start' as const,
    },
  },
  {
    element: '#nav-freeplay-btn',
    popover: {
      title: 'Free Play Mode',
      description:
        'Generate endless puzzles with custom seeds, pick your difficulty, and choose from 7 variants (Diagonal, Windoku, Disjoint...)',
      side: 'bottom' as const,
      align: 'start' as const,
    },
  },
  {
    element: '#nav-settings-btn',
    popover: {
      title: 'Settings',
      description:
        'Customize the theme, toggle hints, set conflict highlighting, and manage your progress data here.',
      side: 'bottom' as const,
      align: 'end' as const,
    },
  },
  {
    element: '#nav-streak-badge',
    popover: {
      title: 'Streak & Stars',
      description:
        'Your daily streak and total star count are shown here. Keep playing every day to grow your streak!',
      side: 'bottom' as const,
      align: 'end' as const,
    },
  },
]

interface AppTourProps {
  autoStart?: boolean
  triggerCount?: number
}

export function AppTour({ autoStart = true, triggerCount = 0 }: AppTourProps) {
  const driverRef = useRef<Driver | null>(null)

  const startTour = () => {
    if (driverRef.current) {
      driverRef.current.destroy()
      driverRef.current = null
    }

    const d = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayOpacity: 0.6,
      smoothScroll: true,
      stagePadding: 6,
      popoverClass: 'sudoku-tour-popover',
      progressText: '{{current}} / {{total}}',
      nextBtnText: 'Next',
      prevBtnText: 'Prev',
      doneBtnText: 'Done',
      onPopoverRender: (popoverDOM) => {
        const { wrapper, title, description, footer, closeButton } = popoverDOM

        // 1. Skip Tour button (clean text button at top-right next to close, NO horizontal line!)
        if (!wrapper.querySelector('.tour-skip-btn')) {
          const skipBtn = document.createElement('button')
          skipBtn.type = 'button'
          skipBtn.className = 'tour-skip-btn'
          skipBtn.textContent = 'Skip Tour'
          skipBtn.setAttribute('aria-label', 'Skip the guided tour')
          skipBtn.onclick = (e) => {
            e.preventDefault()
            e.stopPropagation()
            markTourSeen()
            d.destroy()
          }
          wrapper.insertBefore(skipBtn, closeButton)
        }

        // 2. Avatar + Text layout (like reference image 2)
        if (!wrapper.querySelector('.tour-card-body')) {
          const cardBody = document.createElement('div')
          cardBody.className = 'tour-card-body'

          const avatar = document.createElement('div')
          avatar.className = 'tour-avatar'

          const img = document.createElement('img')
          const baseUrl = import.meta.env.BASE_URL || '/'
          img.src = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}favicon.svg`
          img.alt = 'Sudoku Logo'
          img.width = 44
          img.height = 44
          img.onerror = () => {
            avatar.innerHTML = `<span class="tour-avatar-fallback">S</span>`
          }
          avatar.appendChild(img)

          const textContainer = document.createElement('div')
          textContainer.className = 'tour-text-container'

          // Insert cardBody right before footer
          wrapper.insertBefore(cardBody, footer)

          cardBody.appendChild(avatar)
          cardBody.appendChild(textContainer)
          textContainer.appendChild(title)
          textContainer.appendChild(description)
        }
      },
      onCloseClick: () => {
        markTourSeen()
        driverRef.current?.destroy()
        driverRef.current = null
      },
      onDestroyStarted: () => {
        markTourSeen()
        driverRef.current?.destroy()
        driverRef.current = null
      },
      steps: STEPS,
    })

    driverRef.current = d
    d.drive()
  }

  useEffect(() => {
    if (!autoStart) return
    if (hasSeenTour()) return
    const timer = setTimeout(startTour, 800)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  useEffect(() => {
    if (triggerCount <= 0) return
    startTour()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerCount])

  useEffect(() => {
    return () => {
      driverRef.current?.destroy()
      driverRef.current = null
    }
  }, [])

  return null
}
