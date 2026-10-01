"""Tests for generic variant solving and generation engine (Windoku, Center Dot, Asterisk)."""

from __future__ import annotations

import random

from sudoku.constraints import (
    VARIANT_EXTRA_GROUPS,
    VARIANT_META,
    get_extra_groups,
)
from sudoku.grid import Grid
from sudoku.variants import (
    VariantCandidateState,
    VariantSolver,
    generate_variant,
    solve_variant_with_trace,
    validate_variant_solution,
)


def test_variant_registries() -> None:
    for v in ["classic", "diagonal", "windoku", "center_dot", "asterisk", "girandola", "disjoint"]:
        assert v in VARIANT_EXTRA_GROUPS
        assert v in VARIANT_META
        groups = get_extra_groups(v)
        assert isinstance(groups, list)
        if v == "windoku":
            assert len(groups) == 4
            for g in groups:
                assert len(g) == 9
        elif v == "disjoint":
            assert len(groups) == 9
            for g in groups:
                assert len(g) == 9
        elif v in ("center_dot", "asterisk", "girandola"):
            assert len(groups) == 1
            assert len(groups[0]) == 9


def test_windoku_generation_and_solver() -> None:
    rng = random.Random(42)
    solver = VariantSolver("windoku", rng=rng)
    full = solver.solve(Grid.empty())
    assert full is not None
    assert full.is_complete()

    # Verify that each of the 4 windows contains digits 1-9
    for g in VARIANT_EXTRA_GROUPS["windoku"]:
        window_vals = [full.cells[i] for i in g]
        assert sorted(window_vals) == list(range(1, 10))

    # Fast puzzle generation
    res = generate_variant("windoku", difficulty="easy", seed=100, max_attempts=5)
    assert res["ok"]
    assert res["variant"] == "windoku"
    assert res["clues"] < 81
    val_res = validate_variant_solution("windoku", res["solution"])
    assert val_res["ok"]
    assert val_res["valid"]


def test_center_dot_and_asterisk_solver() -> None:
    for v in ["center_dot", "asterisk"]:
        rng = random.Random(123)
        solver = VariantSolver(v, rng=rng)
        full = solver.solve(Grid.empty())
        assert full is not None
        assert full.is_complete()
        group = VARIANT_EXTRA_GROUPS[v][0]
        group_vals = [full.cells[i] for i in group]
        assert sorted(group_vals) == list(range(1, 10))


def test_girandola_and_disjoint_solver() -> None:
    for v in ["girandola", "disjoint"]:
        rng = random.Random(456)
        solver = VariantSolver(v, rng=rng)
        full = solver.solve(Grid.empty())
        assert full is not None
        assert full.is_complete()
        for group in VARIANT_EXTRA_GROUPS[v]:
            group_vals = [full.cells[i] for i in group]
            assert sorted(group_vals) == list(range(1, 10))

    # Generation check
    res = generate_variant("girandola", difficulty="easy", seed=77, max_attempts=5)
    assert res["ok"]
    val_res = validate_variant_solution("girandola", res["solution"])
    assert val_res["ok"]
    assert val_res["valid"]


def test_variant_conflict_detection() -> None:
    state = VariantCandidateState("center_dot")
    # Cell 10 (R2C2) and Cell 13 (R2C5) are both in Center Dot group
    assert state.assign(10, 5)
    # Placing 5 in Cell 13 should fail due to Center Dot constraint
    assert not state.assign(13, 5)


def test_solve_variant_with_trace() -> None:
    res = generate_variant("asterisk", difficulty="beginner", seed=99, max_attempts=5)
    assert res["ok"]
    trace_res = solve_variant_with_trace("asterisk", res["puzzle"])
    assert trace_res["ok"]
    assert trace_res["is_solvable"]
    assert len(trace_res["events"]) > 0
