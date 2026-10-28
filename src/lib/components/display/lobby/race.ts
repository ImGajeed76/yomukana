// The room while a marathon runs, and after it. The board is on the screen;
// the room shows the race in a way that reads from across a classroom:
//
// - How each runner moves says how they are reading. Synced in the last few
//   minutes: jogging laps round the room. Read today: strolling about. Not
//   today: napping, eyes shut, a "z" rising now and then.
// - The top three stand on the podium in front of the screen, first in the
//   middle. When someone overtakes, they walk up and the one they passed
//   steps down.
// - When the results are final, flour flies over the podium and the winner
//   wears the headband.
//
// Points popping up over a head when a score rises are the scene's
// (lobby-scene.ts), as they come with each refresh of the board.

import { Sprite, SpriteMaterial, type Scene, type Texture, type Vector3 } from "three";
import type { Daifuku } from "./daifuku";
import type { FlourBurst } from "./flour-burst";
import type { PodiumStep } from "./podium";
import type { Room } from "./room";
import { spotOn, type Floor, type Spot } from "./wander";

/** Where the room is in a marathon's life. */
export type RoomPhase =
  /** Before the start: everyone mills about (and gathers for the count). */
  | "lobby"
  /** Running. */
  | "race"
  /** Over, the results waiting for offline devices. */
  | "counting"
  /** The results are final. */
  | "final";

/** What the board says about a runner, for the room. */
export interface Standing {
  /** Place on the board, or null for someone not placed yet (nothing read). */
  readonly rank: number | null;
  /** When they last synced, in epoch milliseconds, or null if never. */
  readonly readAt: number | null;
}

/** Synced this recently: jogging. */
const ACTIVE_MS = 5 * 60_000;
/** The laps' track: an oval round the middle of the floor. */
const TRACK = { x: 0, z: -1.0, across: 8.6, deep: 3.6 };
/** How far ahead on the track a jogger aims, in radians, and how fast it goes. */
const LEAD = 0.45;
const JOG = 2.4;
/** How fast someone walks up to, or down from, the podium. */
const CLIMB = 1.4;
/** The most "z"s rising at once, and how often each sleeper sends one. */
const MOST_ZS = 40;
const Z_EVERY = 3.2;
const Z_SECONDS = 2.6;

/**
 * Getting onto the podium: walking to the floor in front of the step, facing
 * it; jumping up onto it, `from` where it left the floor; standing on it.
 */
interface Climb {
  place: number;
  stage: "walking" | "jumping" | "up";
  /** Seconds into the jump. */
  age: number;
  from: Spot;
}

/** Getting off it: jumping down to the floor in front, then walking off. */
interface Descent {
  stage: "jumping" | "walking";
  age: number;
  from: Spot;
  /** Where it lands, and where it walks to after. */
  landing: Spot;
  away: Spot;
}

/** How long the podium's ground stays clear before the podium drops onto it, in seconds. */
const CLEAR_BEFORE_DROP = 1.2;
/** How long a jump onto or off a step takes, and its height over the step. */
const JUMP_SECONDS = 1.1;
const JUMP_HEIGHT = 0.45;
/** The crouch before it leaves the floor, as a share of the jump (as daifuku.ts has it). */
const CROUCH = 0.2;

/** The start of today, local time, in epoch milliseconds. */
function startOfToday(now: number): number {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

export class Race {
  private phase: RoomPhase = "lobby";
  /** Who stands, or is heading, on which step, by place (0 first), and how far they have got. */
  private readonly podium = new Map<Daifuku, Climb>();
  /** Who is coming down off the podium. */
  private readonly descending = new Map<Daifuku, Descent>();
  private readonly lanes = new Map<Daifuku, number>();
  private readonly naps = new Map<Daifuku, Spot>();
  private readonly zs: { sprite: Sprite; age: number }[] = [];
  private readonly zIn = new Map<Daifuku, number>();
  private hasCelebrated = false;
  /** Where the podium is: away, waiting for room, falling in, or down. */
  private podiumState: "away" | "waiting" | "falling" | "down" = "away";
  /** How long the podium's ground has been clear, while it waits to drop. */
  private clearFor = 0;

  constructor(
    private readonly scene: Scene,
    private readonly room: Room,
    private readonly burst: FlourBurst,
    private readonly zTexture: Texture,
    /** Where the podium faces: the room in front of the screen. */
    private readonly audience: Vector3,
    private readonly random: () => number,
  ) {}

  /** Moves the room to another part of the marathon's life. */
  /**
   * Moves the room to another part of the marathon's life. `isLive` when it
   * happens while the screen watches: then the race's start clears the floor
   * and drops the podium in, and the results' moment throws the flour. A
   * screen opened later just shows how things stand.
   */
  setPhase(phase: RoomPhase, crowd: readonly Daifuku[], isLive: boolean): void {
    if (phase === this.phase) return;
    const isResultMoment = isLive && phase === "final" && this.phase === "counting";
    const isStartMoment = isLive && this.phase === "lobby";
    this.phase = phase;
    this.hasCelebrated = !isResultMoment;
    if (phase === "lobby") {
      for (const daifuku of crowd) this.release(daifuku);
      this.room.showPodium("away");
      this.podiumState = "away";
    } else if (this.podiumState === "away") {
      if (isStartMoment) {
        this.podiumState = "waiting";
      } else {
        this.room.showPodium("now");
        this.podiumState = "down";
      }
    }
  }

  /** Whether `daifuku` is on, or on its way to or from, the podium: the count leaves it there. */
  isOnPodium(daifuku: Daifuku): boolean {
    return this.podium.has(daifuku) || this.descending.has(daifuku);
  }

  /** Moves the race on: called every frame, with everyone in the room and what the board says. */
  step(
    seconds: number,
    now: number,
    crowd: readonly { daifuku: Daifuku; standing: Standing }[],
    floor: Floor,
    isCounting: boolean,
    /** Whether the floor in front of the screen is clear of people, for the podium to come down on. */
    isFloorClear: boolean,
  ): void {
    this.stepZs(seconds);
    if (this.phase === "lobby") return;

    // At the start, the podium waits for the floor in front of the screen to
    // clear, falls in, and only once it has landed do the leaders go up.
    // Clear for a moment, not just for a frame, before it falls.
    this.clearFor = this.podiumState === "waiting" && isFloorClear ? this.clearFor + seconds : 0;
    if (this.podiumState === "waiting" && this.clearFor >= CLEAR_BEFORE_DROP) {
      this.room.showPodium("drop");
      this.podiumState = "falling";
    }
    if (this.podiumState === "falling" && this.room.isPodiumDown) {
      this.podiumState = "down";
      this.burst.throw(this.room.podiumSteps, 0.15, 0.3);
      const first = this.room.podiumSteps[0];
      const landing =
        first === undefined ? this.audience : { x: first.x, y: first.height, z: first.z };
      for (const { daifuku } of crowd) {
        daifuku.watch(landing, 2 + this.random() * 2);
        if (this.random() < 0.5) daifuku.cheer(1.5 + this.random());
      }
    }
    if (this.podiumState === "down") this.placePodium(seconds, crowd, floor);

    const today = startOfToday(now);
    for (const { daifuku, standing } of crowd) {
      if (this.isOnPodium(daifuku) || daifuku.isGathered || isCounting) {
        daifuku.walker.hurry = 1;
        continue;
      }
      // After the end nobody runs, and once the results are in everyone is up.
      const readAt = standing.readAt ?? 0;
      const mood =
        this.phase === "final"
          ? "stroll"
          : this.phase === "race" && now - readAt < ACTIVE_MS
            ? "jog"
            : readAt >= today
              ? "stroll"
              : "nap";
      if (mood === "jog") this.jog(daifuku);
      else if (mood === "nap") this.nap(seconds, daifuku, floor);
      else this.stroll(daifuku);
    }

    if (this.phase === "final") {
      const winner = crowd.find(({ standing }) => standing.rank === 1)?.daifuku;
      for (const { daifuku } of crowd) daifuku.setHeadband(daifuku === winner);
      if (!this.hasCelebrated) {
        this.hasCelebrated = true;
        this.burst.throw(this.room.podiumSteps, 1.2);
        for (const { daifuku } of crowd) {
          daifuku.cheer(5 + this.random() * 2);
          daifuku.jump("leap", this.random() * 0.4, 0.5 + this.random() * 0.4);
        }
      }
    }
  }

  /** Round the track, a little ahead of where it is, in its own lane. */
  private jog(daifuku: Daifuku): void {
    daifuku.isAsleep = false;
    this.naps.delete(daifuku);
    let lane = this.lanes.get(daifuku);
    if (lane === undefined) {
      lane = 0.82 + this.random() * 0.36;
      this.lanes.set(daifuku, lane);
    }
    const { walker } = daifuku;
    const angle = Math.atan2(
      (walker.x - TRACK.x) / TRACK.across,
      (walker.z - TRACK.z) / TRACK.deep,
    );
    walker.toX = TRACK.x + Math.sin(angle + LEAD) * TRACK.across * lane;
    walker.toZ = TRACK.z + Math.cos(angle + LEAD) * TRACK.deep * lane;
    walker.seat = null;
    walker.rest = 0;
    walker.hurry = JOG;
  }

  private stroll(daifuku: Daifuku): void {
    daifuku.isAsleep = false;
    daifuku.walker.hurry = 1;
    this.naps.delete(daifuku);
  }

  /** To a spot of its own, then to sleep there, a "z" rising now and then. */
  private nap(seconds: number, daifuku: Daifuku, floor: Floor): void {
    const { walker } = daifuku;
    walker.hurry = 1;
    let spot = this.naps.get(daifuku);
    if (spot === undefined) {
      spot = spotOn(floor, this.random);
      this.naps.set(daifuku, spot);
    }
    walker.seat = null;
    walker.toX = spot.x;
    walker.toZ = spot.z;
    if (Math.hypot(spot.x - walker.x, spot.z - walker.z) > 0.4) {
      walker.rest = 0;
      daifuku.isAsleep = false;
      return;
    }
    walker.rest = Math.max(walker.rest, 2);
    daifuku.isAsleep = true;
    const zIn = (this.zIn.get(daifuku) ?? this.random() * Z_EVERY) - seconds;
    if (zIn <= 0 && this.zs.length < MOST_ZS) {
      this.riseZ(daifuku);
      this.zIn.set(daifuku, Z_EVERY + this.random());
    } else {
      this.zIn.set(daifuku, zIn);
    }
  }

  private riseZ(daifuku: Daifuku): void {
    const sprite = new Sprite(
      new SpriteMaterial({ map: this.zTexture, transparent: true, depthWrite: false }),
    );
    daifuku.nameAt(sprite.position);
    sprite.position.x += 0.25;
    sprite.scale.setScalar(0.35);
    this.scene.add(sprite);
    this.zs.push({ sprite, age: 0 });
  }

  private stepZs(seconds: number): void {
    for (const z of this.zs) {
      z.age += seconds;
      const share = z.age / Z_SECONDS;
      z.sprite.position.y += seconds * 0.45;
      z.sprite.position.x += Math.sin(z.age * 3) * seconds * 0.15;
      z.sprite.scale.setScalar(0.35 + share * 0.25);
      z.sprite.material.opacity = Math.sin(Math.PI * Math.min(1, share));
    }
    for (const z of this.zs.filter((one) => one.age >= Z_SECONDS)) {
      this.scene.remove(z.sprite);
      z.sprite.material.dispose();
      this.zs.splice(this.zs.indexOf(z), 1);
    }
  }

  /**
   * The top three onto their steps, and anyone no longer in it off. Held by
   * this rather than wandering, so the podium is never crowded by
   * passers-by: it stands behind the floor everyone else may use. Each walks
   * to the floor in front of its step, facing it, and jumps up; someone who
   * moves to another step hops across; someone who drops out of the three
   * jumps down to the front and walks back into the room.
   */
  private placePodium(
    seconds: number,
    crowd: readonly { daifuku: Daifuku; standing: Standing }[],
    floor: Floor,
  ): void {
    const steps = this.room.podiumSteps;
    const top = new Map<Daifuku, number>();
    for (const place of steps.keys()) {
      // Equal scores share a place; the first of them on the board takes the step.
      const holder = crowd.find(
        ({ daifuku, standing }) =>
          standing.rank !== null && standing.rank <= place + 1 && !top.has(daifuku),
      );
      if (holder !== undefined) top.set(holder.daifuku, place);
    }

    for (const [daifuku, climb] of this.podium) {
      if (top.has(daifuku)) continue;
      this.podium.delete(daifuku);
      const step = steps[climb.place];
      if (climb.stage === "walking" || step === undefined) {
        daifuku.isOnPodium = false;
        continue;
      }
      daifuku.jump("leap", 0, JUMP_HEIGHT);
      const { x, z } = daifuku.walker;
      this.descending.set(daifuku, {
        stage: "jumping",
        age: 0,
        from: { x, z },
        landing: step.front,
        away: { x: step.front.x, z: floor.back + 0.6 },
      });
    }

    for (const [daifuku, place] of top) {
      const step = steps[place];
      if (step === undefined) continue;
      this.descending.delete(daifuku);
      daifuku.isOnPodium = true;
      daifuku.isAsleep = false;
      let climb = this.podium.get(daifuku);
      if (climb === undefined) {
        climb = { place, stage: "walking", age: 0, from: step.front };
        this.podium.set(daifuku, climb);
      } else if (climb.place !== place) {
        // Moved up or down the podium: from where it stands, a hop to the new step.
        climb.place = place;
        if (climb.stage !== "walking") this.leap(daifuku, climb);
      }
      this.climb(seconds, daifuku, climb, step);
    }

    for (const [daifuku, descent] of this.descending) {
      if (descent.stage === "jumping") {
        descent.age += seconds;
        const share = this.flight(descent.age);
        this.between(daifuku, descent.from, descent.landing, share);
        if (share > 0.5) daifuku.standOn(0);
        if (descent.age >= JUMP_SECONDS) descent.stage = "walking";
        continue;
      }
      daifuku.watch({ x: descent.away.x, y: 0, z: descent.away.z }, 1);
      if (this.walkTo(seconds, daifuku, descent.away) < 0.05) {
        this.descending.delete(daifuku);
        daifuku.isOnPodium = false;
      }
    }
  }

  /** One step of getting onto, or standing on, the podium. */
  private climb(seconds: number, daifuku: Daifuku, climb: Climb, step: PodiumStep): void {
    if (climb.stage === "walking") {
      daifuku.standOn(0);
      daifuku.watch({ x: step.front.x, y: 0, z: step.front.z - 1 }, 1);
      if (this.walkTo(seconds, daifuku, step.front) < 0.05) this.leap(daifuku, climb);
      return;
    }
    if (climb.stage === "jumping") {
      climb.age += seconds;
      const share = this.flight(climb.age);
      this.between(daifuku, climb.from, step, share);
      daifuku.watch({ x: step.x, y: step.height, z: step.z - 1 }, 1);
      // Up onto the step as it comes over the edge, not before.
      daifuku.standOn(share > 0.4 ? step.height : 0);
      if (climb.age >= JUMP_SECONDS) climb.stage = "up";
      return;
    }
    daifuku.standOn(step.height);
    daifuku.watch(this.audience, 1);
  }

  /** Starts a jump from where it stands. */
  private leap(daifuku: Daifuku, climb: Climb): void {
    climb.stage = "jumping";
    climb.age = 0;
    climb.from = { x: daifuku.walker.x, z: daifuku.walker.z };
    daifuku.jump("leap", 0, JUMP_HEIGHT);
  }

  /** How far through the air a jump is, 0 to 1: still in the crouch, then eased. */
  private flight(age: number): number {
    const share = Math.max(0, Math.min(1, (age / JUMP_SECONDS - CROUCH) / (1 - CROUCH)));
    return share * share * (3 - 2 * share);
  }

  /** Puts a held daifuku `share` of the way from `from` to `to`. */
  private between(daifuku: Daifuku, from: Spot, to: Spot, share: number): void {
    daifuku.walker.x = from.x + (to.x - from.x) * share;
    daifuku.walker.z = from.z + (to.z - from.z) * share;
  }

  /** Walks a held daifuku straight towards `to`. Returns how far it still has to go. */
  private walkTo(seconds: number, daifuku: Daifuku, to: Spot): number {
    const { walker } = daifuku;
    const dx = to.x - walker.x;
    const dz = to.z - walker.z;
    const distance = Math.hypot(dx, dz);
    const move = Math.min(distance, CLIMB * seconds);
    if (distance > 0) {
      walker.x += (dx / distance) * move;
      walker.z += (dz / distance) * move;
    }
    return distance - move;
  }

  /** Lets go of someone: off the podium, awake, at a stroll. */
  private release(daifuku: Daifuku): void {
    daifuku.isOnPodium = false;
    daifuku.isAsleep = false;
    daifuku.standOn(0);
    daifuku.setHeadband(false);
    daifuku.walker.hurry = 1;
    this.podium.delete(daifuku);
    this.descending.delete(daifuku);
    this.naps.delete(daifuku);
  }

  /** Forgets someone who left the room. */
  forget(daifuku: Daifuku): void {
    this.release(daifuku);
    this.lanes.delete(daifuku);
    this.zIn.delete(daifuku);
  }

  dispose(): void {
    for (const z of this.zs) {
      this.scene.remove(z.sprite);
      z.sprite.material.dispose();
    }
    this.zs.length = 0;
  }
}
