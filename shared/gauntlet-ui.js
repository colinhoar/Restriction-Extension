/**
 * Shared Gauntlet UI
 * Renders the multi-wave puzzle gauntlet. Used by both the toolbar popup and the
 * full-page guard that stands in front of chrome://extensions.
 *
 * The host page must contain the gauntlet markup (same element IDs in both pages),
 * load this script first, then set:
 *   Gauntlet.purpose = 'disable' | 'guard'
 *   Gauntlet.hooks   = { onFailed(response), onReset(), onClosed() }
 */

const $ = (id) => document.getElementById(id);

const Gauntlet = {
  purpose: 'disable',
  hooks: {
    onFailed() {},
    onReset() {},
    onClosed() {}
  }
};

function send(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, (res) => resolve(res || {})));
}

const views = {
  get puzzle() { return $('puzzleView'); },
  get countdown() { return $('countdownView'); },
  get denial() { return $('denialMessage'); },
  get failed() { return $('failedMessage'); }
};

let currentPuzzle = null;
let submitting = false;
let timers = [];           // puzzle-scoped timeouts/intervals, cleared on every re-render

/** Wire up the shared controls. Call once after the DOM is ready. */
function setupGauntletControls() {
  $('submitAnswer').addEventListener('click', () => submitAnswer($('answerInput').value));
  $('answerInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitAnswer($('answerInput').value);
  });
  $('cancelChallenge').addEventListener('click', cancelGauntlet);

  // No pasting, dropping or autofill: answers must be typed by hand.
  const input = $('answerInput');
  ['paste', 'drop', 'contextmenu'].forEach((evt) =>
    input.addEventListener(evt, (e) => {
      e.preventDefault();
      if (evt !== 'contextmenu') showError('Pasting is disabled. Type it yourself.');
    }));
}

async function cancelGauntlet() {
  await send({ action: 'cancelGauntlet', purpose: Gauntlet.purpose });
  closeModal();
  Gauntlet.hooks.onClosed();
}

/* ------------------------------------------------------------------ */
/* Modal / gauntlet rendering                                          */
/* ------------------------------------------------------------------ */
function openModal() {
  document.body.classList.add('modal-open');
  $('challengeModal').classList.remove('hidden');
  hideError();
}

function closeModal() {
  clearTimers();
  document.body.classList.remove('modal-open');
  $('challengeModal').classList.add('hidden');
  Object.values(views).forEach((v) => v.classList.add('hidden'));
  $('gauntletHeader').classList.remove('hidden');
  $('cancelChallenge').classList.remove('hidden');
  currentPuzzle = null;
  hideError();
}

function showView(name) {
  Object.entries(views).forEach(([key, el]) => el.classList.toggle('hidden', key !== name));
}

function clearTimers() {
  timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
  timers = [];
}

function later(fn, ms) { const t = setTimeout(fn, ms); timers.push(t); return t; }
function every(fn, ms) { const t = setInterval(fn, ms); timers.push(t); return t; }

function renderHeader(state) {
  $('gauntletHeader').classList.remove('hidden');
  $('cancelChallenge').classList.remove('hidden');
  const isFinal = state.wave === state.totalWaves;
  $('waveLabel').textContent = state.phase === 'countdown'
    ? `All ${state.totalWaves} waves cleared`
    : `Wave ${state.wave} of ${state.totalWaves}${isFinal ? ' · Final' : ''}`;
  const done = state.phase === 'countdown' ? state.totalWaves : state.wave - 1;
  $('progressFill').style.width = `${(done / state.totalWaves) * 100}%`;

  const dots = $('strikeDots');
  dots.innerHTML = '';
  for (let i = 0; i < state.maxStrikes; i++) {
    const d = document.createElement('span');
    d.className = 'strike-dot' + (i < state.strikes ? ' used' : '');
    dots.appendChild(d);
  }
  dots.title = `Strikes: ${state.strikes} of ${state.maxStrikes}`;
}

function renderGauntlet(state) {
  clearTimers();
  submitting = false;
  if (!state) { closeModal(); return; }
  renderHeader(state);

  if (state.phase === 'countdown') {
    currentPuzzle = null;
    showView('countdown');
    const btn = $('confirmDisable');
    const tick = () => {
      const left = Math.max(0, Math.ceil((state.countdownUntil - Date.now()) / 1000));
      $('timerDisplay').textContent = left;
      btn.disabled = left > 0;
      btn.classList.toggle('btn-pulse', left === 0);
    };
    tick();
    every(tick, 250);
    return;
  }

  showView('puzzle');
  const lockLeft = state.lockedUntil - Date.now();
  if (lockLeft > 0) {
    showLockout(state.lockedUntil, () => renderPuzzle(state.puzzle));
  } else {
    renderPuzzle(state.puzzle);
  }
}

function showLockout(until, then) {
  const overlay = $('lockoutOverlay');
  overlay.classList.remove('hidden');
  $('puzzleArea').innerHTML = '';
  $('answerRow').classList.add('hidden');
  $('puzzleTitle').textContent = 'Locked';
  $('puzzlePrompt').textContent = 'Wrong answers cost time. A new puzzle is coming.';
  $('timeFill').style.width = '0%';
  const tick = () => {
    const left = Math.ceil((until - Date.now()) / 1000);
    if (left <= 0) {
      overlay.classList.add('hidden');
      clearTimers();
      hideError();
      then();
      return;
    }
    $('lockoutText').textContent = `Next puzzle in ${left}s…`;
  };
  tick();
  every(tick, 200);
}

/* ------------------------------------------------------------------ */
/* Puzzle rendering                                                    */
/* ------------------------------------------------------------------ */
function renderPuzzle(p) {
  currentPuzzle = p;
  $('lockoutOverlay').classList.add('hidden');
  $('puzzleTitle').textContent = p.title;
  $('puzzlePrompt').textContent = p.prompt;
  const area = $('puzzleArea');
  area.innerHTML = '';
  const input = $('answerInput');
  input.value = '';
  input.disabled = false;
  $('submitAnswer').disabled = false;
  const numeric = ['arithmetic', 'sequence', 'count'].includes(p.type);
  input.setAttribute('inputmode', numeric ? 'numeric' : 'text');
  input.placeholder = numeric ? 'Number' : 'Type your answer';

  const needsInput = !['schulte', 'simon'].includes(p.type);
  $('answerRow').classList.toggle('hidden', !needsInput || p.type === 'memory');

  startTimeBar(p);

  switch (p.type) {
    case 'arithmetic':
      area.appendChild(textCanvas(p.data.text, { font: 'bold 26px "Segoe UI", sans-serif', distortion: 1, align: 'center', fit: true }));
      break;
    case 'sequence':
      area.appendChild(textCanvas(p.data.text, { font: 'bold 20px "Segoe UI", sans-serif', distortion: 1, align: 'center', wrap: 'word' }));
      break;
    case 'typing':
    case 'reverse':
      area.appendChild(textCanvas(p.data.text, { font: '22px "Courier New", monospace', distortion: p.data.distortion, wrap: 'char' }));
      break;
    case 'commitment':
      area.appendChild(textCanvas(p.data.text, { font: '16px "Segoe UI", sans-serif', distortion: 0, wrap: 'word', lineHeight: 24 }));
      break;
    case 'unscramble':
      area.appendChild(textCanvas(p.data.text, { font: 'bold 22px "Courier New", monospace', distortion: 1, align: 'center', wrap: 'word', fit: true }));
      break;
    case 'caesar':
      area.appendChild(textCanvas(p.data.text, { font: 'bold 22px "Courier New", monospace', distortion: 1, align: 'center', wrap: 'word' }));
      area.appendChild(alphabetStrip());
      break;
    case 'count':
      area.appendChild(gridCanvas(p.data));
      break;
    case 'memory':
      renderMemory(p, area);
      break;
    case 'schulte':
      renderSchulte(p, area, p.data.tiles);
      break;
    case 'simon':
      renderSimon(p, area);
      break;
  }

  if (needsInput && p.type !== 'memory') later(() => input.focus(), 50);
}

function startTimeBar(p) {
  const fill = $('timeFill');
  const total = p.timeLimitSec * 1000;
  const tick = () => {
    const left = p.expiresAt - Date.now();
    const pct = Math.max(0, Math.min(100, (left / total) * 100));
    fill.style.width = pct + '%';
    fill.classList.toggle('urgent', left < 10000);
    if (left <= -1600) {
      // Out of time: the background will record a strike.
      clearTimers();
      submitAnswer($('answerInput').value, true);
    }
  };
  tick();
  every(tick, 200);
}

function renderMemory(p, area) {
  const canvas = textCanvas(p.data.text, { font: 'bold 30px "Courier New", monospace', distortion: 0, align: 'center', fit: true });
  area.appendChild(canvas);
  const note = document.createElement('div');
  note.className = 'reveal-note';
  area.appendChild(note);
  const hideAt = Date.now() + p.data.revealMs;
  const tick = () => {
    const left = hideAt - Date.now();
    if (left > 0) {
      note.textContent = `Disappears in ${(left / 1000).toFixed(1)}s`;
      return;
    }
    area.innerHTML = '';
    area.appendChild(textCanvas('• '.repeat(p.data.text.length).trim(), { font: 'bold 26px monospace', distortion: 0, align: 'center', fit: true }));
    $('answerRow').classList.remove('hidden');
    $('answerInput').focus();
    clearInterval(memoryTimer);
  };
  const memoryTimer = every(tick, 100);
  tick();
}

function renderSchulte(p, area, tiles) {
  area.innerHTML = '';
  const { size, order } = p.data;
  let progress = 0;
  const grid = document.createElement('div');
  grid.className = 'tile-grid';
  grid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;

  const status = document.createElement('div');
  status.className = 'reveal-note';
  status.textContent = `Next: ${order[0]}`;

  tiles.forEach((label) => {
    const b = document.createElement('button');
    b.className = 'tile';
    b.textContent = label;
    b.addEventListener('click', () => {
      if (submitting || b.classList.contains('found')) return;
      if (label === order[progress]) {
        b.classList.add('found');
        progress++;
        status.textContent = progress < order.length ? `Next: ${order[progress]}` : 'Done!';
        if (progress === order.length) submitAnswer(order.join(','));
      } else {
        b.classList.add('miss');
        showError('Wrong tile — board reshuffled, start over.');
        // Reshuffle and restart this board (no strike, but you lose your progress).
        later(() => renderSchulte(p, area, shuffle(tiles)), 350);
      }
    });
    grid.appendChild(b);
  });
  area.appendChild(grid);
  area.appendChild(status);
}

function renderSimon(p, area) {
  const { size, sequence, flashMs } = p.data;
  const grid = document.createElement('div');
  grid.className = 'tile-grid simon-grid';
  grid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  const cells = [];
  for (let i = 0; i < size * size; i++) {
    const c = document.createElement('button');
    c.className = 'tile simon-tile';
    c.disabled = true;
    grid.appendChild(c);
    cells.push(c);
  }
  const status = document.createElement('div');
  status.className = 'reveal-note';
  status.textContent = 'Watch carefully…';
  area.appendChild(grid);
  area.appendChild(status);

  // Playback
  const startDelay = 600;
  sequence.forEach((idx, i) => {
    later(() => cells[idx].classList.add('lit'), startDelay + i * flashMs);
    later(() => cells[idx].classList.remove('lit'), startDelay + i * flashMs + flashMs * 0.65);
  });

  // Input phase
  later(() => {
    const clicks = [];
    status.textContent = `Your turn: 0 / ${sequence.length}`;
    cells.forEach((c, idx) => {
      c.disabled = false;
      c.addEventListener('click', () => {
        if (submitting || clicks.length >= sequence.length) return;
        clicks.push(idx);
        c.classList.add('lit');
        later(() => c.classList.remove('lit'), 180);
        status.textContent = `Your turn: ${clicks.length} / ${sequence.length}`;
        if (clicks.length === sequence.length) later(() => submitAnswer(clicks.join(',')), 200);
      });
    });
  }, startDelay + sequence.length * flashMs);
}

/* ------------------------------------------------------------------ */
/* Canvas drawing (text is drawn, not typed into the DOM, so it        */
/* can't be selected, copied, or searched)                             */
/* ------------------------------------------------------------------ */
const CANVAS_WIDTH = 290;

function makeCanvas(width, height) {
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.className = 'puzzle-canvas';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { canvas, ctx };
}

function layoutLines(ctx, text, maxWidth, wrap, spacing) {
  const width = (str) => ctx.measureText(str).width + spacing * str.length;
  if (wrap === 'char') {
    const lines = [];
    let line = '';
    for (const ch of text) {
      if (width(line + ch) > maxWidth && line) { lines.push(line); line = ''; }
      line += ch;
    }
    if (line) lines.push(line);
    return lines;
  }
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (width(test) > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function textCanvas(text, opts) {
  const { distortion = 0, align = 'left', wrap = 'word' } = opts;
  let font = opts.font;
  const padding = 14;
  const measure = document.createElement('canvas').getContext('2d');
  // Extra letter spacing when distorted so rotated glyphs don't collide
  const spacing = distortion ? 2 + distortion : 0;
  const maxWidth = CANVAS_WIDTH - padding * 2;
  let size = parseInt(font.match(/(\d+)px/)[1], 10);
  measure.font = font;
  let lines = layoutLines(measure, text, maxWidth, wrap, spacing);
  // 'fit' mode: shrink the font until the text sits on one line
  while (opts.fit && lines.length > 1 && size > 14) {
    size -= 1;
    font = font.replace(/\d+px/, size + 'px');
    measure.font = font;
    lines = layoutLines(measure, text, maxWidth, wrap, spacing);
  }
  const lineHeight = opts.lineHeight || Math.round(size * 1.55);
  const height = lines.length * lineHeight + padding * 2 - (lineHeight - size) / 2;

  const { canvas, ctx } = makeCanvas(CANVAS_WIDTH, Math.max(height, size + padding * 2));
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(0, 0, CANVAS_WIDTH, height + 40);
  ctx.font = font;
  ctx.textBaseline = 'middle';

  lines.forEach((line, li) => {
    const chars = [...line];
    const widths = chars.map((c) => ctx.measureText(c).width + spacing);
    const lineWidth = widths.reduce((a, b) => a + b, 0) - spacing;
    let x = align === 'center' ? (CANVAS_WIDTH - lineWidth) / 2 : padding;
    const y = padding + li * lineHeight + size / 2 + 2;
    chars.forEach((ch, i) => {
      ctx.save();
      const rot = distortion ? (Math.random() - 0.5) * 0.14 * distortion : 0;
      const dy = distortion ? (Math.random() - 0.5) * 2.4 * distortion : 0;
      ctx.translate(x + widths[i] / 2, y + dy);
      ctx.rotate(rot);
      const shade = distortion ? 30 + Math.floor(Math.random() * 40) : 40;
      ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade + 30})`;
      ctx.textAlign = 'center';
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      x += widths[i];
    });
  });

  // Light noise so the text isn't trivially machine-readable
  for (let i = 0; i < distortion * 3; i++) {
    ctx.strokeStyle = `rgba(102, 126, 234, ${0.18 + Math.random() * 0.15})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.random() * CANVAS_WIDTH, Math.random() * height);
    ctx.bezierCurveTo(Math.random() * CANVAS_WIDTH, Math.random() * height,
      Math.random() * CANVAS_WIDTH, Math.random() * height,
      Math.random() * CANVAS_WIDTH, Math.random() * height);
    ctx.stroke();
  }
  return canvas;
}

function gridCanvas({ grid, cols, rows }) {
  const cell = Math.floor((CANVAS_WIDTH - 16) / cols);
  const width = CANVAS_WIDTH;
  const height = rows * cell + 16;
  const { canvas, ctx } = makeCanvas(width, height);
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(0, 0, width, height);
  ctx.font = `${Math.round(cell * 0.72)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const offsetX = (width - cols * cell) / 2;
  grid.forEach((ch, i) => {
    const cx = offsetX + (i % cols) * cell + cell / 2;
    const cy = 8 + Math.floor(i / cols) * cell + cell / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((Math.random() - 0.5) * 0.25);
    ctx.fillStyle = '#333';
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  return canvas;
}

function alphabetStrip() {
  const el = document.createElement('div');
  el.className = 'alphabet';
  el.textContent = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return el;
}

/* ------------------------------------------------------------------ */
/* Submitting                                                          */
/* ------------------------------------------------------------------ */
async function submitAnswer(answer, isTimeout = false) {
  if (!currentPuzzle || submitting) return;
  if (!isTimeout && currentPuzzle.type !== 'schulte' && currentPuzzle.type !== 'simon' && !String(answer).trim()) {
    showError('Enter an answer first.');
    return;
  }
  submitting = true;
  $('answerInput').disabled = true;
  $('submitAnswer').disabled = true;
  hideError();

  const response = await send({ action: 'submitAnswer', purpose: Gauntlet.purpose, puzzleId: currentPuzzle.id, answer });

  switch (response.result) {
    case 'correct':
      flashSuccess();
      later(() => renderGauntlet(response.state), 450);
      break;
    case 'wrong':
    case 'timeout': {
      const s = response.state;
      const left = s.maxStrikes - s.strikes;
      showError(`${response.result === 'timeout' ? 'Out of time' : 'Wrong answer'} — strike ${s.strikes} of ${s.maxStrikes}. ` +
        `${left} more and you're locked out.`);
      renderGauntlet(s);
      break;
    }
    case 'failed': {
      clearTimers();
      currentPuzzle = null;
      $('failedSubtext').textContent =
        `${response.reason === 'timeout' ? 'Ran out of time.' : 'Wrong answer.'} That was your last strike. ` +
        `You're locked out for ${formatTime(response.cooldownUntil - Date.now())}.`;
      hideError();
      $('gauntletHeader').classList.add('hidden');
      $('cancelChallenge').classList.add('hidden');
      showView('failed');
      Gauntlet.hooks.onFailed(response);
      break;
    }
    case 'locked':
    case 'stale':
      renderGauntlet(response.state);
      break;
    default:
      closeModal();
      Gauntlet.hooks.onReset();
  }
}

function flashSuccess() {
  const area = $('puzzleArea');
  area.classList.add('success');
  setTimeout(() => area.classList.remove('success'), 450);
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function showError(message) {
  const errorEl = $('challengeError');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function hideError() {
  $('challengeError').classList.add('hidden');
}

