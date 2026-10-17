/**
 * Popup Script
 * Main screen (status, toggle, timed-disable countdown) for the toolbar popup.
 * The puzzle gauntlet itself is rendered by ../shared/gauntlet-ui.js.
 */

const statusIndicator = $('statusIndicator');
const statusText = $('statusText');
const toggleBtn = $('toggleBtn');
const attemptCount = $('attemptCount');

let currentState = {
  enabled: true,
  locked: true,
  attempts: 0,
  cooldownUntil: 0,
  disabledUntil: 0
};

let cooldownTimer = null;
let disabledTimer = null;

// Motivational quotes
const quotes = [
  { text: 'Focus is the gateway to thinking, perceiving, memory, learning, reasoning, and decision making.', author: 'Daniel Goleman' },
  { text: 'The successful warrior is the average man, with laser-like focus.', author: 'Bruce Lee' },
  { text: 'Where focus goes, energy flows.', author: 'Tony Robbins' },
  { text: 'The shorter way to do many things is to only do one thing at a time.', author: 'Mozart' },
  { text: 'Your focus determines your reality.', author: 'George Lucas' }
];

Gauntlet.purpose = 'disable';
Gauntlet.hooks = {
  onFailed(response) {
    currentState.cooldownUntil = response.cooldownUntil;
    updateCooldown();
  },
  onReset() { loadState(); },
  onClosed() {}
};

document.addEventListener('DOMContentLoaded', () => {
  setupGauntletControls();
  setupEventListeners();
  loadState();
  displayRandomQuote();
});

/* ------------------------------------------------------------------ */
/* Main screen                                                         */
/* ------------------------------------------------------------------ */
async function loadState() {
  const response = await send({ action: 'getState' });
  currentState = response;
  buildDurationOptions(response.durations || [15], response.defaultDuration);
  updateUI();
  // If a gauntlet was in progress when the popup closed, pick up where it left off.
  if (response.gauntlet && response.enabled) {
    openModal();
    renderGauntlet(response.gauntlet);
  }
}

function buildDurationOptions(durations, def) {
  const select = $('disableDuration');
  if (select.options.length) return;
  durations.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m >= 60 ? `${m / 60} hour${m === 60 ? '' : 's'}` : `${m} minutes`;
    if (m === def) opt.selected = true;
    select.appendChild(opt);
  });
}

function updateUI() {
  const { enabled, attempts } = currentState;

  statusIndicator.className = 'status-indicator ' + (enabled ? 'active' : 'inactive');
  statusText.textContent = enabled ? 'Active & Protecting' : 'Disabled';

  toggleBtn.disabled = false;
  if (enabled) {
    toggleBtn.textContent = 'Disable Protection';
    toggleBtn.className = 'btn btn-danger';
  } else {
    toggleBtn.textContent = 'Re-enable Now';
    toggleBtn.className = 'btn btn-success';
  }

  attemptCount.textContent = attempts || 0;
  updateCooldown();
  updateDisabledTimer();
}

/** While temporarily disabled, show how long until protection switches itself back on. */
function updateDisabledTimer() {
  clearInterval(disabledTimer);
  const box = $('disabledNotice');
  if (currentState.enabled || !currentState.disabledUntil) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  const total = currentState.disabledTotalMs || (currentState.disabledUntil - Date.now());
  const tick = () => {
    const left = currentState.disabledUntil - Date.now();
    if (left <= 0) {
      clearInterval(disabledTimer);
      // The background alarm re-enables protection; refresh to reflect it.
      setTimeout(loadState, 800);
      return;
    }
    statusText.textContent = `Disabled · back on in ${formatTime(left)}`;
    $('disabledTime').textContent = formatTime(left);
    $('disabledFill').style.width = `${Math.max(0, Math.min(100, (left / total) * 100))}%`;
  };
  tick();
  disabledTimer = setInterval(tick, 500);
}

function updateCooldown() {
  clearInterval(cooldownTimer);
  const notice = $('cooldownNotice');
  const tick = () => {
    const left = (currentState.cooldownUntil || 0) - Date.now();
    if (left <= 0 || !currentState.enabled) {
      notice.classList.add('hidden');
      clearInterval(cooldownTimer);
      if (currentState.enabled) toggleBtn.disabled = false;
      return;
    }
    notice.classList.remove('hidden');
    toggleBtn.disabled = true;
    $('cooldownTime').textContent = formatTime(left);
  };
  tick();
  cooldownTimer = setInterval(tick, 500);
}

function setupEventListeners() {
  toggleBtn.addEventListener('click', handleToggle);
  $('confirmDisable').addEventListener('click', completeDisable);
  $('closeDenial').addEventListener('click', closeModal);
  $('closeFailed').addEventListener('click', closeModal);
}

function handleToggle() {
  if (currentState.enabled) requestDisable();
  else enableExtension();
}

async function requestDisable() {
  const response = await send({ action: 'requestDisable', purpose: 'disable' });
  if (response.cooldownUntil) {
    currentState.cooldownUntil = response.cooldownUntil;
    updateCooldown();
    return;
  }
  openModal();
  if (response.denied) {
    showView('denial');
    $('gauntletHeader').classList.add('hidden');
    $('cancelChallenge').classList.add('hidden');
    return;
  }
  renderGauntlet(response.state);
}

async function enableExtension() {
  const response = await send({ action: 'enable' });
  if (response.success) loadState();
}

async function completeDisable() {
  const minutes = Number($('disableDuration').value);
  const response = await send({ action: 'completeDisable', minutes });
  if (response.success) {
    closeModal();
    loadState();
  } else if (response.state) {
    renderGauntlet(response.state);
  }
}

function displayRandomQuote() {
  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  $('quoteText').textContent = `"${quote.text}"`;
  document.querySelector('.quote-author').textContent = `- ${quote.author}`;
}
