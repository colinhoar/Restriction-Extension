/**
 * Background Service Worker
 * Manages global extension state, the puzzle gauntlets, timed disabling,
 * and the guard in front of chrome://extensions.
 *
 * Gauntlets live here (not in the popup/guard page) so that:
 *   - answers are never sent to the page,
 *   - nothing can be unlocked without actually finishing every wave,
 *   - progress, strikes, lockouts and timers survive the page being closed and reopened.
 *
 * Two gauntlet "purposes" run independently:
 *   'disable' — from the toolbar popup; clearing it disables protection for a set time
 *   'guard'   — from the guard page; clearing it opens chrome://extensions for a few minutes
 */

importScripts('challenges.js');

const DAY_MS = 24 * 60 * 60 * 1000;
const PURPOSES = ['disable', 'guard'];
const COOLDOWN_KEY = { disable: 'cooldownUntil', guard: 'guardCooldownUntil' };
const EXTENSIONS_PAGES = ['chrome://extensions', 'edge://extensions', 'brave://extensions',
  'opera://extensions', 'vivaldi://extensions'];
const GUARD_PAGE = chrome.runtime.getURL('guard/guard.html');

// Initialize storage on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      extensionEnabled: true,
      locked: true,
      disableAttempts: 0,
      disableHistory: [],
      cooldownUntil: 0,
      guardCooldownUntil: 0,
      disabledUntil: 0,
      guardPassUntil: 0
    });
  }
  console.log('Focus Guardian installed and activated');
  startupChecks();
});

chrome.runtime.onStartup.addListener(startupChecks);
startupChecks(); // also runs whenever the service worker wakes up

/* ------------------------------------------------------------------ */
/* Storage helpers                                                     */
/* ------------------------------------------------------------------ */
const getLocal = (keys) => new Promise((r) => chrome.storage.local.get(keys, r));
const setLocal = (obj) => new Promise((r) => chrome.storage.local.set(obj, r));
// Session storage is cleared when the browser restarts and survives service-worker restarts.
const sessionStore = chrome.storage.session || chrome.storage.local;
const gKey = (purpose) => `gauntlet_${purpose}`;
const getGauntlet = (purpose) => new Promise((r) => sessionStore.get([gKey(purpose)], (d) => r(d[gKey(purpose)] || null)));
const setGauntlet = (g) => new Promise((r) => sessionStore.set({ [gKey(g.purpose)]: g }, r));
const clearGauntlet = (purpose) => new Promise((r) => sessionStore.remove(gKey(purpose), r));

function validPurpose(p) {
  return PURPOSES.includes(p) ? p : 'disable';
}

/* ------------------------------------------------------------------ */
/* Enable / timed disable                                              */
/* ------------------------------------------------------------------ */
async function enableProtection() {
  await setLocal({ extensionEnabled: true, locked: true, disabledUntil: 0 });
  await chrome.alarms.clear('reenable');
  await clearGauntlet('disable');
  chrome.action.setBadgeText({ text: '' });
  reloadAffectedTabs();
}

async function disableProtectionFor(minutes) {
  const allowed = GAUNTLET_CONFIG.disableDurations;
  const m = allowed.includes(minutes) ? minutes : GAUNTLET_CONFIG.defaultDisableMinutes;
  const now = Date.now();
  const disabledUntil = now + m * 60 * 1000;
  const data = await getLocal(['disableAttempts', 'disableHistory']);
  const attempts = (data.disableAttempts || 0) + 1;
  const history = (data.disableHistory || []).filter((t) => now - t < DAY_MS);
  history.push(now);
  await setLocal({
    extensionEnabled: false,
    locked: false,
    disableAttempts: attempts,
    disableHistory: history,
    disabledUntil,
    disabledTotalMs: m * 60 * 1000
  });
  chrome.alarms.create('reenable', { when: disabledUntil });
  chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  chrome.action.setBadgeText({ text: 'OFF' });
  await clearGauntlet('disable');
  reloadAffectedTabs();
  return attempts;
}

/** Make sure timers are honored even if Chrome was closed or the worker was asleep. */
async function startupChecks() {
  const data = await getLocal(['extensionEnabled', 'disabledUntil']);
  if (data.extensionEnabled === false) {
    // Older versions had no time limit: treat an open-ended disable as expired.
    if (!data.disabledUntil || Date.now() >= data.disabledUntil) {
      await enableProtection();
    } else {
      chrome.alarms.create('reenable', { when: data.disabledUntil });
      chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
      chrome.action.setBadgeText({ text: 'OFF' });
    }
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
  sweepExtensionsTabs();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'reenable') enableProtection();
  if (alarm.name === 'guardSweep') sweepExtensionsTabs();
});

/* ------------------------------------------------------------------ */
/* Gauntlet logic                                                      */
/* ------------------------------------------------------------------ */

/** Strip the answer before sending a puzzle to a page. */
function publicPuzzle(p) {
  if (!p) return null;
  const { answer, match, ...rest } = p;
  return rest;
}

/** The state a page needs to render. */
function viewOf(g) {
  return {
    purpose: g.purpose,
    wave: g.current + 1,
    totalWaves: g.waves.length,
    strikes: g.strikes,
    maxStrikes: GAUNTLET_CONFIG.maxStrikes,
    lockedUntil: g.lockedUntil,
    phase: g.phase,
    countdownUntil: g.countdownUntil || 0,
    puzzle: g.phase === 'puzzle' ? publicPuzzle(g.puzzle) : null,
    now: Date.now()
  };
}

function tierFor(waveIndex, puzzleWaves, recentDisables) {
  let tier = 1 + Math.floor((waveIndex * 3) / puzzleWaves);
  if (recentDisables >= 2) tier += 1; // repeat offenders start harder
  return Math.min(3, tier);
}

function newPuzzleForWave(g, waveIndex) {
  const type = g.waves[waveIndex];
  const p = type === 'commitment'
    ? generatePuzzle('commitment', 3)
    : generatePuzzle(type, tierFor(waveIndex, g.puzzleWaves, g.recentDisables));
  const start = Math.max(Date.now(), g.lockedUntil || 0);
  p.expiresAt = start + p.timeLimitSec * 1000;
  return p;
}

function pickTypes(count) {
  // Distinct puzzle types; avoid putting two click-based puzzles back to back.
  const clicky = ['schulte', 'simon'];
  let types;
  do {
    types = shuffle(PUZZLE_TYPES).slice(0, count);
  } while (types.some((t, i) => i > 0 && clicky.includes(t) && clicky.includes(types[i - 1])));
  return types;
}

async function startGauntlet(purpose) {
  const data = await getLocal(['disableHistory']);
  const recent = (data.disableHistory || []).filter((t) => Date.now() - t < DAY_MS).length;

  let waves, puzzleWaves;
  if (purpose === 'guard') {
    puzzleWaves = GAUNTLET_CONFIG.guardPuzzleWaves;
    waves = pickTypes(puzzleWaves);
  } else {
    puzzleWaves = GAUNTLET_CONFIG.basePuzzleWaves + Math.min(GAUNTLET_CONFIG.maxExtraWaves, recent);
    waves = [...pickTypes(puzzleWaves), 'commitment'];
  }

  const g = {
    purpose,
    waves,
    puzzleWaves,
    current: 0,
    strikes: 0,
    lockedUntil: 0,
    phase: 'puzzle',
    recentDisables: recent,
    countdownUntil: 0
  };
  g.puzzle = newPuzzleForWave(g, 0);
  await setGauntlet(g);
  return g;
}

/** Register a strike. Strikes out after maxStrikes. */
async function addStrike(g, reason) {
  g.strikes += 1;
  if (g.strikes >= GAUNTLET_CONFIG.maxStrikes) {
    const cooldownUntil = Date.now() + GAUNTLET_CONFIG.failCooldownSec * 1000;
    await setLocal({ [COOLDOWN_KEY[g.purpose]]: cooldownUntil });
    await clearGauntlet(g.purpose);
    return { result: 'failed', reason, cooldownUntil };
  }
  g.lockedUntil = Date.now() + GAUNTLET_CONFIG.strikeLockoutSec * g.strikes * 1000;
  g.puzzle = newPuzzleForWave(g, g.current); // never retry the same puzzle
  await setGauntlet(g);
  return { result: reason, state: viewOf(g) };
}

async function handleSubmit(purpose, puzzleId, answer) {
  const g = await getGauntlet(purpose);
  if (!g || g.phase !== 'puzzle') return { result: 'none' };
  if (!g.puzzle || g.puzzle.id !== puzzleId) return { result: 'stale', state: viewOf(g) };
  if (Date.now() < g.lockedUntil) return { result: 'locked', state: viewOf(g) };

  // Small grace period for render lag
  if (Date.now() > g.puzzle.expiresAt + 1500) return addStrike(g, 'timeout');

  if (!checkAnswer(g.puzzle, answer)) return addStrike(g, 'wrong');

  g.current += 1;
  if (g.current >= g.waves.length) {
    g.phase = 'countdown';
    g.puzzle = null;
    const secs = purpose === 'guard' ? GAUNTLET_CONFIG.guardCountdownSec : GAUNTLET_CONFIG.finalCountdownSec;
    g.countdownUntil = Date.now() + secs * 1000;
  } else {
    g.puzzle = newPuzzleForWave(g, g.current);
  }
  await setGauntlet(g);
  return { result: 'correct', state: viewOf(g) };
}

async function resumeGauntlet(purpose) {
  const g = await getGauntlet(purpose);
  if (!g) return null;
  // Reveal-based puzzles can't be resumed fairly (they were already shown), so swap in a fresh one.
  if (g.phase === 'puzzle' && g.puzzle && g.puzzle.revealMs) {
    g.puzzle = newPuzzleForWave(g, g.current);
    await setGauntlet(g);
  }
  return g;
}

/** Start or resume a gauntlet, honoring cooldowns. */
async function requestGauntlet(purpose) {
  const key = COOLDOWN_KEY[purpose];
  const data = await getLocal([key]);
  if ((data[key] || 0) > Date.now()) return { cooldownUntil: data[key], now: Date.now() };
  const existing = await resumeGauntlet(purpose);
  if (existing) return { state: viewOf(existing) };
  if (purpose === 'disable' && Math.random() < GAUNTLET_CONFIG.denialChance) return { denied: true };
  const g = await startGauntlet(purpose);
  return { state: viewOf(g) };
}

/** True once the gauntlet is cleared and its final countdown has run out. Consumes it. */
async function consumeFinishedGauntlet(purpose) {
  const g = await getGauntlet(purpose);
  if (!g || g.phase !== 'countdown' || Date.now() < g.countdownUntil) return { ok: false, g };
  await clearGauntlet(purpose);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* chrome://extensions guard                                           */
/* ------------------------------------------------------------------ */
function isExtensionsPage(url) {
  return !!url && EXTENSIONS_PAGES.some((p) => url.startsWith(p));
}

async function guardPassActive() {
  const data = await getLocal(['guardPassUntil']);
  return (data.guardPassUntil || 0) > Date.now();
}

async function guardTab(tabId, url) {
  if (!GAUNTLET_CONFIG.guardExtensionsPage || !isExtensionsPage(url)) return;
  if (await guardPassActive()) return;
  chrome.tabs.update(tabId, { url: `${GUARD_PAGE}?return=${encodeURIComponent(url)}` });
}

/** Send any extensions-page tabs back to the guard once a pass runs out. */
async function sweepExtensionsTabs() {
  if (!GAUNTLET_CONFIG.guardExtensionsPage) return;
  const active = await guardPassActive();
  const tabs = await chrome.tabs.query({});
  let open = false;
  for (const tab of tabs) {
    const url = tab.url || tab.pendingUrl;
    if (!isExtensionsPage(url)) continue;
    if (active) open = true;
    else guardTab(tab.id, url);
  }
  if (!open) chrome.alarms.clear('guardSweep');
}

chrome.tabs.onCreated.addListener((tab) => guardTab(tab.id, tab.pendingUrl || tab.url));

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || (changeInfo.status === 'loading' ? tab.url : null);
  if (url) guardTab(tabId, url);
});

/* ------------------------------------------------------------------ */
/* Message handling                                                    */
/* ------------------------------------------------------------------ */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const purpose = validPurpose(request.purpose);

  const handlers = {
    async getState() {
      const data = await getLocal(['extensionEnabled', 'locked', 'disableAttempts', 'cooldownUntil',
        'disabledUntil', 'disabledTotalMs']);
      const g = await resumeGauntlet('disable');
      return {
        enabled: data.extensionEnabled !== false,
        locked: data.locked !== false,
        attempts: data.disableAttempts || 0,
        cooldownUntil: data.cooldownUntil || 0,
        disabledUntil: data.disabledUntil || 0,
        disabledTotalMs: data.disabledTotalMs || 0,
        durations: GAUNTLET_CONFIG.disableDurations,
        defaultDuration: GAUNTLET_CONFIG.defaultDisableMinutes,
        gauntlet: g ? viewOf(g) : null,
        now: Date.now()
      };
    },

    async getGuardState() {
      const data = await getLocal(['guardCooldownUntil', 'guardPassUntil']);
      const g = await resumeGauntlet('guard');
      return {
        cooldownUntil: data.guardCooldownUntil || 0,
        passUntil: data.guardPassUntil || 0,
        passMinutes: GAUNTLET_CONFIG.guardPassMinutes,
        waves: GAUNTLET_CONFIG.guardPuzzleWaves,
        gauntlet: g ? viewOf(g) : null,
        now: Date.now()
      };
    },

    async enable() {
      await enableProtection();
      return { success: true };
    },

    async requestDisable() {
      return requestGauntlet(purpose);
    },

    async submitAnswer() {
      return handleSubmit(purpose, request.puzzleId, request.answer);
    },

    async cancelGauntlet() {
      await clearGauntlet(purpose);
      return { success: true };
    },

    async completeDisable() {
      const { ok, g } = await consumeFinishedGauntlet('disable');
      if (!ok) return { success: false, state: g ? viewOf(g) : null };
      const attempts = await disableProtectionFor(Number(request.minutes));
      return { success: true, attempts };
    },

    async completeGuard() {
      const { ok, g } = await consumeFinishedGauntlet('guard');
      if (!ok) return { success: false, state: g ? viewOf(g) : null };
      const passUntil = Date.now() + GAUNTLET_CONFIG.guardPassMinutes * 60 * 1000;
      await setLocal({ guardPassUntil: passUntil });
      // Check every 30s so an extensions tab left open gets re-guarded when the pass ends.
      chrome.alarms.create('guardSweep', { when: passUntil + 500, periodInMinutes: 0.5 });
      const target = isExtensionsPage(request.returnUrl) ? request.returnUrl : 'chrome://extensions/';
      if (sender.tab) chrome.tabs.update(sender.tab.id, { url: target });
      return { success: true, passUntil };
    }
  };

  const handler = handlers[request.action];
  if (!handler) return false;
  handler().then(sendResponse).catch((err) => {
    console.error('Focus Guardian error:', err);
    sendResponse({ error: String(err) });
  });
  return true; // keep the message channel open for the async response
});

/**
 * Reload all Instagram and YouTube tabs to apply/remove blocking
 */
function reloadAffectedTabs() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.url && (
        tab.url.includes('instagram.com') ||
        tab.url.includes('youtube.com')
      )) {
        chrome.tabs.reload(tab.id);
      }
    });
  });
}

/**
 * Block navigation to Instagram at the network level
 * This provides an additional layer of blocking
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && changeInfo.url.includes('instagram.com')) {
    chrome.storage.local.get(['extensionEnabled'], (data) => {
      if (data.extensionEnabled !== false) {
        // Extension is active, block Instagram
        chrome.tabs.update(tabId, {
          url: 'about:blank'
        });
      }
    });
  }
});
