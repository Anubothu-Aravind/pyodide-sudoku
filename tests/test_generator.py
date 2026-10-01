"""Tests for PuzzleGenerator, DifficultyGrader, and Puzzle representation."""

import pytest

from sudoku.difficulty import Difficulty
from sudoku.generator import PuzzleGenerator
from sudoku.solver import BacktrackingSolver
from tests.reference.dlx import DLXSolver


def test_difficulty_from_string() -> None:
    assert Difficulty.from_string("BEGINNER") == Difficulty.BEGINNER
    assert Difficulty.from_string("easy") == Difficulty.EASY
    assert Difficulty.from_string("Medium") == Difficulty.MEDIUM
    assert Difficulty.from_string("hard") == Difficulty.HARD
    assert Difficulty.from_string("expert") == Difficulty.EXPERT
    with pytest.raises(ValueError, match="Unknown difficulty"):
        Difficulty.from_string("impossible")


def test_generator_determinism() -> None:
    gen = PuzzleGenerator()
    p1 = gen.generate(Difficulty.MEDIUM, seed=12345)
    p2 = gen.generate(Difficulty.MEDIUM, seed=12345)
    assert p1.to_string() == p2.to_string()
    assert p1.solution == p2.solution
    assert p1.difficulty == p2.difficulty
    assert p1.clue_count == p2.clue_count


def test_generator_string_seed() -> None:
    gen = PuzzleGenerator()
    p1 = gen.generate(Difficulty.HARD, seed="my-secret-seed")
    p2 = gen.generate(Difficulty.HARD, seed="my-secret-seed")
    assert p1.to_string() == p2.to_string()
    assert p1.solution == p2.solution


@pytest.mark.parametrize("diff", [
    Difficulty.BEGINNER,
    Difficulty.EASY,
    Difficulty.MEDIUM,
    Difficulty.HARD,
    Difficulty.EXPERT,
])
def test_generator_uniqueness_and_correctness(diff: Difficulty) -> None:
    gen = PuzzleGenerator()
    puzzle = gen.generate(diff, seed=100)

    # Check that givens have exactly 1 solution
    bt = BacktrackingSolver()
    assert bt.count_solutions(puzzle.givens, limit=2) == 1

    # Cross-check with DLX
    dlx = DLXSolver()
    assert dlx.count_solutions(puzzle.givens, limit=2) == 1

    # Solved grid matches stored solution
    solved = bt.solve(puzzle.givens)
    assert solved == puzzle.solution
    assert solved.is_complete()


def test_generator_symmetry_mode() -> None:
    gen = PuzzleGenerator()
    # Rotational 180° symmetry: cell at idx has matching cell at 80 - idx
    puzzle = gen.generate(Difficulty.BEGINNER, seed=777, symmetric=True)
    cells = puzzle.givens.cells
    for i in range(41):
        has_cell = cells[i] != 0
        has_sym = cells[80 - i] != 0
        assert has_cell == has_sym, f"Asymmetry at {i} and {80 - i}"


def test_puzzle_pretty_and_str() -> None:
    gen = PuzzleGenerator()
    puzzle = gen.generate(Difficulty.EASY, seed=999)
    s = str(puzzle)
    assert "Sudoku Puzzle [EASY]" in s
    assert "+-------+-------+-------+" in s
    assert puzzle.to_string() == puzzle.givens.to_string()
