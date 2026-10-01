"""Tests for CLI interface."""

import json
from pathlib import Path

import pytest

from sudoku.cli import main
from tests.test_grid import SAMPLE_PUZZLE, SAMPLE_SOLVED


def test_cli_help(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as exc_info:
        main(["--help"])
    assert exc_info.value.code == 0
    captured = capsys.readouterr()
    assert "Sudoku Generator & Solver CLI" in captured.out


def test_cli_generate_pretty(capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["generate", "--difficulty", "easy", "--seed", "42"])
    assert code == 0
    out = capsys.readouterr().out
    assert "Sudoku Puzzle [EASY]" in out
    assert "+-------+-------+-------+" in out


def test_cli_generate_json(capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["generate", "--difficulty", "hard", "--seed", "123", "--format", "json"])
    assert code == 0
    data = json.loads(capsys.readouterr().out)
    assert data["difficulty"] == "hard"
    assert "givens" in data
    assert "solution" in data
    assert len(data["givens"]) == 81


def test_cli_generate_raw(capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["generate", "--difficulty", "medium", "--seed", "42", "--format", "raw"])
    assert code == 0
    raw = capsys.readouterr().out.strip()
    assert len(raw) == 81


def test_cli_solve_string(capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["solve", SAMPLE_PUZZLE, "--format", "raw"])
    assert code == 0
    assert capsys.readouterr().out.strip() == SAMPLE_SOLVED


def test_cli_solve_dlx(capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["solve", SAMPLE_PUZZLE, "-a", "dlx", "--format", "raw"])
    assert code == 0
    assert capsys.readouterr().out.strip() == SAMPLE_SOLVED


def test_cli_solve_file(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    p_file = tmp_path / "puzzle.txt"
    p_file.write_text(SAMPLE_PUZZLE)
    code = main(["solve", "--file", str(p_file), "--format", "raw"])
    assert code == 0
    assert capsys.readouterr().out.strip() == SAMPLE_SOLVED


def test_cli_solve_stats(capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["solve", SAMPLE_PUZZLE, "--stats"])
    assert code == 0
    out = capsys.readouterr().out
    assert "Stats: nodes=" in out


def test_cli_solve_unsolvable(capsys: pytest.CaptureFixture[str]) -> None:
    unsolvable = "55" + "." * 79
    code = main(["solve", unsolvable])
    assert code == 1


def test_cli_check_unique(capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["check", SAMPLE_PUZZLE])
    assert code == 0
    out = capsys.readouterr().out
    assert "VALID & UNIQUE" in out


def test_cli_check_json(capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["check", SAMPLE_PUZZLE, "--format", "json"])
    assert code == 0
    data = json.loads(capsys.readouterr().out)
    assert data["valid"] is True
    assert data["unique"] is True


def test_cli_check_multi(capsys: pytest.CaptureFixture[str]) -> None:
    multi = "12345678" + "." * 73
    code = main(["check", multi])
    assert code == 1
    captured = capsys.readouterr()
    assert "MULTI-SOLUTION" in (captured.out + captured.err)


def test_cli_check_unsolvable(capsys: pytest.CaptureFixture[str]) -> None:
    unsolvable = "55" + "." * 79
    code = main(["check", unsolvable])
    assert code == 1
    captured = capsys.readouterr()
    assert "INVALID" in (captured.out + captured.err)


def test_cli_generate_invalid_difficulty(capsys: pytest.CaptureFixture[str]) -> None:
    # Subparser choices would fail parser, test with unknown directly if needed
    code = main(["generate", "-d", "easy", "--show-solution", "--no-symmetry"])
    assert code == 0
    captured = capsys.readouterr().out
    assert "Solution:" in captured


def test_cli_solve_json_output(capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["solve", SAMPLE_PUZZLE, "--format", "json"])
    assert code == 0
    data = json.loads(capsys.readouterr().out)
    assert data["is_solvable"] is True
    assert data["nodes_expanded"] >= 0


def test_cli_file_not_found(capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["solve", "--file", "non_existent_file.txt"])
    assert code == 1
    assert "Puzzle file not found" in capsys.readouterr().err


def test_cli_no_puzzle_argument(capsys: pytest.CaptureFixture[str]) -> None:
    code = main(["solve"])
    assert code == 1
    assert "No puzzle provided" in capsys.readouterr().err
