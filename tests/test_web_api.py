"""Tests for sudoku/web_api.py facade functions."""

import json
from pathlib import Path

from sudoku import web_api


def test_web_api_generate() -> None:
    res = web_api.generate(difficulty="easy", seed="test-seed-123", symmetric=True)
    assert res["success"] is True
    assert "puzzle" in res
    assert "solution" in res
    assert res["difficulty"] == "easy"
    assert len(res["puzzle"]) == 81
    assert len(res["solution"]) == 81


def test_web_api_check_and_solve() -> None:
    puzzle = "81572349646251983779368412552784631963495178218937256494613527835826794127149865."
    # Solve
    res_solve = web_api.solve(puzzle)
    assert res_solve["success"] is True
    assert res_solve["solution"] is not None
    assert res_solve["solution"][80] == "3"

    # Check
    res_check = web_api.check(puzzle)
    assert res_check["valid"] is True
    assert res_check["solvable"] is True
    assert res_check["unique"] is True

    # Count solutions
    res_count = web_api.count_solutions(puzzle, limit=2)
    assert res_count["count"] == 1


def test_web_api_hint() -> None:
    puzzle = "81572349646251983779368412552784631963495178218937256494613527835826794127149865."
    res = web_api.hint(puzzle)
    assert res["technique"] in ("naked_single", "hidden_single")
    assert res["cell"] == [8, 8]
    assert res["value"] == 3


def test_web_api_solve_with_trace() -> None:
    puzzle = "81572349646251983779368412552784631963495178218937256494613527835826794127149865."
    res = web_api.solve_with_trace(puzzle, mode="propagate", max_events=500)
    assert res["success"] is True
    assert len(res["events"]) > 0


def test_web_api_level_functions() -> None:
    spec = web_api.level_spec(1)
    assert spec["level"] == 1
    assert spec["world"] == 1

    lvl = web_api.generate_level(1)
    assert lvl["level"] == 1
    assert len(lvl["puzzle"]) == 81

    batch = web_api.generate_levels(1, 3)
    assert len(batch) == 3
    assert [item["level"] for item in batch] == [1, 2, 3]


def test_golden_puzzles_match() -> None:
    """Validate that all 20 golden puzzles in golden_puzzles.json match web_api.generate exactly."""
    golden_path = Path(__file__).parent / "golden_puzzles.json"
    with open(golden_path, "r", encoding="utf-8") as f:
        golden_data = json.load(f)

    assert len(golden_data) == 20
    for entry in golden_data:
        res = web_api.generate(
            difficulty=entry["difficulty"],
            seed=entry["seed"],
            symmetric=True,
        )
        assert res["puzzle"] == entry["puzzle"]
        assert res["solution"] == entry["solution"]
        assert res["clues"] == entry["clues"]


def test_web_api_error_branches() -> None:
    """Test error handling in web_api functions."""
    # Invalid difficulty in generate
    res = web_api.generate(difficulty="super_impossible")
    assert res["ok"] is False
    assert "error" in res

    # Invalid grid in solve
    res_inv = web_api.solve("invalid_grid")
    assert res_inv["ok"] is False
    assert "error" in res_inv

    # Unsolvable puzzle in solve
    unsolvable = "11" + "." * 79
    res_unsolv = web_api.solve(unsolvable)
    assert res_unsolv["ok"] is False
    assert "error" in res_unsolv

    # Invalid grid in check
    res_chk_inv = web_api.check("bad_grid")
    assert res_chk_inv["ok"] is False
    assert res_chk_inv["valid"] is False

    # Conflicting grid in check
    res_chk_conflict = web_api.check(unsolvable)
    assert res_chk_conflict["ok"] is True
    assert res_chk_conflict["valid"] is False

    # Invalid grid in count_solutions
    res_cnt_inv = web_api.count_solutions("bad_grid")
    assert res_cnt_inv["ok"] is False

    # Invalid grid in hint
    res_hint_inv = web_api.hint("bad_grid")
    assert res_hint_inv["ok"] is False

    # Invalid grid in solve_with_trace
    res_trace_inv = web_api.solve_with_trace("bad_grid")
    assert res_trace_inv["ok"] is False

    # Invalid level in level_spec
    res_spec_inv = web_api.level_spec(0)
    assert res_spec_inv["ok"] is False

    # Invalid level in generate_level
    res_lvl_inv = web_api.generate_level(0)
    assert res_lvl_inv["ok"] is False
