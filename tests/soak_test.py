"""Soak test script to verify 100% uniqueness and correctness across many puzzles."""

from __future__ import annotations

import argparse
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sudoku.difficulty import Difficulty
from sudoku.generator import PuzzleGenerator
from sudoku.solver import BacktrackingSolver
from tests.reference.dlx import DLXSolver


def _verify_single_puzzle(args: tuple[int, bool]) -> tuple[bool, str]:
    """Worker task for multiprocessing."""
    seed_idx, cross_validate_dlx = args
    generator = PuzzleGenerator()
    bt_solver = BacktrackingSolver()
    dlx_solver = DLXSolver() if cross_validate_dlx else None

    difficulties = list(Difficulty)
    target_diff = difficulties[seed_idx % len(difficulties)]
    seed = seed_idx * 17 + 101

    try:
        p = generator.generate(target_diff, seed=seed)

        # 1. Backtracking count must be exactly 1
        bt_count = bt_solver.count_solutions(p.givens, limit=2)
        if bt_count != 1:
            return False, f"Puzzle {seed_idx} has {bt_count} solutions with BT"

        # 2. DLX count must be exactly 1
        if dlx_solver:
            dlx_count = dlx_solver.count_solutions(p.givens, limit=2)
            if dlx_count != 1:
                return False, f"Puzzle {seed_idx} has {dlx_count} solutions with DLX"

        # 3. Solved grid must match stored solution
        solved = bt_solver.solve(p.givens)
        if solved != p.solution:
            return False, f"Puzzle {seed_idx} solved grid != stored solution"

        return True, ""
    except Exception as e:  # noqa: BLE001
        return False, f"Puzzle {seed_idx} raised {type(e).__name__}: {e}"


def run_soak_test(count: int = 100, cross_validate_dlx: bool = True, workers: int | None = None) -> int:
    """Run soak test generating `count` puzzles and verifying uniqueness."""
    max_workers = workers or os.cpu_count() or 4
    print(f"Starting soak test: {count} puzzles with {max_workers} workers (cross_validate_dlx={cross_validate_dlx})...")
    start_time = time.perf_counter()
    failures = 0
    completed = 0

    tasks = [(i, cross_validate_dlx) for i in range(count)]

    if max_workers == 1:
        for t in tasks:
            ok, err = _verify_single_puzzle(t)
            if not ok:
                print(f"FAILED: {err}", file=sys.stderr)
                failures += 1
            completed += 1
            if completed % 100 == 0 or completed == count:
                elapsed = time.perf_counter() - start_time
                print(f"Progress: {completed}/{count} verified unique ({completed / elapsed:.1f} puzzles/sec)")
    else:
        with ProcessPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(_verify_single_puzzle, t) for t in tasks]
            for future in as_completed(futures):
                ok, err = future.result()
                if not ok:
                    print(f"FAILED: {err}", file=sys.stderr)
                    failures += 1
                completed += 1
                if completed % 500 == 0 or completed == count:
                    elapsed = time.perf_counter() - start_time
                    print(f"Progress: {completed}/{count} verified unique ({completed / elapsed:.1f} puzzles/sec)")

    total_time = time.perf_counter() - start_time
    print(
        f"\nSoak test completed: {count - failures}/{count} passed "
        f"({total_time:.2f}s total, {count/total_time:.1f} puzzles/sec)"
    )

    return 0 if failures == 0 else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sudoku Generator Soak Test")
    parser.add_argument("-n", "--count", type=int, default=100, help="Number of puzzles to generate and verify")
    parser.add_argument("--no-dlx", action="store_true", help="Skip DLX cross-validation for speed")
    parser.add_argument("-w", "--workers", type=int, default=None, help="Worker processes")
    args = parser.parse_args()

    sys.exit(run_soak_test(count=args.count, cross_validate_dlx=not args.no_dlx, workers=args.workers))
