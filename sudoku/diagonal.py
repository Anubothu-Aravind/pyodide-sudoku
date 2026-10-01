"""Diagonal Sudoku: solver, generator, and trace support.

Extends the classic BacktrackingSolver/PuzzleGenerator to enforce two extra
all-different constraints (the two main diagonals) without rewriting the core
candidate-propagation engine.

Design principle:
  DiagonalCandidateState subclasses CandidateState and overrides assign() to
  also maintain two extra "used" bitmasks (diag_main_used, diag_anti_used) and
  propagates eliminations to diagonal peers.  The solver, generator, and grader
  remain unchanged — they just receive a DiagonalCandidateState instead.
"""

from __future__ import annotations

import random
import time
from typing import Any

from sudoku.candidates import DIGIT_BIT, CandidateState, mask_to_digits
from sudoku.constraints import ANTI_DIAGONAL, MAIN_DIAGONAL
from sudoku.difficulty import Difficulty, DifficultyGrader
from sudoku.generator import PuzzleGenerator
from sudoku.grid import (
    CELL_BOX,
    CELL_COL,
    CELL_PEERS,
    CELL_ROW,
    TOTAL_CELLS,
    Grid,
    InvalidGridError,
)
from sudoku.solver import BacktrackingSolver, SolveResult, SolverStats
from sudoku.trace import (
    DoneEvent,
    InitEvent,
    SolutionEvent,
)

# ---------------------------------------------------------------------------
# Pre-compute diagonal membership and peer extensions
# ---------------------------------------------------------------------------

#: For each cell: which diagonals it belongs to (0=main, 1=anti, or both)
CELL_DIAG_MAIN: tuple[bool, ...] = tuple(
    CELL_ROW[i] == CELL_COL[i] for i in range(TOTAL_CELLS)
)
CELL_DIAG_ANTI: tuple[bool, ...] = tuple(
    CELL_ROW[i] + CELL_COL[i] == 8 for i in range(TOTAL_CELLS)
)

# Extended peer sets for each cell: classic peers + diagonal peers (de-duped)
_MAIN_DIAG_SET = frozenset(MAIN_DIAGONAL)
_ANTI_DIAG_SET = frozenset(ANTI_DIAGONAL)

CELL_DIAG_PEERS: tuple[tuple[int, ...], ...] = tuple(
    tuple(
        sorted(
            frozenset(CELL_PEERS[i])
            | ((_MAIN_DIAG_SET - {i}) if CELL_DIAG_MAIN[i] else frozenset())
            | ((_ANTI_DIAG_SET - {i}) if CELL_DIAG_ANTI[i] else frozenset())
        )
    )
    for i in range(TOTAL_CELLS)
)


# ---------------------------------------------------------------------------
# Diagonal-aware candidate state
# ---------------------------------------------------------------------------

class DiagonalCandidateState(CandidateState):
    """CandidateState extended with two diagonal all-different constraints.

    Overrides assign() to:
    • maintain diag_main_used / diag_anti_used bitmasks
    • eliminate the placed digit from all diagonal peers (not just classic peers)

    Overrides undo() to correctly unwind diagonal masks when backtracking.
    """

    __slots__ = ("_diag_trail", "diag_anti_used", "diag_main_used")

    def __init__(self, grid: Grid | None = None) -> None:
        # Initialize classic state (rows, cols, boxes)
        # We call object.__init__ then manually replicate CandidateState.__init__
        # because CandidateState.__init__ calls _init_from_grid which calls self.assign —
        # we need our overridden assign() to be active, so we just call super().__init__(None)
        # then manually call our own _init_from_grid.
        super().__init__(None)  # init without loading grid

        # Extra diagonal masks
        self.diag_main_used: int = 0
        self.diag_anti_used: int = 0
        # Separate trail for diagonal masks: (diag_main_used_snapshot, diag_anti_used_snapshot)
        # We append one entry per assign() call; undo uses len parity with _trail.
        self._diag_trail: list[tuple[int, int]] = []

        if grid is not None:
            grid.validate()
            for idx, val in enumerate(grid.cells):
                if val != 0 and not self.assign(idx, val):
                    raise InvalidGridError(
                        f"Diagonal contradiction initializing cell {idx} with {val}"
                    )

    # ------------------------------------------------------------------ undo
    def checkpoint(self) -> int:
        return len(self._trail)

    def undo(self, checkpoint: int) -> None:
        """Undo changes back to checkpoint, including diagonal masks."""
        trail = self._trail
        diag_trail = self._diag_trail

        while len(trail) > checkpoint:
            idx, old_val, old_cand = trail.pop()
            # Pop the paired diagonal snapshot (may be (−1, −1) for eliminate-only)
            if diag_trail:
                dm, da = diag_trail.pop()
                if dm >= 0:
                    self.diag_main_used = dm
                    self.diag_anti_used = da

            curr_val = self.cells[idx]
            if curr_val != 0 and old_val == 0:
                d = curr_val
                bit = DIGIT_BIT[d]
                r = CELL_ROW[idx]
                c = CELL_COL[idx]
                b = CELL_BOX[idx]
                self.row_used[r] &= ~bit
                self.col_used[c] &= ~bit
                self.box_used[b] &= ~bit
                self.empty_count += 1

            self.cells[idx] = old_val
            self.candidates[idx] = old_cand

    def _record_cell_change(self, idx: int) -> None:
        """Record cell + diagonal masks to both trails."""
        self._trail.append((idx, self.cells[idx], self.candidates[idx]))
        # Sentinel: diagonal masks are recorded separately only during assign(),
        # not during eliminate().  We use (-1,-1) here so undo() knows not to
        # restore diag masks for plain candidate eliminations.
        self._diag_trail.append((-1, -1))

    # --------------------------------------------------------------- assign
    def assign(self, idx: int, digit: int) -> bool:
        """Assign digit to cell, enforcing diagonal constraints."""
        bit = DIGIT_BIT[digit]

        if not (self.candidates[idx] & bit):
            return False

        r = CELL_ROW[idx]
        c = CELL_COL[idx]
        b = CELL_BOX[idx]

        if (self.row_used[r] & bit) or (self.col_used[c] & bit) or (self.box_used[b] & bit):
            return False

        # Diagonal conflict checks
        if CELL_DIAG_MAIN[idx] and (self.diag_main_used & bit):
            return False
        if CELL_DIAG_ANTI[idx] and (self.diag_anti_used & bit):
            return False

        # Record BEFORE mutating (save old diag masks)
        old_dm = self.diag_main_used
        old_da = self.diag_anti_used
        self._trail.append((idx, self.cells[idx], self.candidates[idx]))
        self._diag_trail.append((old_dm, old_da))

        # Assign
        self.cells[idx] = digit
        self.candidates[idx] = bit
        self.row_used[r] |= bit
        self.col_used[c] |= bit
        self.box_used[b] |= bit
        self.empty_count -= 1

        # Update diagonal masks
        if CELL_DIAG_MAIN[idx]:
            self.diag_main_used |= bit
        if CELL_DIAG_ANTI[idx]:
            self.diag_anti_used |= bit

        # Eliminate digit from extended peers (classic + diagonal)
        for peer in CELL_DIAG_PEERS[idx]:
            if self.cells[peer] == 0:
                peer_mask = self.candidates[peer]
                if peer_mask & bit:
                    new_mask = peer_mask & ~bit
                    if new_mask == 0:
                        return False
                    self._trail.append((peer, self.cells[peer], peer_mask))
                    self._diag_trail.append((-1, -1))
                    self.candidates[peer] = new_mask

        return True


# ---------------------------------------------------------------------------
# Diagonal-aware solver (reuses BacktrackingSolver logic, swaps state class)
# ---------------------------------------------------------------------------

class DiagonalSolver(BacktrackingSolver):
    """Backtracking solver that enforces diagonal all-different constraints."""

    def solve_detailed(self, grid: Grid) -> SolveResult:
        start_time = time.perf_counter()
        self._stats = SolverStats()
        listener = self.listener

        if not _diagonal_is_valid(grid):
            self._stats.time_elapsed_seconds = time.perf_counter() - start_time
            return SolveResult(grid=None, stats=self._stats)

        try:
            state = DiagonalCandidateState(grid)
        except InvalidGridError:
            self._stats.time_elapsed_seconds = time.perf_counter() - start_time
            return SolveResult(grid=None, stats=self._stats)

        if listener is not None:
            cands = [mask_to_digits(state.candidates[i]) for i in range(TOTAL_CELLS)]
            listener.on_event(
                InitEvent(
                    event_type="init",
                    explanation=f"Diagonal Sudoku initialized with {grid.clues} given clues.",
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
                        explanation="Diagonal Sudoku solved!",
                        grid=solved_grid.to_string(),
                    )
                )
            listener.on_event(
                DoneEvent(
                    event_type="done",
                    explanation=(
                        f"Done: {self._stats.nodes_expanded} nodes, "
                        f"{self._stats.backtracks} backtracks."
                    ),
                    stats=self._stats.to_dict(),
                    solution_count=1 if solved_grid is not None else 0,
                )
            )

        return SolveResult(grid=solved_grid, stats=self._stats)

    def count_solutions(self, grid: Grid, limit: int = 2) -> int:
        start_time = time.perf_counter()
        self._stats = SolverStats()

        if limit <= 0 or not _diagonal_is_valid(grid):
            return 0

        try:
            state = DiagonalCandidateState(grid)
        except InvalidGridError:
            return 0

        count = [0]
        self._backtrack_count(state, depth=0, count=count, limit=limit)
        self._stats.naked_singles = state.naked_singles_count
        self._stats.hidden_singles = state.hidden_singles_count
        self._stats.time_elapsed_seconds = time.perf_counter() - start_time
        return count[0]


# ---------------------------------------------------------------------------
# Diagonal validity helper
# ---------------------------------------------------------------------------

def _diagonal_is_valid(grid: Grid) -> bool:
    """Check that the two diagonals in grid have no repeated non-zero digits."""
    for diag in (MAIN_DIAGONAL, ANTI_DIAGONAL):
        seen: set[int] = set()
        for idx in diag:
            v = grid.cells[idx]
            if v != 0:
                if v in seen:
                    return False
                seen.add(v)
    return grid.is_valid()


# ---------------------------------------------------------------------------
# Diagonal-aware puzzle generator
# ---------------------------------------------------------------------------

class DiagonalPuzzleGenerator(PuzzleGenerator):
    """Generates puzzles that satisfy diagonal Sudoku constraints.

    Identical interface to PuzzleGenerator — just uses DiagonalSolver for all
    solving and uniqueness checks.
    """

    def __init__(self) -> None:
        super().__init__(
            solver=DiagonalSolver(),
            grader=DifficultyGrader(),
        )
        self._diag_solver = DiagonalSolver()

    def _generate_full_grid(self, rng: random.Random) -> Grid:
        """Generate a random complete 9×9 grid that satisfies diagonal constraints."""
        solver = DiagonalSolver(rng=rng)
        grid = solver.solve(Grid.empty())
        if grid is None or not grid.is_complete():
            raise RuntimeError("Failed to generate complete diagonal grid")
        if not _diagonal_is_valid(grid):
            raise RuntimeError("Generated grid violates diagonal constraints")
        return grid

    def _carve_clues(
        self,
        full_grid: Grid,
        target_clues: int,
        min_clues: int,
        symmetric: bool,
        rng: random.Random,
    ) -> tuple[Grid, bool]:
        """Carve clues using DiagonalSolver for uniqueness checks."""
        from sudoku.grid import TOTAL_CELLS

        cells = list(full_grid.cells)
        current_clues = TOTAL_CELLS
        is_symmetric = symmetric

        if symmetric:
            pairs: list[tuple[int, int]] = [(idx, 80 - idx) for idx in range(41)]
            rng.shuffle(pairs)

            for a, b in pairs:
                if current_clues <= target_clues:
                    break
                old_a, old_b = cells[a], cells[b]
                cells[a] = 0
                cells[b] = 0

                test_grid = Grid(cells)
                if self._diag_solver.count_solutions(test_grid, limit=2) == 1:
                    current_clues -= 2 if a != b else 1
                else:
                    cells[a] = old_a
                    cells[b] = old_b

        if current_clues > target_clues or not symmetric:
            remaining = [i for i in range(TOTAL_CELLS) if cells[i] != 0]
            rng.shuffle(remaining)

            for idx in remaining:
                if current_clues <= target_clues:
                    break
                old_val = cells[idx]
                cells[idx] = 0
                test_grid = Grid(cells)

                if self._diag_solver.count_solutions(test_grid, limit=2) == 1:
                    current_clues -= 1
                    if symmetric:
                        is_symmetric = False
                else:
                    cells[idx] = old_val

        return Grid(cells), is_symmetric


# ---------------------------------------------------------------------------
# Public API — generate + solve + trace for diagonal variant
# ---------------------------------------------------------------------------

def generate_diagonal(
    difficulty: str = "medium",
    seed: int | str | None = None,
    symmetric: bool = True,
    max_attempts: int = 20,
) -> dict[str, Any]:
    """Generate a Diagonal Sudoku puzzle. Same return shape as web_api.generate()."""
    try:
        diff_enum = Difficulty.from_string(difficulty)
        generator = DiagonalPuzzleGenerator()
        puzzle = generator.generate(diff_enum, seed=seed, symmetric=symmetric, max_attempts=max_attempts)
        return {
            "ok": True,
            "success": True,
            "variant": "diagonal",
            "difficulty": puzzle.difficulty.value,
            "clues": puzzle.clue_count,
            "effort_score": round(puzzle.effort_score, 2),
            "seed": str(seed) if seed is not None else str(puzzle.seed or ""),
            "symmetric": puzzle.is_symmetric,
            "puzzle": puzzle.to_string(),
            "solution": puzzle.solution.to_string(),
            "stats": puzzle.stats.to_dict(),
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "success": False, "error": str(e)}


def solve_diagonal_with_trace(
    grid_str: str,
    max_events: int = 50_000,
    node_limit: int = 50_000,
) -> dict[str, Any]:
    """Solve a Diagonal Sudoku puzzle and return trace events."""
    from sudoku.trace import EventCollector

    try:
        grid = Grid.from_string(grid_str)
        if not _diagonal_is_valid(grid):
            return {
                "ok": False,
                "success": False,
                "error": "Grid violates diagonal constraints.",
                "events": [],
            }

        collector = EventCollector(max_events=max_events)
        solver = DiagonalSolver(listener=collector)
        result = solver.solve_detailed(grid)

        events = [e.to_dict() if hasattr(e, "to_dict") else e for e in collector.events]

        return {
            "ok": result.is_solvable,
            "success": result.is_solvable,
            "mode": "propagate",
            "variant": "diagonal",
            "solution": result.grid.to_string() if result.grid else None,
            "is_solvable": result.is_solvable,
            "stats": result.stats.to_dict(),
            "truncated": collector.truncated if hasattr(collector, "truncated") else False,
            "events": events,
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "success": False, "error": str(e), "events": []}


def validate_diagonal_solution(grid_str: str) -> dict[str, Any]:
    """Validate that a completed grid satisfies all diagonal Sudoku rules."""
    try:
        grid = Grid.from_string(grid_str)
        valid = _diagonal_is_valid(grid)
        diag_main_ok = _check_unit(grid, MAIN_DIAGONAL)
        diag_anti_ok = _check_unit(grid, ANTI_DIAGONAL)
        return {
            "ok": True,
            "valid": valid and diag_main_ok and diag_anti_ok,
            "classic_valid": grid.is_valid(),
            "diag_main_valid": diag_main_ok,
            "diag_anti_valid": diag_anti_ok,
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


def _check_unit(grid: Grid, cells: list[int]) -> bool:
    """Check that the given cell group contains digits 1-9 exactly once (if fully filled)."""
    vals = [grid.cells[i] for i in cells]
    if any(v == 0 for v in vals):
        return True  # partial — don't fail incomplete boards
    return sorted(vals) == list(range(1, 10))
