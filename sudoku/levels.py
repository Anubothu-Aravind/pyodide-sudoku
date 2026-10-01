"""Levels mode: deterministic level-to-puzzle mapping, endless progression, and boss levels."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, TypedDict

from sudoku.difficulty import Difficulty
from sudoku.generator import PuzzleGenerator
from sudoku.solver import BacktrackingSolver

GENERATOR_VERSION: int = 1


class WorldConfig(TypedDict):
    difficulty: Difficulty
    min_clues: int
    max_clues: int
    base_target_clues: int
    boss_target_clues: int
    min_effort: float
    max_effort: float


@dataclass(frozen=True)
class LevelSpec:
    """Specification of a campaign level."""
    level: int
    world: int
    index_in_world: int  # 1..10
    difficulty: Difficulty
    min_clues: int
    max_clues: int
    target_clues: int
    min_effort: float
    max_effort: float
    symmetric: bool
    seed: str
    is_boss: bool

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["difficulty"] = self.difficulty.value
        return d


# Configuration curve table for worlds 1 to 5
WORLD_CONFIGS: list[WorldConfig] = [
    # World 1: Beginner
    {
        "difficulty": Difficulty.BEGINNER,
        "min_clues": 40,
        "max_clues": 45,
        "base_target_clues": 43,
        "boss_target_clues": 40,
        "min_effort": 10.0,
        "max_effort": 16.0,
    },
    # World 2: Easy
    {
        "difficulty": Difficulty.EASY,
        "min_clues": 34,
        "max_clues": 39,
        "base_target_clues": 37,
        "boss_target_clues": 34,
        "min_effort": 15.0,
        "max_effort": 21.0,
    },
    # World 3: Medium
    {
        "difficulty": Difficulty.MEDIUM,
        "min_clues": 28,
        "max_clues": 33,
        "base_target_clues": 31,
        "boss_target_clues": 28,
        "min_effort": 20.0,
        "max_effort": 30.0,
    },
    # World 4: Hard
    {
        "difficulty": Difficulty.HARD,
        "min_clues": 24,
        "max_clues": 27,
        "base_target_clues": 27,
        "boss_target_clues": 24,
        "min_effort": 30.0,
        "max_effort": 55.0,
    },
    # World 5+: Expert (endless)
    {
        "difficulty": Difficulty.EXPERT,
        "min_clues": 22,
        "max_clues": 25,
        "base_target_clues": 25,
        "boss_target_clues": 23,
        "min_effort": 50.0,
        "max_effort": 100.0,
    },
]


def level_spec(level: int) -> LevelSpec:
    """Generate the deterministic LevelSpec for a given 1-based level index."""
    if level < 1:
        raise ValueError(f"Level must be >= 1, got {level}")

    world = (level - 1) // 10 + 1
    index_in_world = (level - 1) % 10 + 1
    is_boss = index_in_world == 10

    # Determine world configuration
    cfg_idx = min(world - 1, len(WORLD_CONFIGS) - 1)
    cfg = WORLD_CONFIGS[cfg_idx]

    # For endless worlds (> 5), ramp up effort ceiling
    extra_world = max(0, world - 5)
    effort_boost = extra_world * 5.0

    # Ramp effort across levels 1 to 9, with level 10 at peak
    progress = (index_in_world - 1) / 9.0  # 0.0 to 1.0
    min_eff = cfg["min_effort"] + effort_boost
    max_eff = cfg["max_effort"] + effort_boost
    target_effort_lo = min_eff + (max_eff - min_eff) * (progress * 0.8)
    target_effort_hi = target_effort_lo + (max_eff - min_eff) * 0.3

    if is_boss:
        target_clues = cfg["boss_target_clues"]
        symmetric = True
    else:
        # Clues decrease slightly towards end of world
        clue_span = cfg["base_target_clues"] - cfg["boss_target_clues"]
        target_clues = int(cfg["base_target_clues"] - clue_span * progress)
        symmetric = True

    seed = f"lvl-{level}-v{GENERATOR_VERSION}"

    return LevelSpec(
        level=level,
        world=world,
        index_in_world=index_in_world,
        difficulty=cfg["difficulty"],
        min_clues=cfg["min_clues"],
        max_clues=cfg["max_clues"],
        target_clues=target_clues,
        min_effort=round(target_effort_lo, 1),
        max_effort=round(target_effort_hi, 1),
        symmetric=symmetric,
        seed=seed,
        is_boss=is_boss,
    )


def calculate_par_time_seconds(effort_score: float, clues: int) -> int:
    """Calculate target par time in seconds for a puzzle.

    Formula:
    Base time (120s) + 5s per point of solver effort + 3s per missing clue from 81.
    Rounded to nearest 30 seconds, minimum 120s (2 min), maximum 1800s (30 min).
    """
    empty_cells = max(0, 81 - clues)
    raw = 90.0 + effort_score * 4.5 + empty_cells * 2.5
    rounded = int(round(raw / 30.0) * 30)
    return max(120, min(1800, rounded))


def generate_level(level: int, generator: PuzzleGenerator | None = None) -> dict[str, Any]:
    """Generate the puzzle for a given level with complete metadata."""
    spec = level_spec(level)
    gen = generator or PuzzleGenerator()

    # Generate with target difficulty and deterministic seed
    puzzle = gen.generate(
        difficulty=spec.difficulty,
        seed=spec.seed,
        symmetric=spec.symmetric,
        max_attempts=10,
    )

    # Verify uniqueness
    solver = BacktrackingSolver()
    if solver.count_solutions(puzzle.givens, limit=2) != 1:
        raise RuntimeError(f"Generated puzzle for level {level} does not have unique solution")

    fallback = (puzzle.difficulty != spec.difficulty) or not (
        spec.min_clues <= puzzle.clue_count <= spec.max_clues
    )

    par_time = calculate_par_time_seconds(puzzle.effort_score, puzzle.clue_count)

    return {
        "level": level,
        "world": spec.world,
        "index_in_world": spec.index_in_world,
        "is_boss": spec.is_boss,
        "difficulty": puzzle.difficulty.value,
        "clues": puzzle.clue_count,
        "effort_score": puzzle.effort_score,
        "par_time_seconds": par_time,
        "seed": spec.seed,
        "generator_version": GENERATOR_VERSION,
        "fallback": fallback,
        "puzzle": puzzle.to_string(),
        "solution": puzzle.solution.to_string(),
    }
