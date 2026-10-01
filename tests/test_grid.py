"""Tests for Grid parsing, validation, immutability, and serialization."""

import pytest

from sudoku.grid import Grid, InvalidGridError

SAMPLE_PUZZLE = (
    "53..7...."
    "6..195..."
    ".98....6."
    "8...6...3"
    "4..8.3..1"
    "7...2...6"
    ".6....28."
    "...419..5"
    "....8..79"
)

SAMPLE_SOLVED = (
    "534678912"
    "672195348"
    "198342567"
    "859761423"
    "426853791"
    "713924856"
    "961537284"
    "287419635"
    "345286179"
)


def test_empty_grid() -> None:
    g = Grid.empty()
    assert len(g) == 81
    assert g.clues == 0
    assert len(g.empty_cells()) == 81
    assert not g.is_complete()
    assert g.is_valid()


def test_parse_sample_puzzle() -> None:
    g = Grid.from_string(SAMPLE_PUZZLE)
    assert g.clues == 30
    assert g[0, 0] == 5
    assert g[0, 1] == 3
    assert g[0, 2] == 0
    assert g[8, 8] == 9
    assert g.is_valid()
    assert not g.is_complete()


def test_solved_grid_completeness() -> None:
    g = Grid.from_string(SAMPLE_SOLVED)
    assert g.clues == 81
    assert g.is_valid()
    assert g.is_complete()
    assert len(g.empty_cells()) == 0


def test_grid_equality_and_hash() -> None:
    g1 = Grid.from_string(SAMPLE_PUZZLE)
    g2 = Grid.from_string(SAMPLE_PUZZLE)
    assert g1 == g2
    assert hash(g1) == hash(g2)
    assert {g1, g2} == {g1}


def test_grid_serialization_roundtrip() -> None:
    g = Grid.from_string(SAMPLE_PUZZLE)
    s = g.to_string(blank=".")
    assert s == SAMPLE_PUZZLE
    g_parsed = Grid.from_string(s)
    assert g == g_parsed


def test_grid_validation_duplicate_in_row() -> None:
    # 2 fives in first row
    bad_str = "55" + "." * 79
    g = Grid.from_string(bad_str)
    assert not g.is_valid()
    with pytest.raises(InvalidGridError, match="Duplicate value 5 in row 0"):
        g.validate()


def test_grid_validation_duplicate_in_col() -> None:
    # Row 0 col 0 is 5, Row 1 col 0 is 5
    cells = [0] * 81
    cells[0] = 5
    cells[9] = 5
    g = Grid(cells)
    assert not g.is_valid()
    with pytest.raises(InvalidGridError, match="Duplicate value 5 in column 0"):
        g.validate()


def test_grid_validation_duplicate_in_box() -> None:
    # Row 0 col 1 is 5, Row 1 col 2 is 5 (same 3x3 box)
    cells = [0] * 81
    cells[1] = 5
    cells[11] = 5
    g = Grid(cells)
    assert not g.is_valid()
    with pytest.raises(InvalidGridError, match="Duplicate value 5 in box 0"):
        g.validate()


def test_grid_invalid_length() -> None:
    with pytest.raises(InvalidGridError, match="Invalid grid string length"):
        Grid.from_string("12345")


def test_grid_with_cell() -> None:
    g = Grid.empty()
    g2 = g.with_cell(0, 0, 7)
    assert g[0, 0] == 0
    assert g2[0, 0] == 7
    assert g2.clues == 1


def test_pretty_printing() -> None:
    g = Grid.from_string(SAMPLE_PUZZLE)
    pretty = g.pretty()
    assert "+-------+-------+-------+" in pretty
    assert "| 5 3 . | . 7 . | . . . |" in pretty


def test_grid_2d_list_init() -> None:
    row = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    grid_2d = [row[:] for _ in range(9)]
    g = Grid(grid_2d)
    assert len(g) == 81
    assert g[0, 0] == 1
    assert g[8, 8] == 9


def test_grid_row_col_box_helpers() -> None:
    g = Grid.from_string(SAMPLE_PUZZLE)
    assert len(g.row(0)) == 9
    assert len(g.col(0)) == 9
    assert len(g.box(0)) == 9
    assert Grid.box_index(0, 0) == 0
    assert Grid.box_index(8, 8) == 8
    assert Grid.row_col(9) == (1, 0)
    assert Grid.index(1, 0) == 9

    with pytest.raises(IndexError):
        g.row(10)
    with pytest.raises(IndexError):
        g.col(-1)
    with pytest.raises(IndexError):
        g.box(9)
    with pytest.raises(IndexError):
        Grid.index(10, 0)


def test_grid_invalid_types_and_values() -> None:
    with pytest.raises(TypeError):
        Grid(12345)  # type: ignore

    with pytest.raises(InvalidGridError):
        Grid([10] * 81)

    with pytest.raises(InvalidGridError):
        Grid([[1] * 8 for _ in range(9)])  # bad row length

    with pytest.raises(InvalidGridError):
        Grid([[10] * 9 for _ in range(9)])  # bad cell value

    with pytest.raises(IndexError):
        Grid.empty()[100]

    with pytest.raises(IndexError):
        Grid.empty()[10, 0]

    with pytest.raises(IndexError):
        Grid.empty().with_cell(100, 5)

    with pytest.raises(ValueError):
        Grid.empty().with_cell(0, 15)


def test_grid_not_equal_other_types() -> None:
    g = Grid.empty()
    assert g != "not a grid"
    assert g != 42
    assert list(iter(g)) == list(g.cells)
