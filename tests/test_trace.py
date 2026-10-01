"""Tests for solver tracing, replay, and hint logic."""

from sudoku.grid import Grid
from sudoku.solver import BacktrackingSolver, hint, solve_with_trace
from sudoku.trace import TraceEvent, TraceListener


def test_solve_with_trace_basic() -> None:
    puzzle = "81572349646251983779368412552784631963495178218937256494613527835826794127149865."
    grid = Grid.from_string(puzzle)
    result = solve_with_trace(grid, mode="propagate", max_events=1000)
    assert result["success"] is True
    assert result["solution"] is not None
    assert result["solution"][80] == "3"
    assert result["truncated"] is False
    assert len(result["events"]) > 0

    # First event should be init
    assert result["events"][0]["type"] == "init"
    # Last events should be solution and done
    types = [e["type"] for e in result["events"]]
    assert "solution" in types
    assert "done" in types


def test_solve_with_trace_replay_matches_solution() -> None:
    """Replaying events from init must reproduce the solver's final grid."""
    puzzle = "....6.8..768.394.52.5.....7..7498....3.7.5.4....6137..4.....1.39.318.654..6.5...."
    grid = Grid.from_string(puzzle)
    result = solve_with_trace(grid, mode="propagate", max_events=50000)
    assert result["success"] is True
    sol_str = result["solution"]

    # Replay
    board = [0] * 81
    # Stack of placements per depth for backtracks
    history: list[tuple[int, int]] = []  # (cell_index, prev_val)

    for event in result["events"]:
        etype = event["type"]
        if etype == "init":
            for idx, ch in enumerate(event["givens"]):
                if ch != ".":
                    board[idx] = int(ch)
        elif etype in ("naked_single", "hidden_single", "branch"):
            r, c = event["cell_rc"]
            idx = r * 9 + c
            history.append((idx, board[idx]))
            board[idx] = event["chosen_digit"] if etype == "branch" else event["digit"]
        elif etype == "backtrack":
            # Undone placements count
            undone = event["undone_count"]
            for _ in range(undone):
                if history:
                    idx, prev = history.pop()
                    board[idx] = prev

    replayed = "".join(str(d) for d in board)
    assert replayed == sol_str


def test_naive_vs_propagate_agreement() -> None:
    """Naive backtracking and constraint propagation agree on solution."""
    puzzle = "26914358.457928316831567492693782145172459863584316279748295631326871954915634728"
    grid = Grid.from_string(puzzle)

    res_prop = solve_with_trace(grid, mode="propagate", max_events=5000)
    res_naive = solve_with_trace(grid, mode="naive", max_events=5000)

    assert res_prop["success"] is True
    assert res_naive["success"] is True
    assert res_prop["solution"] == res_naive["solution"]


def test_naive_node_limit() -> None:
    """Naive search respects max_events and stops gracefully."""
    puzzle = "................................................................................."
    grid = Grid.from_string(puzzle)
    res = solve_with_trace(grid, mode="naive", max_events=50)
    assert res["truncated"] is True
    assert len(res["events"]) <= 55


def test_trace_explanations() -> None:
    """Every trace event must carry a non-empty human-readable explanation."""
    puzzle = "....6.8..768.394.52.5.....7..7498....3.7.5.4....6137..4.....1.39.318.654..6.5...."
    grid = Grid.from_string(puzzle)
    res = solve_with_trace(grid, mode="propagate", max_events=1000)
    for event in res["events"]:
        assert "explanation" in event
        assert isinstance(event["explanation"], str)
        assert len(event["explanation"]) > 0


def test_trace_determinism() -> None:
    """Trace events are deterministic on the same puzzle."""
    puzzle = "....6.8..768.394.52.5.....7..7498....3.7.5.4....6137..4.....1.39.318.654..6.5...."
    grid = Grid.from_string(puzzle)
    res1 = solve_with_trace(grid, mode="propagate", max_events=500)
    res2 = solve_with_trace(grid, mode="propagate", max_events=500)
    assert res1["events"][:-1] == res2["events"][:-1]
    done1 = dict(res1["events"][-1])
    done2 = dict(res2["events"][-1])
    done1["stats"] = {k: v for k, v in done1["stats"].items() if k != "time_elapsed_seconds"}
    done2["stats"] = {k: v for k, v in done2["stats"].items() if k != "time_elapsed_seconds"}
    assert done1 == done2


def test_hint_singles_and_reveal() -> None:
    """Test hint logic: naked single, hidden single, and reveal."""
    # Naked single: cell (0, 0) has only 1 candidate
    puzzle_naked = "81572349.462519837793684125527846319634951782189372564946135278358267941271498653"
    grid = Grid.from_string(puzzle_naked)
    h = hint(grid)
    assert h["technique"] in ("naked_single", "hidden_single")
    assert h["cell"] == [0, 8]
    assert h["value"] == 6
    assert "explanation" in h

    # Solved grid has no hint
    solved = "815723496462519837793684125527846319634951782189372564946135278358267941271498653"
    h_solved = hint(Grid.from_string(solved))
    assert h_solved["technique"] == "none"

    # Reveal hint on empty grid (no singles)
    h_empty = hint(Grid.empty())
    assert h_empty["technique"] == "reveal"
    assert 1 <= h_empty["value"] <= 9


def test_trace_listener_zero_overhead() -> None:
    """Solver with listener=None runs quickly without overhead."""
    puzzle = "....6.8..768.394.52.5.....7..7498....3.7.5.4....6137..4.....1.39.318.654..6.5...."
    grid = Grid.from_string(puzzle)
    solver = BacktrackingSolver()
    sol1 = solver.solve(grid)
    assert sol1 is not None

    class CountingListener(TraceListener):
        def __init__(self) -> None:
            self.count = 0

        def on_event(self, event: TraceEvent) -> None:
            self.count += 1

    listener = CountingListener()
    solver_traced = BacktrackingSolver(listener=listener)
    sol2 = solver_traced.solve(grid)
    assert sol2 == sol1
    assert listener.count > 0
