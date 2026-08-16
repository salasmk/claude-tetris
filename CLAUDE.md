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
- **Scoring/leveling**: `LINE_SCORES = [0,100,300,500,800]` multiplied by `level`; hard drop adds 2 pts/row, soft drop 1 pt/row. Level increments every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Rendering**: `draw()` clears and redraws the whole board canvas every frame (grid, locked blocks, ghost piece at `globalAlpha = 0.2`, current piece); `drawNext()` renders the preview canvas separately. There's no dirty-rect optimization — keep it simple if extending.
- **Input**: a single `keydown` listener switches on `e.code` (arrows, `KeyX` for rotate, `Space` for hard drop, `KeyP` for pause); pause/game-over states short-circuit input handling.

If you change `COLS`, `ROWS`, or `BLOCK`, update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).

## CI

`.github/workflows/` contains Claude Code Review and Claude PR Assistant GitHub Actions — they run automatically on PR/issue events, no local invocation needed.
