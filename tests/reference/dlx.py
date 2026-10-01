"""Independent reference solver based on Knuth's Dancing Links (Algorithm X).

Test-only reference implementation used for cross-validation and property verification.
Excluded from the shipped Pyodide package.
"""

from __future__ import annotations

import time

from sudoku.grid import Grid
from sudoku.solver import Solver, SolverStats


class _DLXNode:
    __slots__ = ("col_header", "down", "left", "right", "row_id", "up")

    def __init__(self, row_id: int = -1, col_header: _DLXColumn | None = None) -> None:
        self.left: _DLXNode = self
        self.right: _DLXNode = self
        self.up: _DLXNode = self
        self.down: _DLXNode = self
        self.col_header: _DLXColumn | None = col_header
        self.row_id: int = row_id


class _DLXColumn(_DLXNode):
    __slots__ = ("name", "size")

    def __init__(self, name: str) -> None:
        super().__init__()
        self.col_header = self
        self.size: int = 0
        self.name: str = name


class DLXSolver(Solver):
    """Independent reference solver based on Knuth's Dancing Links (Algorithm X)."""

    def __init__(self) -> None:
        self._stats = SolverStats()

    def get_last_stats(self) -> SolverStats:
        return self._stats

    def solve(self, grid: Grid) -> Grid | None:
        """Solve using DLX Algorithm X."""
        start_time = time.perf_counter()
        self._stats = SolverStats()

        if not grid.is_valid():
            self._stats.time_elapsed_seconds = time.perf_counter() - start_time
            return None

        root, _columns, _row_nodes = self._build_matrix(grid)
        solution_rows: list[int] = []

        if self._search(root, solution_rows, limit=1):
            cells = list(grid.cells)
            for r_id in solution_rows:
                r, c, d = self._decode_row_id(r_id)
                cells[r * 9 + c] = d
            self._stats.time_elapsed_seconds = time.perf_counter() - start_time
            return Grid(cells)

        self._stats.time_elapsed_seconds = time.perf_counter() - start_time
        return None

    def count_solutions(self, grid: Grid, limit: int = 2) -> int:
        """Count solutions up to limit using DLX Algorithm X."""
        start_time = time.perf_counter()
        self._stats = SolverStats()

        if limit <= 0 or not grid.is_valid():
            self._stats.time_elapsed_seconds = time.perf_counter() - start_time
            return 0

        root, _columns, _row_nodes = self._build_matrix(grid)
        solution_rows: list[int] = []
        count = [0]
        self._count_search(root, solution_rows, count, limit)
        self._stats.time_elapsed_seconds = time.perf_counter() - start_time
        return count[0]

    @staticmethod
    def _encode_row_id(r: int, c: int, d: int) -> int:
        return r * 81 + c * 9 + (d - 1)

    @staticmethod
    def _decode_row_id(row_id: int) -> tuple[int, int, int]:
        d = (row_id % 9) + 1
        rem = row_id // 9
        c = rem % 9
        r = rem // 9
        return r, c, d

    def _build_matrix(
        self, grid: Grid
    ) -> tuple[_DLXColumn, list[_DLXColumn], dict[int, list[_DLXNode]]]:
        root = _DLXColumn("root")
        columns: list[_DLXColumn] = []

        for r in range(9):
            for c in range(9):
                columns.append(_DLXColumn(f"cell_{r}_{c}"))
        for r in range(9):
            for d in range(1, 10):
                columns.append(_DLXColumn(f"row_{r}_{d}"))
        for c in range(9):
            for d in range(1, 10):
                columns.append(_DLXColumn(f"col_{c}_{d}"))
        for b in range(9):
            for d in range(1, 10):
                columns.append(_DLXColumn(f"box_{b}_{d}"))

        prev = root
        for col in columns:
            prev.right = col
            col.left = prev
            prev = col
        prev.right = root
        root.left = prev

        row_nodes: dict[int, list[_DLXNode]] = {}
        cells = grid.cells

        for r in range(9):
            for c in range(9):
                idx = r * 9 + c
                given = cells[idx]
                digits = [given] if given != 0 else list(range(1, 10))
                b = (r // 3) * 3 + (c // 3)

                for d in digits:
                    row_id = self._encode_row_id(r, c, d)
                    c_cell = columns[r * 9 + c]
                    c_row = columns[81 + r * 9 + (d - 1)]
                    c_col = columns[162 + c * 9 + (d - 1)]
                    c_box = columns[243 + b * 9 + (d - 1)]

                    n1 = _DLXNode(row_id, c_cell)
                    n2 = _DLXNode(row_id, c_row)
                    n3 = _DLXNode(row_id, c_col)
                    n4 = _DLXNode(row_id, c_box)

                    n1.right = n2
                    n2.left = n1
                    n2.right = n3
                    n3.left = n2
                    n3.right = n4
                    n4.left = n3
                    n4.right = n1
                    n1.left = n4

                    for node, col in ((n1, c_cell), (n2, c_row), (n3, c_col), (n4, c_box)):
                        node.down = col
                        node.up = col.up
                        col.up.down = node
                        col.up = node
                        col.size += 1

                    row_nodes[row_id] = [n1, n2, n3, n4]

        return root, columns, row_nodes

    def _cover(self, col: _DLXColumn) -> None:
        col.right.left = col.left
        col.left.right = col.right
        i = col.down
        while i != col:
            j = i.right
            while j != i:
                j.down.up = j.up
                j.up.down = j.down
                if j.col_header:
                    j.col_header.size -= 1
                j = j.right
            i = i.down

    def _uncover(self, col: _DLXColumn) -> None:
        i = col.up
        while i != col:
            j = i.left
            while j != i:
                if j.col_header:
                    j.col_header.size += 1
                j.down.up = j
                j.up.down = j
                j = j.left
            i = i.up
        col.right.left = col
        col.left.right = col

    def _search(self, root: _DLXColumn, solution: list[int], limit: int) -> bool:
        self._stats.nodes_expanded += 1
        if root.right == root:
            return True

        col: _DLXColumn = root.right  # type: ignore[assignment]
        min_size = col.size
        curr = col.right
        while curr != root:
            assert isinstance(curr, _DLXColumn)
            if curr.size < min_size:
                col = curr
                min_size = curr.size
            curr = curr.right

        if min_size == 0:
            self._stats.backtracks += 1
            return False

        self._cover(col)
        row_node = col.down
        while row_node != col:
            solution.append(row_node.row_id)
            j = row_node.right
            while j != row_node:
                if j.col_header:
                    self._cover(j.col_header)
                j = j.right

            if self._search(root, solution, limit):
                return True

            solution.pop()
            j = row_node.left
            while j != row_node:
                if j.col_header:
                    self._uncover(j.col_header)
                j = j.left
            row_node = row_node.down

        self._uncover(col)
        self._stats.backtracks += 1
        return False

    def _count_search(
        self, root: _DLXColumn, solution: list[int], count: list[int], limit: int
    ) -> None:
        if count[0] >= limit:
            return

        self._stats.nodes_expanded += 1
        if root.right == root:
            count[0] += 1
            return

        col: _DLXColumn = root.right  # type: ignore[assignment]
        min_size = col.size
        curr = col.right
        while curr != root:
            assert isinstance(curr, _DLXColumn)
            if curr.size < min_size:
                col = curr
                min_size = curr.size
            curr = curr.right

        if min_size == 0:
            self._stats.backtracks += 1
            return

        self._cover(col)
        row_node = col.down
        while row_node != col:
            solution.append(row_node.row_id)
            j = row_node.right
            while j != row_node:
                if j.col_header:
                    self._cover(j.col_header)
                j = j.right

            self._count_search(root, solution, count, limit)
            if count[0] >= limit:
                j = row_node.left
                while j != row_node:
                    if j.col_header:
                        self._uncover(j.col_header)
                    j = j.left
                solution.pop()
                break

            solution.pop()
            j = row_node.left
            while j != row_node:
                if j.col_header:
                    self._uncover(j.col_header)
                j = j.left
            row_node = row_node.down

        self._uncover(col)
