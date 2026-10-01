"""Generic variant engine for arbitrary all-different constraint groups.

Supports Windoku, Center Dot, Asterisk, and any variant defined in
sudoku.constraints.VARIANT_EXTRA_GROUPS without hard-coding rules.
"""

from __future__ import annotations

import random
import time
from typing import Any

from sudoku.candidates import DIGIT_BIT, CandidateState, mask_to_digits
from sudoku.constraints import VARIANT_EXTRA_GROUPS, VARIANT_META
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
from sudoku.puzzle import Puzzle
from sudoku.solver import BacktrackingSolver, SolveResult, SolverStats
from sudoku.trace import (
    DoneEvent,
    EventCollector,
    InitEvent,
    SolutionEvent,
    TraceListener,
)


def _variant_is_valid(grid: Grid, extra_groups: list[list[int]]) -> bool:
    """Check that extra constraint groups in grid have no duplicate non-zero digits."""
    for group in extra_groups:
        seen: set[int] = set()
        for idx in group:
            v = grid.cells[idx]
            if v != 0:
                if v in seen:
                    return False
                seen.add(v)
    return grid.is_valid()


class VariantCandidateState(CandidateState):
    """CandidateState extended with arbitrary extra all-different constraint groups.

    Compatible with all variants in VARIANT_EXTRA_GROUPS.
    """

    __slots__ = (
        "_group_trail",
        "cell_groups",
        "cell_peers",
        "group_used",
        "groups",
        "variant",
    )

    def __init__(self, variant: str = "classic", grid: Grid | None = None) -> None:
        super().__init__(None)
        self.variant = variant
        raw_groups = VARIANT_EXTRA_GROUPS.get(variant, [])
        self.groups: tuple[tuple[int, ...], ...] = tuple(tuple(g) for g in raw_groups)
        num_g = len(self.groups)
        self.group_used: list[int] = [0] * num_g
        self._group_trail: list[tuple[int, ...]] = []

        self.cell_groups: tuple[tuple[int, ...], ...] = tuple(
            tuple(g_idx for g_idx, g_cells in enumerate(self.groups) if i in g_cells)
            for i in range(TOTAL_CELLS)
        )
        self.cell_peers: tuple[tuple[int, ...], ...] = tuple(
            tuple(
                sorted(
                    frozenset(CELL_PEERS[i])
                    | frozenset(
                        c
                        for g_idx in self.cell_groups[i]
                        for c in self.groups[g_idx]
                        if c != i
                    )
                )
            )
            for i in range(TOTAL_CELLS)
        )

        if grid is not None:
            grid.validate()
            for idx, val in enumerate(grid.cells):
                if val != 0 and not self.assign(idx, val):
                    raise InvalidGridError(
                        f"Variant '{variant}' contradiction initializing cell {idx} with {val}"
                    )

    def checkpoint(self) -> int:
        return len(self._trail)

    def undo(self, checkpoint: int) -> None:
        trail = self._trail
        gtrail = self._group_trail

        while len(trail) > checkpoint:
            idx, old_val, old_cand = trail.pop()
            if gtrail:
                snap = gtrail.pop()
                if snap:
                    self.group_used = list(snap)

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
        self._trail.append((idx, self.cells[idx], self.candidates[idx]))
        self._group_trail.append(())

    def assign(self, idx: int, digit: int) -> bool:
        bit = DIGIT_BIT[digit]
        if not (self.candidates[idx] & bit):
            return False

        r = CELL_ROW[idx]
        c = CELL_COL[idx]
        b = CELL_BOX[idx]
        if (self.row_used[r] & bit) or (self.col_used[c] & bit) or (self.box_used[b] & bit):
            return False

        for g_idx in self.cell_groups[idx]:
            if self.group_used[g_idx] & bit:
                return False

        # Record snapshot before mutating
        self._trail.append((idx, self.cells[idx], self.candidates[idx]))
        self._group_trail.append(tuple(self.group_used))

        self.cells[idx] = digit
        self.candidates[idx] = bit
        self.row_used[r] |= bit
        self.col_used[c] |= bit
        self.box_used[b] |= bit
        self.empty_count -= 1

        for g_idx in self.cell_groups[idx]:
            self.group_used[g_idx] |= bit

        for peer in self.cell_peers[idx]:
            if self.cells[peer] == 0:
                p_mask = self.candidates[peer]
                if p_mask & bit:
                    new_mask = p_mask & ~bit
                    if new_mask == 0:
                        return False
                    self._trail.append((peer, self.cells[peer], p_mask))
                    self._group_trail.append(())
                    self.candidates[peer] = new_mask

        return True


class VariantSolver(BacktrackingSolver):
    """Backtracking solver supporting arbitrary variant constraint groups."""

    def __init__(
        self,
        variant: str = "classic",
        listener: TraceListener | None = None,
        node_limit: int = 50_000,
        rng: random.Random | None = None,
    ) -> None:
        super().__init__(listener=listener, rng=rng)
        self.node_limit = node_limit
        self.variant = variant
        self.extra_groups = VARIANT_EXTRA_GROUPS.get(variant, [])

    def solve(self, grid: Grid) -> Grid | None:
        res = self.solve_detailed(grid)
        return res.grid

    def count_solutions(self, grid: Grid, limit: int = 2) -> int:
        start_time = time.perf_counter()
        self._stats = SolverStats()

        if limit <= 0 or not _variant_is_valid(grid, self.extra_groups):
            return 0

        try:
            state = VariantCandidateState(self.variant, grid)
        except InvalidGridError:
            return 0

        count = [0]
        self._backtrack_count(state, depth=0, count=count, limit=limit)
        self._stats.naked_singles = state.naked_singles_count
        self._stats.hidden_singles = state.hidden_singles_count
        self._stats.time_elapsed_seconds = time.perf_counter() - start_time
        return count[0]

    def solve_detailed(self, grid: Grid) -> SolveResult:
        start_time = time.perf_counter()
        self._stats = SolverStats()
        listener = self.listener

        if not _variant_is_valid(grid, self.extra_groups):
            self._stats.time_elapsed_seconds = time.perf_counter() - start_time
            return SolveResult(grid=None, stats=self._stats)

        try:
            state = VariantCandidateState(self.variant, grid)
        except InvalidGridError:
            self._stats.time_elapsed_seconds = time.perf_counter() - start_time
            return SolveResult(grid=None, stats=self._stats)

        if listener is not None:
            cands = [mask_to_digits(state.candidates[i]) for i in range(TOTAL_CELLS)]
            meta = VARIANT_META.get(self.variant)
            v_name = meta["name"] if meta is not None else self.variant.title()
            listener.on_event(
                InitEvent(
                    event_type="init",
                    explanation=f"{v_name} initialized with {grid.clues} given clues.",
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
                        explanation=f"{self.variant.title()} Sudoku solved!",
                        grid=solved_grid.to_string(),
                    )
                )
            listener.on_event(
                DoneEvent(
                    event_type="done",
                    explanation=f"Done: {self._stats.nodes_expanded} nodes, {self._stats.backtracks} backtracks.",
                    stats=self._stats.to_dict(),
                    solution_count=1 if solved_grid is not None else 0,
                )
            )

        return SolveResult(grid=solved_grid, stats=self._stats)


class VariantPuzzleGenerator(PuzzleGenerator):
    """Generates puzzles satisfying variant constraints."""

    def __init__(self, variant: str = "classic") -> None:
        self.variant = variant
        self._var_solver = VariantSolver(variant)
        super().__init__(
            solver=self._var_solver,
            grader=DifficultyGrader(),
        )

    def _generate_full_grid(self, rng: random.Random) -> Grid:
        solver = VariantSolver(self.variant, rng=rng)
        grid = solver.solve(Grid.empty())
        if grid is None or not grid.is_complete():
            raise RuntimeError(f"Failed to generate complete {self.variant} grid")
        if not _variant_is_valid(grid, self._var_solver.extra_groups):
            raise RuntimeError(f"Generated grid violates {self.variant} constraints")
        return grid

    def _carve_clues(
        self,
        full_grid: Grid,
        target_clues: int,
        min_clues: int,
        symmetric: bool,
        rng: random.Random,
    ) -> tuple[Grid, bool]:
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
                if self._var_solver.count_solutions(test_grid, limit=2) == 1:
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

                if self._var_solver.count_solutions(test_grid, limit=2) == 1:
                    current_clues -= 1
                    if symmetric:
                        is_symmetric = False
                else:
                    cells[idx] = old_val

        return Grid(cells), is_symmetric


def generate_variant(
    variant: str = "classic",
    difficulty: str = "medium",
    seed: int | str | None = None,
    symmetric: bool = True,
    max_attempts: int = 20,
) -> dict[str, Any]:
    """Generate a puzzle for the given variant id. Returns same shape as web_api.generate()."""
    try:
        diff_enum = Difficulty.from_string(difficulty)
        generator = VariantPuzzleGenerator(variant)
        puzzle: Puzzle = generator.generate(
            diff_enum, seed=seed, symmetric=symmetric, max_attempts=max_attempts
        )
        return {
            "ok": True,
            "success": True,
            "variant": variant,
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


def solve_variant_with_trace(
    variant: str,
    grid_str: str,
    max_events: int = 50_000,
) -> dict[str, Any]:
    """Solve any variant puzzle and return step-by-step trace events."""
    try:
        grid = Grid.from_string(grid_str)
        groups = VARIANT_EXTRA_GROUPS.get(variant, [])
        if not _variant_is_valid(grid, groups):
            return {
                "ok": False,
                "success": False,
                "error": f"Grid violates {variant} constraints.",
                "events": [],
            }

        collector = EventCollector(max_events=max_events)
        solver = VariantSolver(variant, listener=collector)
        result = solver.solve_detailed(grid)

        events = [e.to_dict() if hasattr(e, "to_dict") else e for e in collector.events]

        return {
            "ok": result.is_solvable,
            "success": result.is_solvable,
            "mode": "propagate",
            "variant": variant,
            "solution": result.grid.to_string() if result.grid else None,
            "is_solvable": result.is_solvable,
            "stats": result.stats.to_dict(),
            "truncated": getattr(collector, "truncated", False),
            "events": events,
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "success": False, "error": str(e), "events": []}


def validate_variant_solution(variant: str, grid_str: str) -> dict[str, Any]:
    """Validate that a completed grid satisfies classic and variant rules."""
    try:
        grid = Grid.from_string(grid_str)
        groups = VARIANT_EXTRA_GROUPS.get(variant, [])
        valid = _variant_is_valid(grid, groups)
        all_groups_ok = True
        for g in groups:
            vals = [grid.cells[i] for i in g]
            if not (any(v == 0 for v in vals) or sorted(vals) == list(range(1, 10))):
                all_groups_ok = False
                break
        return {
            "ok": True,
            "valid": valid and all_groups_ok,
            "classic_valid": grid.is_valid(),
            "variant": variant,
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}
