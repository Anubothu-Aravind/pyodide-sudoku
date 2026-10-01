/**
 * Client for managing the Pyodide Web Worker.
 * Handles request queueing, timeouts (15s hard timeout), slow job notifications (2s),
 * cancellation (terminate + re-create), and pre-warming.
 */

import type { WorkerRequest, WorkerResponse } from './types'
import type { HintResult, LevelSpec, TraceSolveResult } from '../types'

interface PendingRequest {
  id: string
  method: string
  params: Record<string, any>
  resolve: (value: any) => void
  reject: (reason: any) => void
  timer: ReturnType<typeof setTimeout>
  slowTimer: ReturnType<typeof setTimeout>
}

export class SudokuWorkerClient {
  private worker: Worker | null = null
  private isReady = false
  private pendingRequests = new Map<string, PendingRequest>()
  private reqCounter = 0
  private readyListeners: Array<(ready: boolean) => void> = []
  private slowJobListeners: Array<(isSlow: boolean) => void> = []
  private activeSlowJobs = 0

  constructor() {
    this.spawnWorker()
  }

  private spawnWorker(): void {
    if (this.worker) {
      try {
        this.worker.terminate()
      } catch (e) {
        console.warn('Error terminating previous worker:', e)
      }
      this.worker = null
    }

    this.isReady = false
    this.notifyReady(false)

    try {
      this.worker = new Worker(new URL('./pyodide.worker.ts', import.meta.url), {
        type: 'module',
      })

      this.worker.onmessage = (e: MessageEvent<any>) => {
        const data = e.data
        if (data.type === 'status') {
          if (data.ready) {
            this.isReady = true
            this.notifyReady(true)
          } else {
            console.error('Worker status error:', data.message)
          }
          return
        }

        const resp = data as WorkerResponse
        const pending = this.pendingRequests.get(resp.id)
        if (pending) {
          clearTimeout(pending.timer)
          clearTimeout(pending.slowTimer)
          this.decrementSlowJob()
          this.pendingRequests.delete(resp.id)

          if (resp.ok) {
            pending.resolve(resp.result)
          } else {
            pending.reject(new Error(resp.error || 'Worker operation failed'))
          }
        }
      }

      this.worker.onerror = (err) => {
        console.error('Worker error event:', err)
      }
    } catch (err) {
      console.error('Failed to spawn worker:', err)
    }
  }

  public subscribeReady(listener: (ready: boolean) => void): () => void {
    this.readyListeners.push(listener)
    listener(this.isReady)
    return () => {
      this.readyListeners = this.readyListeners.filter((l) => l !== listener)
    }
  }

  public subscribeSlowJob(listener: (isSlow: boolean) => void): () => void {
    this.slowJobListeners.push(listener)
    listener(this.activeSlowJobs > 0)
    return () => {
      this.slowJobListeners = this.slowJobListeners.filter((l) => l !== listener)
    }
  }

  private notifyReady(ready: boolean): void {
    for (const l of this.readyListeners) {
      l(ready)
    }
  }

  private notifySlowJob(): void {
    const isSlow = this.activeSlowJobs > 0
    for (const l of this.slowJobListeners) {
      l(isSlow)
    }
  }

  private incrementSlowJob(): void {
    this.activeSlowJobs++
    this.notifySlowJob()
  }

  private decrementSlowJob(): void {
    if (this.activeSlowJobs > 0) {
      this.activeSlowJobs--
      this.notifySlowJob()
    }
  }

  public get ready(): boolean {
    return this.isReady
  }

  /**
   * Cancel the currently executing long job by terminating the worker and spawning a new one.
   */
  public cancelCurrentJob(): void {
    if (this.pendingRequests.size === 0) return

    // Reject all pending jobs
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer)
      clearTimeout(pending.slowTimer)
      pending.reject(new Error('Operation cancelled by user.'))
    }
    this.pendingRequests.clear()
    this.activeSlowJobs = 0
    this.notifySlowJob()

    // Re-spawn worker
    this.spawnWorker()
  }

  /**
   * Send a typed RPC request to the worker with 2s slow notification and 15s hard timeout.
   */
  public request<T = any>(method: WorkerRequest['method'], params: Record<string, any> = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = `req_${++this.reqCounter}_${Date.now()}`

      // 2-second slow job notification
      const slowTimer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.incrementSlowJob()
        }
      }, 2000)

      // 45-second hard timeout (allows cold start Pyodide initialization)
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.decrementSlowJob()
          this.pendingRequests.delete(id)
          reject(new Error(`Operation '${method}' timed out after 45 seconds.`))
          // Recycle worker after hard timeout to prevent deadlock
          this.spawnWorker()
        }
      }, 45000)

      this.pendingRequests.set(id, {
        id,
        method,
        params,
        resolve,
        reject,
        timer,
        slowTimer,
      })

      if (!this.worker) {
        this.spawnWorker()
      }

      this.worker!.postMessage({ id, method, params })
    })
  }

  // High-level API wrappers matching sudoku.web_api
  public generate(
    difficulty: string = 'medium',
    seed?: string | number,
    symmetric: boolean = true
  ): Promise<{
    ok: boolean
    puzzle: string
    solution: string
    difficulty: string
    clues: number
    effort_score: number
    seed: string
  }> {
    return this.request('generate', { difficulty, seed, symmetric })
  }

  public solve(gridStr: string): Promise<{ ok: boolean; solution: string; stats: any }> {
    return this.request('solve', { grid_str: gridStr })
  }

  public check(gridStr: string): Promise<{
    ok: boolean
    valid: boolean
    solvable: boolean
    unique: boolean
    solutions_count: number
    clues?: number
    difficulty?: string
    effort_score?: number
    error?: string
  }> {
    return this.request('check', { grid_str: gridStr })
  }

  public countSolutions(gridStr: string, limit: number = 2): Promise<{ ok: boolean; count: number }> {
    return this.request('count_solutions', { grid_str: gridStr, limit })
  }

  public hint(gridStr: string): Promise<HintResult> {
    return this.request('hint', { grid_str: gridStr })
  }

  public solveWithTrace(
    gridStr: string,
    mode: 'propagate' | 'naive' | 'naive_backtrack' = 'propagate',
    maxEvents: number = 50000
  ): Promise<TraceSolveResult> {
    return this.request('solve_with_trace', {
      grid_str: gridStr,
      mode,
      max_events: maxEvents,
    })
  }

  public solveNaiveWithTrace(
    gridStr: string,
    maxEvents: number = 20000
  ): Promise<TraceSolveResult> {
    return this.request('solve_naive_with_trace', {
      grid_str: gridStr,
      max_events: maxEvents,
    })
  }

  public generateVariantPuzzle(
    variant: string = 'classic',
    difficulty: string = 'medium',
    seed?: string | number,
    symmetric: boolean = true
  ): Promise<{
    ok: boolean
    variant: string
    puzzle: string
    solution: string
    difficulty: string
    clues: number
    effort_score: number
    seed: string
    symmetric: boolean
    stats: any
    error?: string
  }> {
    const pyVariant = variant === 'center-dot' ? 'center_dot' : variant
    return this.request('generate_variant_puzzle', { variant: pyVariant, difficulty, seed, symmetric })
  }

  public generateDiagonalPuzzle(
    difficulty: string = 'medium',
    seed?: string | number,
    symmetric: boolean = true
  ): Promise<{
    ok: boolean
    variant: string
    puzzle: string
    solution: string
    difficulty: string
    clues: number
    effort_score: number
    seed: string
    symmetric: boolean
    stats: any
    error?: string
  }> {
    return this.request('generate_diagonal_puzzle', { difficulty, seed, symmetric })
  }

  public solveDiagonalWithTrace(
    gridStr: string,
    maxEvents: number = 50000
  ): Promise<TraceSolveResult> {
    return this.request('solve_diagonal_with_trace', {
      grid_str: gridStr,
      max_events: maxEvents,
    })
  }

  public validateDiagonalSolution(gridStr: string): Promise<{
    ok: boolean
    valid: boolean
    classic_valid: boolean
    diag_main_valid: boolean
    diag_anti_valid: boolean
    error?: string
  }> {
    return this.request('validate_diagonal_solution', { grid_str: gridStr })
  }

  public levelSpec(level: number): Promise<LevelSpec> {
    return this.request('level_spec', { level })
  }

  public generateLevel(level: number): Promise<any> {
    return this.request('generate_level', { level })
  }

  public generateLevels(start: number, count: number): Promise<any[]> {
    return this.request('generate_levels', { start, count })
  }
}

// Global singleton instance pre-warmed on load
export const sudokuWorker = new SudokuWorkerClient()
