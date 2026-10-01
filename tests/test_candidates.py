"""Tests for CandidateState operations, eliminations, undo, and edge cases."""

import pytest

from sudoku.candidates import CandidateState, digit_from_bit, mask_to_digits
from sudoku.difficulty import Difficulty, DifficultyGrader
from sudoku.grid import Grid, InvalidGridError
from tests.test_grid import SAMPLE_PUZZLE


def test_digit_from_bit() -> None:
    for d in range(1, 10):
        bit = 1 << (d - 1)
        assert digit_from_bit(bit) == d


def test_mask_to_digits() -> None:
    mask = (1 << 0) | (1 << 2) | (1 << 8)  # digits 1, 3, 9
    assert mask_to_digits(mask) == [1, 3, 9]


def test_candidate_state_eliminate_and_undo() -> None:
    state = CandidateState()
    cp = state.checkpoint()

    # Eliminate digit 5 from cell 0
    assert state.eliminate(0, 5) is True
    assert 5 not in mask_to_digits(state.candidates[0])

    # Re-eliminating already eliminated digit returns True
    assert state.eliminate(0, 5) is True

    # Roll back
    state.undo(cp)
    assert 5 in mask_to_digits(state.candidates[0])


def test_candidate_state_contradiction_eliminate_all() -> None:
    state = CandidateState()
    # Eliminate 1..8
    for d in range(1, 9):
        assert state.eliminate(0, d) is True

    # Eliminating last remaining digit (9) should return False (contradiction)
    assert state.eliminate(0, 9) is False


def test_candidate_state_assign_already_used_digit() -> None:
    state = CandidateState()
    assert state.assign(0, 5) is True

    # Assigning 5 again in same row, column, or box should return False
    assert state.assign(1, 5) is False
    assert state.assign(9, 5) is False


def test_candidate_state_init_with_invalid_grid() -> None:
    bad_grid = Grid.from_string("55" + "." * 79)
    with pytest.raises(InvalidGridError):
        CandidateState(bad_grid)


def test_difficulty_grader_unsolvable_raises() -> None:
    grader = DifficultyGrader()
    unsolvable = Grid.from_string("55" + "." * 79)
    with pytest.raises(ValueError, match="Cannot grade an unsolvable puzzle"):
        grader.grade(unsolvable)


def test_difficulty_grader_matches_target() -> None:
    grader = DifficultyGrader()
    g = Grid.from_string(SAMPLE_PUZZLE)
    assert grader.matches_target(g, Difficulty.MEDIUM) is True
    assert grader.matches_target(g, Difficulty.EXPERT) is False
