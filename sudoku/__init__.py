"""Sudoku Generator & Solver library."""

from sudoku.candidates import CandidateState
from sudoku.diagonal import (
    DiagonalCandidateState,
    generate_diagonal,
    solve_diagonal_with_trace,
    validate_diagonal_solution,
)
from sudoku.difficulty import Difficulty, DifficultyGrader
from sudoku.generator import PuzzleGenerator
from sudoku.grid import Grid, InvalidGridError
from sudoku.puzzle import Puzzle
from sudoku.solver import (
    BacktrackingSolver,
    Solver,
    SolveResult,
    SolverStats,
    hint,
    solve_with_trace,
)

__all__ = [
    "BacktrackingSolver",
    "CandidateState",
    "DiagonalCandidateState",
    "Difficulty",
    "DifficultyGrader",
    "Grid",
    "InvalidGridError",
    "Puzzle",
    "PuzzleGenerator",
    "SolveResult",
    "Solver",
    "SolverStats",
    "generate_diagonal",
    "hint",
    "solve_diagonal_with_trace",
    "solve_with_trace",
    "validate_diagonal_solution",
]
