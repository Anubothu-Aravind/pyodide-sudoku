"""Naive Backtracking Sudoku Solver with conflict and backtrack event tracing."""

from __future__ import annotations

import time
from typing import Any

from sudoku.grid import CELL_COL, CELL_PEERS, CELL_ROW, Grid


def naive_backtrack_trace(
    puzzle: str | Grid,
    max_events: int = 20_000,
) -> dict[str, Any]:
    """Solve puzzle with pure naive row-major backtracking, emitting place/conflict/backtrack events.

    Walks empty cells in row-major order, trying digits 1..9 in order.
    Emits events:
      - place: {cell, digit}
      - conflict: {cell, digit, with: [conflicting_cells]}
      - backtrack: {cell}
    Caps at `max_events` and returns success=False with a "step limit" message if reached.
    """
    start_time = time.perf_counter()
    if isinstance(puzzle, str):
        grid = Grid.from_string(puzzle)
    else:
        grid = puzzle

    givens_str = grid.to_string()
    cells = list(grid.cells)
    empty_cells = [i for i, v in enumerate(cells) if v == 0]

    if not grid.is_valid():
        return {
            "ok": False,
            "success": False,
            "error": "Invalid puzzle.",
            "mode": "naive",
            "solution": None,
            "events": [],
            "stats": {"tries": 0, "backtracks": 0, "nodes_expanded": 0},
        }

    # Init event
    events: list[dict[str, Any]] = [
        {
            "type": "init",
            "event_type": "init",
            "explanation": f"Naive backtracking initialized with {grid.clues} given clues.",
            "givens": givens_str,
            "candidates": [list(range(1, 10)) if v == 0 else [v] for v in cells],
        }
    ]

    tries = 0
    backtracks = 0
    hit_step_limit = False

    ptr = 0
    num_empty = len(empty_cells)
    next_digits = [1] * num_empty

    while 0 <= ptr < num_empty:
        cell = empty_cells[ptr]
        d = next_digits[ptr]

        if d > 9:
            # Dead end at this cell: clear it and backtrack to previous empty cell
            cells[cell] = 0
            next_digits[ptr] = 1  # reset for subsequent visits
            backtracks += 1
            r, c = CELL_ROW[cell], CELL_COL[cell]
            events.append({
                "type": "backtrack",
                "event_type": "backtrack",
                "cell": cell,
                "cell_rc": [r, c],
                "explanation": f"Backtracking: cleared R{r + 1}C{c + 1} (all digits 1-9 exhausted).",
            })
            if len(events) >= max_events:
                hit_step_limit = True
                break
            ptr -= 1
            continue

        # Advance next digit for this cell
        next_digits[ptr] += 1
        tries += 1

        # Check conflicts against already-filled peers
        confs = [p for p in CELL_PEERS[cell] if cells[p] == d]
        r, c = CELL_ROW[cell], CELL_COL[cell]

        if confs:
            events.append({
                "type": "conflict",
                "event_type": "conflict",
                "cell": cell,
                "cell_rc": [r, c],
                "digit": d,
                "with": confs,
                "explanation": f"Conflict: placing {d} at R{r + 1}C{c + 1} conflicts with {len(confs)} cell(s).",
            })
            if len(events) >= max_events:
                hit_step_limit = True
                break
            # Try next digit at this same cell
            continue
        else:
            # Valid placement
            cells[cell] = d
            events.append({
                "type": "place",
                "event_type": "place",
                "cell": cell,
                "cell_rc": [r, c],
                "digit": d,
                "explanation": f"Placing {d} at R{r + 1}C{c + 1}.",
            })
            if len(events) >= max_events:
                hit_step_limit = True
                break
            # Advance to next empty cell
            ptr += 1

    time_elapsed = time.perf_counter() - start_time

    if hit_step_limit:
        return {
            "ok": False,
            "success": False,
            "error": f"Step limit of {max_events} reached before solving.",
            "mode": "naive",
            "solution": None,
            "is_solvable": False,
            "stats": {
                "tries": tries,
                "backtracks": backtracks,
                "nodes_expanded": tries,
                "max_depth": num_empty,
                "time_elapsed_seconds": round(time_elapsed, 5),
            },
            "truncated": True,
            "events": events[:max_events],
        }

    success = ptr == num_empty
    solved_str = "".join(str(v) for v in cells) if success else None

    if success:
        events.append({
            "type": "solution",
            "event_type": "solution",
            "explanation": "Naive backtracking solved the puzzle!",
            "grid": solved_str or "",
        })
        events.append({
            "type": "done",
            "event_type": "done",
            "explanation": f"Naive search completed in {tries} tries and {backtracks} backtracks.",
            "stats": {
                "tries": tries,
                "backtracks": backtracks,
                "nodes_expanded": tries,
                "max_depth": num_empty,
                "time_elapsed_seconds": round(time_elapsed, 5),
            },
            "solution_count": 1,
        })

    return {
        "ok": success,
        "success": success,
        "mode": "naive",
        "solution": solved_str,
        "is_solvable": success,
        "stats": {
            "tries": tries,
            "backtracks": backtracks,
            "nodes_expanded": tries,
            "max_depth": num_empty,
            "time_elapsed_seconds": round(time_elapsed, 5),
        },
        "truncated": False,
        "events": events,
    }
