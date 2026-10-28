// The last minute before a marathon starts or ends, in the room. The screen
// counts down (ScreenCountdown.svelte); here the room joins in. Everyone
// stops what they are doing and gathers in front of the screen, watching it.
// Through the last ten seconds they hop on each beat, not all at once but in
// a wave rolling across the crowd, each a little in its own time. The
// lanterns under the screen light one by one over the last five. At zero
// everyone leaps with happy eyes, and at a start the flour flies too; at the
// end it waits for the results (see race.ts).

import type { Daifuku } from "./daifuku";
import { FESTOON_LANTERNS } from "./festoon";
import type { FlourBurst } from "./flour-burst";
import { assignSpots, gatherSpots, waveDelay } from "./gather";
import type { Room } from "./room";
import type { Floor, Spot } from "./wander";

/** What a count counts down to. */
export interface Countdown {
  /** Epoch milliseconds. */
  readonly at: number;
  readonly kind: "start" | "end";
}

/** From here each second is a hop. */
const BEAT_SECONDS = 10;
/** Within this of its place, a daifuku settles onto it and stays. */
const SETTLE = 0.6;

export class StartCount {
  private countdown: Countdown | null = null;
  private spots = new Map<Daifuku, Spot | null>();
  private lastBeat: number | null = null;
  private hasLeapt = false;

  constructor(
    private readonly room: Room,
    private readonly burst: FlourBurst,
    private readonly random: () => number,
  ) {}

  /** Whether a count is on, so the room gathers. */
  get isCounting(): boolean {
    return this.countdown !== null;
  }

  /** Counts down, or stops counting with null. */
  set(countdown: Countdown | null, crowd: readonly Daifuku[]): void {
    if (countdown?.at === this.countdown?.at && countdown?.kind === this.countdown?.kind) return;
    this.countdown = countdown;
    this.spots.clear();
    this.lastBeat = null;
    this.hasLeapt = false;
    this.room.setLanternsLit(0);
    for (const daifuku of crowd) {
      daifuku.isGathered = false;
      daifuku.isAtPlace = false;
    }
  }

  /** Moves the count on: called every frame, with everyone in the room. */
  step(seconds: number, now: number, crowd: readonly Daifuku[], floor: Floor): void {
    if (this.countdown === null) return;
    const left = (this.countdown.at - now) / 1000;

    this.gather(seconds, crowd, floor);

    const second = Math.ceil(left);
    if (second >= 1 && second <= BEAT_SECONDS && second !== this.lastBeat) {
      this.lastBeat = second;
      const xs = crowd.map((daifuku) => daifuku.walker.x);
      const leftmost = Math.min(...xs);
      const rightmost = Math.max(...xs);
      // A little higher as the count runs down.
      const lift = (BEAT_SECONDS - second) * 0.012;
      for (const daifuku of crowd) {
        const height = 0.16 + this.random() * 0.12 + lift;
        daifuku.jump("beat", waveDelay(daifuku.walker.x, leftmost, rightmost, this.random), height);
      }
    }
    this.room.setLanternsLit(
      left <= 0
        ? FESTOON_LANTERNS
        : Math.max(0, Math.min(FESTOON_LANTERNS, FESTOON_LANTERNS + 1 - second)),
    );

    if (left <= 0 && !this.hasLeapt) {
      this.hasLeapt = true;
      if (this.countdown.kind === "start") this.burst.throw(crowd.map((daifuku) => daifuku.walker));
      for (const daifuku of crowd) {
        daifuku.cheer(4 + this.random());
        daifuku.jump("leap", this.random() * 0.25, 0.7 + this.random() * 0.5);
      }
    }
  }

  /**
   * Everyone to a place in front of the screen, facing it. Once there, it
   * settles exactly onto its place and is held, so the crowd stands neat and
   * those still coming go round them rather than shoving.
   */
  private gather(seconds: number, crowd: readonly Daifuku[], floor: Floor): void {
    // A latecomer gets one of the places nobody has; nobody already placed
    // moves. The places for more people begin with the places for fewer, so
    // the crowd only ever grows at its back.
    const newcomers = crowd.filter((daifuku) => !this.spots.has(daifuku));
    if (newcomers.length > 0) {
      const key = (spot: Spot): string => `${spot.x.toFixed(3)},${spot.z.toFixed(3)}`;
      const taken = new Set(
        [...this.spots.values()].flatMap((spot) => (spot === null ? [] : [key(spot)])),
      );
      // Round the podium once it is out (its ground is the floor's
      // clearing); before the start, round the middle of the screen.
      const podium = floor.clearings[0];
      const focus =
        podium === undefined
          ? { x: this.room.screenMiddle.x, z: floor.back }
          : { x: podium.x, z: podium.z };
      const free = gatherSpots(crowd.length, floor, floor.space, focus).filter(
        (spot) => !taken.has(key(spot)),
      );
      const given = assignSpots(
        newcomers.map((daifuku) => daifuku.walker),
        free,
        focus,
      );
      for (const [index, daifuku] of newcomers.entries())
        this.spots.set(daifuku, given[index] ?? null);
    }
    for (const daifuku of crowd) {
      const spot = this.spots.get(daifuku);
      daifuku.isGathered = true;
      daifuku.isAsleep = false;
      daifuku.watch(this.room.screenMiddle, 1);
      if (spot === null || spot === undefined) continue;
      const { walker } = daifuku;
      walker.toX = spot.x;
      walker.toZ = spot.z;
      walker.seat = null;
      const distance = Math.hypot(spot.x - walker.x, spot.z - walker.z);
      if (daifuku.isAtPlace || distance < SETTLE) {
        daifuku.isAtPlace = true;
        const share = Math.min(1, seconds * 4);
        walker.x += (spot.x - walker.x) * share;
        walker.z += (spot.z - walker.z) * share;
        walker.rest = Math.max(walker.rest, 1);
      } else {
        walker.rest = 0;
      }
    }
  }
}
