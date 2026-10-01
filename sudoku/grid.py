"""9x9 Sudoku Grid value object with parsing, serialization, and validation."""

from __future__ import annotations

from collections.abc import Iterator, Sequence


class InvalidGridError(ValueError):
    """Raised when a Sudoku grid is malformed or violates Sudoku rules."""


# Precomputed peer tables and indices for performance
GRID_SIZE = 9
BOX_SIZE = 3
TOTAL_CELLS = 81
ALL_DIGITS_MASK = 0x1FF  # 9 bits: 111111111 in binary


def _calc_row_col(index: int) -> tuple[int, int]:
    return index // 9, index % 9


def _calc_box(r: int, c: int) -> int:
    return (r // 3) * 3 + (c // 3)


def _calc_index(r: int, c: int) -> int:
    return r * 9 + c


# Precompute lookup tables
ROW_INDICES: tuple[tuple[int, ...], ...] = tuple(
    tuple(_calc_index(r, c) for c in range(GRID_SIZE)) for r in range(GRID_SIZE)
)
COL_INDICES: tuple[tuple[int, ...], ...] = tuple(
    tuple(_calc_index(r, c) for r in range(GRID_SIZE)) for c in range(GRID_SIZE)
)
BOX_INDICES: tuple[tuple[int, ...], ...] = tuple(
    tuple(
        _calc_index(br * 3 + dr, bc * 3 + dc)
        for dr in range(BOX_SIZE)
        for dc in range(BOX_SIZE)
    )
    for br in range(BOX_SIZE)
    for bc in range(BOX_SIZE)
)

CELL_ROW: tuple[int, ...] = tuple(_calc_row_col(i)[0] for i in range(TOTAL_CELLS))
CELL_COL: tuple[int, ...] = tuple(_calc_row_col(i)[1] for i in range(TOTAL_CELLS))
CELL_BOX: tuple[int, ...] = tuple(
    _calc_box(CELL_ROW[i], CELL_COL[i]) for i in range(TOTAL_CELLS)
)

# Peers for each cell (excluding the cell itself)
CELL_PEERS: tuple[tuple[int, ...], ...] = tuple(
    tuple(
        sorted(
            set(ROW_INDICES[CELL_ROW[i]])
            | set(COL_INDICES[CELL_COL[i]])
            | set(BOX_INDICES[CELL_BOX[i]])
            - {i}
        )
    )
    for i in range(TOTAL_CELLS)
)

# All 27 units: 9 rows, 9 columns, 9 boxes
ALL_UNITS: tuple[tuple[int, ...], ...] = ROW_INDICES + COL_INDICES + BOX_INDICES

# Units that each cell belongs to (row unit, col unit, box unit)
CELL_UNITS: tuple[tuple[tuple[int, ...], tuple[int, ...], tuple[int, ...]], ...] = tuple(
    (ROW_INDICES[CELL_ROW[i]], COL_INDICES[CELL_COL[i]], BOX_INDICES[CELL_BOX[i]])
    for i in range(TOTAL_CELLS)
)


class Grid:
    """An immutable-ish 9x9 Sudoku grid representation.

    Cells are indexed either by a flat index 0..80 or by (row, col) where 0 <= row, col < 9.
    Values are integers in 0..9, where 0 denotes an empty cell.
    """

    __slots__ = ("_cells", "_hash")

    def __init__(self, data: str | Sequence[int] | Sequence[Sequence[int]] | None = None) -> None:
        if data is None:
            self._cells: tuple[int, ...] = (0,) * TOTAL_CELLS
        elif isinstance(data, str):
            self._cells = self._parse_string(data)
        elif isinstance(data, (tuple, list)):
            if len(data) == TOTAL_CELLS and all(isinstance(x, int) for x in data):
                cells_list = list(data)
                for i, v in enumerate(cells_list):
                    if not (0 <= v <= 9):
                        raise InvalidGridError(f"Cell {i} has invalid value {v}; must be 0-9")
                self._cells = tuple(cells_list)
            elif len(data) == GRID_SIZE and all(isinstance(row, (tuple, list)) for row in data):
                flat: list[int] = []
                for r_idx, row in enumerate(data):
                    if len(row) != GRID_SIZE:
                        raise InvalidGridError(f"Row {r_idx} has length {len(row)}, expected 9")
                    for c_idx, v in enumerate(row):
                        if not isinstance(v, int) or not (0 <= v <= 9):
                            raise InvalidGridError(f"Cell ({r_idx}, {c_idx}) has invalid value {v}; must be 0-9")
                        flat.append(v)
                self._cells = tuple(flat)
            else:
                raise InvalidGridError(f"Expected sequence of 81 ints or 9x9 ints, got length {len(data)}")
        else:
            raise TypeError(f"Cannot initialize Grid from {type(data).__name__}")

        self._hash: int | None = None

    @staticmethod
    def _parse_string(s: str) -> tuple[int, ...]:
        """Parse an 81-character or formatted string into 81 integers (0-9)."""
        # Filter out common separators like pipes, dashes, spaces, newlines, plusses
        cleaned = [c for c in s if c in "0123456789._"]
        if len(cleaned) != TOTAL_CELLS:
            raise InvalidGridError(
                f"Invalid grid string length: found {len(cleaned)} digits/placeholders, expected 81"
            )
        cells: list[int] = []
        for c in cleaned:
            if c in ".0_":
                cells.append(0)
            elif "1" <= c <= "9":
                cells.append(int(c))
            else:
                raise InvalidGridError(f"Invalid character '{c}' in grid string")
        return tuple(cells)

    @classmethod
    def from_string(cls, s: str) -> Grid:
        """Create a Grid from an 81-char string or formatted multiline string."""
        return cls(s)

    @classmethod
    def empty(cls) -> Grid:
        """Create an empty 9x9 Grid."""
        return cls()

    @property
    def cells(self) -> tuple[int, ...]:
        """Return the flat tuple of 81 cell values."""
        return self._cells

    @property
    def clues(self) -> int:
        """Number of pre-filled (non-zero) cells."""
        return sum(1 for v in self._cells if v != 0)

    def is_complete(self) -> bool:
        """Check if all cells are filled and valid."""
        return all(v != 0 for v in self._cells) and self.is_valid()

    is_solved = is_complete

    def empty_cells(self) -> tuple[int, ...]:
        """Indices of all empty (0) cells."""
        return tuple(i for i, v in enumerate(self._cells) if v == 0)

    def filled_cells(self) -> tuple[int, ...]:
        """Indices of all filled (non-zero) cells."""
        return tuple(i for i, v in enumerate(self._cells) if v != 0)

    def row(self, r: int) -> tuple[int, ...]:
        """Return values of row r (0 <= r < 9)."""
        if not (0 <= r < GRID_SIZE):
            raise IndexError(f"Row index out of range: {r}")
        return tuple(self._cells[i] for i in ROW_INDICES[r])

    def col(self, c: int) -> tuple[int, ...]:
        """Return values of column c (0 <= c < 9)."""
        if not (0 <= c < GRID_SIZE):
            raise IndexError(f"Col index out of range: {c}")
        return tuple(self._cells[i] for i in COL_INDICES[c])

    def box(self, b: int) -> tuple[int, ...]:
        """Return values of 3x3 box b (0 <= b < 9)."""
        if not (0 <= b < GRID_SIZE):
            raise IndexError(f"Box index out of range: {b}")
        return tuple(self._cells[i] for i in BOX_INDICES[b])

    @staticmethod
    def box_index(r: int, c: int) -> int:
        """Return the 3x3 box index (0..8) for cell at (r, c)."""
        return _calc_box(r, c)

    @staticmethod
    def row_col(index: int) -> tuple[int, int]:
        """Return (row, col) for a given flat cell index (0..80)."""
        return CELL_ROW[index], CELL_COL[index]

    @staticmethod
    def index(r: int, c: int) -> int:
        """Return flat index (0..80) for (row, col)."""
        if not (0 <= r < GRID_SIZE and 0 <= c < GRID_SIZE):
            raise IndexError(f"Cell coordinates out of bounds: ({r}, {c})")
        return _calc_index(r, c)

    def validate(self) -> None:
        """Validate that no row, column, or 3x3 box has duplicate non-zero digits.

        Raises:
            InvalidGridError: If a constraint violation is found.
        """
        for r in range(GRID_SIZE):
            seen: set[int] = set()
            for idx in ROW_INDICES[r]:
                val = self._cells[idx]
                if val != 0:
                    if val in seen:
                        raise InvalidGridError(f"Duplicate value {val} in row {r}")
                    seen.add(val)

        for c in range(GRID_SIZE):
            seen = set()
            for idx in COL_INDICES[c]:
                val = self._cells[idx]
                if val != 0:
                    if val in seen:
                        raise InvalidGridError(f"Duplicate value {val} in column {c}")
                    seen.add(val)

        for b in range(GRID_SIZE):
            seen = set()
            for idx in BOX_INDICES[b]:
                val = self._cells[idx]
                if val != 0:
                    if val in seen:
                        raise InvalidGridError(f"Duplicate value {val} in box {b}")
                    seen.add(val)

    def is_valid(self) -> bool:
        """Check if grid has no duplicate non-zero digits in any row, column, or box."""
        try:
            self.validate()
            return True
        except InvalidGridError:
            return False

    def with_cell(self, r_or_idx: int, c_or_val: int, val: int | None = None) -> Grid:
        """Return a new Grid with one cell modified.

        Can be called as `grid.with_cell(index, val)` or `grid.with_cell(row, col, val)`.
        """
        if val is None:
            idx = r_or_idx
            new_val = c_or_val
        else:
            idx = _calc_index(r_or_idx, c_or_val)
            new_val = val

        if not (0 <= idx < TOTAL_CELLS):
            raise IndexError(f"Cell index out of range: {idx}")
        if not (0 <= new_val <= 9):
            raise ValueError(f"Invalid cell value: {new_val}")

        cells_list = list(self._cells)
        cells_list[idx] = new_val
        return Grid(cells_list)

    def to_string(self, blank: str = ".") -> str:
        """Serialize grid to an 81-character string."""
        return "".join(blank if v == 0 else str(v) for v in self._cells)

    def pretty(self) -> str:
        """Format the grid as a pretty-printed 9x9 board with 3x3 block borders."""
        lines: list[str] = []
        divider = "+-------+-------+-------+"
        for r in range(GRID_SIZE):
            if r % 3 == 0:
                lines.append(divider)
            row_vals = [str(self._cells[r * 9 + c]) if self._cells[r * 9 + c] != 0 else "." for c in range(GRID_SIZE)]
            b1 = " ".join(row_vals[0:3])
            b2 = " ".join(row_vals[3:6])
            b3 = " ".join(row_vals[6:9])
            lines.append(f"| {b1} | {b2} | {b3} |")
        lines.append(divider)
        return "\n".join(lines)

    def __getitem__(self, item: int | tuple[int, int]) -> int:
        if isinstance(item, tuple):
            r, c = item
            if not (0 <= r < GRID_SIZE and 0 <= c < GRID_SIZE):
                raise IndexError(f"Cell coordinates out of bounds: ({r}, {c})")
            return self._cells[_calc_index(r, c)]
        if not (0 <= item < TOTAL_CELLS):
            raise IndexError(f"Cell index out of bounds: {item}")
        return self._cells[item]

    def __len__(self) -> int:
        return TOTAL_CELLS

    def __iter__(self) -> Iterator[int]:
        return iter(self._cells)

    def __eq__(self, other: object) -> bool:
        if isinstance(other, Grid):
            return self._cells == other._cells
        return False

    def __hash__(self) -> int:
        if self._hash is None:
            self._hash = hash(self._cells)
        return self._hash

    def __repr__(self) -> str:
        return f"Grid('{self.to_string()}')"

    def __str__(self) -> str:
        return self.pretty()
