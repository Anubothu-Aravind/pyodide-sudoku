/**
 * Modal comparing BacktrackingSolver (MRV + propagation) with Naive Backtracking.
 */

import React from 'react'
import { X } from 'lucide-react'

export interface NaiveCompareModalProps {
  isOpen: boolean
  isLoading: boolean
  onClose: () => void
  propagateStats: {
    nodes_expanded: number
    backtracks: number
    time_elapsed_seconds: number
  }
  naiveStats: {
    nodes_expanded: number
    backtracks: number
    time_elapsed_seconds: number
    gave_up?: boolean
  } | null
}

export const NaiveCompareModal: React.FC<NaiveCompareModalProps> = ({
  isOpen,
  isLoading,
  onClose,
  propagateStats,
  naiveStats,
}) => {
  if (!isOpen) return null

  const propNodes = propagateStats.nodes_expanded.toLocaleString()
  const naiveNodes = naiveStats ? naiveStats.nodes_expanded.toLocaleString() : '...'
  const naiveGaveUp = naiveStats?.gave_up ?? false

  const ratio =
    naiveStats && propagateStats.nodes_expanded > 0
      ? Math.round(naiveStats.nodes_expanded / propagateStats.nodes_expanded)
      : null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 100,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-modal-title"
        style={{
          backgroundColor: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 id="compare-modal-title" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
            Compare Algorithms: CSP vs GHB
          </h2>
          <button
            onClick={onClose}
            aria-label="Close comparison modal"
            style={{
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Running Greedy Heuristic + Backtracking (GHB) in Web Worker...
            </p>
          </div>
        ) : naiveStats ? (
          <>
            {/* One line summary */}
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: 'var(--color-logic-bg)',
                border: '1px solid var(--color-logic)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.95rem',
                lineHeight: 1.5,
                color: 'var(--text-primary)',
              }}
            >
              <strong>Summary: </strong>
              Greedy Heuristic + Backtracking (GHB) visited <strong>{naiveNodes}</strong> nodes
              {naiveGaveUp ? ' (capped at node limit)' : ''}; Constraint Satisfaction (CSP) with MRV visited only{' '}
              <strong>{propNodes}</strong>
              {ratio ? ` (${ratio}× reduction)` : ''}.
            </div>

            {/* Side-by-side comparison table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                  <th style={{ padding: '8px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Metric</th>
                  <th style={{ padding: '8px', color: 'var(--color-logic)', fontSize: '0.85rem' }}>Constraint Satisfaction (CSP)</th>
                  <th style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Greedy Heuristic + Backtracking (GHB)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '10px 8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Nodes Visited</td>
                  <td className="tabular-nums" style={{ padding: '10px 8px', fontWeight: 700, color: 'var(--color-logic)' }}>
                    {propNodes}
                  </td>
                  <td className="tabular-nums" style={{ padding: '10px 8px', fontWeight: 600 }}>
                    {naiveNodes}
                  </td>
                </tr>

                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '10px 8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Backtracks</td>
                  <td className="tabular-nums" style={{ padding: '10px 8px', fontWeight: 700, color: 'var(--color-logic)' }}>
                    {propagateStats.backtracks.toLocaleString()}
                  </td>
                  <td className="tabular-nums" style={{ padding: '10px 8px', fontWeight: 600 }}>
                    {naiveStats.backtracks.toLocaleString()}
                  </td>
                </tr>

                <tr>
                  <td style={{ padding: '10px 8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Time (Worker)</td>
                  <td className="tabular-nums" style={{ padding: '10px 8px', fontWeight: 700, color: 'var(--color-logic)' }}>
                    {(propagateStats.time_elapsed_seconds * 1000).toFixed(1)} ms
                  </td>
                  <td className="tabular-nums" style={{ padding: '10px 8px', fontWeight: 600 }}>
                    {(naiveStats.time_elapsed_seconds * 1000).toFixed(1)} ms
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        ) : (
          <p style={{ color: 'var(--color-conflict)' }}>Failed to load naive solver stats.</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            className="ui-btn ui-btn-secondary"
            style={{
              padding: '8px 18px',
              minHeight: '38px',
              fontSize: '0.85rem',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
