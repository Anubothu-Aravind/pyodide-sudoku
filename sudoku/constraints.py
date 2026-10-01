"""Variant constraint group definitions.

Each variant is described by a list of *extra* all-different groups (on top of
the standard 9 rows, 9 columns, and 9 boxes).

Cell indices follow the flat row-major convention used everywhere in this
codebase: index = row * 9 + col, with row and col both 0-based.

Adding a new variant later (Windoku, Anti-Knight, …) requires only a new entry
in VARIANT_EXTRA_GROUPS and a corresponding VARIANT_META entry.  No solver code
needs to change.
"""

from __future__ import annotations

from typing import TypedDict


class VariantMeta(TypedDict):
    name: str
    description: str


# ---------------------------------------------------------------------------
# Diagonal cell indices
# ---------------------------------------------------------------------------

#: Main diagonal: top-left → bottom-right (r == c)
MAIN_DIAGONAL: list[int] = [r * 9 + r for r in range(9)]
# = [0, 10, 20, 30, 40, 50, 60, 70, 80]

#: Anti-diagonal: top-right → bottom-left (r + c == 8)
ANTI_DIAGONAL: list[int] = [r * 9 + (8 - r) for r in range(9)]
# = [8, 16, 24, 32, 40, 48, 56, 64, 72]

# ---------------------------------------------------------------------------
# Windoku (Hyper Sudoku) window cell indices (four 3x3 shaded windows)
# ---------------------------------------------------------------------------

WINDOKU_TL: list[int] = [r * 9 + c for r in (1, 2, 3) for c in (1, 2, 3)]
WINDOKU_TR: list[int] = [r * 9 + c for r in (1, 2, 3) for c in (5, 6, 7)]
WINDOKU_BL: list[int] = [r * 9 + c for r in (5, 6, 7) for c in (1, 2, 3)]
WINDOKU_BR: list[int] = [r * 9 + c for r in (5, 6, 7) for c in (5, 6, 7)]

# ---------------------------------------------------------------------------
# Center Dot cell indices (9 box center cells)
# ---------------------------------------------------------------------------

CENTER_DOT: list[int] = [r * 9 + c for r in (1, 4, 7) for c in (1, 4, 7)]

# ---------------------------------------------------------------------------
# Asterisk cell indices (9 asterisk pattern cells)
# ---------------------------------------------------------------------------

ASTERISK: list[int] = [13, 20, 24, 37, 40, 43, 56, 60, 67]

# ---------------------------------------------------------------------------
# Girandola cell indices (4 corners + 4 edge centers + center cell)
# ---------------------------------------------------------------------------

GIRANDOLA: list[int] = [0, 8, 13, 37, 40, 43, 67, 72, 80]

# ---------------------------------------------------------------------------
# Disjoint Groups cell indices (cells in identical relative positions in 3x3s)
# ---------------------------------------------------------------------------

DISJOINT_GROUPS: list[list[int]] = [
    [(br * 3 + rr) * 9 + (bc * 3 + rc) for br in range(3) for bc in range(3)]
    for rr in range(3)
    for rc in range(3)
]

# ---------------------------------------------------------------------------
# Variant registries
# ---------------------------------------------------------------------------

#: Extra all-different groups per variant (beyond standard rows/cols/boxes).
#: Classic has none.
VARIANT_EXTRA_GROUPS: dict[str, list[list[int]]] = {
    "classic": [],
    "diagonal": [MAIN_DIAGONAL, ANTI_DIAGONAL],
    "windoku": [WINDOKU_TL, WINDOKU_TR, WINDOKU_BL, WINDOKU_BR],
    "center_dot": [CENTER_DOT],
    "asterisk": [ASTERISK],
    "girandola": [GIRANDOLA],
    "disjoint": DISJOINT_GROUPS,
}

VARIANT_META: dict[str, VariantMeta] = {
    "classic": {
        "name": "Classic Sudoku",
        "description": "Standard 9×9 Sudoku with rows, columns, and 3×3 boxes.",
    },
    "diagonal": {
        "name": "Diagonal Sudoku",
        "description": (
            "Standard Sudoku rules plus both main diagonals (top-left→bottom-right "
            "and top-right→bottom-left) must each contain the digits 1–9 exactly once."
        ),
    },
    "windoku": {
        "name": "Windoku (Hyper Sudoku)",
        "description": (
            "Classic Sudoku rules plus four extra shaded 3×3 window regions "
            "must each contain the digits 1–9 exactly once."
        ),
    },
    "center_dot": {
        "name": "Center Dot Sudoku",
        "description": (
            "Classic Sudoku rules plus the center cell of each of the nine 3×3 boxes "
            "forms an extra 9-cell group containing digits 1–9 exactly once."
        ),
    },
    "asterisk": {
        "name": "Asterisk Sudoku",
        "description": (
            "Classic Sudoku rules plus the 9 marked asterisk cells "
            "must contain the digits 1–9 exactly once."
        ),
    },
    "girandola": {
        "name": "Girandola Sudoku",
        "description": (
            "Classic Sudoku rules plus the 9 pinwheel cells (4 corners, 4 edge centers, "
            "and center cell) must contain the digits 1–9 exactly once."
        ),
    },
    "disjoint": {
        "name": "Disjoint Groups Sudoku",
        "description": (
            "Classic Sudoku rules plus cells sharing the same relative position within their "
            "3×3 boxes (e.g. all top-left cells) must contain the digits 1–9 without repeating."
        ),
    },
}


def get_extra_groups(variant: str) -> list[list[int]]:
    """Return extra all-different constraint groups for the given variant id.

    Raises ValueError for unknown variants.
    """
    if variant not in VARIANT_EXTRA_GROUPS:
        raise ValueError(
            f"Unknown variant {variant!r}. Known variants: {list(VARIANT_EXTRA_GROUPS)}"
        )
    return VARIANT_EXTRA_GROUPS[variant]
