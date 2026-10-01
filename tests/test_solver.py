"""Tests for BacktrackingSolver, DLXSolver, and candidate propagation."""

from sudoku.grid import Grid
from sudoku.solver import BacktrackingSolver
from tests.reference.dlx import DLXSolver
from tests.test_grid import SAMPLE_PUZZLE, SAMPLE_SOLVED

# Known hard puzzle: AI Escargot (by Arto Inkala)
AI_ESCARGOT = (
    "1....7.9."
    ".3..2...8"
    "..96..5.."
    "..53..9.."
    ".1..8...2"
    "6....4..."
    "3......1."
    ".4......7"
    "..7...3.."
)

# Minimum 17-clue puzzle with diagonal symmetry (RedEd / Gordon Royle catalog)
SEVENTEEN_CLUE = (
    "........1"
    ".......23"
    "..4..5..."
    "...1....."
    "....3.6.."
    "--7---58-"
    "....67..."
    ".1---4---"
    "52......."
).replace("-", ".")

# Norvig's hardest #1 (from norvig.com/hardest.txt)
NORVIG_HARDEST = "85...24..72......9..4.........1.7..23.5...9...4...........8..7..17..........36.4."

# Unsolvable puzzle (empty with a contradiction injected)
CONTRADICTION_PUZZLE = (
    "55......."
    "........."
    "........."
    "........."
    "........."
    "........."
    "........."
    "........."
    "........."
)

# Multiple solution puzzle (only 4 clues, definitely many solutions)
MULTI_SOLUTION = (
    "12345678."
    "........."
    "........."
    "........."
    "........."
    "........."
    "........."
    "........."
    "........."
)


def test_backtracking_solve_sample() -> None:
    grid = Grid.from_string(SAMPLE_PUZZLE)
    solver = BacktrackingSolver()
    solved = solver.solve(grid)
    assert solved is not None
    assert solved == Grid.from_string(SAMPLE_SOLVED)
    assert solved.is_complete()


def test_dlx_solve_sample() -> None:
    grid = Grid.from_string(SAMPLE_PUZZLE)
    dlx = DLXSolver()
    solved = dlx.solve(grid)
    assert solved is not None
    assert solved == Grid.from_string(SAMPLE_SOLVED)


def test_solvers_agree_on_solution() -> None:
    grid = Grid.from_string(SAMPLE_PUZZLE)
    bt_res = BacktrackingSolver().solve(grid)
    dlx_res = DLXSolver().solve(grid)
    assert bt_res is not None
    assert bt_res == dlx_res


def test_count_solutions_unique() -> None:
    grid = Grid.from_string(SAMPLE_PUZZLE)
    bt = BacktrackingSolver()
    assert bt.count_solutions(grid, limit=2) == 1

    dlx = DLXSolver()
    assert dlx.count_solutions(grid, limit=2) == 1


def test_count_solutions_multi() -> None:
    grid = Grid.from_string(MULTI_SOLUTION)
    bt = BacktrackingSolver()
    assert bt.count_solutions(grid, limit=2) == 2

    dlx = DLXSolver()
    assert dlx.count_solutions(grid, limit=2) == 2


def test_unsolvable_puzzle() -> None:
    grid = Grid.from_string(CONTRADICTION_PUZZLE)
    bt = BacktrackingSolver()
    assert bt.solve(grid) is None
    assert bt.count_solutions(grid, limit=2) == 0

    dlx = DLXSolver()
    assert dlx.solve(grid) is None
    assert dlx.count_solutions(grid, limit=2) == 0


def test_solve_ai_escargot() -> None:
    grid = Grid.from_string(AI_ESCARGOT)
    bt = BacktrackingSolver()
    solved = bt.solve(grid)
    assert solved is not None
    assert solved.is_complete()
    assert bt.count_solutions(grid, limit=2) == 1

    # Also verify with DLX
    dlx = DLXSolver()
    dlx_solved = dlx.solve(grid)
    assert dlx_solved == solved


def test_solve_17_clue_puzzle() -> None:
    grid = Grid.from_string(SEVENTEEN_CLUE)
    assert grid.clues == 17
    bt = BacktrackingSolver()
    solved = bt.solve(grid)
    assert solved is not None
    assert solved.is_complete()
    assert bt.count_solutions(grid, limit=2) == 1


def test_solve_norvig_hardest() -> None:
    grid = Grid.from_string(NORVIG_HARDEST)
    bt = BacktrackingSolver()
    solved = bt.solve(grid)
    assert solved is not None
    assert solved.is_complete()
    assert bt.count_solutions(grid, limit=2) == 1


def test_solver_stats() -> None:
    grid = Grid.from_string(SAMPLE_PUZZLE)
    bt = BacktrackingSolver()
    res = bt.solve_detailed(grid)
    assert res.grid is not None
    assert res.is_solvable
    assert res.stats.nodes_expanded > 0
    assert res.stats.time_elapsed_seconds >= 0.0
