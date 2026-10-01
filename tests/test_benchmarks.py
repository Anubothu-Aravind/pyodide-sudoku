"""Performance benchmark tests to verify NFR targets."""

import time

from sudoku.difficulty import Difficulty
from sudoku.generator import PuzzleGenerator
from sudoku.grid import Grid
from sudoku.solver import BacktrackingSolver
from tests.test_grid import SAMPLE_PUZZLE
from tests.test_solver import AI_ESCARGOT, NORVIG_HARDEST


def test_benchmark_solve_typical_puzzle() -> None:
    grid = Grid.from_string(SAMPLE_PUZZLE)
    solver = BacktrackingSolver()

    # Typical puzzle should solve in < 10 ms (PRD Section 7)
    start = time.perf_counter()
    iterations = 50
    for _ in range(iterations):
        res = solver.solve(grid)
        assert res is not None
    avg_ms = ((time.perf_counter() - start) / iterations) * 1000

    assert avg_ms < 10.0, f"Typical solve took {avg_ms:.2f} ms (target < 10 ms)"


def test_benchmark_solve_ai_escargot() -> None:
    grid = Grid.from_string(AI_ESCARGOT)
    solver = BacktrackingSolver()

    # Hard puzzle should solve in < 500 ms (PRD Section 7)
    start = time.perf_counter()
    res = solver.solve(grid)
    elapsed_ms = (time.perf_counter() - start) * 1000

    assert res is not None
    assert elapsed_ms < 500.0, f"AI Escargot solve took {elapsed_ms:.2f} ms (target < 500 ms)"


def test_benchmark_solve_norvig_hardest() -> None:
    grid = Grid.from_string(NORVIG_HARDEST)
    solver = BacktrackingSolver()

    start = time.perf_counter()
    res = solver.solve(grid)
    elapsed_ms = (time.perf_counter() - start) * 1000

    assert res is not None
    assert elapsed_ms < 500.0, f"Norvig hardest solve took {elapsed_ms:.2f} ms (target < 500 ms)"


def test_benchmark_generator_timings() -> None:
    generator = PuzzleGenerator()

    # Generation across tiers should be < 2s on average (PRD Section 7)
    tiers = [Difficulty.BEGINNER, Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD]
    total_time = 0.0

    for tier in tiers:
        start = time.perf_counter()
        puzzle = generator.generate(tier, seed=101)
        dur = time.perf_counter() - start
        total_time += dur
        assert puzzle.clue_count > 0

    avg_time = total_time / len(tiers)
    assert avg_time < 2.0, f"Average generation time {avg_time:.2f}s (target < 2s)"
