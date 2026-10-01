"""Unit tests for naive row-major backtracking trace solver."""

from sudoku.grid import CELL_PEERS, Grid
from sudoku.naive import naive_backtrack_trace
from sudoku.solver import BacktrackingSolver


def test_naive_easy_puzzle_matches_known_solution() -> None:
    # 1 clue missing from complete puzzle
    puzzle = "81572349646251983779368412552784631963495178218937256494613527835826794127149865."
    res = naive_backtrack_trace(puzzle)
    assert res["success"] is True
    assert res["solution"] is not None
    assert res["solution"][80] == "3"

    # Also test an easy puzzle with multiple empty cells
    easy_puzzle = "8157234964625198377936841255278463196349517821893725649461352783582679412714986.."
    smart_solver = BacktrackingSolver()
    expected = smart_solver.solve(Grid.from_string(easy_puzzle))
    assert expected is not None

    res2 = naive_backtrack_trace(easy_puzzle)
    assert res2["success"] is True
    assert res2["solution"] == expected.to_string()


def test_naive_puzzle_needing_backtracking_and_valid_conflicts() -> None:
    # A standard puzzle that requires backtracking in naive row-major search
    puzzle = "....6.8..768.394.52.5.....7..7498....3.7.5.4....6137..4.....1.39.318.654..6.5...."
    res = naive_backtrack_trace(puzzle, max_events=20_000)
    assert res["ok"] is True
    assert res["success"] is True

    events = res["events"]
    backtrack_events = [e for e in events if e["type"] == "backtrack"]
    conflict_events = [e for e in events if e["type"] == "conflict"]

    assert len(backtrack_events) > 0, "Puzzle should have generated at least one backtrack event"
    assert len(conflict_events) > 0, "Puzzle should have generated conflict events"

    # Verify that every conflict event really conflicts against the active board state
    board = [0] * 81
    for ev in events:
        etype = ev["type"]
        if etype == "init":
            for i, ch in enumerate(ev["givens"]):
                if ch != "." and ch != "0":
                    board[i] = int(ch)
        elif etype == "place":
            cell = ev["cell"]
            board[cell] = ev["digit"]
        elif etype == "backtrack":
            cell = ev["cell"]
            board[cell] = 0
        elif etype == "conflict":
            cell = ev["cell"]
            digit = ev["digit"]
            with_cells = ev["with"]
            assert len(with_cells) > 0, f"Conflict at cell {cell} had empty 'with' list"
            for p in with_cells:
                # Must be a peer
                assert p in CELL_PEERS[cell], f"Cell {p} is not a peer of {cell}"
                # Must contain the conflicting digit on the active board
                assert board[p] == digit, f"Expected conflicting cell {p} to have digit {digit}, got {board[p]}"


def test_naive_step_cap() -> None:
    # Use a hard puzzle and small step cap
    puzzle = "....6.8..768.394.52.5.....7..7498....3.7.5.4....6137..4.....1.39.318.654..6.5...."
    cap = 150
    res = naive_backtrack_trace(puzzle, max_events=cap)
    assert res["success"] is False
    assert len(res["events"]) == cap
    assert "step limit" in res["error"].lower()
    assert res["solution"] is None
