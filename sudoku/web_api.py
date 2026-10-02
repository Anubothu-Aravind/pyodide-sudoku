"""Web API facade for Pyodide worker communication.

Every function is pure, takes strings and primitives, and returns JSON-serializable dicts.
"""

from __future__ import annotations

from typing import Any

from sudoku.constraints import VARIANT_META, get_extra_groups
from sudoku.diagonal import (
    generate_diagonal as _generate_diagonal,
)
from sudoku.diagonal import (
    solve_diagonal_with_trace as _solve_diagonal_with_trace,
)
from sudoku.diagonal import (
    validate_diagonal_solution as _validate_diagonal_solution,
)
from sudoku.difficulty import Difficulty
from sudoku.generator import PuzzleGenerator
from sudoku.grid import Grid, InvalidGridError
from sudoku.levels import generate_level as _generate_level
from sudoku.levels import level_spec as _level_spec
from sudoku.solver import BacktrackingSolver
from sudoku.solver import hint as _hint
from sudoku.solver import solve_with_trace as _solve_with_trace
from sudoku.variants import (
    VariantSolver,
    generate_variant as _generate_variant,
    solve_variant_with_trace as _solve_variant_with_trace,
    validate_variant_solution as _validate_variant_solution,
)


def generate(
    difficulty: str = "medium",
    seed: int | str | None = None,
    symmetric: bool = True,
) -> dict[str, Any]:
    """Generate a puzzle with guaranteed unique solution."""
    try:
        diff_enum = Difficulty.from_string(difficulty)
        generator = PuzzleGenerator()
        puzzle = generator.generate(diff_enum, seed=seed, symmetric=symmetric)
        return {
            "ok": True,
            "success": True,
            "difficulty": puzzle.difficulty.value,
            "clues": puzzle.clue_count,
            "effort_score": round(puzzle.effort_score, 2),
            "seed": str(seed) if seed is not None else str(puzzle.seed or ""),
            "symmetric": puzzle.is_symmetric,
            "puzzle": puzzle.to_string(),
            "solution": puzzle.solution.to_string(),
            "stats": puzzle.stats.to_dict(),
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "success": False, "error": str(e)}


def solve(grid_str: str) -> dict[str, Any]:
    """Solve an 81-character puzzle string."""
    try:
        grid = Grid.from_string(grid_str)
        solver = BacktrackingSolver()
        result = solver.solve_detailed(grid)
        if result.grid is None:
            return {"ok": False, "success": False, "error": "Puzzle is unsolvable."}
        return {
            "ok": True,
            "success": True,
            "solution": result.grid.to_string(),
            "stats": result.stats.to_dict(),
        }
    except InvalidGridError as e:
        return {"ok": False, "success": False, "error": f"Invalid grid: {e}"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "success": False, "error": str(e)}


def count_solutions(grid_str: str, limit: int = 2) -> dict[str, Any]:
    """Count solutions up to limit (0, 1, or limit)."""
    try:
        grid = Grid.from_string(grid_str)
        solver = BacktrackingSolver()
        count = solver.count_solutions(grid, limit=limit)
        return {"ok": True, "count": count}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "count": 0}


def check(grid_str: str) -> dict[str, Any]:
    """Check puzzle validity and uniqueness."""
    try:
        grid = Grid.from_string(grid_str)
        if not grid.is_valid():
            return {
                "ok": True,
                "valid": False,
                "solvable": False,
                "unique": False,
                "solutions_count": 0,
                "error": "Grid violates row, column, or 3x3 box rules.",
            }

        solver = BacktrackingSolver()
        cnt = solver.count_solutions(grid, limit=2)
        unique = cnt == 1

        tier = None
        effort = 0.0
        if unique:
            from sudoku.difficulty import DifficultyGrader

            grader = DifficultyGrader()
            t, _stats, effort = grader.grade(grid, solver)
            tier = t.value

        return {
            "ok": True,
            "valid": True,
            "solvable": cnt > 0,
            "unique": unique,
            "solutions_count": cnt,
            "clues": grid.clues,
            "difficulty": tier,
            "effort_score": round(effort, 2),
        }
    except Exception as e:  # noqa: BLE001
        return {
            "ok": False,
            "valid": False,
            "solvable": False,
            "unique": False,
            "solutions_count": 0,
            "error": str(e),
        }


def hint(grid_str: str) -> dict[str, Any]:
    """Get the next logical hint step for a puzzle."""
    try:
        grid = Grid.from_string(grid_str)
        h = _hint(grid)
        return {"ok": True, "success": True, **h}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "success": False, "error": str(e)}


from sudoku.naive import naive_backtrack_trace as _naive_backtrack_trace


def solve_naive_with_trace(
    grid_str: str,
    max_events: int = 20_000,
) -> dict[str, Any]:
    """Solve puzzle using pure naive row-major backtracking with conflict and backtrack tracing."""
    try:
        grid = Grid.from_string(grid_str)
        return _naive_backtrack_trace(grid, max_events=max_events)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "success": False, "error": str(e), "events": []}


def solve_with_trace(
    grid_str: str,
    mode: str = "propagate",
    max_events: int = 50_000,
) -> dict[str, Any]:
    """Solve puzzle and collect step-by-step trace events."""
    try:
        if mode in ("naive_backtrack", "naive_red"):
            return solve_naive_with_trace(grid_str, max_events=min(max_events, 20_000))
        grid = Grid.from_string(grid_str)
        return _solve_with_trace(grid, mode=mode, max_events=max_events)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "success": False, "error": str(e), "events": []}


def level_spec(level: int) -> dict[str, Any]:
    """Get specification for level n."""
    try:
        spec = _level_spec(level)
        return {"ok": True, **spec.to_dict()}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


def generate_level(level: int) -> dict[str, Any]:
    """Generate puzzle and metadata for level n."""
    try:
        res = _generate_level(level)
        res["ok"] = True
        res["success"] = True
        return res
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "success": False, "error": str(e)}


def generate_levels(start: int, count: int) -> list[dict[str, Any]]:
    """Batch generate multiple levels (e.g. for prefetching)."""
    levels: list[dict[str, Any]] = []
    for lvl in range(start, start + count):
        levels.append(generate_level(lvl))
    return levels


# ---------------------------------------------------------------------------
# Diagonal variant API
# ---------------------------------------------------------------------------



def generate_diagonal_puzzle(
    difficulty: str = "medium",
    seed: int | str | None = None,
    symmetric: bool = True,
) -> dict[str, Any]:
    """Generate a Diagonal Sudoku puzzle with guaranteed unique solution."""
    return _generate_diagonal(difficulty=difficulty, seed=seed, symmetric=symmetric)


def solve_diagonal_with_trace(
    grid_str: str,
    max_events: int = 50_000,
) -> dict[str, Any]:
    """Solve a Diagonal Sudoku puzzle with step-by-step trace events."""
    return _solve_diagonal_with_trace(grid_str=grid_str, max_events=max_events)


def validate_diagonal_solution(grid_str: str) -> dict[str, Any]:
    """Validate a completed Diagonal Sudoku grid (classic + diagonal constraints)."""
    return _validate_diagonal_solution(grid_str=grid_str)


def variant_info(variant: str = "classic") -> dict[str, Any]:
    """Return metadata and extra constraint group indices for a variant."""
    try:
        meta = VARIANT_META.get(variant)
        if meta is None:
            return {"ok": False, "error": f"Unknown variant: {variant!r}"}
        extra_groups = get_extra_groups(variant)
        return {
            "ok": True,
            "variant": variant,
            "name": meta["name"],
            "description": meta["description"],
            "extra_groups": extra_groups,
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}




def generate_variant_puzzle(
    variant: str = "classic",
    difficulty: str = "medium",
    seed: int | str | None = None,
    symmetric: bool = True,
) -> dict[str, Any]:
    """Generate a puzzle for any supported variant with guaranteed unique solution."""
    v = variant.replace("-", "_")
    if v == "classic":
        return generate(difficulty=difficulty, seed=seed, symmetric=symmetric)
    if v == "diagonal":
        return _generate_diagonal(difficulty=difficulty, seed=seed, symmetric=symmetric)
    return _generate_variant(
        variant=v, difficulty=difficulty, seed=seed, symmetric=symmetric
    )


def solve_variant_puzzle_with_trace(
    variant: str,
    grid_str: str,
    max_events: int = 50_000,
) -> dict[str, Any]:
    """Solve any variant puzzle with step-by-step trace events."""
    v = variant.replace("-", "_")
    if v == "classic":
        return solve_with_trace(grid_str=grid_str, mode="propagate", max_events=max_events)
    if v == "diagonal":
        return _solve_diagonal_with_trace(grid_str=grid_str, max_events=max_events)
    return _solve_variant_with_trace(
        variant=v, grid_str=grid_str, max_events=max_events
    )


def validate_variant_puzzle_solution(variant: str, grid_str: str) -> dict[str, Any]:
    """Validate a completed or in-progress puzzle against classic and variant constraints."""
    v = variant.replace("-", "_")
    if v == "classic":
        try:
            grid = Grid.from_string(grid_str)
            valid = grid.is_valid()
            complete = grid.is_complete()
            solvable = False
            if valid:
                solver = BacktrackingSolver()
                solvable = solver.count_solutions(grid, limit=1) > 0
            return {
                "ok": True,
                "valid": valid,
                "is_complete": complete,
                "solvable": solvable,
                "classic_valid": valid,
            }
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)}

    if v == "diagonal":
        diag_res = _validate_diagonal_solution(grid_str=grid_str)
        if diag_res.get("ok"):
            try:
                g = Grid.from_string(grid_str)
                diag_res["is_complete"] = g.is_complete()
                if diag_res.get("valid"):
                    if g.is_complete():
                        diag_res["solvable"] = True
                    else:
                        from sudoku.diagonal import DiagonalSolver
                        diag_res["solvable"] = DiagonalSolver().count_solutions(g, limit=1) > 0
                else:
                    diag_res["solvable"] = False
            except Exception:
                pass
        return diag_res

    var_res = _validate_variant_solution(variant=v, grid_str=grid_str)
    if var_res.get("ok"):
        try:
            g = Grid.from_string(grid_str)
            var_res["is_complete"] = g.is_complete()
            if var_res.get("valid"):
                if g.is_complete():
                    var_res["solvable"] = True
                else:
                    var_res["solvable"] = VariantSolver(v).count_solutions(g, limit=1) > 0
            else:
                var_res["solvable"] = False
        except Exception:
            pass
    return var_res


