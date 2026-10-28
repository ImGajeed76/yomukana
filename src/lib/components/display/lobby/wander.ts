// How the daifuku drift about the lobby floor, so a room waiting for a start
// has something alive in it: each floats slowly to a spot, rests there a few
// seconds, sometimes on a cushion, picks another, and keeps out of the way of
// the others and the furniture. Positions only, on the floor plane. Pure, so
// it can be tested without a GPU.

export interface Spot {
  readonly x: number;
  readonly z: number;
}

/** The floor they may use: a band in depth, as wide as the camera sees at each depth. */
export interface Floor {
  /** The front edge, nearest the camera. */
  readonly front: number;
  /** The back edge, a smaller z than `front`. */
  readonly back: number;
  /** How far either side of the middle a daifuku at depth `z` is still on screen. */
  readonly halfWidth: (z: number) => number;
  /** Cushions, where a daifuku may sit for a while. */
  readonly seats: readonly Spot[];
  /** Furniture to float round, each a circle on the floor. */
  readonly obstacles: readonly (Spot & { readonly radius: number })[];
  /**
   * The closest two may float: PERSONAL_SPACE in a room with space to
   * spare, less in a crowd, where the daifuku are smaller too.
   */
  readonly space: number;
  /** How fast they drift, as a share of WANDER_SPEED: more when hurrying to the count. */
  readonly pace: number;
  /**
   * Ovals kept clear, like the podium's ground once a race is on. Anyone
   * inside is eased out, not jumped, and nobody picks a spot in one.
   */
  readonly clearings: readonly Clearing[];
}

/** An oval on the floor: its middle, and how far it reaches across and front to back. */
export interface Clearing {
  readonly x: number;
  readonly z: number;
  readonly across: number;
  readonly deep: number;
}

/** How far into an oval a point is: under 1 inside, 1 on its edge. */
function ovalReach(clearing: Clearing, x: number, z: number): number {
  return Math.hypot((x - clearing.x) / clearing.across, (z - clearing.z) / clearing.deep);
}

/** Whether a spot is outside every clearing, by `margin` of its size. */
export function isOutsideClearings(floor: Floor, spot: Spot, margin = 1): boolean {
  return floor.clearings.every((clearing) => ovalReach(clearing, spot.x, spot.z) >= margin);
}

export interface Walker {
  x: number;
  z: number;
  /** Velocity, in scene units a second. */
  vx: number;
  vz: number;
  /** Where it is heading. */
  toX: number;
  toZ: number;
  /** Seconds left before it sets off again; 0 while it moves. */
  rest: number;
  /** The cushion it is heading for or sitting on, by index in `Floor.seats`. */
  seat: number | null;
  /**
   * Whether it is held where it is: lying on its face after a fall, or in its
   * place in the crowd at a start. It does not move, and nobody pushes it;
   * the others go round.
   */
  isPinned: boolean;
  /** How fast it goes, as a share of the floor's pace: more for one jogging laps in a race. */
  hurry: number;
}

/** Scene units a second at full drift: a stroll, not a race. */
export const WANDER_SPEED = 0.55;
/** The closest two may float in a room with space to spare. One daifuku is about 1.3 wide. */
export const PERSONAL_SPACE = 1.5;
/** How far round a piece of furniture they keep, past its own radius. */
const CLEARANCE = 0.75;
/** How fast someone drifts out of a clearing, in scene units a second. */
const CLEARING_SPEED = 1.6;
/** How far a new spot may be from the last, so nobody crosses the whole room at once. */
const STROLL = 3.5;
/** Seconds of rest at a spot, and on a cushion, the shortest and the longest. */
const REST = [2, 8] as const;
const SIT = [6, 14] as const;
/** The chance that the next spot is a free cushion, when there is one. */
const SIT_CHANCE = 0.3;
/** Within this of its spot, it has arrived. */
const ARRIVED = 0.15;
/** How fast it turns towards where it wants to go, a share per second. */
const STEERING = 1.5;

function between(random: () => number, [low, high]: readonly [number, number]): number {
  return low + (high - low) * random();
}

/** Whether a spot is clear of every piece of furniture and every clearing. */
function isClear(floor: Floor, spot: Spot): boolean {
  return (
    floor.obstacles.every(
      (obstacle) =>
        Math.hypot(spot.x - obstacle.x, spot.z - obstacle.z) > obstacle.radius + CLEARANCE,
    ) && isOutsideClearings(floor, spot, 1.1)
  );
}

/** Moves a spot onto the floor, if it was off it. */
function onFloor(floor: Floor, spot: Spot): Spot {
  const z = Math.min(floor.front, Math.max(floor.back, spot.z));
  const reach = floor.halfWidth(z);
  return { x: Math.min(reach, Math.max(-reach, spot.x)), z };
}

/** A random clear spot on the floor, `random` returning 0 to 1. */
export function spotOn(floor: Floor, random: () => number): Spot {
  let spot: Spot = { x: 0, z: floor.front };
  for (let attempt = 0; attempt < 12; attempt++) {
    const z = floor.back + (floor.front - floor.back) * random();
    spot = { x: (random() * 2 - 1) * floor.halfWidth(z), z };
    if (isClear(floor, spot)) return spot;
  }
  return spot;
}

/**
 * A walker standing at a spot, resting a moment before it sets off, or at
 * least `atLeast` seconds, while it gets its bearings.
 */
export function walkerAt(spot: Spot, random: () => number, atLeast = 0): Walker {
  return {
    ...spot,
    vx: 0,
    vz: 0,
    toX: spot.x,
    toZ: spot.z,
    rest: atLeast + between(random, REST),
    seat: null,
    isPinned: false,
    hurry: 1,
  };
}

/** Whether a walker is sitting on a cushion right now. */
export function isSitting(walker: Walker): boolean {
  return walker.seat !== null && walker.rest > 0;
}

/** Whether a walker stays put when another bumps it: sitting, or pinned. */
function isFixed(walker: Walker): boolean {
  return walker.isPinned || isSitting(walker);
}

/** Where to go next: now and then a free cushion, otherwise a clear spot nearby. */
function nextSpot(
  walker: Walker,
  walkers: readonly Walker[],
  floor: Floor,
  random: () => number,
): { spot: Spot; seat: number | null } {
  if (random() < SIT_CHANCE) {
    const taken = new Set(walkers.map((other) => other.seat));
    const free = floor.seats
      .map((seat, index) => ({ seat, index }))
      .filter(({ seat, index }) => {
        if (taken.has(index)) return false;
        return Math.hypot(seat.x - walker.x, seat.z - walker.z) < STROLL * 1.5;
      });
    const chosen = free[Math.floor(random() * free.length)];
    if (chosen !== undefined) return { spot: chosen.seat, seat: chosen.index };
  }
  let spot: Spot = walker;
  for (let attempt = 0; attempt < 8; attempt++) {
    spot = onFloor(floor, {
      x: walker.x + (random() * 2 - 1) * STROLL,
      z: walker.z + (random() * 2 - 1) * STROLL * 0.5,
    });
    if (isClear(floor, spot)) break;
  }
  return { spot, seat: null };
}

/**
 * The way to go, `x` and `z` a unit direction, bent round any furniture in
 * the way. Near a piece and heading into it, the part of the way that points
 * into it is dropped and the walker slides along its edge instead, on the
 * side its goal is, so it goes round rather than pressing against it.
 */
function aroundFurniture(walker: Walker, floor: Floor, x: number, z: number): Spot {
  let wayX = x;
  let wayZ = z;
  for (const obstacle of floor.obstacles) {
    const toX = obstacle.x - walker.x;
    const toZ = obstacle.z - walker.z;
    const distance = Math.hypot(toX, toZ);
    if (distance === 0 || distance > obstacle.radius + CLEARANCE + 0.8) continue;
    const inX = toX / distance;
    const inZ = toZ / distance;
    const into = wayX * inX + wayZ * inZ;
    if (into <= 0) continue;
    // Along the edge, turned to whichever side the goal lies on.
    const side = Math.sign(x * -inZ + z * inX) || 1;
    wayX = wayX - into * inX - side * inZ * into;
    wayZ = wayZ - into * inZ + side * inX * into;
  }
  const length = Math.hypot(wayX, wayZ);
  return length === 0 ? { x, z } : { x: wayX / length, z: wayZ / length };
}

/** Moves every walker on by `seconds`. Changes them in place: this runs every frame. */
export function stepWalkers(
  walkers: readonly Walker[],
  seconds: number,
  floor: Floor,
  random: () => number,
): void {
  for (const walker of walkers) {
    if (walker.isPinned) {
      walker.vx = 0;
      walker.vz = 0;
      continue;
    }
    let wantX = 0;
    let wantZ = 0;
    if (walker.rest > 0) {
      walker.rest = Math.max(0, walker.rest - seconds);
      if (walker.rest === 0) {
        const next = nextSpot(walker, walkers, floor, random);
        walker.toX = next.spot.x;
        walker.toZ = next.spot.z;
        walker.seat = next.seat;
      }
    } else {
      const dx = walker.toX - walker.x;
      const dz = walker.toZ - walker.z;
      const distance = Math.hypot(dx, dz);
      if (distance < ARRIVED) {
        walker.rest = between(random, walker.seat === null ? REST : SIT);
      } else {
        // Slows down over the last stretch, so it settles rather than stops dead.
        const speed = WANDER_SPEED * floor.pace * walker.hurry * Math.min(1, distance);
        const round = aroundFurniture(walker, floor, dx / distance, dz / distance);
        wantX = round.x * speed;
        wantZ = round.z * speed;
      }
    }
    const share = Math.min(1, seconds * STEERING);
    walker.vx += (wantX - walker.vx) * share;
    walker.vz += (wantZ - walker.vz) * share;
  }

  // Keeps them apart: two too close drift away from each other, softly, so a
  // newcomer landing in a crowd nudges a space open instead of overlapping.
  // One sitting on a cushion, or held in place, is not pushed; the other goes round.
  for (const [index, one] of walkers.entries()) {
    for (const other of walkers.slice(index + 1)) {
      const dx = other.x - one.x;
      const dz = other.z - one.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= floor.space) continue;
      // Exactly on top of each other: pick a side, any side.
      const away = distance === 0 ? { x: 1, z: 0 } : { x: dx / distance, z: dz / distance };
      const push = (floor.space - distance) * 2 * seconds;
      const oneShare = isFixed(one) ? 0 : isFixed(other) ? 2 : 1;
      const otherShare = isFixed(other) ? 0 : isFixed(one) ? 2 : 1;
      one.vx -= away.x * push * oneShare;
      one.vz -= away.z * push * oneShare;
      other.vx += away.x * push * otherShare;
      other.vz += away.z * push * otherShare;
    }
  }

  for (const walker of walkers) {
    if (walker.isPinned) continue;
    walker.x += walker.vx * seconds;
    walker.z += walker.vz * seconds;
    // Furniture is solid: anything inside its circle is moved back out to the edge.
    for (const obstacle of floor.obstacles) {
      const dx = walker.x - obstacle.x;
      const dz = walker.z - obstacle.z;
      const distance = Math.hypot(dx, dz);
      const edge = obstacle.radius + CLEARANCE * 0.6;
      if (distance >= edge || distance === 0) continue;
      walker.x = obstacle.x + (dx / distance) * edge;
      walker.z = obstacle.z + (dz / distance) * edge;
    }
    // A clearing is eased: anyone in one drifts out of it, straight away from
    // its middle, a little at a time.
    for (const clearing of floor.clearings) {
      const reach = ovalReach(clearing, walker.x, walker.z);
      if (reach >= 1) continue;
      const outX = (walker.x - clearing.x) / (clearing.across * clearing.across);
      const outZ = (walker.z - clearing.z) / (clearing.deep * clearing.deep);
      const length = Math.hypot(outX, outZ) || 1;
      const step = Math.min(CLEARING_SPEED * seconds, (1 - reach) * clearing.deep);
      walker.x += (outX / length) * step;
      walker.z += (outZ / length) * step;
    }
    const spot = onFloor(floor, walker);
    walker.x = spot.x;
    walker.z = spot.z;
    // A spot a push left off the floor is given up on rather than pushed against forever.
    if (walker.rest === 0 && walker.seat === null) {
      const to = onFloor(floor, { x: walker.toX, z: walker.toZ });
      walker.toX = to.x;
      walker.toZ = to.z;
    }
  }
}
