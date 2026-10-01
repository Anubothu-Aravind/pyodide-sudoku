"""Solver tracing protocols, event dataclasses, and plain-English explanations."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Protocol

from sudoku.grid import CELL_COL, CELL_ROW


def format_cell_rc(cell_idx: int) -> str:
    """Format cell index 0..80 as human-friendly 'R{row+1}C{col+1}'."""
    r = CELL_ROW[cell_idx] + 1
    c = CELL_COL[cell_idx] + 1
    return f"R{r}C{c}"


@dataclass(frozen=True)
class SolverEvent:
    """Base class for all solver trace events."""
    event_type: str
    explanation: str

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["type"] = self.event_type
        return d


TraceEvent = SolverEvent


@dataclass(frozen=True)
class InitEvent(SolverEvent):
    givens: str
    candidates: list[list[int]]


@dataclass(frozen=True)
class NakedSingleEvent(SolverEvent):
    cell: int
    cell_rc: list[int]  # [row, col] 0-indexed
    digit: int
    depth: int


@dataclass(frozen=True)
class HiddenSingleEvent(SolverEvent):
    cell: int
    cell_rc: list[int]
    digit: int
    unit_type: str  # "row", "col", "box"
    unit_index: int
    depth: int


@dataclass(frozen=True)
class EliminateEvent(SolverEvent):
    # List of [cell_index, digit]
    removals: list[list[int]]
    depth: int


@dataclass(frozen=True)
class BranchEvent(SolverEvent):
    cell: int
    cell_rc: list[int]
    candidates: list[int]
    chosen_digit: int
    depth: int


@dataclass(frozen=True)
class ContradictionEvent(SolverEvent):
    cell: int | None
    cell_rc: list[int] | None
    unit_type: str | None
    unit_index: int | None
    digit: int | None
    reason: str
    depth: int


@dataclass(frozen=True)
class BacktrackEvent(SolverEvent):
    to_depth: int
    undone_count: int


@dataclass(frozen=True)
class SolutionEvent(SolverEvent):
    grid: str


@dataclass(frozen=True)
class DoneEvent(SolverEvent):
    stats: dict[str, Any]
    solution_count: int


@dataclass(frozen=True)
class PlaceEvent(SolverEvent):
    cell: int
    cell_rc: list[int]
    digit: int


@dataclass(frozen=True)
class ConflictEvent(SolverEvent):
    cell: int
    cell_rc: list[int]
    digit: int
    with_cells: list[int]


class TraceListener(Protocol):
    """Protocol for receiving solver events during execution."""

    def on_event(self, event: SolverEvent) -> None:
        ...


class EventCollector:
    """Collects solver trace events up to max_events."""

    def __init__(self, max_events: int = 50_000) -> None:
        self.max_events = max_events
        self.events: list[SolverEvent] = []
        self.truncated: bool = False

    def on_event(self, event: SolverEvent) -> None:
        if len(self.events) < self.max_events:
            self.events.append(event)
        else:
            self.truncated = True
