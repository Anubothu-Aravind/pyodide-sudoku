"""Puzzle data object holding givens, solution, difficulty, and solver metadata."""

from __future__ import annotations

from dataclasses import dataclass

from sudoku.difficulty import Difficulty
from sudoku.grid import Grid
from sudoku.solver import SolverStats


@dataclass(frozen=True)
class Puzzle:
    """A generated or loaded Sudoku puzzle with solution and difficulty metadata."""

    givens: Grid
    solution: Grid
    difficulty: Difficulty
    clue_count: int
    effort_score: float
    stats: SolverStats
    is_symmetric: bool = True
    seed: int | str | None = None

    def to_string(self, blank: str = ".") -> str:
        """Return 81-character string of the givens."""
        return self.givens.to_string(blank)

    def pretty(self) -> str:
        """Pretty-print the puzzle givens."""
        return self.givens.pretty()

    def __str__(self) -> str:
        header = (
            f"Sudoku Puzzle [{self.difficulty.value.upper()}] "
            f"({self.clue_count} clues, effort: {self.effort_score:.1f})"
        )
        return f"{header}\n{self.pretty()}"
