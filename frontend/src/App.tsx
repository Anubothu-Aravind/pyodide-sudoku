/**
 * Main Sudoku Application Component.
 * Coordinates Campaign (Levels) and Free Play modes with URL routing (/levels, /play),
 * integrated solver inspection, theme management, and instant state refresh.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Navbar, type AppMode } from './components/common/Navbar'
import { LevelsView } from './components/levels/LevelsView'
import { PlayView } from './components/play/PlayView'
import { SettingsModal } from './components/common/SettingsModal'
import { CookieBanner } from './components/common/CookieBanner'
import { BackToTop } from './components/common/BackToTop'
import { storage, DEFAULT_SETTINGS } from './storage/db'
import type { ValidatedUserSettings } from './storage/validation'
import type { Difficulty } from './types'
import { AlertCircle } from 'lucide-react'

export const App: React.FC = () => {
  const [currentMode, setCurrentMode] = useState<AppMode>('levels')
  const [refreshKey, setRefreshKey] = useState<number>(0)
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)
  const [userSettings, setUserSettings] = useState<ValidatedUserSettings>(DEFAULT_SETTINGS)
  const [totalStars, setTotalStars] = useState<number>(0)
  const [streakDays, setStreakDays] = useState<number>(0)
  const [storageBanner, setStorageBanner] = useState<boolean>(false)

  // Cross-link puzzle transfer state
  const [playTargetPuzzle, setPlayTargetPuzzle] = useState<string | undefined>()
  const [playInitialDiff, setPlayInitialDiff] = useState<Difficulty>('medium')
  const [playInitialSeed, setPlayInitialSeed] = useState<string | undefined>()
  const [playInitialSubMode, setPlayInitialSubMode] = useState<'play' | 'solver'>('play')
  const [returnToMapSignal, setReturnToMapSignal] = useState<number>(0)
  const [showCookieBanner, setShowCookieBanner] = useState<boolean>(() => {
    try {
      return !localStorage.getItem('sudoku_cookie_consent')
    } catch {
      return false
    }
  })

  const handleAcceptCookies = useCallback(() => {
    try {
      localStorage.setItem('sudoku_cookie_consent', 'accepted')
    } catch {}
    setShowCookieBanner(false)
  }, [])

  // Refresh global stats (stars, streak) and re-mount views
  const refreshGlobalStats = useCallback(async () => {
    const levels = await storage.getAllLevels()
    const stars = levels.reduce((sum, l) => sum + (l.status === 'completed' ? 3 : (l.stars || 0)), 0)
    setTotalStars(stars)

    const stats = await storage.getStats()
    setStreakDays(stats.currentStreakDays)

    if (!storage.storageAvailable) {
      setStorageBanner(true)
    }
  }, [])

  const handleProgressUpdated = useCallback(async () => {
    await refreshGlobalStats()
    setRefreshKey((k) => k + 1)
  }, [refreshGlobalStats])

  // Apply theme to document
  const applyTheme = useCallback((theme: 'system' | 'light' | 'dark') => {
    let resolvedTheme = theme
    if (theme === 'system') {
      const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      resolvedTheme = prefersDark ? 'dark' : 'light'
    }
    document.documentElement.setAttribute('data-theme', resolvedTheme)
  }, [])

  // Listen for system theme changes if theme setting is 'system'
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleMediaChange = () => {
      storage.getSettings().then((s) => {
        if (s.theme === 'system') {
          applyTheme('system')
        }
      })
    }
    if (media.addEventListener) {
      media.addEventListener('change', handleMediaChange)
      return () => media.removeEventListener('change', handleMediaChange)
    }
  }, [applyTheme])

  // Helper to retrieve the current app base path without trailing slash
  const getSubpath = () => {
    const pathname = window.location.pathname
    const match = pathname.match(/^(.*)\/(?:levels|play)\/?$/)
    if (match) return match[1] || ''
    return pathname.replace(/\/$/, '')
  }

  // Preserve UTM params in search string
  const getPreservedSearch = () => {
    const params = new URLSearchParams(window.location.search)
    const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
    const preserved = new URLSearchParams()
    for (const key of utmKeys) {
      const val = params.get(key)
      if (val) preserved.set(key, val)
    }
    const str = preserved.toString()
    return str ? `?${str}` : ''
  }

  // Dynamic Document Title
  useEffect(() => {
    if (isSettingsOpen) {
      document.title = 'Sudoku | Settings'
    } else if (currentMode === 'play') {
      document.title = 'Sudoku | Free Play'
    } else {
      document.title = 'Sudoku | Campaign'
    }
  }, [currentMode, isSettingsOpen])

  // Mode selection with HTML5 History pushState
  const handleSelectMode = useCallback((mode: AppMode) => {
    if (mode === 'levels' && currentMode === 'levels') {
      setReturnToMapSignal((s) => s + 1)
    }
    setCurrentMode(mode)
    const base = getSubpath()
    const search = getPreservedSearch()
    const targetPath = `${base}/${mode === 'play' ? 'play' : 'levels'}${search}`
    if (window.location.pathname !== `${base}/${mode === 'play' ? 'play' : 'levels'}`) {
      window.history.pushState(null, '', targetPath)
    }
  }, [currentMode])

  // Initial load: parse URL path and parameters, setup popstate listener
  useEffect(() => {
    refreshGlobalStats()

    storage.getSettings().then((s) => {
      setUserSettings(s)
      applyTheme(s.theme)
    })

    // Parse URL path
    const path = window.location.pathname
    if (path.endsWith('/play')) {
      setCurrentMode('play')
    } else {
      setCurrentMode('levels')
      const base = getSubpath()
      const search = getPreservedSearch()
      if (!path.endsWith('/levels') && (path === '/' || path === '' || path === base || path === `${base}/`)) {
        window.history.replaceState(null, '', `${base}/levels${search}`)
      }
    }

    // Parse query parameters
    const params = new URLSearchParams(window.location.search)
    const modeParam = params.get('mode')
    if (modeParam === 'play' || modeParam === 'solver') {
      setCurrentMode('play')
      if (modeParam === 'solver') {
        setPlayInitialSubMode('solver')
      }
    } else if (modeParam === 'levels') {
      setCurrentMode('levels')
    }

    const puzzleParam = params.get('puzzle')
    if (puzzleParam) {
      setPlayTargetPuzzle(puzzleParam)
      setPlayInitialSubMode('solver')
      setCurrentMode('play')
    }

    const diffParam = params.get('diff') as Difficulty
    if (diffParam && ['beginner', 'easy', 'medium', 'hard', 'expert'].includes(diffParam)) {
      setPlayInitialDiff(diffParam)
    }

    const seedParam = params.get('seed')
    if (seedParam) {
      setPlayInitialSeed(seedParam)
    }

    // Browser back/forward navigation
    const handlePopState = () => {
      const currentPath = window.location.pathname
      if (currentPath.endsWith('/play')) {
        setCurrentMode('play')
      } else {
        setCurrentMode('levels')
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [refreshGlobalStats, applyTheme])

  // Cross-link: send puzzle to Watch Solver in Free Play
  const handleWatchSolver = (puzzle: string) => {
    setPlayTargetPuzzle(puzzle)
    setPlayInitialSubMode('solver')
    handleSelectMode('play')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-deep)' }}>
      {/* Top Sticky Header */}
      <div className="app-sticky-header">
        {showCookieBanner && (
          <div className="mobile-cookie-slot">
            <CookieBanner
              visible={showCookieBanner}
              onAccept={handleAcceptCookies}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          </div>
        )}
        <Navbar
          currentMode={currentMode}
          onSelectMode={handleSelectMode}
          totalStars={totalStars}
          streakDays={streakDays}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      </div>

      {/* Storage unavailable warning banner */}
      {storageBanner && (
        <div
          style={{
            padding: '10px 16px',
            backgroundColor: 'var(--bg-subtle)',
            color: 'var(--accent-blue)',
            borderBottom: '1px solid var(--accent-blue)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '0.82rem',
            fontFamily: 'var(--font-arcade)',
          }}
        >
          <AlertCircle size={16} />
          <span>
            Storage is restricted in this session. Export progress to save offline.
          </span>
        </div>
      )}

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '16px 8px 32px' }}>
        {currentMode === 'levels' && (
          <LevelsView
            key={refreshKey}
            userSettings={userSettings}
            onWatchSolver={handleWatchSolver}
            returnToMapSignal={returnToMapSignal}
          />
        )}

        {currentMode === 'play' && (
          <PlayView
            key={refreshKey}
            userSettings={userSettings}
            initialDifficulty={playInitialDiff}
            initialSeed={playInitialSeed}
            initialPuzzle={playTargetPuzzle}
            initialSubMode={playInitialSubMode}
            onWatchSolver={handleWatchSolver}
            onGoHome={() => handleSelectMode('levels')}
          />
        )}
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsChanged={(s) => {
          setUserSettings(s)
          applyTheme(s.theme)
        }}
        onProgressUpdated={handleProgressUpdated}
      />

      {/* Desktop Cookie Consent Banner (at bottom) */}
      {showCookieBanner && (
        <div className="desktop-cookie-slot">
          <CookieBanner
            visible={showCookieBanner}
            onAccept={handleAcceptCookies}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        </div>
      )}

      {/* Back To Top Button */}
      <BackToTop />
    </div>
  )
}

export default App
