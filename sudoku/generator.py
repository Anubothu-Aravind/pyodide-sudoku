"""Sudoku PuzzleGenerator with unique-solution guarantee and selectable difficulty."""

from __future__ import annotations

import random

from sudoku.difficulty import Difficulty, DifficultyGrader
from sudoku.grid import TOTAL_CELLS, Grid
from sudoku.puzzle import Puzzle
from sudoku.solver import BacktrackingSolver


class PuzzleGenerator:
    """Generates unique-solution Sudoku puzzles across 5 difficulty tiers.

    Guarantees:
    - Exactly one unique solution for every generated puzzle.
    - Deterministic generation when a seed is provided.
    - Optional 180° rotational symmetry.
    """

    def __init__(
        self,
        solver: BacktrackingSolver | None = None,
        grader: DifficultyGrader | None = None,
    ) -> None:
        self.solver = solver or BacktrackingSolver()
        self.grader = grader or DifficultyGrader()

    def generate(
        self,
        difficulty: Difficulty | str = Difficulty.MEDIUM,
        seed: int | str | None = None,
        symmetric: bool = True,
        max_attempts: int = 15,
    ) -> Puzzle:
        """Generate a Sudoku puzzle with a guaranteed unique solution.

        Args:
            difficulty: Target difficulty level (beginner, easy, medium, hard, expert).
            seed: Optional integer or string seed for deterministic output.
            symmetric: Whether to use 180° rotational symmetry during clue removal.
            max_attempts: Maximum retry attempts to match target difficulty tier.

        Returns:
            Puzzle instance containing givens, solution, difficulty, and stats.
        """
        if isinstance(difficulty, str):
            target_diff = Difficulty.from_string(difficulty)
        else:
            target_diff = difficulty

        rng = self._create_rng(seed)
        clue_spec = self.grader.clue_ranges[target_diff]

        best_puzzle: Puzzle | None = None
        min_diff_distance = 999.0

        for attempt in range(max_attempts):
            # 1. Build a complete valid 9x9 grid using randomized backtracking
            full_grid = self._generate_full_grid(rng)

            # 2. Carve clues out while preserving uniqueness
            puzzle_grid, is_sym = self._carve_clues(
                full_grid=full_grid,
                target_clues=clue_spec.target_clues,
                min_clues=clue_spec.min_clues,
                symmetric=symmetric,
                rng=rng,
            )

            # 3. Grade the generated puzzle
            actual_tier, stats, effort = self.grader.grade(puzzle_grid, self.solver)

            candidate_puzzle = Puzzle(
                givens=puzzle_grid,
                solution=full_grid,
                difficulty=actual_tier,
                clue_count=puzzle_grid.clues,
                effort_score=effort,
                stats=stats,
                is_symmetric=is_sym,
                seed=seed,
            )

            # If it strictly matches target tier, return immediately
            if actual_tier == target_diff:
                return candidate_puzzle

            # Track closest candidate by clue distance and tier rank
            tier_ranks = {
                Difficulty.BEGINNER: 1,
                Difficulty.EASY: 2,
                Difficulty.MEDIUM: 3,
                Difficulty.HARD: 4,
                Difficulty.EXPERT: 5,
            }
            rank_diff = abs(tier_ranks[actual_tier] - tier_ranks[target_diff])
            clue_diff = abs(puzzle_grid.clues - clue_spec.target_clues)
            dist = rank_diff * 10.0 + clue_diff

            if dist < min_diff_distance:
                min_diff_distance = dist
                best_puzzle = candidate_puzzle

        # Fall back to the nearest tier candidate found
        assert best_puzzle is not None
        return best_puzzle

    @staticmethod
    def _create_rng(seed: int | str | None) -> random.Random:
        if seed is None:
            return random.Random()
        if isinstance(seed, str):
            # Hash string seed into integer
            import hashlib
            seed_int = int(hashlib.sha256(seed.encode("utf-8")).hexdigest(), 16) % (2**32)
            return random.Random(seed_int)
        return random.Random(seed)

    def _generate_full_grid(self, rng: random.Random) -> Grid:
        """Generate a random fully solved valid Sudoku grid."""
        solver = BacktrackingSolver(rng=rng)
        grid = solver.solve(Grid.empty())
        if grid is None or not grid.is_complete():
            raise RuntimeError("Failed to generate complete valid grid")
        return grid

    def _carve_clues(
        self,
        full_grid: Grid,
        target_clues: int,
        min_clues: int,
        symmetric: bool,
        rng: random.Random,
    ) -> tuple[Grid, bool]:
        """Carve clues from full grid, ensuring uniqueness after every removal."""
        cells = list(full_grid.cells)
        current_clues = TOTAL_CELLS
        is_symmetric = symmetric

        if symmetric:
            # 41 pairs under 180° rotational symmetry (cell and 80 - cell)
            pairs: list[tuple[int, int]] = []
            for idx in range(41):
                sym_idx = 80 - idx
                pairs.append((idx, sym_idx))

            rng.shuffle(pairs)

            for a, b in pairs:
                if current_clues <= target_clues:
                    break

                old_a, old_b = cells[a], cells[b]
                cells[a] = 0
                cells[b] = 0

                # Check if puzzle still has exactly one solution
                test_grid = Grid(cells)
                if self.solver.count_solutions(test_grid, limit=2) == 1:
                    current_clues -= 2 if a != b else 1
                else:
                    # Contradiction or multiple solutions: restore
                    cells[a] = old_a
                    cells[b] = old_b

        # If symmetric removal didn't reach target_clues or if asymmetric requested:
        if current_clues > target_clues or not symmetric:
            remaining = [i for i in range(TOTAL_CELLS) if cells[i] != 0]
            rng.shuffle(remaining)

            for idx in remaining:
                if current_clues <= target_clues:
                    break

                old_val = cells[idx]
                cells[idx] = 0
                test_grid = Grid(cells)

                if self.solver.count_solutions(test_grid, limit=2) == 1:
                    current_clues -= 1
                    if symmetric:
                        is_symmetric = False
                else:
                    cells[idx] = old_val

        return Grid(cells), is_symmetric
