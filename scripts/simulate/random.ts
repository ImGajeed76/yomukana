// Seeded randomness for the simulations, so a run can be repeated exactly and
// two formulas can be compared on the very same readers doing the very same
// things. Nothing in scripts/simulate may reach for Math.random.

export type Random = () => number;

/** Mulberry32: small, fast, and good enough to decide who remembers what. */
export function seeded(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A normally distributed number, by Box and Muller. */
export function normal(random: Random, mean = 0, spread = 1): number {
  const first = Math.max(random(), Number.EPSILON);
  const second = random();
  return mean + spread * Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

/**
 * A positive number around `median`, skewed to the right the way reaction
 * times are: mostly near it, now and then much slower, never below zero.
 */
export function logNormal(random: Random, median: number, spread: number): number {
  return median * Math.exp(normal(random, 0, spread));
}
