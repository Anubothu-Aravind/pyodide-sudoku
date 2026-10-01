"""Tests for levels mode generation, par times, and progression curve."""

import json
from pathlib import Path

import pytest

from sudoku.levels import (
    GENERATOR_VERSION,
    calculate_par_time_seconds,
    generate_level,
    level_spec,
)
from sudoku.solver import BacktrackingSolver
from tests.reference.dlx import DLXSolver


def test_level_spec_structure() -> None:
    """Validate level_spec produces valid metadata for various levels."""
    for lvl in [1, 5, 10, 11, 20, 50, 55, 60, 100]:
        spec = level_spec(lvl)
        assert spec.level == lvl
        assert spec.world == (lvl - 1) // 10 + 1
        assert spec.index_in_world == (lvl - 1) % 10 + 1
        assert spec.seed == f"lvl-{lvl}-v{GENERATOR_VERSION}"
        assert spec.min_clues <= spec.target_clues <= spec.max_clues
        assert spec.min_effort <= spec.max_effort
        if spec.index_in_world == 10:
            assert spec.is_boss is True
            assert spec.symmetric is True
        else:
            assert spec.is_boss is False


def test_par_time_calculation() -> None:
    """Par time is deterministic, bounded, and scales with effort/clues."""
    # Low effort, many clues -> lower par time
    t1 = calculate_par_time_seconds(effort_score=10.0, clues=42)
    # High effort, fewer clues -> higher par time
    t2 = calculate_par_time_seconds(effort_score=80.0, clues=24)
    assert t1 >= 120
    assert t2 <= 1200
    assert t2 > t1


def test_golden_levels_match() -> None:
    """Levels 1 to 60 must match tests/golden_levels.json exactly."""
    golden_path = Path(__file__).parent / "golden_levels.json"
    if not golden_path.exists():
        pytest.skip("golden_levels.json not found")

    with open(golden_path, "r", encoding="utf-8") as f:
        golden_data = json.load(f)

    # Check a sample across worlds to keep test fast while verifying determinism
    check_levels = [1, 2, 10, 11, 20, 21, 30, 31, 40, 41, 50, 51, 60]
    golden_by_lvl = {item["level"]: item for item in golden_data}

    for lvl in check_levels:
        golden = golden_by_lvl[lvl]
        res = generate_level(lvl)
        assert res["level"] == golden["level"]
        assert res["world"] == golden["world"]
        assert res["difficulty"] == golden["difficulty"]
        assert res["puzzle"] == golden["puzzle"]
        assert res["solution"] == golden["solution"]
        assert res["seed"] == golden["seed"]


def test_levels_uniqueness_with_dlx() -> None:
    """Sample levels tested for uniqueness using both Backtracker and DLX reference solver."""
    dlx = DLXSolver()
    backtracker = BacktrackingSolver()

    # Check boss levels of worlds 1 to 5
    for lvl in [10, 20, 30, 40, 50]:
        res = generate_level(lvl)
        grid_str = res["puzzle"]
        from sudoku.grid import Grid

        grid = Grid.from_string(grid_str)

        assert backtracker.count_solutions(grid, limit=2) == 1
        assert dlx.count_solutions(grid, limit=2) == 1
        dlx_sol = dlx.solve(grid)
        assert dlx_sol is not None
        assert dlx_sol.to_string() == res["solution"]


def test_monotone_effort_across_worlds() -> None:
    """Mean effort per world should be non-decreasing across worlds 1 to 5."""
    golden_path = Path(__file__).parent / "golden_levels.json"
    if not golden_path.exists():
        pytest.skip("golden_levels.json not found")

    with open(golden_path, "r", encoding="utf-8") as f:
        golden_data = json.load(f)

    world_efforts: dict[int, list[float]] = {}
    for item in golden_data:
        w = item["world"]
        world_efforts.setdefault(w, []).append(item["effort_score"])

    mean_efforts = [sum(world_efforts[w]) / len(world_efforts[w]) for w in range(1, 6)]
    for i in range(len(mean_efforts) - 1):
        assert mean_efforts[i] <= mean_efforts[i + 1]
