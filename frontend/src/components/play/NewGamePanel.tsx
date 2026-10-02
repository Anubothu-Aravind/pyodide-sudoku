import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { VARIANTS, type VariantId, VARIANT_SYMBOLS } from '../../variants'
import type { Difficulty } from '../../types'
import type { PlayDifficulty } from './PlayView'
import { X, Check, FileText } from 'lucide-react'

export interface NewGamePanelProps {
  isOpen: boolean
  onClose: () => void
  currentDifficulty: PlayDifficulty
  currentVariantId: VariantId
  hasActiveMoves: boolean
  onGenerate: (difficulty: PlayDifficulty, variantId: VariantId) => void
}

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
  { id: 'expert', label: 'Expert' },
]

const NewGamePanelContent: React.FC<Omit<NewGamePanelProps, 'isOpen'>> = ({
  onClose,
  currentDifficulty,
  currentVariantId,
  hasActiveMoves,
  onGenerate,
}) => {
  const isCurrentlyBlank = currentDifficulty === 'blank'
  const initialDiff: Difficulty = isCurrentlyBlank ? 'medium' : currentDifficulty

  const [draftDifficulty, setDraftDifficulty] = useState<Difficulty>(initialDiff)
  const [draftVariant, setDraftVariant] = useState<VariantId>(currentVariantId)
  const [draftEmptyBoard, setDraftEmptyBoard] = useState<boolean>(isCurrentlyBlank)
  const [rememberedDifficulty, setRememberedDifficulty] = useState<Difficulty>(initialDiff)

  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false)

  const firstFocusableRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    firstFocusableRef.current?.focus()
  }, [])

  // Toggle empty board and remember/restore difficulty
  const handleToggleEmptyBoard = (checked: boolean) => {
    if (checked) {
      setRememberedDifficulty(draftDifficulty)
      setDraftEmptyBoard(true)
    } else {
      setDraftEmptyBoard(false)
      setDraftDifficulty(rememberedDifficulty || 'medium')
    }
  }

  // Commit generation
  const handleCommitGenerate = useCallback(() => {
    const targetDiff: PlayDifficulty = draftEmptyBoard ? 'blank' : draftDifficulty
    onGenerate(targetDiff, draftVariant)
    onClose()
  }, [draftEmptyBoard, draftDifficulty, draftVariant, onGenerate, onClose])

  // Handle Generate button click
  const handleGenerateClick = () => {
    if (hasActiveMoves) {
      setShowConfirmModal(true)
    } else {
      handleCommitGenerate()
    }
  }

  // Keyboard navigation: Escape discards draft and closes
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (showConfirmModal) {
        setShowConfirmModal(false)
      } else {
        onClose()
      }
    }
  }

  return (
    <>
      {/* Backdrop overlay for mobile & tablet */}
      <div
        className="new-game-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Main Panel Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-game-dialog-title"
        onKeyDown={handleKeyDown}
        className="new-game-panel-container"
      >
        {/* Mobile drag handle indicator */}
        <div className="new-game-drag-handle" aria-hidden="true" />

        {/* Panel Header */}
        <div className="new-game-header">
          <div>
            <h2 id="new-game-dialog-title" className="new-game-title">
              New Game
            </h2>
            <p className="new-game-subtitle">
              Select difficulty and variant to generate a puzzle.
            </p>
          </div>
          <button
            ref={firstFocusableRef}
            type="button"
            onClick={onClose}
            aria-label="Discard changes and close"
            title="Cancel (Esc)"
            className="icon-touch-btn"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Configuration Body */}
        <div className="new-game-body">
          {/* Section 1: Difficulty Selector */}
          <div className="new-game-section">
            <div className="new-game-section-header">
              <span className="new-game-section-label">Difficulty</span>
              {draftEmptyBoard && (
                <span className="new-game-disabled-tag">Disabled in Blank Grid</span>
              )}
            </div>

            <div
              className={`new-game-diff-group ${draftEmptyBoard ? 'is-disabled' : ''}`}
              role="radiogroup"
              aria-label="Difficulty"
            >
              {DIFFICULTIES.map((diff) => {
                const isSelected = !draftEmptyBoard && draftDifficulty === diff.id
                return (
                  <button
                    key={diff.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={draftEmptyBoard}
                    onClick={() => setDraftDifficulty(diff.id)}
                    className={`new-game-diff-btn ${isSelected ? 'active' : ''}`}
                  >
                    {diff.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Section 2: Empty Board Toggle */}
          <div className="new-game-section">
            <label className="new-game-empty-toggle">
              <input
                type="checkbox"
                checked={draftEmptyBoard}
                onChange={(e) => handleToggleEmptyBoard(e.target.checked)}
                className="new-game-checkbox"
              />
              <div className="new-game-empty-content">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={15} style={{ color: 'var(--accent-blue)' }} />
                  <span className="new-game-empty-title">Start with empty board</span>
                </div>
                <span className="new-game-empty-desc">
                  Play as a blank grid for custom puzzle entry and step-by-step solver tracing.
                </span>
              </div>
            </label>
          </div>

          {/* Section 3: Variant Selector */}
          <div className="new-game-section">
            <div className="new-game-section-header">
              <span className="new-game-section-label">Variant</span>
              <span className="new-game-section-hint">Select rules</span>
            </div>

            <div className="new-game-variant-grid" role="radiogroup" aria-label="Sudoku variants">
              {(Object.keys(VARIANTS) as VariantId[]).map((vid) => {
                const v = VARIANTS[vid]
                const isSelected = draftVariant === vid
                const symbol = VARIANT_SYMBOLS[vid] || ''
                const cleanName = v.metadata.name.replace(/\s+Sudoku$/i, '')

                return (
                  <button
                    key={vid}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setDraftVariant(vid)}
                    className={`new-game-variant-card ${isSelected ? 'active' : ''}`}
                  >
                    <div className="new-game-card-top">
                      <span className="new-game-card-name">
                        {cleanName} {symbol && <span className="new-game-card-sym">{symbol}</span>}
                      </span>
                      {isSelected && (
                        <span className="new-game-card-check">
                          <Check size={13} />
                        </span>
                      )}
                    </div>

                    <p className="new-game-card-desc">{v.metadata.description}</p>

                    {vid !== 'classic' && (
                      <span className="new-game-card-badge">Classic rules apply</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="new-game-actions">
          <button
            type="button"
            onClick={onClose}
            className="ui-btn ui-btn-outline"
            style={{ flex: '1 1 35%', minHeight: '40px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerateClick}
            className="ui-btn ui-btn-primary"
            style={{ flex: '1 1 65%', minHeight: '40px', fontWeight: 700 }}
          >
            {draftEmptyBoard ? 'Create Blank Grid' : 'Generate Puzzle'}
          </button>
        </div>
      </div>

      {/* Confirmation Modal when discarding active moves */}
      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-newgame-title"
          className="new-game-confirm-modal"
        >
          <div className="new-game-confirm-card">
            <h3 id="confirm-newgame-title" className="new-game-confirm-title">
              Start new puzzle?
            </h3>
            <p className="new-game-confirm-text">
              You have active moves in your current game. Generating a new puzzle will clear your progress.
            </p>
            <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="ui-btn ui-btn-secondary"
                style={{ flex: 1, minHeight: '38px' }}
              >
                Keep Playing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false)
                  handleCommitGenerate()
                }}
                className="ui-btn ui-btn-danger"
                style={{ flex: 1, minHeight: '38px', fontWeight: 700 }}
              >
                New Puzzle
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export const NewGamePanel: React.FC<NewGamePanelProps> = (props) => {
  if (!props.isOpen) return null
  if (typeof document === 'undefined') return null
  return createPortal(<NewGamePanelContent {...props} />, document.body)
}
