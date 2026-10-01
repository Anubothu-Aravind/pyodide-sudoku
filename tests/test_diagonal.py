"""Tests for Diagonal Sudoku constraint logic, solver, generator, and web API."""

from sudoku.constraints import (
    ANTI_DIAGONAL,
    MAIN_DIAGONAL,
    VARIANT_META,
    get_extra_groups,
)
from sudoku.diagonal import (
    DiagonalCandidateState,
    generate_diagonal,
    solve_diagonal_with_trace,
    validate_diagonal_solution,
)
from sudoku.grid import Grid
from sudoku.web_api import (
    variant_info,
)


def test_diagonal_indices():
    """Verify diagonal index definitions and center cell."""
    assert len(MAIN_DIAGONAL) == 9
    assert len(ANTI_DIAGONAL) == 9

    # Main diagonal: (0,0), (1,1), ..., (8,8) -> 0, 10, 20, 30, 40, 50, 60, 70, 80
    for r in range(9):
        assert MAIN_DIAGONAL[r] == r * 9 + r

    # Anti-diagonal: (0,8), (1,7), ..., (8,0) -> 8, 16, 24, 32, 40, 48, 56, 64, 72
    for r in range(9):
        assert ANTI_DIAGONAL[r] == r * 9 + (8 - r)

    # Center cell (r=4, c=4, idx=40) must be on both diagonals
    assert 40 in MAIN_DIAGONAL
    assert 40 in ANTI_DIAGONAL


def test_variant_meta_and_groups():
    """Verify constraint metadata and group extraction."""
    assert "classic" in VARIANT_META
    assert "diagonal" in VARIANT_META
    assert VARIANT_META["diagonal"]["name"] == "Diagonal Sudoku"

    diag_info = variant_info("diagonal")
    assert diag_info["ok"]
    assert diag_info["name"] == "Diagonal Sudoku"
    assert len(diag_info["extra_groups"]) == 2

    groups = get_extra_groups("diagonal")
    assert len(groups) == 2
    assert groups[0] == MAIN_DIAGONAL
    assert groups[1] == ANTI_DIAGONAL

    empty_groups = get_extra_groups("classic")
    assert len(empty_groups) == 0


def test_diagonal_candidate_state_conflicts():
    """DiagonalCandidateState must enforce all-different on both diagonals."""
    state = DiagonalCandidateState()
    # Cell 0 is (0,0) on MAIN diagonal (row 0, col 0, box 0)
    assert state.assign(0, 5)

    # Cell 80 is (8,8) on MAIN diagonal (row 8, col 8, box 8 - no row/col/box overlap with 0)
    # Placing 5 at cell 80 must fail strictly due to main diagonal constraint
    assert not state.assign(80, 5)

    # Cell 16 is (1,7) on ANTI-diagonal (row 1, col 7, box 2 - no row/col/box/main-diag overlap with 0)
    assert state.assign(16, 5)

    # Cell 48 is (5,3) on ANTI-diagonal (row 5, col 3, box 4 - no row/col/box overlap with cell 16 or 0)
    # Placing 5 at cell 48 must fail strictly due to anti-diagonal constraint
    assert not state.assign(48, 5)


def test_diagonal_generator_and_solver():
    """generate_diagonal should produce a puzzle solvable with diagonal constraints."""
    result = generate_diagonal(difficulty="easy", seed="test_seed_42", symmetric=True)
    assert result["ok"]
    assert result["success"]
    assert result["variant"] == "diagonal"

    puzzle = result["puzzle"]
    solution = result["solution"]
    assert len(puzzle) == 81
    assert len(solution) == 81

    # Validate solution satisfies diagonal constraints
    val = validate_diagonal_solution(solution)
    assert val["valid"]

    # Verify solving with trace returns events
    trace_res = solve_diagonal_with_trace(puzzle, node_limit=10000)
    assert trace_res["ok"]
    assert trace_res["success"]
    assert trace_res["solution"] == solution
    assert len(trace_res["events"]) > 0


def test_diagonal_rejects_non_diagonal_solution():
    """A classic solution that has duplicates on diagonals must fail validation."""
    invalid_grid = Grid.from_string("1" * 81)
    val = validate_diagonal_solution(invalid_grid.to_string())
    assert not val["valid"]
