/**
 * Custom Sudoku Game Settings Modal.
 * Redesigned clean game panel conforming to Section 17:
 *   SETTINGS
 *   Appearance (THEME: SYSTEM | LIGHT | DARK)
 *   Gameplay (Highlight conflicts, Auto-remove notes, Quiet solver announcements)
 *   Data (EXPORT PROGRESS, IMPORT PROGRESS)
 *   Danger Zone (ERASE ALL PROGRESS)
 *   CLOSE
 */

import React, { useState, useEffect } from 'react'
import { storage } from '../../storage/db'
import { tabSync } from '../../storage/sync'
import {
  exportProgress,
  validateImportJson,
  applyImport,
  type ImportPreview,
} from '../../storage/exportImport'
import type { ValidatedUserSettings } from '../../storage/validation'
import { X, Download, Upload, Trash2 } from 'lucide-react'

export interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onSettingsChanged: (settings: ValidatedUserSettings) => void
  onProgressUpdated: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsChanged,
  onProgressUpdated,
}) => {
  const [settings, setSettings] = useState<ValidatedUserSettings | null>(null)
  const [importJson, setImportJson] = useState<string>('')
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [showEraseConfirm, setShowEraseConfirm] = useState<boolean>(false)
  const [eraseInput, setEraseInput] = useState<string>('')
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      storage.getSettings().then(setSettings)
    }
  }, [isOpen])

  // Support Escape key to close modal
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !settings) return null

  const handleUpdate = async (patch: Partial<ValidatedUserSettings>) => {
    const updated = { ...settings, ...patch }
    setSettings(updated)
    await storage.saveSettings(updated)
    onSettingsChanged(updated)
  }

  const handleExport = async () => {
    const jsonStr = await exportProgress()
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sudoku_progress_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setNotice('PROGRESS EXPORTED')
    setTimeout(() => {
      setNotice(null)
    }, 1200)
  }

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const content = evt.target?.result as string
      setImportJson(content)
      const res = validateImportJson(content)
      if (res.success && res.preview) {
        setImportPreview(res.preview)
        setImportError(null)
      } else {
        setImportError(res.error || 'Invalid file format')
        setImportPreview(null)
      }
    }
    reader.readAsText(file)
  }

  const handleApplyImport = async (mode: 'replace' | 'merge') => {
    const res = validateImportJson(importJson)
    if (res.success && res.data) {
      await applyImport(res.data, mode)
      setImportPreview(null)
      setImportJson('')
      tabSync.broadcastProgressUpdated()
      onProgressUpdated()
      setNotice('PROGRESS IMPORTED')
      setTimeout(() => {
        setNotice(null)
        onClose()
      }, 800)
    }
  }

  const handleEraseAll = async () => {
    if (eraseInput.trim() !== 'DELETE') return
    await storage.clearAll()
    tabSync.broadcastProgressUpdated()
    onProgressUpdated()
    setShowEraseConfirm(false)
    setEraseInput('')
    setNotice('ALL PROGRESS ERASED')
    setTimeout(() => {
      setNotice(null)
      onClose()
    }, 800)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-heading"
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
          padding: '24px 28px',
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2
            id="settings-heading"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.4rem',
              letterSpacing: '0.08em',
              color: 'var(--accent-blue)',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            SETTINGS
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="ui-btn ui-btn-outline"
            style={{ padding: '6px', minHeight: '34px', minWidth: '34px' }}
          >
            <X size={18} />
          </button>
        </div>

        {notice && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--bg-subtle)',
              color: 'var(--accent-blue)',
              border: '1px solid var(--accent-blue)',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-arcade)',
              fontSize: '0.8rem',
              textAlign: 'center',
            }}
          >
            {notice}
          </div>
        )}

        {/* Section: Appearance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Appearance
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {(['system', 'light', 'dark'] as const).map((t) => {
              const isSelected = settings.theme === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleUpdate({ theme: t })}
                  className="ui-btn"
                  style={{
                    backgroundColor: isSelected ? 'var(--accent-blue)' : 'var(--bg-subtle)',
                    color: isSelected ? 'var(--text-inverse)' : 'var(--text-high)',
                    border: isSelected ? '1px solid var(--accent-blue)' : '1px solid var(--border-subtle)',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    letterSpacing: '0.06em',
                  }}
                >
                  {t.toUpperCase()}
                </button>
              )
            })}
          </div>
        </div>

        {/* Section: Gameplay */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Gameplay
          </span>

          {/* Highlight conflicts */}
          <div
            onClick={() => handleUpdate({ highlightConflicts: !settings.highlightConflicts })}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') handleUpdate({ highlightConflicts: !settings.highlightConflicts })
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              padding: '6px 0',
            }}
          >
            <span style={{ fontSize: '0.88rem', color: 'var(--text-high)' }}>Highlight conflicts</span>
            <span
              style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '0.8rem',
                color: settings.highlightConflicts ? 'var(--accent-blue)' : 'var(--text-muted)',
              }}
            >
              {settings.highlightConflicts ? 'ON' : 'OFF'}
            </span>
          </div>

          {/* Auto-remove notes */}
          <div
            onClick={() => handleUpdate({ autoRemoveNotes: !settings.autoRemoveNotes })}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') handleUpdate({ autoRemoveNotes: !settings.autoRemoveNotes })
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              padding: '6px 0',
            }}
          >
            <span style={{ fontSize: '0.88rem', color: 'var(--text-high)' }}>Auto-remove notes</span>
            <span
              style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '0.8rem',
                color: settings.autoRemoveNotes ? 'var(--accent-blue)' : 'var(--text-muted)',
              }}
            >
              {settings.autoRemoveNotes ? 'ON' : 'OFF'}
            </span>
          </div>

          {/* Quiet solver announcements */}
          <div
            onClick={() => handleUpdate({ quietScreenReader: !settings.quietScreenReader })}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') handleUpdate({ quietScreenReader: !settings.quietScreenReader })
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              padding: '6px 0',
            }}
          >
            <span style={{ fontSize: '0.88rem', color: 'var(--text-high)' }}>Quiet solver announcements</span>
            <span
              style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '0.8rem',
                color: settings.quietScreenReader ? 'var(--accent-blue)' : 'var(--text-muted)',
              }}
            >
              {settings.quietScreenReader ? 'ON' : 'OFF'}
            </span>
          </div>

          {/* Show remaining digit counts */}
          <div
            onClick={() => handleUpdate({ showRemainingCounts: !settings.showRemainingCounts })}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') handleUpdate({ showRemainingCounts: !settings.showRemainingCounts })
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              padding: '6px 0',
            }}
          >
            <span style={{ fontSize: '0.88rem', color: 'var(--text-high)' }}>Show remaining digit counts</span>
            <span
              style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '0.8rem',
                color: settings.showRemainingCounts ? 'var(--accent-blue)' : 'var(--text-muted)',
              }}
            >
              {settings.showRemainingCounts ? 'ON' : 'OFF'}
            </span>
          </div>

          {/* Enable hints */}
          <div
            onClick={() => handleUpdate({ enableHints: !settings.enableHints })}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') handleUpdate({ enableHints: !settings.enableHints })
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              padding: '6px 0',
            }}
          >
            <span style={{ fontSize: '0.88rem', color: 'var(--text-high)' }}>Enable hints</span>
            <span
              style={{
                fontFamily: 'var(--font-arcade)',
                fontSize: '0.8rem',
                color: settings.enableHints ? 'var(--accent-blue)' : 'var(--text-muted)',
              }}
            >
              {settings.enableHints ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>

        {/* Section: Data */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Data
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              onClick={handleExport}
              className="ui-btn ui-btn-outline"
              style={{ fontSize: '0.78rem', padding: '10px' }}
            >
              <Download size={15} />
              <span>EXPORT PROGRESS</span>
            </button>

            <label
              className="ui-btn ui-btn-outline"
              style={{ fontSize: '0.78rem', padding: '10px', cursor: 'pointer' }}
            >
              <Upload size={15} />
              <span>IMPORT PROGRESS</span>
              <input type="file" accept=".json" onChange={handleFileImport} style={{ display: 'none' }} />
            </label>
          </div>

          {importPreview && (
            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--accent-blue)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '0.82rem', color: 'var(--accent-blue)', fontFamily: 'var(--font-display)' }}>
                IMPORT PREVIEW: {importPreview.levelsCount} levels ({importPreview.totalStars} ★)
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => handleApplyImport('merge')}
                  className="ui-btn ui-btn-primary"
                  style={{ flex: 1, minHeight: '38px', fontSize: '0.75rem' }}
                >
                  MERGE
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyImport('replace')}
                  className="ui-btn ui-btn-outline"
                  style={{ flex: 1, minHeight: '38px', fontSize: '0.75rem' }}
                >
                  REPLACE
                </button>
              </div>
            </div>
          )}

          {importError && (
            <span style={{ fontSize: '0.78rem', color: 'var(--accent-blue)', fontFamily: 'var(--font-arcade)' }}>
              {importError}
            </span>
          )}
        </div>

        {/* Section: Danger Zone */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Danger Zone
          </span>

          {!showEraseConfirm ? (
            <button
              type="button"
              onClick={() => setShowEraseConfirm(true)}
              className="ui-btn ui-btn-outline"
              style={{ width: '100%', fontSize: '0.78rem' }}
            >
              <Trash2 size={15} />
              <span>ERASE ALL PROGRESS</span>
            </button>
          ) : (
            <div
              style={{
                padding: '14px',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--accent-blue)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '0.8rem', color: 'var(--text-high)' }}>
                Type DELETE to confirm:
              </span>
              <input
                type="text"
                value={eraseInput}
                onChange={(e) => setEraseInput(e.target.value)}
                placeholder="DELETE"
                style={{
                  padding: '8px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-deep)',
                  color: 'var(--text-high)',
                  fontFamily: 'var(--font-display)',
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleEraseAll}
                  disabled={eraseInput.trim() !== 'DELETE'}
                  className="ui-btn ui-btn-primary"
                  style={{ flex: 1, minHeight: '38px', fontSize: '0.75rem' }}
                >
                  CONFIRM
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEraseConfirm(false)
                    setEraseInput('')
                  }}
                  className="ui-btn ui-btn-outline"
                  style={{ flex: 1, minHeight: '38px', fontSize: '0.75rem' }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Close Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            className="ui-btn ui-btn-outline"
            style={{ minWidth: '100px', fontSize: '0.85rem' }}
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  )
}
