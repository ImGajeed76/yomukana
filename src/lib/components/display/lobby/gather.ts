// The crowd at a start: where everyone stands to watch the screen count down,
// and when each one hops on the count. Pure, so it can be tested without a GPU.

import { isOutsideClearings, type Floor, type Spot } from "./wander";

/** How much wider than deep the crowd spreads: people fan out along a screen more than back from it. */
const WIDE = 1.5;
/** How far apart the arcs stand, front to back, in shares of the personal space. */
const DEEP = 0.95;
/** How far a place is nudged, as a share of the space, so the arcs never read as lines. */
const NUDGE = 0.14;

/** A number from 0 to 1 that is always the same for the same two, for the nudges. */
function noise(one: number, two: number): number {
  const value = Math.sin(one * 12.9898 + two * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Places for `count` daifuku, gathered the way a crowd gathers in front of a
 * screen, or round a podium: in arcs round `focus` (the middle of the
 * floor's back edge unless given), wider than deep, each a little further
 * out, every place nudged a touch so there are no straight lines. None on the
 * floor's clearings, so round a podium the first arcs fill only where they
 * pass outside its ground, hugging it. The front middle fills first and the
 * edges last, so a small crowd is the front of a big one. `space` is how
 * close two may stand. Fewer places than asked for if the floor runs out.
 */
export function gatherSpots(
  count: number,
  floor: Floor,
  space: number,
  focus: Spot = { x: 0, z: floor.back },
): Spot[] {
  const spots: Spot[] = [];
  const reachBack = floor.front - focus.z;
  for (let arc = 0; spots.length < count; arc++) {
    const depth = space * (0.7 + arc * DEEP);
    if (depth > reachBack) break;
    // As many as fit along the arc's tighter side, half a step offset every
    // other arc so those behind see between those in front.
    const steps = Math.max(1, Math.floor((Math.PI * depth) / space));
    const places: (Spot & { angle: number })[] = [];
    for (let step = 0; step < steps; step++) {
      const angle = -Math.PI / 2 + ((step + (arc % 2 === 0 ? 0.5 : 0.25)) * Math.PI) / steps;
      const nudge = (noise(arc, step) - 0.5) * 2 * NUDGE * space;
      const x = focus.x + Math.sin(angle) * depth * WIDE + nudge;
      const z = focus.z + Math.cos(angle) * depth + (noise(step, arc) - 0.5) * NUDGE * space;
      if (z > floor.front || z < floor.back || Math.abs(x) > floor.halfWidth(z)) continue;
      if (!isOutsideClearings(floor, { x, z }, 1.08)) continue;
      places.push({ x, z, angle });
    }
    places.sort((one, other) => Math.abs(one.angle) - Math.abs(other.angle));
    for (const { x, z } of places.slice(0, count - spots.length)) spots.push({ x, z });
  }
  return spots;
}

/** How many places are handed out together, matched left to right. */
const BATCH = 12;

/**
 * Who stands where. The places come front first, as gatherSpots gives them;
 * whoever is nearest `focus` takes the front ones, whoever is further away
 * the ones further back, so nobody has to push through people already
 * standing. Within each handful, left goes to left and right to right, so
 * nobody crosses the crowd either. Returns a place for each, by index, or
 * null for anyone the floor had no room for.
 */
export function assignSpots(
  from: readonly Spot[],
  spots: readonly Spot[],
  focus: Spot,
): (Spot | null)[] {
  const result: (Spot | null)[] = from.map(() => null);
  const order = from
    .map((spot, index) => ({ index, distance: Math.hypot(spot.x - focus.x, spot.z - focus.z) }))
    .sort((one, other) => one.distance - other.distance)
    .map((entry) => entry.index);
  for (let start = 0; start < Math.min(order.length, spots.length); start += BATCH) {
    const people = order
      .slice(start, start + BATCH)
      .sort((one, other) => (from[one]?.x ?? 0) - (from[other]?.x ?? 0));
    const places = spots.slice(start, start + BATCH).sort((one, other) => one.x - other.x);
    for (const [rank, index] of people.entries()) result[index] = places[rank] ?? null;
  }
  return result;
}

/**
 * How long after the beat a daifuku standing at `x` hops: later the further
 * right it stands, so the hops roll across the crowd like a wave, with a
 * little of its own on top so it never looks drilled.
 */
export function waveDelay(x: number, left: number, right: number, random: () => number): number {
  const along = right > left ? (x - left) / (right - left) : 0;
  return along * 0.4 + random() * 0.12;
}
