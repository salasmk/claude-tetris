'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // Nut - metallic gray
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Nut - 3x3 ring with hollow center
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const TSPIN_SCORES = [0, 400, 800, 1200]; // T-spin single/double/triple (T can never clear 4)
const PERFECT_CLEAR_BONUS = 2000;
const B2B_MULTIPLIER = 1.5;

const WILDCARD = -1;
const POWERUP_INTERVAL = 5; // lines between power-up spawns
const POWERUP_TYPES = ['bomb', 'lightning', 'tint', 'gravity', 'freeze'];
const POWERUP_META = {
  bomb: { color: '#ff5252', icon: '💣' },
  lightning: { color: '#fff176', icon: '⚡' },
  tint: { color: '#ce93d8', icon: '🎨' },
  gravity: { color: '#78909c', icon: '⬇' },
  freeze: { color: '#4fc3f7', icon: '❄' },
};

const NEXT_QUEUE_SIZE = 5;
const SKILL_ENERGY_MAX = 100;
const SKILL_ENERGY_PER_LINE = 20; // per line, natural clears only (mirrors trackCombo convention)
const SKILL_PEEK_DURATION = 8000;
const SKILL_SLOW_DURATION = 10000;
const SKILL_SLOW_RATE = 0.5; // drop accumulates at half speed while active
const SKILL_LABELS = {
  peek: 'VISIÓN x5',
  swap: 'INTERCAMBIO',
  slow: 'TIEMPO LENTO',
  undo: 'DESHECHO',
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const peekSection = document.getElementById('peek-section');
const peekCanvas = document.getElementById('peek-canvas');
const peekCtx = peekCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const energyBar = document.getElementById('energy-bar');
const energyFill = document.getElementById('energy-fill');
const energyHint = document.getElementById('energy-hint');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const menuBtn = document.getElementById('menu-btn');
const menuOverlay = document.getElementById('menu-overlay');
const modeButtons = document.querySelectorAll('.mode-btn[data-challenge]');
const challengePanel = document.getElementById('challenge-panel');
const challengeGoalEl = document.getElementById('challenge-goal');
const challengeTimeEl = document.getElementById('challenge-time');
const themeToggle = document.getElementById('theme-toggle');
const skillOverlay = document.getElementById('skill-overlay');
const skillButtons = document.querySelectorAll('.skill-btn');
const skillCancelBtn = document.getElementById('skill-cancel-btn');

let board, current, nextQueue, score, lines, level, paused, gameOver, gameStarted, lastTime, dropAccum, dropInterval, animId;
let pendingPowerUp, nextPowerUpAt, frozenUntil;
let combo, backToBackTetris, lastAction, comboEffect, audioCtx;
let challenge, currentChallengeId;
let skillEnergy, choosingSkill, holdPiece, holdUsed, peekUntil, slowUntil, lastLockSnapshot;

// Challenge definitions: each entry describes a win condition (`goal`),
// an optional overall countdown (`timeLimitMs`), and rule modifiers applied
// at specific call sites (tryRotate, draw, loop) rather than replacing them.
const CHALLENGES = {
  lines40: {
    id: 'lines40',
    name: 'Contrarreloj',
    description: 'Limpia 40 líneas en 2 minutos',
    goal: { type: 'lines', target: 40 },
    timeLimitMs: 120000,
    modifiers: {},
  },
  garbage: {
    id: 'garbage',
    name: 'Supervivencia',
    description: 'Sobrevive con basura subiendo desde abajo cada 10s',
    goal: { type: 'survive', target: 90000 },
    modifiers: { garbageIntervalMs: 10000 },
  },
  fixed: {
    id: 'fixed',
    name: 'Bloques fijos',
    description: 'Limpia 15 líneas en un tablero con obstáculos pre-colocados',
    goal: { type: 'lines', target: 15 },
    modifiers: { prefilledBlocks: true },
  },
  invisible: {
    id: 'invisible',
    name: 'Piezas invisibles',
    description: 'Limpia 20 líneas; las piezas se vuelven invisibles al tocar el suelo',
    goal: { type: 'lines', target: 20 },
    modifiers: { invisibleOnLand: true },
  },
  reverse: {
    id: 'reverse',
    name: 'Rotación inversa',
    description: 'Limpia 30 líneas; la rotación se invierte desde el nivel 2',
    goal: { type: 'lines', target: 30 },
    modifiers: { reverseAtLevel: 2 },
  },
};

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.checked = theme === 'light';
  localStorage.setItem('tetris-theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('tetris-theme');
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

function gridColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim();
}

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
});

initTheme();

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

// Seeds the bottom rows with fixed obstacle blocks (reusing the metallic
// "Nut" color index) for the "Bloques fijos" challenge. Written as plain
// board cells so collide()/draw()/clearLines() work unmodified.
function seedFixedBlocks(b) {
  const startRow = ROWS - 6;
  for (let r = startRow; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (Math.random() < 0.35) b[r][c] = 8;
    }
  }
  // Guard against accidentally pre-seeding an already-complete row.
  for (let r = startRow; r < ROWS; r++) {
    if (b[r].every(v => v !== 0)) b[r][Math.floor(Math.random() * COLS)] = 0;
  }
}

function randomPiece() {
  if (pendingPowerUp) {
    pendingPowerUp = false;
    return randomPowerUp();
  }
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPowerUp() {
  const special = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  return { type: 'powerup', special, shape: [[1]], x: Math.floor(COLS / 2), y: 0 };
}

function fillQueue() {
  while (nextQueue.length < NEXT_QUEUE_SIZE) nextQueue.push(randomPiece());
}

function clonePiece(piece) {
  return piece ? { ...piece, shape: piece.shape.map(row => [...row]) } : null;
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function rotateCCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[cols - 1 - c][r] = shape[r][c];
  return result;
}

function tryRotate() {
  const reverse = challenge && challenge.modifiers.reverseAtLevel && level >= challenge.modifiers.reverseAtLevel;
  const rotated = reverse ? rotateCCW(current.shape) : rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      lastAction = 'rotate';
      return;
    }
  }
}

// Standard 3-corner rule: a T-spin requires the last action to be a rotation
// and at least 3 of the 4 corners of the piece's 3x3 box to be occupied.
// Reuses collide() (via a 1x1 probe) as the single source of truth for occupancy.
function isTSpin() {
  if (current.special || current.type !== 3 || lastAction !== 'rotate') return false;
  const { x, y } = current;
  const corners = [
    collide([[1]], x, y),
    collide([[1]], x + 2, y),
    collide([[1]], x, y + 2),
    collide([[1]], x + 2, y + 2),
  ];
  return corners.filter(Boolean).length >= 3;
}

function isBoardEmpty() {
  return board.every(row => row.every(v => v === 0));
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

// Power-up-triggered clears (e.g. lightning) pass trackCombo:false — they're a
// separate mechanic and shouldn't build or break the player's natural combo streak.
function addLinesCleared(count, opts = {}) {
  const { isTSpin = false, trackCombo = true } = opts;
  if (!count) {
    if (trackCombo && combo !== 0) {
      combo = 0;
      updateHUD();
    }
    return;
  }

  lines += count;
  const isTetris = count === 4;

  if (trackCombo) combo++;
  const comboMultiplier = trackCombo ? combo : 1;

  const base = (isTSpin ? TSPIN_SCORES[count] : LINE_SCORES[count]) || 0;
  let lineScore = base * level * comboMultiplier;

  let isB2B = false;
  if (trackCombo) {
    if (isTetris && backToBackTetris) {
      isB2B = true;
      lineScore = Math.round(lineScore * B2B_MULTIPLIER);
    }
    backToBackTetris = isTetris;
    skillEnergy = Math.min(SKILL_ENERGY_MAX, skillEnergy + count * SKILL_ENERGY_PER_LINE);
  }
  score += lineScore;

  let perfectClear = false;
  if (trackCombo && isBoardEmpty()) {
    perfectClear = true;
    score += PERFECT_CLEAR_BONUS * level;
  }

  level = Math.floor(lines / 10) + 1;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  while (lines >= nextPowerUpAt) {
    pendingPowerUp = true;
    nextPowerUpAt += POWERUP_INTERVAL;
  }

  if (trackCombo) triggerComboFeedback({ combo, isTSpin, isTetris, isB2B, perfectClear });
  updateHUD();

  if (challenge && challenge.goal.type === 'lines' && !gameOver) {
    challenge.linesCleared += count;
    updateChallengeHUD();
    if (challenge.linesCleared >= challenge.goal.target) challengeSucceed();
  }
}

function clearLines(opts = {}) {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  addLinesCleared(cleared, opts);
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  if (performance.now() < frozenUntil) return;
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (performance.now() < frozenUntil) return;
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function snapshotBeforeLock() {
  return {
    board: board.map(row => [...row]),
    score, lines, level, combo, backToBackTetris,
    pendingPowerUp, nextPowerUpAt,
    current: clonePiece(current),
    nextQueue: nextQueue.map(clonePiece),
    holdPiece: clonePiece(holdPiece),
    holdUsed,
  };
}

function restoreSnapshot(snap) {
  board = snap.board.map(row => [...row]);
  score = snap.score;
  lines = snap.lines;
  level = snap.level;
  combo = snap.combo;
  backToBackTetris = snap.backToBackTetris;
  pendingPowerUp = snap.pendingPowerUp;
  nextPowerUpAt = snap.nextPowerUpAt;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  current = clonePiece(snap.current);
  nextQueue = snap.nextQueue.map(clonePiece);
  holdPiece = clonePiece(snap.holdPiece);
  holdUsed = snap.holdUsed;
  gameOver = false;
  drawNext();
  drawHold();
  updateHUD();
}

function lockPiece() {
  lastLockSnapshot = snapshotBeforeLock();
  const tspin = isTSpin();
  if (current.special) {
    applyPowerUp(current);
    clearLines({ trackCombo: false });
  } else {
    merge();
    clearLines({ isTSpin: tspin });
  }
  lastAction = null;
  holdUsed = false;
  spawn();
  drawHold();
}

function applyPowerUp(piece) {
  switch (piece.special) {
    case 'bomb': applyBomb(piece.x, piece.y); break;
    case 'lightning': applyLightning(piece.x, piece.y); break;
    case 'tint': applyTint(); break;
    case 'gravity': applyGravity(); break;
    case 'freeze': applyFreeze(); break;
  }
}

function applyBomb(cx, cy) {
  for (let r = cy - 1; r <= cy + 1; r++) {
    if (r < 0 || r >= ROWS) continue;
    for (let c = cx - 1; c <= cx + 1; c++) {
      if (c < 0 || c >= COLS) continue;
      board[r][c] = 0;
    }
  }
}

function applyLightning(cx, cy) {
  if (cy >= 0 && cy < ROWS) {
    board.splice(cy, 1);
    board.unshift(new Array(COLS).fill(0));
    addLinesCleared(1, { trackCombo: false });
  }
  if (cx >= 0 && cx < COLS) {
    for (let r = 0; r < ROWS; r++) board[r][cx] = 0;
    score += LINE_SCORES[1] * level;
    updateHUD();
  }
}

function applyTint() {
  const counts = new Array(COLORS.length).fill(0);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] > 0) counts[board[r][c]]++;
  let targetColor = 0, max = 0;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] > max) { max = counts[i]; targetColor = i; }
  }
  if (!targetColor) return;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === targetColor) board[r][c] = WILDCARD;
}

function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    const colVals = [];
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c]) colVals.push(board[r][c]);
    }
    const pad = ROWS - colVals.length;
    for (let r = 0; r < ROWS; r++) {
      board[r][c] = r < pad ? 0 : colVals[r - pad];
    }
  }
}

function applyFreeze() {
  frozenUntil = lastTime + 5000;
}

// Inserts a garbage row from the bottom and shifts the rest of the board up
// by one, mirroring merge()/clearLines() by writing plain cells into `board`
// so collide() keeps being the single source of truth for the resulting
// overlap/game-over check.
function addGarbageRow() {
  board.shift();
  const row = new Array(COLS).fill(8);
  row[Math.floor(Math.random() * COLS)] = 0;
  board.push(row);
  if (collide(current.shape, current.x, current.y)) {
    challengeFail('¡La basura te alcanzó!');
  }
}

function buildChallenge(id) {
  const def = CHALLENGES[id];
  if (!def) return null;
  return {
    ...def,
    modifiers: { ...def.modifiers },
    goal: { ...def.goal },
    linesCleared: 0,
    elapsedMs: 0,
    garbageAccum: 0,
  };
}

function formatTime(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateChallengeHUD() {
  if (!challenge) return;
  if (challenge.goal.type === 'lines') {
    challengeGoalEl.textContent = `${challenge.linesCleared}/${challenge.goal.target} líneas`;
  } else if (challenge.goal.type === 'survive') {
    challengeGoalEl.textContent = `Sobrevive ${formatTime(challenge.goal.target)}`;
  }
  if (challenge.timeLimitMs != null) {
    challengeTimeEl.textContent = formatTime(challenge.timeLimitMs - challenge.elapsedMs);
  } else if (challenge.goal.type === 'survive') {
    challengeTimeEl.textContent = formatTime(challenge.goal.target - challenge.elapsedMs);
  } else {
    challengeTimeEl.textContent = '-';
  }
}

// Ticked once per frame from loop() using the same ts delta that drives
// dropAccum, rather than a second RAF loop.
function tickChallenge(dt) {
  if (!challenge || gameOver) return;
  challenge.elapsedMs += dt;

  if (challenge.modifiers.garbageIntervalMs) {
    challenge.garbageAccum += dt;
    if (challenge.garbageAccum >= challenge.modifiers.garbageIntervalMs) {
      challenge.garbageAccum -= challenge.modifiers.garbageIntervalMs;
      addGarbageRow();
      if (gameOver) return;
    }
  }

  if (challenge.timeLimitMs != null && challenge.elapsedMs >= challenge.timeLimitMs) {
    challengeFail('¡Se acabó el tiempo!');
    return;
  }

  if (challenge.goal.type === 'survive' && challenge.elapsedMs >= challenge.goal.target) {
    challengeSucceed();
    return;
  }

  updateChallengeHUD();
}

function challengeSucceed() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = '¡DESAFÍO SUPERADO!';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function challengeFail(reason) {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'DESAFÍO FALLIDO';
  overlayScore.textContent = reason || `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function spawn() {
  current = nextQueue.shift();
  fillQueue();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  comboEl.textContent = combo >= 2 ? `x${combo}` : '-';
  const pct = Math.min(100, (skillEnergy / SKILL_ENERGY_MAX) * 100);
  energyFill.style.width = `${pct}%`;
  const ready = skillEnergy >= SKILL_ENERGY_MAX;
  energyBar.classList.toggle('ready', ready);
  energyHint.hidden = !ready;
}

function getAudioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function beep(freq, duration, delay = 0, type = 'square', peakGain = 0.08) {
  const ac = getAudioCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ac.destination);
  const startAt = ac.currentTime + delay;
  gain.gain.setValueAtTime(peakGain, startAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.start(startAt);
  osc.stop(startAt + duration);
}

function playComboSound({ combo, isTSpin, isTetris, isB2B, perfectClear }) {
  if (perfectClear) {
    [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, i * 0.09, 'triangle', 0.1));
    return;
  }
  if (isB2B) {
    beep(880, 0.12, 0, 'sawtooth', 0.09);
    beep(1108, 0.16, 0.1, 'sawtooth', 0.09);
    return;
  }
  if (isTetris) {
    beep(660, 0.14, 0, 'square', 0.09);
    beep(880, 0.16, 0.1, 'square', 0.09);
    return;
  }
  if (isTSpin) {
    beep(740, 0.15, 0, 'sawtooth', 0.08);
    return;
  }
  if (combo >= 2) {
    beep(440 + Math.min(combo, 8) * 60, 0.1, 0, 'square', 0.07);
  }
}

function triggerComboFeedback({ combo, isTSpin, isTetris, isB2B, perfectClear }) {
  const lines = [];
  if (isTSpin) lines.push('T-SPIN!');
  if (isTetris) lines.push('TETRIS!');
  if (isB2B) lines.push('BACK-TO-BACK!');
  if (combo >= 2) lines.push(`COMBO x${combo}`);
  if (perfectClear) lines.push('PERFECT CLEAR!');
  if (!lines.length) return;
  comboEffect = { lines, startedAt: performance.now(), duration: 1400 };
  playComboSound({ combo, isTSpin, isTetris, isB2B, perfectClear });
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = colorIndex === WILDCARD
    ? `hsl(${(performance.now() / 8) % 360}, 80%, 65%)`
    : COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawPowerUp(context, x, y, special, size, alpha) {
  const meta = POWERUP_META[special];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = meta.color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.font = `${Math.floor(size * 0.6)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(meta.icon, x * size + size / 2, y * size + size / 2 + 1);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost + current piece — hidden once landed for the "piezas invisibles" challenge
  const gy = ghostY();
  const landed = challenge && challenge.modifiers.invisibleOnLand &&
    collide(current.shape, current.x, current.y + 1);
  if (!landed) {
    if (current.special) {
      drawPowerUp(ctx, current.x, gy, current.special, BLOCK, 0.2);
      drawPowerUp(ctx, current.x, current.y, current.special, BLOCK);
    } else {
      for (let r = 0; r < current.shape.length; r++)
        for (let c = 0; c < current.shape[r].length; c++)
          if (current.shape[r][c])
            drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

      // current piece
      for (let r = 0; r < current.shape.length; r++)
        for (let c = 0; c < current.shape[r].length; c++)
          drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
    }
  }

  drawComboEffect();
  updatePeekVisibility();
}

function drawComboEffect() {
  if (!comboEffect) return;
  const elapsed = performance.now() - comboEffect.startedAt;
  if (elapsed > comboEffect.duration) {
    comboEffect = null;
    return;
  }
  const progress = elapsed / comboEffect.duration;
  const alpha = progress < 0.7 ? 1 : Math.max(0, 1 - (progress - 0.7) / 0.3);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 22px sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.fillStyle = '#ffd54f';
  const lineHeight = 26;
  const startY = canvas.height / 2 - ((comboEffect.lines.length - 1) * lineHeight) / 2;
  comboEffect.lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    ctx.strokeText(line, canvas.width / 2, y);
    ctx.fillText(line, canvas.width / 2, y);
  });
  ctx.restore();
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const upcoming = nextQueue[0];
  if (upcoming.special) {
    drawPowerUp(nextCtx, 1, 1, upcoming.special, NB);
    return;
  }
  const shape = upcoming.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function drawHold() {
  const HB = 30;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  holdCanvas.classList.toggle('hold-used', holdUsed);
  if (!holdPiece) return;
  const alpha = holdUsed ? 0.35 : 1;
  if (holdPiece.special) {
    drawPowerUp(holdCtx, 1, 1, holdPiece.special, HB, alpha);
    return;
  }
  const shape = holdPiece.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(holdCtx, offX + c, offY + r, shape[r][c], HB, alpha);
}

// Renders all 5 queued pieces in a single row; only shown while the "ver
// próximas 5" skill is active (see updatePeekVisibility, called from draw()).
function drawPeek() {
  const PB = 18;
  peekCtx.clearRect(0, 0, peekCanvas.width, peekCanvas.height);
  nextQueue.forEach((piece, i) => {
    const gx = i * 4;
    if (piece.special) {
      drawPowerUp(peekCtx, gx + 1, 1, piece.special, PB);
      return;
    }
    const shape = piece.shape;
    const offX = Math.floor((4 - shape[0].length) / 2);
    const offY = Math.floor((4 - shape.length) / 2);
    for (let r = 0; r < shape.length; r++)
      for (let c = 0; c < shape[r].length; c++)
        drawBlock(peekCtx, gx + offX + c, offY + r, shape[r][c], PB);
  });
}

function updatePeekVisibility() {
  const active = performance.now() < peekUntil;
  peekSection.hidden = !active;
  if (active) drawPeek();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = challenge ? 'DESAFÍO FALLIDO' : 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function usePeek() {
  peekUntil = performance.now() + SKILL_PEEK_DURATION;
  return true;
}

function useSwapPool() {
  if (current.special) return false;
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  if (!collide(shape, current.x, current.y)) {
    current = { type, shape, x: current.x, y: current.y };
    return true;
  }
  const cx = Math.floor(COLS / 2) - Math.floor(shape[0].length / 2);
  if (!collide(shape, cx, current.y)) {
    current = { type, shape, x: cx, y: current.y };
    return true;
  }
  return false;
}

function useSlowTime() {
  slowUntil = performance.now() + SKILL_SLOW_DURATION;
  return true;
}

function useUndo() {
  if (!lastLockSnapshot) return false;
  restoreSnapshot(lastLockSnapshot);
  lastLockSnapshot = null;
  return true;
}

// Standard modern-Tetris hold: swaps the active piece into the hold slot,
// respawning it at the standard spawn position/orientation (never the
// rotation it had when stored). Usable at most once per piece — holdUsed is
// cleared in lockPiece() once the current piece settles.
function holdSwap() {
  if (holdUsed || current.special) return false;
  if (holdPiece) {
    const swapped = clonePiece(holdPiece);
    const spawnX = Math.floor(COLS / 2) - Math.floor(swapped.shape[0].length / 2);
    holdPiece = { type: current.type, shape: PIECES[current.type].map(row => [...row]) };
    current = { type: swapped.type, shape: swapped.shape, x: spawnX, y: 0 };
    if (collide(current.shape, current.x, current.y)) endGame();
  } else {
    holdPiece = { type: current.type, shape: PIECES[current.type].map(row => [...row]) };
    current = nextQueue.shift();
    fillQueue();
    if (collide(current.shape, current.x, current.y)) endGame();
  }
  lastAction = null;
  holdUsed = true;
  drawHold();
  drawNext();
  return true;
}

function triggerSkillFeedback(skillKey) {
  comboEffect = { lines: [SKILL_LABELS[skillKey] || 'HABILIDAD'], startedAt: performance.now(), duration: 1200 };
  beep(520, 0.12, 0, 'triangle', 0.09);
  beep(780, 0.14, 0.08, 'triangle', 0.09);
}

function openSkillSelection() {
  if (skillEnergy < SKILL_ENERGY_MAX || choosingSkill || paused || gameOver) return;
  choosingSkill = true;
  cancelAnimationFrame(animId);
  skillOverlay.classList.remove('hidden');
}

function cancelSkillSelection() {
  if (!choosingSkill) return;
  choosingSkill = false;
  skillOverlay.classList.add('hidden');
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function selectSkill(skillKey) {
  if (!choosingSkill) return;
  let success = false;
  switch (skillKey) {
    case 'peek': success = usePeek(); break;
    case 'swap': success = useSwapPool(); break;
    case 'slow': success = useSlowTime(); break;
    case 'undo': success = useUndo(); break;
  }
  choosingSkill = false;
  skillOverlay.classList.add('hidden');
  if (success) {
    skillEnergy = 0;
    triggerSkillFeedback(skillKey);
  }
  updateHUD();
  if (!gameOver) {
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  tickChallenge(dt);
  if (gameOver) { draw(); return; }
  if (ts >= frozenUntil) {
    dropAccum += ts < slowUntil ? dt * SKILL_SLOW_RATE : dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  challenge = currentChallengeId ? buildChallenge(currentChallengeId) : null;
  board = createBoard();
  if (challenge && challenge.modifiers.prefilledBlocks) seedFixedBlocks(board);
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  gameStarted = true;
  dropInterval = 1000;
  dropAccum = 0;
  pendingPowerUp = false;
  nextPowerUpAt = POWERUP_INTERVAL;
  frozenUntil = 0;
  combo = 0;
  backToBackTetris = false;
  lastAction = null;
  comboEffect = null;
  skillEnergy = 0;
  choosingSkill = false;
  holdPiece = null;
  holdUsed = false;
  peekUntil = 0;
  slowUntil = 0;
  lastLockSnapshot = null;
  lastTime = performance.now();
  nextQueue = [];
  fillQueue();
  spawn();
  drawHold();
  updateHUD();
  challengePanel.hidden = !challenge;
  updateChallengeHUD();
  overlay.classList.add('hidden');
  menuOverlay.classList.add('hidden');
  skillOverlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function showMenu() {
  cancelAnimationFrame(animId);
  gameOver = true;
  overlay.classList.add('hidden');
  menuOverlay.classList.remove('hidden');
}

function startGame(challengeId) {
  currentChallengeId = challengeId || null;
  init();
}

document.addEventListener('keydown', e => {
  if (!gameStarted) return;
  if (choosingSkill) {
    switch (e.code) {
      case 'Digit1': selectSkill('peek'); break;
      case 'Digit2': selectSkill('swap'); break;
      case 'Digit3': selectSkill('slow'); break;
      case 'Digit4': selectSkill('undo'); break;
      case 'Escape': cancelSkillSelection(); break;
    }
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  if (e.code === 'KeyC') { openSkillSelection(); return; }
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) { current.x--; lastAction = 'move'; }
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) { current.x++; lastAction = 'move'; }
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      holdSwap();
      break;
  }
  updateHUD();
});

modeButtons.forEach(btn => {
  btn.addEventListener('click', () => startGame(btn.dataset.challenge));
});

skillButtons.forEach(btn => {
  btn.addEventListener('click', () => selectSkill(btn.dataset.skill));
});

skillCancelBtn.addEventListener('click', cancelSkillSelection);

restartBtn.addEventListener('click', () => startGame(currentChallengeId));
menuBtn.addEventListener('click', showMenu);
