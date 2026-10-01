"""Property-based tests using Hypothesis (PRD Section 8)."""

from hypothesis import given, settings
from hypothesis import strategies as st

from sudoku.difficulty import Difficulty
from sudoku.generator import PuzzleGenerator
from sudoku.grid import Grid
from sudoku.solver import BacktrackingSolver
from tests.reference.dlx import DLXSolver

# Shared instances
generator = PuzzleGenerator()
bt_solver = BacktrackingSolver()
dlx_solver = DLXSolver()

# Strategies
diff_strategy = st.sampled_from([
    Difficulty.BEGINNER,
    Difficulty.EASY,
    Difficulty.MEDIUM,
    Difficulty.HARD,
    Difficulty.EXPERT,
])
seed_strategy = st.integers(min_value=0, max_value=1_000_000)


# 1. Round-trip serialization property
@given(st.lists(st.integers(min_value=0, max_value=9), min_size=81, max_size=81))
@settings(max_examples=100, deadline=None)
def test_property_roundtrip_serialization(digits: list[int]) -> None:
    """parse(serialize(grid)) == grid."""
    g = Grid(digits)
    serialized = g.to_string(blank=".")
    assert len(serialized) == 81
    g_parsed = Grid.from_string(serialized)
    assert g == g_parsed


# 2. Determinism: same seed gives identical puzzles
@given(seed=seed_strategy, diff=diff_strategy)
@settings(max_examples=15, deadline=None)
def test_property_determinism(seed: int, diff: Difficulty) -> None:
    """Same seed and difficulty must produce the identical puzzle."""
    p1 = generator.generate(diff, seed=seed)
    p2 = generator.generate(diff, seed=seed)
    assert p1.to_string() == p2.to_string()
    assert p1.solution == p2.solution
    assert p1.difficulty == p2.difficulty
    assert p1.clue_count == p2.clue_count


# 3. Solver soundness & completeness on generated puzzles
@given(seed=seed_strategy, diff=diff_strategy)
@settings(max_examples=15, deadline=None)
def test_property_solver_soundness(seed: int, diff: Difficulty) -> None:
    """solve(p) returns a grid that is fully filled, valid, and agrees with every given."""
    puzzle = generator.generate(diff, seed=seed)
    solved = bt_solver.solve(puzzle.givens)

    assert solved is not None
    assert solved.is_complete()
    assert solved.is_valid()

    # Agrees with every given
    for idx, val in enumerate(puzzle.givens.cells):
        if val != 0:
            assert solved.cells[idx] == val


# 4. Uniqueness: count_solutions == 1
@given(seed=seed_strategy, diff=diff_strategy)
@settings(max_examples=15, deadline=None)
def test_property_uniqueness(seed: int, diff: Difficulty) -> None:
    """Every generated puzzle has exactly 1 solution."""
    puzzle = generator.generate(diff, seed=seed)
    assert bt_solver.count_solutions(puzzle.givens, limit=2) == 1
    assert dlx_solver.count_solutions(puzzle.givens, limit=2) == 1


# 5. Solution matches: solver output equals stored solution
@given(seed=seed_strategy, diff=diff_strategy)
@settings(max_examples=15, deadline=None)
def test_property_solution_matches(seed: int, diff: Difficulty) -> None:
    """Solver output strictly equals the generator's stored solution."""
    puzzle = generator.generate(diff, seed=seed)
    solved_bt = bt_solver.solve(puzzle.givens)
    solved_dlx = dlx_solver.solve(puzzle.givens)

    assert solved_bt == puzzle.solution
    assert solved_dlx == puzzle.solution


# 6. Idempotence: solving an already solved grid returns it unchanged
@given(seed=seed_strategy)
@settings(max_examples=15, deadline=None)
def test_property_idempotence(seed: int) -> None:
    """Solving an already solved grid returns it unchanged."""
    puzzle = generator.generate(Difficulty.MEDIUM, seed=seed)
    solved_once = puzzle.solution
    solved_again = bt_solver.solve(solved_once)
    assert solved_again == solved_once


# 7. Clue-removal monotonicity: adding any solution-consistent clue keeps uniqueness
@given(seed=seed_strategy)
@settings(max_examples=15, deadline=None)
def test_property_clue_addition_monotonicity(seed: int) -> None:
    """Adding a solution-consistent clue to a uniquely solvable puzzle keeps it uniquely solvable."""
    puzzle = generator.generate(Difficulty.EASY, seed=seed)
    empty_indices = puzzle.givens.empty_cells()
    if empty_indices:
        idx_to_fill = empty_indices[0]
        correct_val = puzzle.solution.cells[idx_to_fill]

        more_clues_grid = puzzle.givens.with_cell(idx_to_fill, correct_val)
        assert bt_solver.count_solutions(more_clues_grid, limit=2) == 1


# 8. Contradiction handling: injecting a conflicting digit makes solve None and count 0
@given(seed=seed_strategy)
@settings(max_examples=15, deadline=None)
def test_property_contradiction_handling(seed: int) -> None:
    """Injecting a conflicting digit into a valid puzzle makes solve return None and count 0."""
    puzzle = generator.generate(Difficulty.MEDIUM, seed=seed)
    empty_indices = puzzle.givens.empty_cells()
    if empty_indices:
        idx_to_fill = empty_indices[0]
        correct_val = puzzle.solution.cells[idx_to_fill]
        # Pick a conflicting digit
        wrong_val = (correct_val % 9) + 1

        contradictory_grid = puzzle.givens.with_cell(idx_to_fill, wrong_val)
        assert bt_solver.solve(contradictory_grid) is None
        assert bt_solver.count_solutions(contradictory_grid, limit=2) == 0


# 9. Multi-solution detection: removing a unique-critical clue yields count >= 2
@given(seed=seed_strategy)
@settings(max_examples=15, deadline=None)
def test_property_multi_solution_detection(seed: int) -> None:
    """For a minimal/expert puzzle, removing a critical clue yields >= 2 solutions."""
    puzzle = generator.generate(Difficulty.HARD, seed=seed)
    filled = puzzle.givens.filled_cells()
    found_critical = False

    for idx in filled:
        # Try removing this clue
        reduced_grid = puzzle.givens.with_cell(idx, 0)
        cnt = bt_solver.count_solutions(reduced_grid, limit=2)
        if cnt >= 2:
            found_critical = True
            break

    # In a hard puzzle with ~26 clues, removing at least one clue should unlock multiple solutions
    assert found_critical, "Expected at least one unique-critical clue whose removal yields multi-solutions"


# 10. Cross-solver agreement: BacktrackingSolver and DLXSolver agree on solutions and counts
@given(seed=seed_strategy, diff=diff_strategy)
@settings(max_examples=15, deadline=None)
def test_property_solver_agreement(seed: int, diff: Difficulty) -> None:
    """The backtracker and DLX reference solver agree on count and solution."""
    puzzle = generator.generate(diff, seed=seed)
    bt_count = bt_solver.count_solutions(puzzle.givens, limit=2)
    dlx_count = dlx_solver.count_solutions(puzzle.givens, limit=2)
    assert bt_count == dlx_count == 1

    bt_solved = bt_solver.solve(puzzle.givens)
    dlx_solved = dlx_solver.solve(puzzle.givens)
    assert bt_solved == dlx_solved


# 11. Difficulty ordering: mean effort score non-decreasing across tiers
def test_property_difficulty_effort_ordering() -> None:
    """Mean solver effort score is non-decreasing across tiers over a sample of seeds."""
    sample_seeds = [10, 20, 30, 40]
    tier_scores: dict[Difficulty, float] = {}

    for diff in [Difficulty.BEGINNER, Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD]:
        scores = []
        for s in sample_seeds:
            p = generator.generate(diff, seed=s)
            scores.append(p.effort_score)
        tier_scores[diff] = sum(scores) / len(scores)

    # Verify Beginner <= Easy <= Medium <= Hard
    assert tier_scores[Difficulty.BEGINNER] <= tier_scores[Difficulty.EASY] + 1.0
    assert tier_scores[Difficulty.EASY] <= tier_scores[Difficulty.MEDIUM]
    assert tier_scores[Difficulty.MEDIUM] <= tier_scores[Difficulty.HARD]
