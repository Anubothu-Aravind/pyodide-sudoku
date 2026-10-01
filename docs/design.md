# Visual Design Plan: Sudoku & Watch Solver

## 1. Aesthetic Direction: The Modern Interactive Book of Logic
The design feels like a beautifully printed, contemporary puzzle book — calm, tactile, and deeply legible. It rejects noisy game cliches (no bouncy candy animations, no cartoon badges, no confetti) in favor of crisp typography, deliberate hierarchy, and purposeful color coding that clarifies the solver's deductive reasoning.

Motion occurs strictly in response to playback, navigation, or direct user input. Page load is calm and instantaneous.

---

## 2. Typography
- **Primary Interface & Explanations:** Clean, contemporary sans-serif with high x-height (`Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`, `sans-serif`).
- **Board Digits & Live Candidates:** Fixed-width tabular figures (`font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1;`), using high-legibility geometric/grotesque glyphs (`Outfit` / `Inter` / system monospace fallbacks) to ensure digits and 3×3 pencil mark grids never shift adjacent layout.
- **Micro-type (Candidate Marks):** 3×3 pencil grid with fixed slot coordinates (1-9) per empty cell, optically sized and centered.

---

## 3. Restrained Color Palette & Semantic Roles
A cohesive 7-role semantic palette tested for WCAG AA contrast (≥ 4.5:1 against surfaces) and colorblind safety (using shape/stroke cues alongside hue so no state relies solely on red/green distinctions).

| Role | Light Theme Hex / HSL | Dark Theme Hex / HSL | Semantic Meaning |
|---|---|---|---|
| **Surface Base** | `#F8F9FA` / `hsl(210, 17%, 98%)` | `#12151A` / `hsl(220, 18%, 9%)` | App background, paper-like matte finish |
| **Board / Card Surface** | `#FFFFFF` / `hsl(0, 0%, 100%)` | `#1A1E26` / `hsl(220, 19%, 13%)` | Board interior, dialog cards, sidebars |
| **Grid Lines (Box)** | `#2B303A` (2px solid) | `#60697B` (2px solid) | 3×3 major box boundaries |
| **Grid Lines (Cell)** | `#DCE1E8` (1px solid) | `#2E3646` (1px solid) | 1×1 cell boundaries |
| **Given Digits** | `#0F172A` / Bold 700 | `#F1F5F9` / Bold 700 | Original puzzle clues (locked) |
| **Player Digits** | `#1D4ED8` / Medium 600 | `#60A5FA` / Medium 600 | Digits entered by the human solver |
| **Logic Placed** | `#0D9488` / Medium 600 | `#2DD4BF` / Medium 600 | Placed via deduction (naked/hidden singles) |
| **Guessed Digits** | Depth ramp (Sapphire → Violet → Amber) | Depth ramp | Trial & error / MRV branch decisions |
| **Candidate Notes** | `#64748B` / Regular 400 | `#94A3B8` / Regular 400 | Live candidates / player pencil notes |
| **Selection / Focus** | `#E0E7FF` / Border `#4338CA` | `#312E81` / Border `#818CF8` | Active cell + peer row/col/box highlight |
| **Conflict / Error** | `#E11D48` / Light `#FFE4E6` | `#F43F5E` / Dark `#4C0519` | Duplicate numbers, dead-end contradictions |

### Guess Depth Ramp (Colorblind-Safe Hue + Numeric Indicator)
- **Depth 1:** Royal Cobalt (`#2563EB` / `#60A5FA`)
- **Depth 2:** Deep Purple (`#7C3AED` / `#A78BFA`)
- **Depth 3:** Magenta / Plum (`#C026D3` / `#E879F9`)
- **Depth 4+:** Amber Ochre (`#D97706` / `#FBBF24`)
*Accessibility:* In addition to color, guessed digits display a small subscript/tag denoting depth (e.g. `7₂`) and an explicit ARIA label announcing `Guessed at depth 2`.

---

## 4. Layout Architecture
- **Responsive Breakpoint:** Fluid scaling down to 360px portrait mobile.
- **Desktop (≥ 1024px):**
  - Left / Center: Square 9×9 board (`max(360px, min(70vh, 580px))`), perfectly centered.
  - Right: Unified inspection sidebar (Search Tree / Decision Stack, Step-by-Step Explanation Log, Live Stats).
  - Bottom / Below Board: Playback scrubber and step navigation controls.
- **Mobile (< 1024px):**
  - Board pinned at top (square, full width with 12px padding).
  - Sticky bottom touch toolbar with min 44×44px hit targets.
  - Collapsible drawer / bottom tabs for Tree, Explanations, and Stats.

---

## 5. Watch Solver Visual Treatments
- **Naked Single:** Subtle pulse on cell; single candidate glows teal before converting to placed digit.
- **Hidden Single:** The defining unit (row, column, or 3×3 box) receives a crisp tinted highlight frame (`#0D948820`), drawing the eye to the single remaining coordinate.
- **Eliminate:** Affected candidate marks in peer cells show a strike-through line and fade out cleanly.
- **Branch:** Cell highlights with depth color; decision stack adds new guess node.
- **Contradiction:** Offending cell or empty candidate set flashes rose `#E11D48`, accompanied by an immediate explanation in the live log.
- **Backtrack:** Undone cells clear with a smooth rollback animation (or instant state change under `prefers-reduced-motion`); decision stack strikes through failed branch and pivots to alternative.

---

## 6. Levels Mode Map
Styled as an elegant, embossed **Table of Contents** of a classic puzzle compendium:
- Worlds 1 through 5 (Beginner, Easy, Medium, Hard, Expert) followed by Endless Expert Chapters.
- Clean typography cards with world title, difficulty descriptor, star completion counter (e.g. `28 / 30 ★`).
- Level grid tiles (1-10) with crisp star icons (empty / filled), completion time, and an ornate seal/badge for the Level 10 Boss level.
- Virtualized list rendering for smooth 60fps scrolling through hundreds of levels.
