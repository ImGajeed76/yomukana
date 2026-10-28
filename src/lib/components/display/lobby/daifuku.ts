// A daifuku: the lobby's mascot, one for each runner. What it is made of is
// in dough.ts; this is how it behaves.
//
// It floats, rests, drifts about (see wander.ts), sits on cushions, blinks,
// looks around, turns to see who just arrived, and now and then hops,
// wiggles or spins. Someone who joins falls out of the sky, lands on their
// face in a puff of flour, lies there a moment, and gets up.

import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector2, type Vector3 } from "three";
import type { BufferGeometry, ShaderMaterial } from "three";
import type { CardColor } from "$lib/sync/profile-rules";
import {
  between,
  doughMaterial,
  doughShape,
  paintFace,
  randomFrom,
  setDough,
  shadowMap,
  type Face,
} from "./dough";
import { hachimaki } from "./hachimaki";
import { isSitting, WANDER_SPEED, type Walker } from "./wander";

/** Something a daifuku can look at. */
export interface Sight {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** How it comes into the room. */
export type Arrival =
  /** Pops up where it stands, when the screen first opens. Waits `delay` seconds first. */
  | { readonly kind: "pop"; readonly delay: number }
  /** Falls from the sky onto its face and gets up: someone who just joined. */
  | { readonly kind: "drop" };

/**
 * What it does for fun while it rests, and, at a start, on the count: a
 * short `beat` hop on each of the last seconds, and a `leap` at zero.
 */
type Antic = "hop" | "wiggle" | "spin" | "beat" | "leap";

/** Unhurried, apart from the count's hops, which have to fit in a second. */
const ANTIC_SECONDS: Readonly<Record<Antic, number>> = {
  hop: 1.2,
  wiggle: 1.4,
  spin: 1.9,
  beat: 0.62,
  leap: 1.1,
};

/** Seconds to pop up, and to float off when it leaves. */
const POP_SECONDS = 0.45;
const LEAVE_SECONDS = 1.6;
/** The fall: dropping, lying on its face, getting up. */
const FALL_SECONDS = 0.75;
const LIE_SECONDS = 0.9;
const RISE_SECONDS = 0.55;
/** How high it falls from. */
const FALL_HEIGHT = 14;
/** How far above the floor it floats, and above a cushion it sits on. */
const HOVER = 0.22;
const SEATED = 0.1;
/** Seconds a blink takes. */
const BLINK_SECONDS = 0.16;

/** Turns `from` towards `to` by `share`, the short way round. */
function turnTowards(from: number, to: number, share: number): number {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + difference * share;
}

/** Eases out past the end and back, for getting up with a bit of bounce. */
function overshoot(share: number): number {
  const back = 1.7;
  const rest = share - 1;
  return 1 + (back + 1) * rest * rest * rest + back * rest * rest;
}

export class Daifuku {
  /** On the floor, where it stands. Everything else hangs off it. */
  readonly root = new Group();
  readonly shadow: Mesh<PlaneGeometry, MeshBasicMaterial>;

  // From the floor up: its heading, its lean, its tumble round its middle,
  // and its squash from its bottom.
  private readonly turn = new Group();
  private readonly lean = new Group();
  private readonly tumble = new Group();
  private readonly squash = new Group();
  private readonly body: Mesh<BufferGeometry, ShaderMaterial>;
  /** From its bottom to the top of its head, and from its middle to its face. */
  private readonly height: number;
  private readonly depth: number;
  private readonly face: Face = { open: 1, happy: 0, look: new Vector2() };
  private readonly random: () => number;
  private readonly phase: number;
  private readonly pace: number;

  private clock = 0;
  /**
   * How far through its bob it is, in radians. Kept as its own running
   * phase rather than worked out from the clock, so bobbing a little faster
   * on the move changes the speed from then on and never jumps it to another
   * point in the bob, which in a jostling crowd looked like fluttering.
   */
  private bobPhase = 0;
  /** How much it is moving, 0 to 1, eased. */
  private motion = 0;
  private yaw: number;
  private yawSpeed = 0;
  private hover = HOVER;
  /** How big it is, and is growing or shrinking towards: smaller in a crowded room. */
  private size = 1;
  private sizeTo = 1;
  /** Seconds since it arrived; negative while it waits its turn to pop up. */
  private age: number;
  /** Seconds since it last touched down, for the wobble as it lands. */
  private landed = 10;
  private hasLanded = false;
  private leaving: number | null = null;
  private blinkIn: number;
  private blinking: number | null = null;
  private anticIn: number;
  private antic: { kind: Antic; age: number; height: number } | null = null;
  /** A jump on the count, waiting its turn in the wave. */
  private queued: { wait: number; kind: "beat" | "leap"; height: number } | null = null;
  /** Whether it stands with the crowd at a start, so it does nothing on its own. */
  isGathered = false;
  /** Whether it has reached its place in that crowd, and stays there. */
  isAtPlace = false;
  /** Whether it is napping: hasn't read today, so it sleeps through the race. */
  isAsleep = false;
  /** Whether it is on its way up to, or standing on, the podium; race.ts moves it there. */
  isOnPodium = false;
  /** How high the step it stands on is, eased towards `stepTo`: a podium step during a race. */
  private step = 0;
  private stepTo = 0;
  private headband: Group | null = null;
  private gaze: Sight | null = null;
  private gazeFor = 0;
  private happyFor = 0;

  constructor(
    readonly username: string,
    color: CardColor,
    readonly walker: Walker,
    private readonly arrival: Arrival,
    light: Vector3,
  ) {
    this.random = randomFrom(username);
    const geometry = doughShape(this.random);
    const box = geometry.boundingBox;
    const bottom = box?.min.y ?? -0.3;
    this.height = (box?.max.y ?? 0.4) - bottom;
    this.depth = box?.max.z ?? 0.6;
    this.body = new Mesh(geometry, doughMaterial(color, this.random, light));
    this.body.castShadow = true;

    // Hung from its bottom, so it squashes down onto the floor, and tumbles
    // round its middle, so it can fall on its face.
    this.body.position.y = -bottom;
    this.squash.position.y = -this.height / 2;
    this.tumble.position.y = this.height / 2;
    this.squash.add(this.body);
    this.tumble.add(this.squash);
    this.lean.add(this.tumble);
    this.turn.add(this.lean);
    this.root.add(this.turn);

    this.shadow = new Mesh(
      new PlaneGeometry(1.5, 1.1),
      new MeshBasicMaterial({ map: shadowMap(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;

    this.phase = this.random() * Math.PI * 2;
    this.pace = between(this.random, 0.8, 1.25);
    // A faller lands sideways on, so the room sees it flat on its face.
    this.yaw =
      arrival.kind === "drop"
        ? (this.random() < 0.5 ? -1 : 1) * between(this.random, 1.2, 1.9)
        : between(this.random, -0.6, 0.6);
    this.age = arrival.kind === "pop" ? -arrival.delay : 0;
    this.blinkIn = between(this.random, 1, 5);
    this.anticIn = between(this.random, 4, 14);
    this.place(0);
  }

  /** Whether it has floated off for good and can be taken away. */
  get isGone(): boolean {
    return this.leaving !== null && this.leaving >= LEAVE_SECONDS;
  }

  /** Whether its name shows: not before it appears, and not while it falls. */
  get isNameShown(): boolean {
    if (this.age < 0) return false;
    return this.arrival.kind !== "drop" || this.age >= FALL_SECONDS;
  }

  /** True once, the frame it hits the floor, for the puff of flour. */
  takeLanding(): boolean {
    if (!this.hasLanded && this.arrival.kind === "drop" && this.age >= FALL_SECONDS) {
      this.hasLanded = true;
      return true;
    }
    return false;
  }

  setColor(color: CardColor): void {
    setDough(this.body.material, color);
  }

  /** Looks at something for a while, like someone who just arrived. */
  watch(sight: Sight, seconds: number): void {
    this.gaze = sight;
    this.gazeFor = seconds;
  }

  /** Squints happily for a moment. */
  cheer(seconds: number): void {
    this.happyFor = seconds;
  }

  /** A little hop, as when someone arrives. */
  hop(): void {
    if (this.antic === null && this.isSettled && !isSitting(this.walker)) {
      this.antic = { kind: "hop", age: 0, height: 0.32 };
    }
  }

  /** A jump on the count, `wait` seconds from now, so the crowd's hops roll by as a wave. */
  jump(kind: "beat" | "leap", wait: number, height: number): void {
    if (this.falling === null && this.leaving === null) this.queued = { wait, kind, height };
  }

  leave(): void {
    this.leaving ??= 0;
  }

  /** Steps up onto, or down from, something `height` high: a podium step. */
  standOn(height: number): void {
    this.stepTo = height;
  }

  /**
   * Ties on, or takes off, the winner's headband: a white hachimaki with a
   * red sun at the front, cut to the daifuku's own shape where it sits.
   */
  setHeadband(isOn: boolean): void {
    if (isOn && this.headband === null) {
      this.headband = hachimaki(this.body.geometry, this.height);
      this.squash.add(this.headband);
    }
    if (this.headband !== null) this.headband.visible = isOn;
  }

  /** Grows or shrinks, gently, to `size` times its own: the room makes everyone smaller as it fills. */
  setSize(size: number, isAtOnce = false): void {
    this.sizeTo = size;
    if (isAtOnce) this.size = size;
  }

  /** Seconds into the fall, or null once it is up, or if it never fell. */
  private get falling(): number | null {
    if (this.arrival.kind !== "drop") return null;
    return this.age < FALL_SECONDS + LIE_SECONDS + RISE_SECONDS ? this.age : null;
  }

  /** Whether it is in the room and at rest, not arriving or leaving. */
  private get isSettled(): boolean {
    const isArriving = this.falling !== null || this.age < POP_SECONDS;
    return this.walker.rest > 0 && !isArriving && this.leaving === null;
  }

  /**
   * Moves it on by `seconds`. `pick` chooses something to look at when it is
   * done looking at the last thing: the room, a neighbour, or nothing.
   */
  update(seconds: number, pick: (self: Daifuku) => Sight | null): void {
    const wasFalling = this.falling;
    this.clock += seconds;
    this.age += seconds;
    this.landed += seconds;
    if (this.leaving !== null) this.leaving += seconds;
    if (
      this.arrival.kind === "pop" &&
      this.age >= POP_SECONDS &&
      this.age - seconds < POP_SECONDS
    ) {
      this.landed = 0;
    }
    // Nobody moves it while it lies on its face, or once it has its place in the crowd.
    this.walker.isPinned = this.falling !== null || this.isAtPlace || this.isOnPodium;
    // Up on its feet: a wobble, and a shake to get the flour off.
    if (wasFalling !== null && this.falling === null) {
      this.landed = 0;
      this.antic = { kind: "wiggle", age: 0, height: 0 };
      this.blinkIn = 0.2;
    }
    this.updateEyes(seconds, pick);
    this.updateAntics(seconds);
    this.place(seconds);
  }

  private updateEyes(seconds: number, pick: (self: Daifuku) => Sight | null): void {
    // A blink every few seconds, now and then two in a row.
    this.blinkIn -= seconds;
    if (this.blinking === null && this.blinkIn <= 0) {
      this.blinking = 0;
      this.blinkIn = this.random() < 0.2 ? 0.3 : between(this.random, 2, 6);
    }
    let open = 1;
    if (this.blinking !== null) {
      this.blinking += seconds;
      open = 1 - Math.sin((Math.PI * Math.min(this.blinking, BLINK_SECONDS)) / BLINK_SECONDS);
      if (this.blinking >= BLINK_SECONDS) this.blinking = null;
    }
    const falling = this.falling;
    // Squeezed shut from the moment it hits the floor until it is up.
    if (falling !== null && falling >= FALL_SECONDS) open = 0;
    // Asleep, the eyes are shut: two short lines.
    if (this.isAsleep) open = 0;
    this.face.open = open;

    this.happyFor = Math.max(0, this.happyFor - seconds);
    this.face.happy += ((this.happyFor > 0 ? 1 : 0) - this.face.happy) * Math.min(1, seconds * 8);

    this.gazeFor -= seconds;
    if (this.gazeFor <= 0) {
      this.gaze = pick(this);
      this.gazeFor = between(this.random, 1.5, 5);
    }
  }

  private updateAntics(seconds: number): void {
    // A jump on the count goes when its turn comes, whatever else it was doing.
    if (this.queued !== null) {
      this.queued.wait -= seconds;
      if (this.queued.wait <= 0) {
        this.antic = { kind: this.queued.kind, age: 0, height: this.queued.height };
        this.queued = null;
      }
    }
    if (this.antic !== null) {
      this.antic.age += seconds;
      if (this.antic.age >= ANTIC_SECONDS[this.antic.kind]) {
        if (this.antic.kind !== "wiggle" && this.antic.kind !== "spin") this.landed = 0;
        this.antic = null;
      }
      return;
    }
    // Only while resting and settled, and not while the crowd waits for a
    // start: never mid-stroll, on a cushion, or arriving.
    if (!this.isSettled || isSitting(this.walker) || this.isGathered || this.isAsleep) return;
    this.anticIn -= seconds;
    if (this.anticIn > 0) return;
    const roll = this.random();
    const kind = roll < 0.5 ? "hop" : roll < 0.85 ? "wiggle" : "spin";
    this.antic = { kind, age: 0, height: 0.32 };
    this.anticIn = between(this.random, 9, 22);
  }

  private place(seconds: number): void {
    const { x, z, vx, vz } = this.walker;
    const speed = Math.hypot(vx, vz);
    // Eased, so a jostle in a crowd does not flick it between moving and still.
    this.motion += (Math.min(1, speed / WANDER_SPEED) - this.motion) * Math.min(1, seconds * 3);
    const moving = this.motion;
    const time = this.clock * this.pace;

    // Bobbing in the air, a little quicker on the move, barely at all on a cushion.
    const isSeated = isSitting(this.walker);
    this.size += (this.sizeTo - this.size) * Math.min(1, seconds * 1.5);
    // Asleep, it sinks to the floor; on a step, it floats over the step.
    const resting = isSeated || this.isAsleep ? SEATED : HOVER;
    this.step += (this.stepTo - this.step) * Math.min(1, seconds * 4);
    this.hover += (resting + this.step - this.hover) * Math.min(1, seconds * 3);
    const bob = isSeated || this.isAsleep ? 0.01 : 0.06;
    this.bobPhase += seconds * this.pace * (1.6 + moving);
    let y = this.hover + bob * Math.sin(this.bobPhase + this.phase);
    // Breathing; on a cushion it settles into it, a little flatter, and asleep
    // flatter still, breathing slow and deep.
    let stretch = this.isAsleep
      ? 0.88 + 0.04 * Math.sin(time * 1.1 + this.phase)
      : (isSeated ? 0.93 : 1) + 0.025 * Math.sin(time * 2.2 + this.phase * 2);
    let roll = 0;
    let spin = 0;
    let pitch = 0;
    let splat = 0;

    const falling = this.falling;
    if (falling !== null) {
      // Lying on its face, its middle is as high as its face is deep.
      const lying = (this.depth - this.height / 2) * this.size;
      if (falling < FALL_SECONDS) {
        const share = falling / FALL_SECONDS;
        y = lying + FALL_HEIGHT * (1 - share * share);
        // Tips forward as it falls, so it lands face first.
        pitch = (Math.PI / 2) * Math.pow(share, 1.6);
        stretch = 1.06;
      } else if (falling < FALL_SECONDS + LIE_SECONDS) {
        const down = falling - FALL_SECONDS;
        pitch = Math.PI / 2;
        y = lying;
        // Splats flat, then wriggles a little before getting up.
        splat = 0.3 * Math.exp(-6 * down) * Math.cos(13 * down);
        roll = 0.1 * Math.sin(down * 22) * Math.max(0, (down - 0.4) / (LIE_SECONDS - 0.4));
      } else {
        const share = (falling - FALL_SECONDS - LIE_SECONDS) / RISE_SECONDS;
        const up = Math.min(1, overshoot(share));
        pitch = (Math.PI / 2) * (1 - up);
        y = lying + (this.hover - lying) * Math.min(1, share * 1.4);
      }
    }

    if (this.leaving !== null) {
      const share = Math.min(1, this.leaving / LEAVE_SECONDS);
      y += 12 * share * share;
    }
    if (this.antic !== null) {
      const share = this.antic.age / ANTIC_SECONDS[this.antic.kind];
      const kind = this.antic.kind;
      if (kind === "hop" || kind === "beat" || kind === "leap") {
        // Sinks slowly into a crouch, springs up, eases over the top and
        // floats back down: the crouch eased in and out, the flight a smooth arc.
        // A hop on the count crouches quicker, to fit in its second.
        const crouch = kind === "hop" ? 0.3 : 0.2;
        if (share < crouch) {
          stretch -= 0.12 * Math.sin((Math.PI / 2) * (share / crouch));
        } else {
          const air = (share - crouch) / (1 - crouch);
          const arc = Math.sin(Math.PI * air);
          y += this.antic.height * arc;
          stretch +=
            0.05 * Math.sin(Math.PI * Math.min(1, air * 2)) - 0.12 * (1 - Math.min(1, air * 5));
        }
      } else if (kind === "wiggle") {
        // A slow shake, two and a half sways, dying away.
        roll = 0.14 * Math.sin(share * Math.PI * 5) * Math.sin(Math.PI * share);
      } else {
        spin = Math.PI * 2 * (share * share * (3 - 2 * share));
      }
    }
    // Squashes as it lands and settles back, soft rather than jelly-quick.
    const wobble = 0.12 * Math.exp(-4.5 * this.landed) * Math.cos(9 * this.landed);
    stretch *= 1 - wobble;

    // Faces where it goes on the move; at rest, whatever caught its eye. Not
    // while it lies on its face.
    let wantYaw = this.yaw;
    if (falling !== null) wantYaw = this.yaw;
    else if (moving > 0.3) wantYaw = Math.atan2(vx, vz);
    else if (this.gaze !== null) wantYaw = Math.atan2(this.gaze.x - x, this.gaze.z - z);
    const before = this.yaw;
    this.yaw = turnTowards(this.yaw, wantYaw, Math.min(1, seconds * 1.6));
    this.yawSpeed = seconds > 0 ? (this.yaw - before) / seconds : 0;

    // The eyes go first and the body follows, so the eyes lead each turn.
    const behind = Math.atan2(Math.sin(wantYaw - this.yaw), Math.cos(wantYaw - this.yaw));
    const lookUp =
      this.gaze === null ? 0 : Math.max(-0.04, Math.min(0.06, (this.gaze.y - y) * 0.01));
    const share = Math.min(1, seconds * 10);
    const look = this.face.look;
    look.x += (Math.max(-0.16, Math.min(0.16, behind * 0.3)) - look.x) * share;
    look.y += (lookUp - look.y) * share;
    paintFace(this.body.material, this.face);

    this.root.position.set(x, y, z);
    this.root.scale.setScalar(this.size);
    this.turn.rotation.y = this.yaw + spin;
    // Leans into where it goes, and sways as it turns.
    this.lean.rotation.x = 0.2 * moving;
    this.lean.rotation.z = roll - this.yawSpeed * 0.06;
    this.tumble.rotation.x = pitch;
    // Flattened against the floor while it lies on its face, along its face's direction.
    this.squash.scale.set(
      (1 + splat * 0.5) / Math.sqrt(stretch),
      stretch * (1 + splat * 0.5),
      (1 - splat) / Math.sqrt(stretch),
    );
    const leaving = this.leaving === null ? 1 : Math.max(0, 1 - this.leaving / LEAVE_SECONDS);
    // Pops up from nothing, overshooting a little, when the screen first opens.
    const popped =
      this.arrival.kind === "pop" && this.age < POP_SECONDS
        ? overshoot(Math.max(0, this.age) / POP_SECONDS)
        : 1;
    this.squash.scale.multiplyScalar(leaving * popped);
    this.root.visible = this.age >= 0;

    // The shadow stays on the floor, smaller and fainter the higher it floats.
    // On a podium step, the shadow falls on the step.
    const lift = Math.max(0, y - HOVER - this.step);
    this.shadow.position.set(x, (isSeated ? 0.13 : 0.01) + this.step, z);
    this.shadow.visible = this.root.visible;
    this.shadow.scale.setScalar(Math.max(0.25, 1 - lift * 0.08) * this.size);
    this.shadow.material.opacity = Math.max(0, 1 - lift * 0.08) * leaving;
  }

  /** The point above its head where its name floats. */
  nameAt(target: Vector3): Vector3 {
    return target.set(
      this.root.position.x,
      this.root.position.y + this.height * this.squash.scale.y * this.size + 0.2,
      this.root.position.z,
    );
  }

  dispose(): void {
    this.body.geometry.dispose();
    this.body.material.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
    this.headband?.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const piece = object as Mesh<BufferGeometry, MeshBasicMaterial>;
      piece.geometry.dispose();
      piece.material.dispose();
    });
  }
}
