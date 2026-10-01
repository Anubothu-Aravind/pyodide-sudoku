"""Bitmask-based candidate state with constraint propagation and trail-based undo."""

from __future__ import annotations

from typing import Any

from sudoku.grid import (
    ALL_DIGITS_MASK,
    ALL_UNITS,
    CELL_BOX,
    CELL_COL,
    CELL_PEERS,
    CELL_ROW,
    COL_INDICES,
    GRID_SIZE,
    ROW_INDICES,
    TOTAL_CELLS,
    Grid,
    InvalidGridError,
)

# DIGIT_BIT[d] = 1 << (d - 1) for d in 1..9; DIGIT_BIT[0] = 0
DIGIT_BIT: tuple[int, ...] = (0,) + tuple(1 << (d - 1) for d in range(1, 10))

# Precomputed bit to digit lookup for single bits
BIT_TO_DIGIT: dict[int, int] = {1 << (d - 1): d for d in range(1, 10)}


def digit_from_bit(bit: int) -> int:
    """Extract digit 1..9 from a single-bit mask (e.g. 1 -> 1, 256 -> 9)."""
    return bit.bit_length()


def mask_to_digits(mask: int) -> list[int]:
    """Convert bitmask to a list of digits."""
    return [d for d in range(1, 10) if (mask & DIGIT_BIT[d])]


class CandidateState:
    """Manages cell values, candidate bitmasks, and unit masks with trail-based undo.

    Optimized for fast backtracking, MRV heuristics, and constraint propagation.
    """

    __slots__ = (
        "_trail",
        "box_used",
        "candidates",
        "cells",
        "col_used",
        "empty_count",
        "hidden_singles_count",
        "naked_singles_count",
        "row_used",
    )

    def __init__(self, grid: Grid | None = None) -> None:
        # Cell values (0 = empty, 1..9 = filled)
        self.cells: list[int] = [0] * TOTAL_CELLS
        # Bitmask of valid candidates for each cell (0..511)
        self.candidates: list[int] = [ALL_DIGITS_MASK] * TOTAL_CELLS
        # Used digit bitmask per row, column, box
        self.row_used: list[int] = [0] * GRID_SIZE
        self.col_used: list[int] = [0] * GRID_SIZE
        self.box_used: list[int] = [0] * GRID_SIZE
        self.empty_count: int = TOTAL_CELLS
        # Trail for undo: list of (cell_idx, old_val, old_candidates)
        # We also store an operation marker for trail actions
        self._trail: list[tuple[int, int, int]] = []
        # Stats on propagations
        self.naked_singles_count: int = 0
        self.hidden_singles_count: int = 0

        if grid is not None:
            self._init_from_grid(grid)

    def _init_from_grid(self, grid: Grid) -> None:
        """Initialize state from an existing Grid, verifying constraints."""
        grid.validate()
        for idx, val in enumerate(grid.cells):
            if val != 0 and not self.assign(idx, val):
                raise InvalidGridError(f"Contradiction initializing cell {idx} with {val}")

    def checkpoint(self) -> int:
        """Return the current trail depth to allow rollback."""
        return len(self._trail)

    def undo(self, checkpoint: int) -> None:
        """Roll back all state changes made since checkpoint."""
        trail = self._trail
        while len(trail) > checkpoint:
            idx, old_val, old_cand = trail.pop()
            curr_val = self.cells[idx]

            # If we are unassigning a cell that had a value assigned
            if curr_val != 0 and old_val == 0:
                d = curr_val
                bit = DIGIT_BIT[d]
                r = CELL_ROW[idx]
                c = CELL_COL[idx]
                b = CELL_BOX[idx]
                self.row_used[r] &= ~bit
                self.col_used[c] &= ~bit
                self.box_used[b] &= ~bit
                self.empty_count += 1

            self.cells[idx] = old_val
            self.candidates[idx] = old_cand

    def _record_cell_change(self, idx: int) -> None:
        """Record current cell state to the trail."""
        self._trail.append((idx, self.cells[idx], self.candidates[idx]))

    def assign(self, idx: int, digit: int) -> bool:
        """Assign digit to cell idx, updating peers and masks.

        Returns False if assignment creates a direct contradiction (e.g., peer has 0 candidates).
        """
        bit = DIGIT_BIT[digit]
        # Check if digit is valid in this cell
        if not (self.candidates[idx] & bit):
            return False

        r = CELL_ROW[idx]
        c = CELL_COL[idx]
        b = CELL_BOX[idx]

        # Verify unit masks
        if (self.row_used[r] & bit) or (self.col_used[c] & bit) or (self.box_used[b] & bit):
            return False

        # Record this cell
        self._record_cell_change(idx)
        self.cells[idx] = digit
        self.candidates[idx] = bit
        self.row_used[r] |= bit
        self.col_used[c] |= bit
        self.box_used[b] |= bit
        self.empty_count -= 1

        # Eliminate digit from peers
        eliminations: list[list[int]] = []
        for peer in CELL_PEERS[idx]:
            if self.cells[peer] == 0:
                peer_mask = self.candidates[peer]
                if peer_mask & bit:
                    new_mask = peer_mask & ~bit
                    if new_mask == 0:
                        # Contradiction: peer has no remaining candidates!
                        return False
                    self._record_cell_change(peer)
                    self.candidates[peer] = new_mask
                    eliminations.append([peer, digit])

        return True

    def eliminate(self, idx: int, digit: int) -> bool:
        """Eliminate digit from candidates of cell idx.

        Returns False if cell is left with 0 candidates.
        """
        bit = DIGIT_BIT[digit]
        mask = self.candidates[idx]
        if not (mask & bit):
            return True  # Already not a candidate

        new_mask = mask & ~bit
        if new_mask == 0:
            return False

        self._record_cell_change(idx)
        self.candidates[idx] = new_mask
        return True

    def propagate(self, listener: Any = None, depth: int = 0) -> bool:
        """Propagate constraints (Naked Singles and Hidden Singles) until fixpoint.

        Returns:
            True if propagation succeeded without contradictions.
            False if a contradiction was encountered.
        """
        from sudoku.trace import (
            ContradictionEvent,
            HiddenSingleEvent,
            NakedSingleEvent,
            format_cell_rc,
        )

        while True:
            progress = False

            # 1. Naked Singles: cells with exactly 1 candidate
            for idx in range(TOTAL_CELLS):
                if self.cells[idx] == 0:
                    cand = self.candidates[idx]
                    count = cand.bit_count()
                    if count == 0:
                        if listener is not None:
                            r, c = CELL_ROW[idx], CELL_COL[idx]
                            rc_str = format_cell_rc(idx)
                            listener.on_event(
                                ContradictionEvent(
                                    event_type="contradiction",
                                    explanation=f"Contradiction at {rc_str}: cell has 0 candidate digits remaining.",
                                    cell=idx,
                                    cell_rc=[r, c],
                                    unit_type=None,
                                    unit_index=None,
                                    digit=None,
                                    reason="no_candidates",
                                    depth=depth,
                                )
                            )
                        return False
                    if count == 1:
                        digit = digit_from_bit(cand)
                        self.naked_singles_count += 1
                        if listener is not None:
                            r, c = CELL_ROW[idx], CELL_COL[idx]
                            rc_str = format_cell_rc(idx)
                            listener.on_event(
                                NakedSingleEvent(
                                    event_type="naked_single",
                                    explanation=f"{rc_str} has only 1 candidate remaining ({digit}); all others are in its row, column or box.",
                                    cell=idx,
                                    cell_rc=[r, c],
                                    digit=digit,
                                    depth=depth,
                                )
                            )
                        if not self.assign(idx, digit):
                            if listener is not None:
                                r, c = CELL_ROW[idx], CELL_COL[idx]
                                listener.on_event(
                                    ContradictionEvent(
                                        event_type="contradiction",
                                        explanation=f"Contradiction assigning naked single {digit} at {format_cell_rc(idx)}.",
                                        cell=idx,
                                        cell_rc=[r, c],
                                        unit_type=None,
                                        unit_index=None,
                                        digit=digit,
                                        reason="naked_single_conflict",
                                        depth=depth,
                                    )
                                )
                            return False
                        progress = True

            # 2. Hidden Singles: in any unit, if a digit can only go in one cell
            for unit_idx, unit in enumerate(ALL_UNITS):
                # Identify unit type
                if unit_idx < 9:
                    unit_type = "row"
                    unit_name = f"row {unit_idx + 1}"
                elif unit_idx < 18:
                    unit_type = "col"
                    unit_name = f"column {unit_idx - 8}"
                else:
                    unit_type = "box"
                    unit_name = f"box {unit_idx - 17}"

                # Count placements for each unplaced digit in this unit
                digit_counts = [0] * 10
                digit_cell = [0] * 10

                for idx in unit:
                    if self.cells[idx] == 0:
                        mask = self.candidates[idx]
                        for d in range(1, 10):
                            if mask & DIGIT_BIT[d]:
                                digit_counts[d] += 1
                                digit_cell[d] = idx

                for d in range(1, 10):
                    cnt = digit_counts[d]
                    if cnt == 1:
                        target_cell = digit_cell[d]
                        self.hidden_singles_count += 1
                        if listener is not None:
                            tr, tc = CELL_ROW[target_cell], CELL_COL[target_cell]
                            rc_str = format_cell_rc(target_cell)
                            listener.on_event(
                                HiddenSingleEvent(
                                    event_type="hidden_single",
                                    explanation=f"In {unit_name}, digit {d} can only be placed at {rc_str}.",
                                    cell=target_cell,
                                    cell_rc=[tr, tc],
                                    digit=d,
                                    unit_type=unit_type,
                                    unit_index=unit_idx % 9,
                                    depth=depth,
                                )
                            )
                        if not self.assign(target_cell, d):
                            if listener is not None:
                                tr, tc = CELL_ROW[target_cell], CELL_COL[target_cell]
                                listener.on_event(
                                    ContradictionEvent(
                                        event_type="contradiction",
                                        explanation=f"Contradiction assigning hidden single {d} at {format_cell_rc(target_cell)} in {unit_name}.",
                                        cell=target_cell,
                                        cell_rc=[tr, tc],
                                        unit_type=unit_type,
                                        unit_index=unit_idx % 9,
                                        digit=d,
                                        reason="hidden_single_conflict",
                                        depth=depth,
                                    )
                                )
                            return False
                        progress = True
                    elif cnt == 0:
                        # Check if digit is already placed in this unit
                        bit = DIGIT_BIT[d]
                        first_cell = unit[0]
                        r, c, b = CELL_ROW[first_cell], CELL_COL[first_cell], CELL_BOX[first_cell]
                        if unit == ROW_INDICES[r]:
                            placed = bool(self.row_used[r] & bit)
                        elif unit == COL_INDICES[c]:
                            placed = bool(self.col_used[c] & bit)
                        else:
                            placed = bool(self.box_used[b] & bit)

                        if not placed:
                            if listener is not None:
                                listener.on_event(
                                    ContradictionEvent(
                                        event_type="contradiction",
                                        explanation=f"Contradiction in {unit_name}: digit {d} has no valid placement remaining.",
                                        cell=None,
                                        cell_rc=None,
                                        unit_type=unit_type,
                                        unit_index=unit_idx % 9,
                                        digit=d,
                                        reason="missing_digit_in_unit",
                                        depth=depth,
                                    )
                                )
                            return False

            if not progress:
                break

        return True

    def find_mrv_cell(self) -> int | None:
        """Find the unassigned cell with the Minimum Remaining Values (MRV).

        Returns None if all cells are assigned.
        Tie-breaking: cell with highest degree (unassigned peers).
        """
        best_cell: int | None = None
        min_candidates = 10
        best_degree = -1

        for idx in range(TOTAL_CELLS):
            if self.cells[idx] == 0:
                count = self.candidates[idx].bit_count()
                if count < min_candidates:
                    min_candidates = count
                    best_cell = idx
                    best_degree = sum(1 for p in CELL_PEERS[idx] if self.cells[p] == 0)
                    if min_candidates == 2:
                        # Can't get better than 2 since naked singles (1) are propagated
                        # We can still check ties if degree is higher, but 2 is already great
                        pass
                elif count == min_candidates and best_cell is not None:
                    # Degree heuristic tie-breaker
                    degree = sum(1 for p in CELL_PEERS[idx] if self.cells[p] == 0)
                    if degree > best_degree:
                        best_cell = idx
                        best_degree = degree

        return best_cell

    def to_grid(self) -> Grid:
        """Convert current cell values into a Grid."""
        return Grid(self.cells)
