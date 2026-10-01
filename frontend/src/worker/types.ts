/**
 * Typed Web Worker RPC Protocol.
 */

export interface WorkerRequest {
  id: string
  method:
    | 'generate'
    | 'solve'
    | 'check'
    | 'count_solutions'
    | 'hint'
    | 'solve_with_trace'
    | 'solve_naive_with_trace'
    | 'level_spec'
    | 'generate_level'
    | 'generate_levels'
    | 'generate_diagonal_puzzle'
    | 'solve_diagonal_with_trace'
    | 'validate_diagonal_solution'
    | 'generate_variant_puzzle'
    | 'solve_variant_puzzle_with_trace'
    | 'validate_variant_puzzle_solution'
    | 'variant_info'
  params: Record<string, any>
}

export interface WorkerResponse {
  id: string
  ok: boolean
  result?: any
  error?: string
}

export interface WorkerStatusMessage {
  type: 'status'
  ready: boolean
  message?: string
}
