/**
 * Guard Page Script
 * Stands in for chrome://extensions. Clearing the guard gauntlet opens the
 * extensions page for a few minutes; the background re-guards it afterwards.
 */

const params = new URLSearchParams(location.search);
const returnUrl = params.get('return') || 'chrome://extensions/';
let guardCooldownTimer = null;

Gauntlet.purpose = 'guard';
Gauntlet.hooks = {
  onFailed(response) {
    // Leave the "failed" message up; the intro behind it shows the cooldown once dismissed.
    showCooldown(response.cooldownUntil);
  },
  onReset() { init(); },
  onClosed() { leave(); }
};

document.addEventListener('DOMContentLoaded', () => {
  setupGauntletControls();
  $('guardStart').addEventListener('click', start);
  $('guardLeave').addEventListener('click', leave);
  $('confirmDisable').addEventListener('click', openExtensionsPage);
  $('closeDenial').addEventListener('click', () => closeModal());
  $('closeFailed').addEventListener('click', () => closeModal());
  init();
});

async function init() {
  const state = await send({ action: 'getGuardState' });
  $('guardPassMinutes').textContent = state.passMinutes;
  $('guardWaveCount').textContent = state.waves;
  $('passNote').textContent =
    `The extensions page will stay open for ${state.passMinutes} minutes, then lock again.`;

  if (state.passUntil > Date.now()) {
    // Already unlocked (e.g. a second tab): go straight through.
    location.replace(returnUrl);
    return;
  }
  if (state.gauntlet) {
    openModal();
    renderGauntlet(state.gauntlet);
    return;
  }
  showCooldown(state.cooldownUntil);
}

function showCooldown(until) {
  clearInterval(guardCooldownTimer);
  const box = $('guardCooldown');
  const startBtn = $('guardStart');
  const tick = () => {
    const left = (until || 0) - Date.now();
    if (left <= 0) {
      box.classList.add('hidden');
      startBtn.disabled = false;
      clearInterval(guardCooldownTimer);
      return;
    }
    box.classList.remove('hidden');
    startBtn.disabled = true;
    $('guardCooldownTime').textContent = formatTime(left);
  };
  tick();
  guardCooldownTimer = setInterval(tick, 500);
}

async function start() {
  const response = await send({ action: 'requestDisable', purpose: 'guard' });
  if (response.cooldownUntil) {
    showCooldown(response.cooldownUntil);
    return;
  }
  openModal();
  renderGauntlet(response.state);
}

async function openExtensionsPage() {
  const response = await send({ action: 'completeGuard', returnUrl });
  if (!response.success && response.state) renderGauntlet(response.state);
  // On success the background navigates this tab to the extensions page.
}

function leave() {
  chrome.tabs.getCurrent((tab) => {
    if (tab) chrome.tabs.update(tab.id, { url: 'chrome://newtab/' });
  });
}
