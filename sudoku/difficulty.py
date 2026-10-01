"""Sudoku Difficulty enum and DifficultyGrader strategy."""

from __future__ import annotations

from enum import Enum
from typing import NamedTuple

from sudoku.grid import Grid
from sudoku.solver import BacktrackingSolver, SolverStats


class Difficulty(str, Enum):
    """Sudoku difficulty levels."""
    BEGINNER = "beginner"
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
    EXPERT = "expert"

    @classmethod
    def from_string(cls, val: str) -> Difficulty:
        """Parse case-insensitive string into Difficulty."""
        normalized = val.strip().lower()
        for member in cls:
            if member.value == normalized:
                return member
        valid = ", ".join(m.value for m in cls)
        raise ValueError(f"Unknown difficulty '{val}'. Must be one of: {valid}")


class ClueRange(NamedTuple):
    min_clues: int
    max_clues: int
    target_clues: int


# Target clue ranges defined by the PRD
DIFFICULTY_CLUE_RANGES: dict[Difficulty, ClueRange] = {
    Difficulty.BEGINNER: ClueRange(40, 45, 42),
    Difficulty.EASY: ClueRange(34, 39, 36),
    Difficulty.MEDIUM: ClueRange(28, 33, 30),
    Difficulty.HARD: ClueRange(24, 27, 26),
    Difficulty.EXPERT: ClueRange(22, 25, 24),
}


class DifficultyGrader:
    """Evaluates Sudoku difficulty using a composite of clue count and solver effort."""

    def __init__(
        self,
        clue_ranges: dict[Difficulty, ClueRange] | None = None,
    ) -> None:
        self.clue_ranges = clue_ranges or DIFFICULTY_CLUE_RANGES

    def grade(
        self, grid: Grid, solver: BacktrackingSolver | None = None
    ) -> tuple[Difficulty, SolverStats, float]:
        """Grade a puzzle grid, returning (Difficulty, SolverStats, effort_score).

        Difficulty rules based on PRD Section 5:
        - Beginner: 40-45 clues, naked singles only, no branching (max_depth == 0, backtracks == 0)
        - Easy: 34-39 clues, singles only (naked or hidden), no branching
        - Medium: 28-33 clues, small branching depth (depth <= 2)
        - Hard: 24-27 clues, needs branching (depth >= 3 or moderate nodes)
        - Expert: 22-25 clues, deep branching or high node count
        """
        active_solver = solver or BacktrackingSolver()
        result = active_solver.solve_detailed(grid)

        if result.grid is None:
            raise ValueError("Cannot grade an unsolvable puzzle")

        stats = result.stats
        clues = grid.clues
        score = stats.effort_score

        # Composite tier determination
        if stats.backtracks == 0 and stats.max_depth == 0:
            if clues >= 40:
                tier = Difficulty.BEGINNER
            elif clues >= 34:
                tier = Difficulty.EASY
            else:
                # If clue count is lower than 34 but solved with 0 branching,
                # classify by clue count into Medium
                tier = Difficulty.MEDIUM
        elif stats.max_depth <= 2 and stats.backtracks <= 12:
            if clues >= 34:
                tier = Difficulty.EASY
            elif clues >= 28:
                tier = Difficulty.MEDIUM
            else:
                tier = Difficulty.HARD
        elif stats.max_depth <= 4 and stats.backtracks <= 40:
            if clues <= 25 and (stats.max_depth >= 4 or stats.backtracks >= 20):
                tier = Difficulty.EXPERT
            else:
                tier = Difficulty.HARD
        else:
            tier = Difficulty.EXPERT

        return tier, stats, score

    def matches_target(
        self, grid: Grid, target: Difficulty, solver: BacktrackingSolver | None = None
    ) -> bool:
        """Check if a puzzle meets the target difficulty tier criteria."""
        clue_range = self.clue_ranges[target]
        clues = grid.clues
        if not (clue_range.min_clues <= clues <= clue_range.max_clues):
            return False

        tier, _, _ = self.grade(grid, solver)
        return tier == target
