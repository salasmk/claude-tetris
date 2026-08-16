# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Vanilla JavaScript Tetris. No build step, no package manager, no dependencies — just `index.html`, `style.css`, and `game.js` (~300 lines) served or opened directly.

## Running the game

There is no build/lint/test tooling. To run:

```bash
start index.html        # Windows: open directly in browser
# or serve locally
python3 -m http.server 8000
npx serve .
```

Then verify changes by opening the page in a browser and playing — there are no automated tests.

## Architecture

Everything lives in `game.js` as module-level state and free functions (no classes, no build-time modules).

- **Board model**: `board` is a `ROWS × COLS` matrix (20×10); each cell is `0` (empty) or a color index 1–7 identifying which piece locked there.
- **Pieces**: `PIECES` defines the 7 tetrominoes as square matrices. `current` and `next` are `{ type, shape, x, y }` objects. Rotation is `rotateCW` (transpose + reverse), applied via `tryRotate`, which attempts wall kicks at offsets `[0, -1, 1, -2, 2]` before giving up.
- **Collision**: `collide(shape, ox, oy)` is the single source of truth used by movement, rotation, ghost-piece projection, and spawn-blocking (game over) checks — reuse it rather than writing bespoke bounds checks.
- **Game loop**: `loop(ts)` runs via `requestAnimationFrame`, accumulating elapsed time in `dropAccum` and dropping the piece one row once `dropInterval` is exceeded, otherwise calling `lockPiece()` (which merges into `board`, clears lines, and spawns the next piece).
- **Scoring/leveling**: base line score is `LINE_SCORES[count]` (or `TSPIN_SCORES[count]` for a T-spin clear) `× level`, then `× combo` (the consecutive-clear streak multiplier: `combo` increments each lock that clears ≥1 line and resets to `0` on a lock that clears none). A Tetris (`count === 4`) immediately following another Tetris (`backToBackTetris`) gets an extra `× B2B_MULTIPLIER`. A `board` left fully empty after a clear adds a flat `PERFECT_CLEAR_BONUS × level`. `lockPiece()` computes T-spin eligibility via `isTSpin()` (last action was a rotation, tracked in `lastAction`, plus the standard 3-corner occupancy rule reusing `collide()`) before merging, then passes it into `clearLines()`/`addLinesCleared()`. Power-up-triggered clears pass `{ trackCombo: false }` so they don't affect the combo/B2B/perfect-clear state — that system only tracks natural player clears. Hard drop adds 2 pts/row, soft drop 1 pt/row (untouched by combo). Level increments every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)`. `triggerComboFeedback()` shows a fading canvas overlay (`comboEffect`, rendered in `draw()`) and plays a short Web Audio oscillator cue (`beep()`/`playComboSound()`) for combos/T-spins/Tetris/B2B/Perfect Clear — no audio/image assets are used.
- **Rendering**: `draw()` clears and redraws the whole board canvas every frame (grid, locked blocks, ghost piece at `globalAlpha = 0.2`, current piece); `drawNext()` renders the preview canvas separately. There's no dirty-rect optimization — keep it simple if extending.
- **Input**: a single `keydown` listener switches on `e.code` (arrows, `KeyX` for rotate, `Space` for hard drop, `KeyP` for pause); pause/game-over states short-circuit input handling.

If you change `COLS`, `ROWS`, or `BLOCK`, update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).

## CI

`.github/workflows/` contains Claude Code Review and Claude PR Assistant GitHub Actions — they run automatically on PR/issue events, no local invocation needed.
