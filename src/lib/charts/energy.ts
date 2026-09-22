// How much energy the page has, given how hard the reader is typing.
//
// Not a fade. A fade says the same thing whether the reader has typed one key or
// twenty, and it always takes the same time to say it. This is a weight thrown
// upward: every keystroke shoves it higher, and the moment the keys stop it
// hangs for an instant and then falls away, faster the longer it falls.
//
// Pure, so the feel can be tuned against numbers rather than by watching it.

export interface Energy {
  /** How lit the page is, 0 to 1. */
  readonly level: number;
  /** How fast that is changing, in level per second. */
  readonly velocity: number;
}

export const AT_REST: Energy = { level: 0, velocity: 0 };

/**
 * How much a keystroke adds.
 *
 * A key that landed is worth a real shove: three of them in a row light the page
 * right up, which is the point. A wrong one still counts for something, because
 * a reader working out a spelling has not stopped reading and the page going
 * dark under them would be the wrong thing to say about it. It counts for much
 * less, so what the glow tracks is reading, not keyboard noise.
 */
export const CORRECT_IMPULSE = 0.34;
export const WRONG_IMPULSE = 0.05;

/** Pull, in level per second per second. What makes it hang and then drop. */
export const GRAVITY = 1.9;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * A keystroke lands.
 *
 * It adds to the level and cancels whatever fall was under way, so a run of keys
 * keeps the page up rather than fighting the pull on every one of them.
 */
export function struck(energy: Energy, impulse: number): Energy {
  return { level: clamp01(energy.level + impulse), velocity: 0 };
}

/** Time passes with no keystroke. */
export function fallen(energy: Energy, seconds: number): Energy {
  const velocity = energy.velocity - GRAVITY * seconds;
  const level = energy.level + velocity * seconds;

  // The floor is the floor. Nothing bounces: a page that rebounded off empty
  // would be reacting to the reader having stopped, which is not a thing worth
  // drawing attention to.
  if (level <= 0) return AT_REST;
  return { level: clamp01(level), velocity };
}
