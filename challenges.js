/**
 * Challenge Generators
 * Loaded by the background service worker via importScripts().
 *
 * Every generator takes a difficulty tier (1, 2 or 3) and returns:
 *   {
 *     type, title, prompt,        // what the popup shows
 *     data,                       // display data for the popup renderer
 *     answer,                     // kept in the background, never sent to the popup
 *     match: 'exact' | 'number' | 'caseless' | 'trimmed',
 *     timeLimitSec,               // time allowed before it counts as a strike
 *     revealMs                    // (optional) time spent showing info before input
 *   }
 */

/* ------------------------------------------------------------------ */
/* Tunable settings — edit these to make the gauntlet easier/harder.   */
/* ------------------------------------------------------------------ */
const GAUNTLET_CONFIG = {
  basePuzzleWaves: 4,          // puzzle waves before the final commitment wave
  maxExtraWaves: 3,            // extra waves added for repeated disables in 24h
  maxStrikes: 3,               // wrong answers / timeouts allowed before failing
  strikeLockoutSec: 6,         // lockout after a wrong answer (multiplied by strike #)
  failCooldownSec: 180,        // cooldown after striking out (survives popup close)
  finalCountdownSec: 30,       // wait after the last wave before "Disable" unlocks
  denialChance: 0.3,           // chance of being refused outright before starting

  // Timed disable: protection always switches itself back on
  disableDurations: [5, 15, 30],   // minutes offered on the final screen
  defaultDisableMinutes: 15,

  // chrome://extensions guard
  guardExtensionsPage: true,   // intercept the extensions page with its own gauntlet
  guardPuzzleWaves: 3,         // puzzle waves before the extensions page opens
  guardCountdownSec: 10,       // wait after the last guard wave
  guardPassMinutes: 3          // how long the extensions page stays open after passing
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomString(length, charset) {
  let s = '';
  for (let i = 0; i < length; i++) s += charset.charAt(Math.floor(Math.random() * charset.length));
  return s;
}

function byTier(tier, a, b, c) {
  return tier <= 1 ? a : tier === 2 ? b : c;
}

// Characters that are hard to confuse with each other (no 0/O, 1/l/I, etc.)
const SAFE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const SAFE_SYMBOLS = '#$%&*+=?@';
const MEMORY_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const WORDS = [
  'discipline', 'attention', 'momentum', 'patience', 'practice', 'purpose',
  'priority', 'progress', 'strength', 'deadline', 'schedule', 'notebook',
  'library', 'calendar', 'homework', 'exercise', 'mountain', 'journey',
  'thinking', 'learning', 'reading', 'building', 'creative', 'mindful',
  'resolute', 'ambition', 'diligent', 'steadfast', 'tenacity', 'composure',
  'endurance', 'deliberate', 'commitment', 'perspective', 'motivation',
  'achievement', 'concentrate', 'determined', 'workbench', 'blueprint',
  'algorithm', 'chemistry', 'geography', 'philosophy', 'vocabulary',
  'telescope', 'adventure', 'curiosity', 'knowledge', 'wilderness'
];

const COMMITMENTS = [
  'I am choosing distraction over the goals I set for myself today.',
  'Turning this off is a decision I am making on purpose, not by accident.',
  'Future me asked present me to keep this on, and I am ignoring that request.',
  'I understand that this is exactly the moment this extension was built for.',
  'If this is truly important, I will still want it after thirty more seconds.',
  'I set up this protection because I know how easily my focus slips away.'
];

/* ------------------------------------------------------------------ */
/* Generators                                                          */
/* ------------------------------------------------------------------ */
const GENERATORS = {

  // Multi-step mental arithmetic (rendered as an image so it can't be copy/pasted)
  arithmetic(tier) {
    let expr, answer;
    if (tier <= 1) {
      const a = randInt(13, 49), b = randInt(13, 49), c = randInt(101, 899);
      expr = `${a} × ${b} + ${c}`;
      answer = a * b + c;
    } else if (tier === 2) {
      let a = randInt(23, 99), b = randInt(23, 99), c = randInt(11, 49), d = randInt(11, 49);
      if (a * b < c * d) [a, b, c, d] = [c, d, a, b];
      expr = `${a} × ${b} − ${c} × ${d}`;
      answer = a * b - c * d;
    } else {
      const a = randInt(113, 489), b = randInt(13, 49), c = randInt(23, 99), d = randInt(23, 99);
      const e = randInt(101, 999);
      expr = `${a} × ${b} − ${c} × ${d} + ${e}`;
      answer = a * b - c * d + e;
    }
    return {
      type: 'arithmetic',
      title: 'Mental Math',
      prompt: 'Solve it. Multiplication comes before addition and subtraction.',
      data: { text: expr },
      answer: String(answer),
      match: 'number',
      timeLimitSec: byTier(tier, 90, 120, 150)
    };
  },

  // Find the next number in a generated sequence
  sequence(tier) {
    const builders = {
      secondOrder() {               // differences grow by a constant
        let x = randInt(2, 30), d = randInt(1, 9); const k = randInt(2, 6);
        const seq = [x];
        for (let i = 0; i < 6; i++) { x += d; d += k; seq.push(x); }
        return seq;
      },
      mulAdd() {                    // x -> x*m + a
        let x = randInt(1, 6); const m = randInt(2, 3), a = randInt(-3, 5) || 1;
        const seq = [x];
        for (let i = 0; i < 6; i++) { x = x * m + a; seq.push(x); }
        return seq;
      },
      interleaved() {               // two arithmetic sequences woven together
        let p = randInt(1, 20), q = randInt(40, 90);
        const dp = randInt(3, 9), dq = -randInt(2, 7);
        const seq = [];
        for (let i = 0; i < 7; i++) {
          if (i % 2 === 0) { seq.push(p); p += dp; } else { seq.push(q); q += dq; }
        }
        return seq;
      },
      fibLike() {                   // a(n) = a(n-1) + a(n-2) + k
        let a = randInt(1, 5), b = randInt(2, 8); const k = randInt(-2, 4);
        const seq = [a, b];
        for (let i = 0; i < 5; i++) { const c = a + b + k; seq.push(c); a = b; b = c; }
        return seq;
      },
      alternatingOps() {            // +a, ×b, +a, ×b ...
        let x = randInt(1, 9); const a = randInt(2, 9), b = randInt(2, 3);
        const seq = [x];
        for (let i = 0; i < 6; i++) { x = i % 2 === 0 ? x + a : x * b; seq.push(x); }
        return seq;
      },
      squaresPlus() {               // n^2 + k*n (offset start)
        const n0 = randInt(2, 7), k = randInt(-3, 5);
        const seq = [];
        for (let n = n0; n < n0 + 7; n++) seq.push(n * n + k * n);
        return seq;
      }
    };
    const pool = byTier(tier,
      ['secondOrder', 'interleaved', 'mulAdd'],
      ['mulAdd', 'interleaved', 'fibLike', 'squaresPlus'],
      ['fibLike', 'alternatingOps', 'squaresPlus', 'secondOrder']);
    const seq = builders[pick(pool)]();
    const answer = seq.pop();
    return {
      type: 'sequence',
      title: 'Find the Pattern',
      prompt: 'What number comes next?',
      data: { text: seq.join(',  ') + ',  ?' },
      answer: String(answer),
      match: 'number',
      timeLimitSec: byTier(tier, 90, 120, 150)
    };
  },

  // Copy a distorted string (drawn on a canvas; copy/paste is impossible)
  typing(tier) {
    const len = byTier(tier, 18, 24, 30);
    const charset = tier >= 3 ? SAFE_CHARS + SAFE_SYMBOLS : SAFE_CHARS;
    const text = randomString(len, charset);
    return {
      type: 'typing',
      title: 'Transcribe',
      prompt: 'Type the characters exactly as shown. Case matters.',
      data: { text, distortion: tier },
      answer: text,
      match: 'exact',
      timeLimitSec: byTier(tier, 75, 90, 120)
    };
  },

  // Type a string backwards
  reverse(tier) {
    const len = byTier(tier, 10, 14, 18);
    const text = randomString(len, SAFE_CHARS);
    return {
      type: 'reverse',
      title: 'Mirror Image',
      prompt: 'Type these characters in REVERSE order (last character first).',
      data: { text, distortion: Math.max(1, tier - 1) },
      answer: text.split('').reverse().join(''),
      match: 'exact',
      timeLimitSec: byTier(tier, 60, 90, 120)
    };
  },

  // Memorize a code that disappears
  memory(tier) {
    const len = byTier(tier, 7, 9, 10);
    const revealMs = byTier(tier, 4000, 4000, 3500);
    const reversed = tier >= 3 && Math.random() < 0.5;
    const text = randomString(len, MEMORY_CHARS);
    return {
      type: 'memory',
      title: 'Memory Flash',
      prompt: reversed
        ? 'Memorize this code. It will vanish — then type it BACKWARDS.'
        : 'Memorize this code. It will vanish — then type it from memory.',
      data: { text, revealMs, reversed },
      answer: reversed ? text.split('').reverse().join('') : text,
      match: 'caseless',
      revealMs,
      timeLimitSec: Math.round(revealMs / 1000) + 30
    };
  },

  // Count a target letter in a grid of look-alike letters
  count(tier) {
    const cfg = byTier(tier,
      { cols: 10, rows: 7, set: 'ABCDEFGHJKMNPRSTUVWXYZ'.split(''), p: 0.14 },
      { cols: 12, rows: 9, set: ['b', 'd', 'p', 'q', 'g'], p: 0.18 },
      { cols: 13, rows: 11, set: ['b', 'd', 'p', 'q', 'h', 'k'], p: 0.13 });
    const target = pick(cfg.set);
    const others = cfg.set.filter((c) => c !== target);
    const grid = [];
    let count = 0;
    for (let i = 0; i < cfg.cols * cfg.rows; i++) {
      if (Math.random() < cfg.p) { grid.push(target); count++; } else grid.push(pick(others));
    }
    return {
      type: 'count',
      title: 'Letter Count',
      prompt: `How many times does the letter “${target}” appear in the grid?`,
      data: { grid, cols: cfg.cols, rows: cfg.rows, target },
      answer: String(count),
      match: 'number',
      timeLimitSec: byTier(tier, 60, 90, 120)
    };
  },

  // Decode a Caesar-shifted word
  caesar(tier) {
    const plain = tier >= 3
      ? `${pick(WORDS)} ${pick(WORDS)}`
      : pick(WORDS.filter((w) => (tier <= 1 ? w.length <= 8 : w.length >= 8)));
    const shift = byTier(tier, randInt(2, 4), randInt(5, 11), randInt(7, 19));
    const encoded = plain.toUpperCase().replace(/[A-Z]/g, (ch) =>
      String.fromCharCode(((ch.charCodeAt(0) - 65 + shift) % 26) + 65));
    return {
      type: 'caesar',
      title: 'Secret Code',
      prompt: `Every letter was shifted FORWARD ${shift} places in the alphabet (wrapping Z→A). Decode it.`,
      data: { text: encoded, shift },
      answer: plain,
      match: 'caseless',
      timeLimitSec: byTier(tier, 90, 150, 210)
    };
  },

  // Unscramble a word
  unscramble(tier) {
    const pool = WORDS.filter((w) => byTier(tier, w.length <= 8, w.length >= 8 && w.length <= 9, w.length >= 10));
    const word = pick(pool);
    let scrambled;
    do { scrambled = shuffle(word.split('')).join(''); } while (scrambled === word);
    return {
      type: 'unscramble',
      title: 'Unscramble',
      prompt: 'Rearrange these letters into a real English word.',
      data: { text: scrambled.toUpperCase().split('').join(' ') },
      answer: word,
      match: 'caseless',
      timeLimitSec: byTier(tier, 60, 90, 120)
    };
  },

  // Click tiles in order (Schulte table / Trail-Making B at tier 3)
  schulte(tier) {
    let order;
    let size;
    if (tier <= 1) { size = 4; order = Array.from({ length: 16 }, (_, i) => String(i + 1)); }
    else if (tier === 2) { size = 5; order = Array.from({ length: 25 }, (_, i) => String(i + 1)); }
    else {
      size = 5; order = [];
      for (let i = 0; order.length < 25; i++) {
        order.push(String(i + 1));
        if (order.length < 25) order.push(String.fromCharCode(65 + i));
      }
    }
    return {
      type: 'schulte',
      title: 'Find in Order',
      prompt: tier >= 3
        ? 'Click tiles alternating numbers and letters: 1 → A → 2 → B → 3 → C … A wrong click reshuffles the board.'
        : `Click the numbers 1 to ${order.length} in order. A wrong click reshuffles the board.`,
      data: { size, order, tiles: shuffle(order) },
      answer: order.join(','),
      match: 'exact',
      timeLimitSec: byTier(tier, 45, 75, 100)
    };
  },

  // Watch a sequence of flashing tiles and repeat it
  simon(tier) {
    const length = byTier(tier, 5, 7, 9);
    const flashMs = byTier(tier, 650, 550, 480);
    const sequence = [];
    while (sequence.length < length) {
      const n = randInt(0, 15);
      if (n !== sequence[sequence.length - 1]) sequence.push(n);
    }
    const revealMs = length * flashMs + 900;
    return {
      type: 'simon',
      title: 'Pattern Recall',
      prompt: `Watch ${length} tiles light up, then click them in the same order.`,
      data: { size: 4, sequence, flashMs },
      answer: sequence.join(','),
      match: 'exact',
      revealMs,
      timeLimitSec: Math.round(revealMs / 1000) + 25
    };
  },

  // Final wave: type a commitment sentence
  commitment() {
    const text = pick(COMMITMENTS);
    return {
      type: 'commitment',
      title: 'Final Wave: Own It',
      prompt: 'Type this sentence exactly, punctuation included.',
      data: { text, distortion: 0 },
      answer: text,
      match: 'trimmed',
      timeLimitSec: 120
    };
  }
};

const PUZZLE_TYPES = ['arithmetic', 'sequence', 'typing', 'reverse', 'memory', 'count',
  'caesar', 'unscramble', 'schulte', 'simon'];

function generatePuzzle(type, tier) {
  const p = GENERATORS[type](tier);
  p.id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  p.tier = tier;
  return p;
}

function normalizeAnswer(value, match) {
  const v = String(value == null ? '' : value);
  switch (match) {
    case 'number': return v.replace(/[\s,]/g, '').replace(/^\+/, '').replace(/^−/, '-');
    case 'caseless': return v.trim().replace(/\s+/g, ' ').toLowerCase();
    case 'trimmed': return v.trim().replace(/\s+/g, ' ');
    default: return v;
  }
}

function checkAnswer(puzzle, value) {
  return normalizeAnswer(value, puzzle.match) === normalizeAnswer(puzzle.answer, puzzle.match);
}
