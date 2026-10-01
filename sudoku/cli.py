"""Command-Line Interface (CLI) for Sudoku Generator & Solver."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from sudoku.difficulty import Difficulty, DifficultyGrader
from sudoku.generator import PuzzleGenerator
from sudoku.grid import Grid, InvalidGridError
from sudoku.solver import BacktrackingSolver, Solver


def _load_puzzle_input(puzzle_arg: str | None, file_arg: str | None) -> str:
    """Read puzzle string either from argument or file."""
    if file_arg:
        path = Path(file_arg)
        if not path.is_file():
            raise FileNotFoundError(f"Puzzle file not found: {file_arg}")
        return path.read_text(encoding="utf-8")
    if puzzle_arg:
        return puzzle_arg
    raise ValueError("No puzzle provided. Specify a puzzle string or use --file.")


def cmd_generate(args: argparse.Namespace) -> int:
    """Execute 'sudoku generate' command."""
    try:
        diff = Difficulty.from_string(args.difficulty)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    generator = PuzzleGenerator()
    puzzle = generator.generate(
        difficulty=diff,
        seed=args.seed,
        symmetric=not args.no_symmetry,
    )

    if args.format == "json":
        data = {
            "difficulty": puzzle.difficulty.value,
            "clues": puzzle.clue_count,
            "seed": puzzle.seed,
            "symmetric": puzzle.is_symmetric,
            "effort_score": puzzle.effort_score,
            "givens": puzzle.to_string(),
            "solution": puzzle.solution.to_string(),
        }
        print(json.dumps(data, indent=2))
    elif args.format == "raw":
        print(puzzle.to_string())
        if args.show_solution:
            print(puzzle.solution.to_string())
    else:
        print(str(puzzle))
        if args.show_solution:
            print("\nSolution:")
            print(puzzle.solution.pretty())

    return 0


def cmd_solve(args: argparse.Namespace) -> int:
    """Execute 'sudoku solve' command."""
    try:
        raw_text = _load_puzzle_input(args.puzzle, args.file)
        grid = Grid.from_string(raw_text)
    except (ValueError, FileNotFoundError, InvalidGridError) as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    if args.algorithm == "dlx":
        try:
            from tests.reference.dlx import DLXSolver
            solver: Solver = DLXSolver()
        except ImportError:
            print("Error: DLX reference solver is only available in test environment.", file=sys.stderr)
            return 1
    else:
        solver = BacktrackingSolver()

    result = solver.solve(grid)

    if result is None:
        print("Error: Puzzle is unsolvable or has no valid solutions.", file=sys.stderr)
        return 1

    stats = solver.get_last_stats()

    if args.format == "json":
        data = {
            "is_solvable": True,
            "algorithm": args.algorithm,
            "solution": result.to_string(),
            "nodes_expanded": stats.nodes_expanded,
            "backtracks": stats.backtracks,
            "max_depth": stats.max_depth,
            "time_elapsed_seconds": stats.time_elapsed_seconds,
        }
        print(json.dumps(data, indent=2))
    elif args.format == "raw":
        print(result.to_string())
    else:
        print(result.pretty())
        if args.stats:
            print(
                f"\nStats: nodes={stats.nodes_expanded}, "
                f"backtracks={stats.backtracks}, "
                f"max_depth={stats.max_depth}, "
                f"time={stats.time_elapsed_seconds * 1000:.2f}ms"
            )

    return 0


def cmd_check(args: argparse.Namespace) -> int:
    """Execute 'sudoku check' command."""
    try:
        raw_text = _load_puzzle_input(args.puzzle, args.file)
        grid = Grid.from_string(raw_text)
    except (ValueError, FileNotFoundError, InvalidGridError) as e:
        print(f"Status: INVALID - {e}", file=sys.stderr)
        return 1

    if not grid.is_valid():
        print("Status: INVALID - violates row, column, or 3x3 box rules.", file=sys.stderr)
        return 1

    solver = BacktrackingSolver()
    count = solver.count_solutions(grid, limit=2)

    if count == 0:
        print("Status: UNSOLVABLE (0 solutions).", file=sys.stderr)
        return 1
    elif count == 2:
        print("Status: MULTI-SOLUTION (2 or more solutions).", file=sys.stderr)
        return 1

    # Exactly 1 solution: valid and unique!
    grader = DifficultyGrader()
    tier, stats, effort = grader.grade(grid, solver)

    if args.format == "json":
        data = {
            "valid": True,
            "unique": True,
            "clues": grid.clues,
            "difficulty": tier.value,
            "effort_score": effort,
            "nodes_expanded": stats.nodes_expanded,
            "backtracks": stats.backtracks,
        }
        print(json.dumps(data, indent=2))
    else:
        print("Status: VALID & UNIQUE (1 solution)")
        print(f"Difficulty: {tier.value.upper()}")
        print(f"Clues: {grid.clues}")
        print(f"Effort score: {effort:.1f} (nodes={stats.nodes_expanded}, backtracks={stats.backtracks})")

    return 0


def create_parser() -> argparse.ArgumentParser:
    """Build the CLI argument parser."""
    parser = argparse.ArgumentParser(
        prog="sudoku",
        description="Sudoku Generator & Solver CLI with constraint pruning and uniqueness guarantee.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Subcommand: generate
    p_gen = subparsers.add_parser("generate", help="Generate a unique-solution Sudoku puzzle.")
    p_gen.add_argument(
        "-d",
        "--difficulty",
        choices=["beginner", "easy", "medium", "hard", "expert"],
        default="medium",
        help="Difficulty tier (default: medium).",
    )
    p_gen.add_argument("-s", "--seed", help="Random seed (integer or string) for reproducibility.")
    p_gen.add_argument(
        "--no-symmetry",
        action="store_true",
        help="Disable 180° rotational symmetry.",
    )
    p_gen.add_argument(
        "--show-solution",
        action="store_true",
        help="Display solution along with the puzzle.",
    )
    p_gen.add_argument(
        "--format",
        choices=["pretty", "raw", "json"],
        default="pretty",
        help="Output format (default: pretty).",
    )
    p_gen.set_defaults(func=cmd_generate)

    # Subcommand: solve
    p_solve = subparsers.add_parser("solve", help="Solve an arbitrary 9x9 Sudoku puzzle.")
    p_solve.add_argument("puzzle", nargs="?", help="81-character puzzle string (. or 0 for blank).")
    p_solve.add_argument("-f", "--file", help="Path to text file containing puzzle.")
    p_solve.add_argument(
        "-a",
        "--algorithm",
        choices=["backtracking", "dlx"],
        default="backtracking",
        help="Solver algorithm (default: backtracking).",
    )
    p_solve.add_argument("--stats", action="store_true", help="Print solver statistics.")
    p_solve.add_argument(
        "--format",
        choices=["pretty", "raw", "json"],
        default="pretty",
        help="Output format (default: pretty).",
    )
    p_solve.set_defaults(func=cmd_solve)

    # Subcommand: check
    p_check = subparsers.add_parser("check", help="Verify validity and uniqueness of a puzzle.")
    p_check.add_argument("puzzle", nargs="?", help="81-character puzzle string (. or 0 for blank).")
    p_check.add_argument("-f", "--file", help="Path to text file containing puzzle.")
    p_check.add_argument(
        "--format",
        choices=["pretty", "json"],
        default="pretty",
        help="Output format (default: pretty).",
    )
    p_check.set_defaults(func=cmd_check)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Entry point for CLI execution."""
    parser = create_parser()
    args = parser.parse_args(argv)
    res: int = args.func(args)
    return res


if __name__ == "__main__":
    sys.exit(main())
