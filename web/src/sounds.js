// Little tunes and alarms, synthesised with Web Audio so there are no sound
// files to ship (and nothing to cache-bust). All melodies are original:
// "Pokémon-style" / "Minecraft-style" means the feel (8-bit chiptune, calm
// piano), not the real theme tunes.
//
// Browsers only allow sound after a tap, so call unlock() from a tap handler
// (ticking a job, starting a timer) before anything plays without one.

let ctx = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
  return ctx;
}

/** Call from a tap: wakes the audio engine (iOS needs a sound to play). */
export function unlock() {
  const c = audio();
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = c.createBuffer(1, 1, 22050);
  src.connect(c.destination);
  src.start(0);
}

const SEMI = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

/** 'A4' -> 440, 'C#5' / 'Bb3' supported; numbers pass through. */
function freq(note) {
  if (typeof note === 'number') return note;
  const m = /^([A-G])([#b]?)(\d)$/.exec(note);
  if (!m) return 0;
  let n = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * Math.pow(2, n / 12);
}

/**
 * One note. ring = how long it takes to fade (piano/bell-like when longer
 * than the note itself).
 */
function tone(c, out, t, note, dur, v) {
  const f = freq(note);
  if (!f) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = v.wave || 'square';
  osc.frequency.setValueAtTime(f, t);
  if (v.slide) osc.frequency.exponentialRampToValueAtTime(f * v.slide, t + dur);
  const vol = v.vol || 0.2;
  const ring = v.ring || dur * 0.9;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + (v.attack || 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(ring, 0.05));
  osc.connect(g);
  g.connect(out);
  osc.start(t);
  osc.stop(t + Math.max(ring, 0.05) + 0.05);
}

/**
 * A tune is { bpm, voices: [{ wave, vol, ring, notes: [[note, beats], ...] }] }.
 * 'r' is a rest; an array of notes plays them together as a chord.
 */
function playTune(tune) {
  const c = audio();
  if (!c) return 0;
  const out = c.createGain();
  out.gain.value = 0.9;
  out.connect(c.destination);
  const beat = 60 / tune.bpm;
  const start = c.currentTime + 0.05;
  let end = 0;
  for (const v of tune.voices) {
    let t = start;
    for (const [note, beats] of v.notes) {
      const dur = beats * beat;
      if (note !== 'r') {
        const ring = v.ring ? v.ring : dur * (v.legato || 0.9);
        const notes = Array.isArray(note) ? note : [note];
        for (const n of notes) tone(c, out, t, n, dur, { ...v, ring });
      }
      t += dur;
    }
    end = Math.max(end, t - start);
  }
  return end;
}

const rep = (pattern, times) => [].concat(...Array(times).fill(pattern));

// ── Celebrations (about 5 seconds) ──
const TUNES = {
  pokemon: {
    label: '⚡ Pokémon-style 8-bit',
    bpm: 160,
    voices: [
      {
        wave: 'square',
        vol: 0.12,
        legato: 0.8,
        notes: [
          ['G4', 0.5], ['C5', 0.5], ['E5', 0.5], ['G5', 1], ['E5', 0.5], ['G5', 1.5],
          ['A5', 0.5], ['G5', 0.5], ['F5', 0.5], ['E5', 0.5], ['D5', 0.5], ['E5', 0.5], ['C5', 1],
          ['D5', 0.5], ['E5', 0.5], ['F5', 0.5], ['G5', 0.5], ['A5', 0.5], ['B5', 0.5], ['C6', 2]
        ]
      },
      {
        wave: 'triangle',
        vol: 0.25,
        legato: 0.7,
        notes: [
          ['C3', 1], ['G3', 1], ['C3', 1], ['G3', 1], ['F3', 1], ['C4', 1], ['F3', 1],
          ['C4', 1], ['G3', 1], ['D4', 1], ['G3', 1], ['B3', 1], ['C3', 1.5]
        ]
      }
    ]
  },
  minecraft: {
    label: '⛏️ Minecraft-style piano',
    bpm: 84,
    voices: [
      {
        wave: 'triangle',
        vol: 0.28,
        ring: 1.8,
        notes: [
          ['E4', 0.5], ['G4', 0.5], ['B4', 0.5], ['D5', 1], ['B4', 0.5], ['A4', 0.5],
          ['C4', 0.5], ['E4', 0.5], ['G4', 0.5], [['B4', 'E5'], 1.5]
        ]
      },
      {
        wave: 'sine',
        vol: 0.22,
        ring: 2.6,
        notes: [['E3', 2], ['C3', 2], ['A2', 1.5], [['E3', 'B3'], 1.5]]
      }
    ]
  },
  fanfare: {
    label: '🎺 Trumpet fanfare',
    bpm: 132,
    voices: [
      {
        wave: 'sawtooth',
        vol: 0.1,
        legato: 0.85,
        notes: [
          ['G4', 0.5], ['C5', 0.5], ['E5', 0.5], ['G5', 1.5], ['E5', 0.5], ['G5', 2],
          ['r', 0.5], ['A5', 0.5], ['G5', 0.5], ['A5', 0.5], [['C5', 'E5', 'C6'], 3]
        ]
      },
      { wave: 'triangle', vol: 0.22, notes: [['C3', 2], ['C3', 1.5], ['G2', 2.5], ['F2', 1.5], ['C3', 3]] }
    ]
  },
  sparkle: {
    label: '✨ Magic sparkle',
    bpm: 100,
    voices: [
      {
        wave: 'sine',
        vol: 0.2,
        ring: 1.2,
        notes: [
          ...rep([['C6', 0.25], ['E6', 0.25], ['G6', 0.25], ['B6', 0.25]], 2),
          ...rep([['D6', 0.25], ['F#6', 0.25], ['A6', 0.25], ['C#7', 0.25]], 2),
          ['E6', 0.5], ['G6', 0.5], ['C7', 0.5], ['E7', 2]
        ]
      },
      { wave: 'triangle', vol: 0.18, ring: 2, notes: [['C4', 2], ['D4', 2], [['C4', 'G4'], 3]] }
    ]
  },
  party: {
    label: '🪩 Disco party',
    bpm: 124,
    voices: [
      {
        wave: 'square',
        vol: 0.1,
        legato: 0.6,
        notes: [
          ['r', 1], ['E5', 0.5], ['G5', 0.5], ['r', 0.5], ['A5', 0.5], ['G5', 1],
          ['r', 1], ['E5', 0.5], ['D5', 0.5], ['r', 0.5], ['C5', 0.5], ['D5', 1], [['E5', 'G5'], 1.5]
        ]
      },
      {
        wave: 'triangle',
        vol: 0.3,
        legato: 0.5,
        notes: rep([['A2', 0.5], ['A3', 0.5]], 4).concat(rep([['F2', 0.5], ['F3', 0.5]], 4), [['A2', 1.5]])
      }
    ]
  },
  levelup: {
    label: '⬆️ Level up',
    bpm: 130,
    voices: [
      {
        wave: 'square',
        vol: 0.12,
        legato: 0.7,
        notes: [
          ['C5', 0.5], ['E5', 0.5], ['G5', 0.5], ['C6', 0.5],
          ['D5', 0.5], ['F#5', 0.5], ['A5', 0.5], ['D6', 0.5],
          ['E5', 0.5], ['G#5', 0.5], ['B5', 0.5], ['E6', 0.5],
          ['r', 0.5], [['E6', 'B6'], 0.5], ['r', 0.5], [['E6', 'B6'], 3]
        ]
      }
    ]
  }
};

// ── Timer alarms (about 3 seconds) ──
const ALARMS = {
  beeps: {
    label: '⏰ Alarm clock',
    bpm: 480,
    voices: [{ wave: 'square', vol: 0.12, legato: 0.8, notes: rep([['A5', 1], ['r', 1], ['A5', 1], ['r', 1], ['A5', 1], ['r', 1], ['A5', 1], ['r', 3]], 3) }]
  },
  chime: {
    label: '🔔 Gentle chime',
    bpm: 110,
    voices: [{ wave: 'sine', vol: 0.3, ring: 1.6, notes: [['E5', 1], ['C5', 1], ['D5', 1], ['G4', 1.5], ['G4', 1], ['D5', 1], ['E5', 1], ['C5', 2]] }]
  },
  buzzer: {
    label: '📣 Game-show buzzer',
    bpm: 120,
    voices: [{ wave: 'sawtooth', vol: 0.12, legato: 0.95, notes: [['C3', 1], ['r', 0.5], ['C3', 1], ['r', 0.5], ['Bb2', 2.5]] }]
  },
  cuckoo: {
    label: '🐦 Cuckoo clock',
    bpm: 140,
    voices: [{ wave: 'sine', vol: 0.3, ring: 0.5, notes: rep([['E6', 0.5], ['C6', 1], ['r', 0.5]], 4) }]
  }
};

// ── Short game effects ──
const SFX = {
  right: { bpm: 600, voices: [{ wave: 'sine', vol: 0.25, ring: 0.3, notes: [['E6', 1], ['A6', 2]] }] },
  wrong: { bpm: 300, voices: [{ wave: 'square', vol: 0.07, legato: 0.9, notes: [['E3', 1], ['C3', 2]] }] },
  go: { bpm: 400, voices: [{ wave: 'square', vol: 0.1, legato: 0.8, notes: [['C5', 1], ['r', 1], ['C5', 1], ['r', 1], ['G5', 3]] }] }
};

export const CELEBRATIONS = Object.keys(TUNES).map((id) => ({ id, label: TUNES[id].label }));
export const TIMER_ALARMS = Object.keys(ALARMS).map((id) => ({ id, label: ALARMS[id].label }));

// Defaults until changed under ⚙️ Settings.
const KID_DEFAULTS = { malachi: 'minecraft', atticus: 'pokemon' };

export function kidSound(settings, slug) {
  const s = (settings || {})['sound_' + slug];
  return TUNES[s] ? s : KID_DEFAULTS[slug] || 'fanfare';
}

export function timerSound(settings) {
  const s = (settings || {}).sound_timer;
  return ALARMS[s] ? s : 'beeps';
}

export function soundsOn(settings) {
  return (settings || {}).sounds_on !== '0';
}

/** Play a celebration or alarm by id. Never throws: sound is a nice-to-have. */
export function play(id) {
  try {
    const tune = TUNES[id] || ALARMS[id] || SFX[id];
    return tune ? playTune(tune) : 0;
  } catch (e) {
    return 0;
  }
}
