"""Sudoku Solvers: Solver interface, BacktrackingSolver with MRV & propagation, tracing, and hints."""

from __future__ import annotations

import random
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from sudoku.candidates import CandidateState, mask_to_digits
from sudoku.grid import (
    CELL_COL,
    CELL_ROW,
    TOTAL_CELLS,
    Grid,
    InvalidGridError,
)
from sudoku.trace import (
    BacktrackEvent,
    BranchEvent,
    DoneEvent,
    EventCollector,
    InitEvent,
    SolutionEvent,
    TraceListener,
    format_cell_rc,
)


@dataclass
class SolverStats:
    """Statistics captured during a solve or solution-count operation."""
    nodes_expanded: int = 0
    backtracks: int = 0
    max_depth: int = 0
    naked_singles: int = 0
    hidden_singles: int = 0
    time_elapsed_seconds: float = 0.0

    @property
    def effort_score(self) -> float:
        """Composite effort score for difficulty evaluation."""
        return (
            self.nodes_expanded * 1.0
            + self.backtracks * 2.5
            + self.max_depth * 3.0
            + self.naked_singles * 0.1
            + self.hidden_singles * 0.5
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "nodes_expanded": self.nodes_expanded,
            "backtracks": self.backtracks,
            "max_depth": self.max_depth,
            "naked_singles": self.naked_singles,
            "hidden_singles": self.hidden_singles,
            "effort_score": round(self.effort_score, 2),
            "time_elapsed_seconds": round(self.time_elapsed_seconds, 5),
        }


@dataclass
class SolveResult:
    """Detailed result of a solve operation."""
    grid: Grid | None
    stats: SolverStats
    is_solvable: bool = field(init=False)

    def __post_init__(self) -> None:
        self.is_solvable = self.grid is not None


class Solver(ABC):
    """Abstract base class for Sudoku solvers."""

    @abstractmethod
    def solve(self, grid: Grid) -> Grid | None:
        """Solve the given grid. Return solved Grid or None if unsolvable."""

    @abstractmethod
    def count_solutions(self, grid: Grid, limit: int = 2) -> int:
        """Count solutions up to `limit`. Returns 0, 1, ..., limit."""

    @abstractmethod
    def get_last_stats(self) -> SolverStats:
        """Return statistics from the most recent solve or count operation."""


class BacktrackingSolver(Solver):
    """Backtracking solver with bitmask candidates, MRV, constraint propagation, and optional tracing."""

    def __init__(
        self,
        rng: random.Random | None = None,
        listener: TraceListener | None = None,
    ) -> None:
        self.rng = rng
        self.listener = listener
        self._stats = SolverStats()

    def get_last_stats(self) -> SolverStats:
        return self._stats

    def solve(self, grid: Grid) -> Grid | None:
        """Solve grid. Returns solved Grid or None if unsolvable."""
        result = self.solve_detailed(grid)
        return result.grid

    def solve_detailed(self, grid: Grid) -> SolveResult:
        """Solve grid and return SolveResult with statistics."""
        start_time = time.perf_counter()
        self._stats = SolverStats()
        listener = self.listener

        if not grid.is_valid():
            self._stats.time_elapsed_seconds = time.perf_counter() - start_time
            return SolveResult(grid=None, stats=self._stats)

        try:
            state = CandidateState(grid)
        except InvalidGridError:
            self._stats.time_elapsed_seconds = time.perf_counter() - start_time
            return SolveResult(grid=None, stats=self._stats)

        if listener is not None:
            cands = [mask_to_digits(state.candidates[i]) for i in range(TOTAL_CELLS)]
            listener.on_event(
                InitEvent(
                    event_type="init",
                    explanation=f"Initialized board with {grid.clues} given clues.",
                    givens=grid.to_string(),
                    candidates=cands,
                )
            )

        solved_grid = self._backtrack_solve(state, depth=0)
        self._stats.naked_singles = state.naked_singles_count
        self._stats.hidden_singles = state.hidden_singles_count
        self._stats.time_elapsed_seconds = time.perf_counter() - start_time

        if listener is not None:
            if solved_grid is not None:
                listener.on_event(
                    SolutionEvent(
                        event_type="solution",
                        explanation="Board completely filled. Puzzle solved successfully!",
                        grid=solved_grid.to_string(),
                    )
                )
            listener.on_event(
                DoneEvent(
                    event_type="done",
                    explanation=f"Solving completed: {self._stats.nodes_expanded} nodes, {self._stats.backtracks} backtracks, max depth {self._stats.max_depth}.",
                    stats=self._stats.to_dict(),
                    solution_count=1 if solved_grid is not None else 0,
                )
            )

        return SolveResult(grid=solved_grid, stats=self._stats)

    def _backtrack_solve(self, state: CandidateState, depth: int) -> Grid | None:
        self._stats.max_depth = max(self._stats.max_depth, depth)
        self._stats.nodes_expanded += 1
        listener = self.listener

        # Checkpoint state before constraint propagation
        cp = state.checkpoint()

        # Propagate constraints (naked & hidden singles)
        if not state.propagate(listener=listener, depth=depth):
            state.undo(cp)
            self._stats.backtracks += 1
            return None

        # If all cells are filled, solution found!
        if state.empty_count == 0:
            return state.to_grid()

        # Choose cell using MRV (Minimum Remaining Values)
        cell = state.find_mrv_cell()
        if cell is None:
            return state.to_grid()

        candidates = mask_to_digits(state.candidates[cell])
        if self.rng is not None:
            candidates = list(candidates)
            self.rng.shuffle(candidates)

        r, c = CELL_ROW[cell], CELL_COL[cell]
        rc_str = format_cell_rc(cell)

        for val in candidates:
            if listener is not None:
                listener.on_event(
                    BranchEvent(
                        event_type="branch",
                        explanation=f"Branching: guessing {val} at {rc_str} (cell with fewest candidates: {len(candidates)}).",
                        cell=cell,
                        cell_rc=[r, c],
                        candidates=candidates,
                        chosen_digit=val,
                        depth=depth,
                    )
                )

            branch_cp = state.checkpoint()
            if state.assign(cell, val):
                res = self._backtrack_solve(state, depth + 1)
                if res is not None:
                    return res

            # Backtrack
            undone = state.checkpoint() - branch_cp
            state.undo(branch_cp)
            self._stats.backtracks += 1

            if listener is not None:
                listener.on_event(
                    BacktrackEvent(
                        event_type="backtrack",
                        explanation=f"Backtracking to depth {depth}: guess {val} at {rc_str} failed. Undone {undone} change(s).",
                        to_depth=depth,
                        undone_count=undone,
                    )
                )

        # Revert propagation from this level
        undone = state.checkpoint() - cp
        state.undo(cp)
        return None

    def count_solutions(self, grid: Grid, limit: int = 2) -> int:
        """Count solutions up to `limit` (default 2 for uniqueness checking)."""
        start_time = time.perf_counter()
        self._stats = SolverStats()

        if limit <= 0 or not grid.is_valid():
            self._stats.time_elapsed_seconds = time.perf_counter() - start_time
            return 0

        try:
            state = CandidateState(grid)
        except InvalidGridError:
            self._stats.time_elapsed_seconds = time.perf_counter() - start_time
            return 0

        count = [0]
        self._backtrack_count(state, depth=0, count=count, limit=limit)
        self._stats.naked_singles = state.naked_singles_count
        self._stats.hidden_singles = state.hidden_singles_count
        self._stats.time_elapsed_seconds = time.perf_counter() - start_time
        return count[0]

    def _backtrack_count(
        self, state: CandidateState, depth: int, count: list[int], limit: int
    ) -> None:
        if count[0] >= limit:
            return

        self._stats.max_depth = max(self._stats.max_depth, depth)
        self._stats.nodes_expanded += 1

        cp = state.checkpoint()

        if not state.propagate():
            state.undo(cp)
            self._stats.backtracks += 1
            return

        if state.empty_count == 0:
            count[0] += 1
            state.undo(cp)
            return

        cell = state.find_mrv_cell()
        if cell is None:
            count[0] += 1
            state.undo(cp)
            return

        candidates = mask_to_digits(state.candidates[cell])
        for val in candidates:
            if count[0] >= limit:
                break
            branch_cp = state.checkpoint()
            if state.assign(cell, val):
                self._backtrack_count(state, depth + 1, count, limit)
            state.undo(branch_cp)
            self._stats.backtracks += 1

        state.undo(cp)


def solve_with_trace(
    grid: Grid,
    mode: str = "propagate",
    max_events: int = 50_000,
    node_limit: int = 50_000,
) -> dict[str, Any]:
    """Solve puzzle and collect detailed trace events for step-by-step visualization.

    Args:
        grid: The puzzle grid.
        mode: "propagate" (standard MRV + constraint propagation) or "naive" (pure backtracking).
        max_events: Maximum number of events to retain before truncating.
        node_limit: Safety node expansion cap for naive mode.

    Returns:
        Dict with solution, stats, events list, truncated flag, and mode.
    """
    collector = EventCollector(max_events=max_events)

    if mode == "naive":
        return _solve_naive_with_trace(grid, collector, node_limit)

    solver = BacktrackingSolver(listener=collector)
    result = solver.solve_detailed(grid)

    success = result.grid is not None
    return {
        "ok": success,
        "success": success,
        "mode": "propagate",
        "solution": result.grid.to_string() if result.grid else None,
        "is_solvable": result.is_solvable,
        "stats": result.stats.to_dict(),
        "truncated": collector.truncated,
        "events": [e.to_dict() for e in collector.events],
    }


def _solve_naive_with_trace(
    grid: Grid,
    collector: EventCollector,
    node_limit: int,
) -> dict[str, Any]:
    """Plain backtracking solver in cell order (0..80) without constraint propagation."""
    start_time = time.perf_counter()
    stats = SolverStats()
    cells = list(grid.cells)
    gave_up = False

    collector.on_event(
        InitEvent(
            event_type="init",
            explanation=f"Naive search initialized with {grid.clues} clues.",
            givens=grid.to_string(),
            candidates=[list(range(1, 10)) if v == 0 else [v] for v in cells],
        )
    )

    def is_valid_placement(idx: int, val: int) -> bool:
        r, c = CELL_ROW[idx], CELL_COL[idx]
        b = (r // 3) * 3 + (c // 3)
        # Check row
        for ci in range(9):
            if ci != c and cells[r * 9 + ci] == val:
                return False
        # Check col
        for ri in range(9):
            if ri != r and cells[ri * 9 + c] == val:
                return False
        # Check box
        br, bc = (b // 3) * 3, (b % 3) * 3
        for dr in range(3):
            for dc in range(3):
                p = (br + dr) * 9 + (bc + dc)
                if p != idx and cells[p] == val:
                    return False
        return True

    def find_first_empty() -> int | None:
        for i in range(TOTAL_CELLS):
            if cells[i] == 0:
                return i
        return None

    def naive_search(depth: int) -> bool:
        nonlocal gave_up
        stats.nodes_expanded += 1
        stats.max_depth = max(stats.max_depth, depth)

        if stats.nodes_expanded >= node_limit:
            gave_up = True
            return False

        idx = find_first_empty()
        if idx is None:
            return True  # Done!

        r, c = CELL_ROW[idx], CELL_COL[idx]
        rc_str = format_cell_rc(idx)
        possible = [d for d in range(1, 10) if is_valid_placement(idx, d)]

        collector.on_event(
            BranchEvent(
                event_type="branch",
                explanation=f"Naive step: trying values in next empty cell {rc_str}.",
                cell=idx,
                cell_rc=[r, c],
                candidates=possible,
                chosen_digit=possible[0] if possible else 0,
                depth=depth,
            )
        )

        for val in possible:
            cells[idx] = val
            if naive_search(depth + 1):
                return True
            cells[idx] = 0
            stats.backtracks += 1
            collector.on_event(
                BacktrackEvent(
                    event_type="backtrack",
                    explanation=f"Naive backtrack from {rc_str} (value {val} failed).",
                    to_depth=depth,
                    undone_count=1,
                )
            )

        return False

    success = naive_search(0)
    stats.time_elapsed_seconds = time.perf_counter() - start_time
    solved_str = "".join(str(v) for v in cells) if success else None

    if success:
        collector.on_event(
            SolutionEvent(
                event_type="solution",
                explanation="Naive search filled all cells. Solution found!",
                grid=solved_str or "",
            )
        )

    collector.on_event(
        DoneEvent(
            event_type="done",
            explanation=(
                f"Naive search {'gave up after reaching' if gave_up else 'completed in'} "
                f"{stats.nodes_expanded} nodes, {stats.backtracks} backtracks."
            ),
            stats=stats.to_dict(),
            solution_count=1 if success else 0,
        )
    )

    return {
        "ok": success,
        "success": success,
        "mode": "naive",
        "gave_up": gave_up,
        "solution": solved_str,
        "is_solvable": success,
        "stats": stats.to_dict(),
        "truncated": collector.truncated,
        "events": [e.to_dict() for e in collector.events],
    }


def hint(grid: Grid) -> dict[str, Any]:
    """Find the next logical hint step for the puzzle.

    Returns:
        Dict: {technique: "naked_single" | "hidden_single" | "reveal" | "none", cell: [r, c], value: int, explanation: str}
    """
    if not grid.is_valid():
        raise InvalidGridError("Grid violates row, column, or 3x3 box rules")

    if grid.is_complete():
        return {
            "technique": "none",
            "cell": [0, 0],
            "value": 0,
            "explanation": "Puzzle is already solved!",
        }

    state = CandidateState(grid)

    # 1. Check for Naked Singles (cell with 1 candidate)
    for idx in range(TOTAL_CELLS):
        if state.cells[idx] == 0:
            cand = state.candidates[idx]
            if cand.bit_count() == 1:
                digit = cand.bit_length()
                r, c = CELL_ROW[idx], CELL_COL[idx]
                rc_str = format_cell_rc(idx)
                return {
                    "technique": "naked_single",
                    "cell": [r, c],
                    "value": digit,
                    "explanation": f"Naked Single: {rc_str} has only candidate {digit} remaining, as 1-9 (except {digit}) are already present in its row, column, or 3x3 box.",
                }

    # 2. Check for Hidden Singles (digit with 1 spot in a unit)
    from sudoku.candidates import DIGIT_BIT
    from sudoku.grid import ALL_UNITS

    for unit_idx, unit in enumerate(ALL_UNITS):
        if unit_idx < 9:
            unit_name = f"row {unit_idx + 1}"
        elif unit_idx < 18:
            unit_name = f"column {unit_idx - 8}"
        else:
            unit_name = f"box {unit_idx - 17}"

        digit_counts = [0] * 10
        digit_cell = [0] * 10

        for idx in unit:
            if state.cells[idx] == 0:
                mask = state.candidates[idx]
                for d in range(1, 10):
                    if mask & DIGIT_BIT[d]:
                        digit_counts[d] += 1
                        digit_cell[d] = idx

        for d in range(1, 10):
            if digit_counts[d] == 1:
                target_cell = digit_cell[d]
                r, c = CELL_ROW[target_cell], CELL_COL[target_cell]
                rc_str = format_cell_rc(target_cell)
                return {
                    "technique": "hidden_single",
                    "cell": [r, c],
                    "value": d,
                    "explanation": f"Hidden Single: in {unit_name}, digit {d} can only be placed at {rc_str}.",
                }

    # 3. If no singles exist, find solution and reveal the most constrained (MRV) cell
    solver = BacktrackingSolver()
    solution = solver.solve(grid)
    if solution is None:
        raise ValueError("Cannot provide hint for an unsolvable puzzle")

    mrv_cell = state.find_mrv_cell()
    target_idx = mrv_cell if mrv_cell is not None else grid.empty_cells()[0]
    val = solution.cells[target_idx]
    r, c = CELL_ROW[target_idx], CELL_COL[target_idx]
    rc_str = format_cell_rc(target_idx)

    return {
        "technique": "reveal",
        "cell": [r, c],
        "value": val,
        "explanation": f"Advanced step (Reveal): logically deducing {val} at {rc_str} requires deeper search.",
    }
