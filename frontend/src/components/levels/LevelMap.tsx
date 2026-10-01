/**
 * Campaign Map: Connected game progression map.
 * Replaces generic dashboard cards with a responsive connected world pathway.
 * Displays worlds of 10 levels, visual connectors, earned ratings (★★★), and CURRENT play state.
 * Responsive:
 * - <640px: 1 column of worlds, 2 level tiles per row
 * - 640-1100px: 1 column of worlds (max 720px), 5 level tiles per row
 * - >=1100px: 2 worlds per row, 5 tiles per row
 * - >=1600px: 3 worlds per row
 */

import React, { useEffect, useRef } from 'react'
import type { ValidatedLevelRecord } from '../../storage/validation'
import { Lock, Crown, Play } from 'lucide-react'

export interface LevelMapProps {
  levels: ValidatedLevelRecord[]
  highestUnlockedLevel: number
  currentLevelNumber: number
  onSelectLevel: (level: number) => void
}

export const LevelMap: React.FC<LevelMapProps> = ({
  levels,
  highestUnlockedLevel,
  currentLevelNumber,
  onSelectLevel,
}) => {
  const currentTileRef = useRef<HTMLButtonElement | null>(null)
  const hasScrolledRef = useRef<boolean>(false)

  // Auto-scroll current level into view ONCE on initial load
  useEffect(() => {
    if (!hasScrolledRef.current && currentTileRef.current) {
      hasScrolledRef.current = true
      currentTileRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentLevelNumber])

  // Group levels into worlds of 10
  const totalWorlds = Math.max(5, Math.ceil(highestUnlockedLevel / 10) + 1)
  const worlds: { world: number; title: string; subtitle: string; levels: ValidatedLevelRecord[] }[] = []

  const worldMetadata: Record<number, { title: string; subtitle: string }> = {
    1: { title: 'WORLD 1', subtitle: 'BEGINNER FUNDAMENTALS' },
    2: { title: 'WORLD 2', subtitle: 'EASY FOUNDATIONS' },
    3: { title: 'WORLD 3', subtitle: 'MEDIUM LOGIC' },
    4: { title: 'WORLD 4', subtitle: 'HARD DEDUCTIONS' },
    5: { title: 'WORLD 5', subtitle: 'EXPERT MASTERY' },
  }

  const levelMap = new Map<number, ValidatedLevelRecord>()
  for (const l of levels) levelMap.set(l.level, l)

  const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X']

  for (let w = 1; w <= totalWorlds; w++) {
    const worldLevels: ValidatedLevelRecord[] = []
    for (let i = 1; i <= 10; i++) {
      const lvlNum = (w - 1) * 10 + i
      const existing = levelMap.get(lvlNum)
      if (existing) {
        worldLevels.push(existing)
      } else {
        const isUnlocked = lvlNum <= highestUnlockedLevel
        worldLevels.push({
          level: lvlNum,
          world: w,
          difficulty: w <= 1 ? 'beginner' : w === 2 ? 'easy' : w === 3 ? 'medium' : w === 4 ? 'hard' : 'expert',
          puzzle: '',
          solution: '',
          clues: 0,
          effort_score: 0,
          par_time_seconds: 300,
          is_boss: i === 10,
          seed: `lvl-${lvlNum}-v1`,
          generator_version: 1,
          status: isUnlocked ? 'unlocked' : 'locked',
          attempts: 0,
        })
      }
    }

    let meta: { title: string; subtitle: string }
    if (worldMetadata[w]) {
      meta = worldMetadata[w]
    } else {
      const endlessNum = w - 5
      const roman = ROMAN[endlessNum - 1] || `${endlessNum}`
      meta = { title: `WORLD ${w}`, subtitle: `ENDLESS EXPERT ${roman}` }
    }
    worlds.push({ world: w, title: meta.title, subtitle: meta.subtitle, levels: worldLevels })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
      {/* Campaign Title Banner */}
      <div style={{ textAlign: 'center', margin: '4px 0 8px' }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.8rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-high)',
            margin: '0 0 4px',
          }}
        >
          Campaign Map
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-arcade)',
            fontSize: '0.85rem',
            color: 'var(--accent-blue)',
            letterSpacing: '0.04em',
            margin: 0,
          }}
        >
          Master the logic.
        </p>
      </div>

      {/* Responsive Worlds Grid */}
      <div className="campaign-worlds-grid">
        {worlds.map(({ world, title, subtitle, levels: wLevels }) => {
          const isWorldUnlocked = wLevels.some((l) => l.status !== 'locked')

          return (
            <div
              key={world}
              className="world-card-container"
              style={{
                opacity: isWorldUnlocked ? 1 : 0.45,
              }}
            >
              {/* World Header */}
              <div
                style={{
                  textAlign: 'center',
                  borderBottom: '1px solid var(--border-subtle)',
                  paddingBottom: '12px',
                  marginBottom: '14px',
                }}
              >
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.2rem',
                    letterSpacing: '0.06em',
                    color: 'var(--accent-blue)',
                    margin: '0 0 2px',
                  }}
                >
                  {title}
                </h3>
                <span
                  style={{
                    fontFamily: 'var(--font-arcade)',
                    fontSize: '0.78rem',
                    color: 'var(--text-secondary)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {subtitle}
                </span>
              </div>

              {/* Connected Node Map Grid: 2 columns on mobile, 5 on tablet/desktop */}
              <div className="world-levels-grid">
                {wLevels.map((lvl) => {
                  const isLocked = lvl.status === 'locked'
                  const isCompleted = lvl.status === 'completed'
                  const isCurrent = lvl.level === currentLevelNumber
                  const isBoss = lvl.is_boss
                  const formattedNum = lvl.level.toString().padStart(2, '0')

                  return (
                    <button
                      key={lvl.level}
                      ref={isCurrent ? currentTileRef : null}
                      disabled={isLocked}
                      onClick={() => onSelectLevel(lvl.level)}
                      aria-label={`Level ${lvl.level}, ${lvl.status}, ${isCompleted ? 3 : (lvl.stars || 0)} stars, ${lvl.difficulty}${isBoss ? ', Boss level' : ''}`}
                      className="ui-card"
                      style={{
                        aspectRatio: '1 / 1',
                        width: '100%',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: isCurrent
                          ? 'var(--accent-blue)'
                          : isCompleted
                          ? 'var(--bg-subtle)'
                          : isLocked
                          ? 'var(--bg-deep)'
                          : 'var(--bg-surface)',
                        color: isCurrent ? 'var(--bg-deep)' : 'var(--text-high)',
                        border: isCurrent
                          ? '2px solid var(--text-high)'
                          : isBoss
                          ? '2px solid var(--accent-blue)'
                          : '1px solid var(--border-subtle)',
                        boxShadow: isCurrent ? '0 0 14px rgba(78, 161, 255, 0.45)' : 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '2px',
                        cursor: isLocked ? 'not-allowed' : 'pointer',
                        padding: '4px',
                        position: 'relative',
                        transform: isCurrent ? 'scale(1.03)' : 'none',
                        transition: 'all 0.15s ease-in-out',
                      }}
                    >
                      {isBoss && (
                        <Crown
                          size={12}
                          color={isCurrent ? 'var(--bg-deep)' : 'var(--accent-blue)'}
                          style={{ position: 'absolute', top: '3px', right: '3px' }}
                        />
                      )}

                      {isLocked ? (
                        <>
                          <Lock size={16} color="var(--text-muted)" />
                          <span
                            style={{
                              fontFamily: 'var(--font-arcade)',
                              fontSize: '0.72rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {formattedNum}
                          </span>
                        </>
                      ) : (
                        <>
                          <span
                            style={{
                              fontFamily: 'var(--font-display)',
                              fontSize: '1.15rem',
                              fontWeight: 700,
                              lineHeight: 1,
                              letterSpacing: '0.03em',
                            }}
                          >
                            {formattedNum}
                          </span>

                          {isCurrent ? (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '2px',
                                backgroundColor: 'var(--bg-deep)',
                                color: 'var(--accent-blue)',
                                padding: '1px 5px',
                                borderRadius: '2px',
                                fontFamily: 'var(--font-display)',
                                fontSize: '0.58rem',
                                letterSpacing: '0.06em',
                                fontWeight: 700,
                                marginTop: '1px',
                              }}
                            >
                              <Play size={7} fill="currentColor" />
                              PLAY
                            </div>
                          ) : isCompleted ? (
                            <span
                              style={{
                                fontFamily: 'var(--font-arcade)',
                                fontSize: '0.68rem',
                                color: 'var(--accent-blue)',
                                letterSpacing: '0.04em',
                                marginTop: '1px',
                              }}
                            >
                              ★★★
                            </span>
                          ) : (
                            <span
                              style={{
                                fontFamily: 'var(--font-arcade)',
                                fontSize: '0.6rem',
                                color: 'var(--text-muted)',
                                letterSpacing: '0.04em',
                                marginTop: '1px',
                              }}
                            >
                              OPEN
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
