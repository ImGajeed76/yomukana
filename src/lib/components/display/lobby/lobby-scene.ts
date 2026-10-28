// The lobby as one 3D scene: the room, a daifuku for each runner, their
// names floating over their heads, and the loop that moves it all. Seen from
// high up at the front of the room, looking down onto the floor and the
// screen at the back.
//
// It runs on a classroom PC left on all day, so it draws at most 30 frames a
// second, at a modest resolution, and the browser stops it whenever the tab
// is hidden. It is all motion, so with reduced motion the page shows the
// plain board instead and never loads it.

import {
  Color,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
  type Texture,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { CardColor } from "$lib/sync/profile-rules";
import { Daifuku, type Arrival, type Sight } from "./daifuku";
import type { Corner } from "./quad";
import { buildRoom, type Room } from "./room";
import { FlourBurst } from "./flour-burst";
import { GainPops } from "./gain-pops";
import { Race, type RoomPhase, type Standing } from "./race";
import { StartCount, type Countdown } from "./start-count";
import { paint, softSpot } from "./textures";
import {
  isOutsideClearings,
  PERSONAL_SPACE,
  spotOn,
  stepWalkers,
  walkerAt,
  type Floor,
} from "./wander";

export interface LobbyMember extends Standing {
  readonly username: string;
  /** What the name over its head says. */
  readonly name: string;
  readonly color: CardColor;
}

/** A face as the page sees it: top left, top right, bottom left, bottom right, in CSS pixels. */
export type ScreenCorners = readonly [Corner, Corner, Corner, Corner];

/** Where the page lays its own content: the board on the screen, the invite on the sign. */
export interface Faces {
  readonly screen: ScreenCorners;
  readonly sign: ScreenCorners;
}

/**
 * The most daifuku in the room at once; the board lists everyone. A marathon
 * may have more, but past this the floor is full and every frame costs a
 * school PC more than the crowd adds.
 */
export const LOBBY_MOST = 300;
/**
 * How many the room holds at their full size. Past that everyone shrinks, and
 * keeps that much less space, so a crowd still fits on the floor, down to
 * the smallest that still reads as a daifuku from across a classroom.
 */
const ROOMY = 70;
const SMALLEST = 0.55;
/**
 * During a count the crowd stands closer than it wanders, shoulder to
 * shoulder, right up under the screen, and hurries there.
 */
const GATHERED_SPACE = 1.3;
const GATHER_BACK = -10.4;
/**
 * How near the screen the floor reaches: before the race, and while it runs,
 * when the podium's own oval of floor is kept clear instead (see Room). For
 * the count to the end, the crowd gathers round that oval.
 */
const LOBBY_BACK = -8.4;
const RACE_BACK = -8.8;
/** How fast that edge moves forward when the floor by the screen closes, in scene units a second. */
const CLEARING = 1.4;
const GATHER_PACE = 2.2;
/** The shortest time between two frames. */
const FRAME_SECONDS = 1 / 30;
/** Where the camera stands and what it looks at. */
const CAMERA_AT = new Vector3(0, 30, 22);
const LOOKING_AT = new Vector3(0, 3, -6);
/** Where the sun comes from, as in room.ts, for the daifuku's own shading. */
const SUN_FROM = new Vector3(-5, 30, 7).normalize();
/** Where the room ends either side, less a daifuku's width. */
const SIDE_REACH = 16.6;
/** Seconds a newcomer lies about getting its bearings before it wanders, fall included. */
const GETTING_UP = 2.4;

/** The "z" rising over someone napping. */
function sleepyZ(): Texture {
  return paint(64, 64, (context) => {
    context.fillStyle = "rgba(60, 50, 40, 0.85)";
    context.font = "600 52px Geist, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("z", 32, 34);
  });
}

interface Resident {
  readonly daifuku: Daifuku;
  readonly label: HTMLElement;
  /** What the board last said about them. */
  standing: Standing;
}

/** A grain of flour thrown up when someone lands on their face. */
interface Puff {
  readonly sprite: Sprite;
  readonly vx: number;
  readonly vz: number;
  age: number;
}

export class LobbyScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(38, 16 / 9, 0.5, 200);
  private readonly room: Room;
  private floor: Floor;
  private readonly burst: FlourBurst;
  private readonly count: StartCount;
  private readonly race: Race;
  private readonly gains: GainPops;
  /** Which refresh of the board the last points popped up for. */
  private gainsFrom: number | null = null;
  private phase: RoomPhase = "lobby";
  /** Whether the phase has been set once: after that, a change happens while the room watches. */
  private hasPhase = false;
  /** How near the screen people may go right now, easing towards backFor. */
  private back = LOBBY_BACK;
  /** How big everyone is, as fitCrowd last set it. */
  private size = 1;
  private readonly residents = new Map<string, Resident>();
  private readonly leaving: Resident[] = [];
  private readonly puffs: Puff[] = [];
  private readonly flour: Texture = softSpot();
  /** The sun's direction as the camera sees it, which the daifuku shader lights by. */
  private readonly light = new Vector3();
  private readonly random = Math.random;
  private readonly point = new Vector3();
  private width = 1;
  private height = 1;
  private frame = 0;
  private last = 0;
  private hasSynced = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly labels: HTMLElement,
    /** Told where the screen's and the sign's faces are on the page, whenever the page resizes. */
    private readonly onFaces: (faces: Faces) => void,
    /** Told where the sign's face is every frame while it sways. */
    private readonly onSignMove: (corners: ScreenCorners) => void,
  ) {
    // See-through where nothing is drawn, so the board under the canvas shows
    // through the screen's face (see room.ts).
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setClearColor(new Color("#efe6d4"), 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.toneMapping = NeutralToneMapping;
    // The room's soft fill: light bouncing off walls and floor, worked out
    // once, so a side in shade still shows its colour and shape.
    const studio = new PMREMGenerator(this.renderer);
    const environment = new RoomEnvironment();
    this.scene.environment = studio.fromScene(environment, 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    environment.dispose();
    studio.dispose();
    this.room = buildRoom(this.light);
    this.scene.add(this.room.group);
    this.camera.position.copy(CAMERA_AT);
    this.camera.lookAt(LOOKING_AT);
    this.floor = {
      // Short of the bottom edge, so nobody floats under the footer.
      front: 4.2,
      back: LOBBY_BACK,
      halfWidth: (z) => this.halfWidthAt(z),
      seats: this.room.seats,
      obstacles: this.room.obstacles,
      space: PERSONAL_SPACE,
      pace: 1,
      clearings: [],
    };
    this.burst = new FlourBurst(this.scene, this.flour, this.random);
    this.count = new StartCount(this.room, this.burst, this.random);
    this.race = new Race(this.scene, this.room, this.burst, sleepyZ(), CAMERA_AT, this.random);
    this.gains = new GainPops(labels);
    this.frame = requestAnimationFrame(this.tick);
  }

  /** Counts the room down to a start or an end, or stops with null. */
  setCountdown(countdown: Countdown | null): void {
    this.count.set(countdown, this.crowd());
  }

  /** Moves the room on to another part of the marathon's life. */
  setPhase(phase: RoomPhase): void {
    // The first phase is how things stand when the screen opens; any after
    // it happens while the room watches.
    const isLive = this.hasPhase;
    this.hasPhase = true;
    this.phase = phase;
    if (!isLive) this.back = this.backFor(phase);
    this.race.setPhase(phase, this.crowd(), isLive);
  }

  /**
   * How near the screen people may go: right up under it while the crowd
   * gathers for the start, a little back before that, and well back once the
   * podium is out, so it has its space and nobody stands in front of it.
   */
  private backFor(phase: RoomPhase): number {
    // Once the podium is out the crowd gathers round it, so up beside it as
    // far as the floor goes; its own ground stays clear (see StartCount).
    if (phase !== "lobby") return RACE_BACK;
    return this.count.isCounting ? GATHER_BACK : LOBBY_BACK;
  }

  /**
   * Points over the heads of everyone whose score rose in the board's last
   * refresh, `from`, once per refresh. Each hops for joy as well.
   */
  showGains(gains: ReadonlyMap<string, number>, from: number | null): void {
    if (from === null || from === this.gainsFrom) return;
    this.gainsFrom = from;
    for (const [username, gain] of gains) {
      const resident = this.residents.get(username);
      if (resident === undefined || gain <= 0) continue;
      this.gains.pop(resident.daifuku, gain);
      // A hop even mid-jog, which an idle hop would wait out.
      resident.daifuku.jump("beat", 0, 0.3);
    }
  }

  private crowd(): Daifuku[] {
    return [...this.residents.values()].map((resident) => resident.daifuku);
  }

  /** Shrinks everyone, and the space they keep, as the room fills. */
  private fitCrowd(isAtOnce: boolean): void {
    const size = Math.max(
      SMALLEST,
      Math.min(1, Math.sqrt(ROOMY / Math.max(1, this.residents.size))),
    );
    this.size = size;
    this.floor = { ...this.floor, space: PERSONAL_SPACE * size };
    for (const { daifuku } of this.residents.values()) daifuku.setSize(size, isAtOnce);
    // The names over their heads shrink with them, or a crowd is a wall of names.
    this.labels.style.setProperty("--crowd", String(size));
  }

  /** How far either side of the middle a daifuku at depth `z` still shows whole. */
  private halfWidthAt(z: number): number {
    const toward = new Vector3().subVectors(LOOKING_AT, CAMERA_AT).normalize();
    const depth = new Vector3(0, 0.4, z).sub(CAMERA_AT).dot(toward);
    const half = Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect * depth;
    return Math.max(1, Math.min(half * 0.94 - 0.8, SIDE_REACH));
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.light.copy(SUN_FROM).transformDirection(this.camera.matrixWorldInverse);
    this.onFaces({
      screen: this.faceOnPage(this.room.screenCorners),
      sign: this.faceOnPage(this.room.signCorners()),
    });
  }

  /** A face's four corners, as the page sees them. */
  private faceOnPage([topLeft, topRight, bottomLeft, bottomRight]: readonly [
    Vector3,
    Vector3,
    Vector3,
    Vector3,
  ]): ScreenCorners {
    return [
      this.onPage(topLeft),
      this.onPage(topRight),
      this.onPage(bottomLeft),
      this.onPage(bottomRight),
    ];
  }

  /** Lowers the sign with the invite in, or pulls it back up out of sight. */
  setSignShown(isShown: boolean): void {
    this.room.setSignShown(isShown);
  }

  /** Where a point in the room shows on the page, in CSS pixels. */
  private onPage(point: Vector3): Corner {
    const at = this.point.copy(point).project(this.camera);
    return [((at.x + 1) / 2) * this.width, ((1 - at.y) / 2) * this.height];
  }

  /**
   * Brings the room in line with who is in the marathon. Everyone there when
   * the screen opens pops up where they stand; anyone who joins after falls
   * from the sky, and the others turn to watch.
   */
  sync(members: readonly LobbyMember[]): void {
    const shown = members.slice(0, LOBBY_MOST);
    const staying = new Set(shown.map((member) => member.username));
    for (const [username, resident] of this.residents) {
      if (staying.has(username)) continue;
      this.residents.delete(username);
      this.race.forget(resident.daifuku);
      resident.daifuku.leave();
      resident.label.classList.add("is-leaving");
      this.leaving.push(resident);
    }
    let popping = 0;
    for (const member of shown) {
      const known = this.residents.get(member.username);
      if (known !== undefined) {
        known.label.textContent = member.name;
        known.daifuku.setColor(member.color);
        known.standing = member;
        continue;
      }
      const isDropping = this.hasSynced;
      const arrival: Arrival = isDropping
        ? { kind: "drop" }
        : { kind: "pop", delay: popping * 0.06 };
      if (arrival.kind === "pop") popping += 1;
      const walker = walkerAt(
        spotOn(this.floor, this.random),
        this.random,
        isDropping ? GETTING_UP : 0,
      );
      const daifuku = new Daifuku(member.username, member.color, walker, arrival, this.light);
      const label = document.createElement("span");
      label.className = "lobby-name";
      label.textContent = member.name;
      this.labels.append(label);
      this.scene.add(daifuku.root, daifuku.shadow);
      this.residents.set(member.username, { daifuku, label, standing: member });
      if (isDropping) this.watchFall(daifuku);
    }
    // The first time, everyone is their size at once; after that they grow
    // or shrink gently as people come and go.
    this.fitCrowd(!this.hasSynced);
    this.hasSynced = true;
  }

  /** Everyone looks up at the one falling, and follows it down. */
  private watchFall(newcomer: Daifuku): void {
    for (const { daifuku } of this.residents.values()) {
      if (daifuku !== newcomer) daifuku.watch(newcomer.root.position, 3 + this.random() * 2);
    }
  }

  /** A landing: a puff of flour, and some of the others are glad to see them. */
  private land(newcomer: Daifuku): void {
    const { x, z } = newcomer.walker;
    for (let index = 0; index < 12; index++) {
      const angle = (index / 12) * Math.PI * 2 + this.random() * 0.4;
      const speed = 0.8 + this.random() * 1.2;
      const sprite = new Sprite(
        new SpriteMaterial({
          map: this.flour,
          color: new Color("#fbf8f1"),
          transparent: true,
          depthWrite: false,
        }),
      );
      sprite.position.set(x, 0.2, z);
      this.scene.add(sprite);
      this.puffs.push({ sprite, vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed, age: 0 });
    }
    for (const { daifuku } of this.residents.values()) {
      if (daifuku === newcomer) continue;
      const distance = Math.hypot(daifuku.walker.x - x, daifuku.walker.z - z);
      if (distance < 8 && this.random() < 0.6) daifuku.cheer(1.2 + this.random());
      if (distance < 5 && this.random() < 0.4) daifuku.hop();
    }
  }

  /** Something to look at: the room in front of the screen, a neighbour, or nothing new. */
  private readonly pick = (self: Daifuku): Sight | null => {
    const roll = this.random();
    if (roll < 0.4) return CAMERA_AT;
    if (roll < 0.85) {
      const near = [...this.residents.values()]
        .map((resident) => resident.daifuku)
        .filter(
          (other) => other !== self && other.root.position.distanceTo(self.root.position) < 6,
        );
      return near[Math.floor(this.random() * near.length)]?.root.position ?? CAMERA_AT;
    }
    return null;
  };

  private readonly tick = (time: number): void => {
    this.frame = requestAnimationFrame(this.tick);
    const seconds = Math.min(0.1, (time - this.last) / 1000);
    if (seconds < FRAME_SECONDS) return;
    this.last = time;
    const crowd = this.crowd();
    const now = Date.now();
    // Before the walkers move: the count and the race may be sending them
    // somewhere. In a count the crowd may come right up under the screen,
    // unless the podium is out there.
    // The floor's edge by the screen moves back at once when it opens up, and
    // forward slowly when it closes, so whoever stands there is eased out of
    // the way rather than jumped.
    const backTo = this.backFor(this.phase);
    this.back = backTo < this.back ? backTo : Math.min(backTo, this.back + CLEARING * seconds);
    const wandering = {
      ...this.floor,
      back: this.back,
      clearings: this.phase === "lobby" ? [] : [this.room.podiumClearing],
    };
    const floor = this.count.isCounting
      ? { ...wandering, space: GATHERED_SPACE * this.size, pace: GATHER_PACE }
      : wandering;
    this.race.step(
      seconds,
      now,
      [...this.residents.values()],
      wandering,
      this.count.isCounting,
      // Clear once nobody but the podium's own stands on its ground. Asked of
      // the race, not of who is held, which still counts the crowd from the
      // start's count for a frame after it ends.
      crowd.every(
        (daifuku) =>
          this.race.isOnPodium(daifuku) || isOutsideClearings(wandering, daifuku.walker, 0.97),
      ),
    );
    this.count.step(
      seconds,
      now,
      crowd.filter((daifuku) => !this.race.isOnPodium(daifuku)),
      floor,
    );
    this.burst.step(seconds);
    this.gains.step(seconds, (daifuku) => this.onPage(daifuku.nameAt(this.point)));
    const walkers = crowd.map((daifuku) => daifuku.walker);
    stepWalkers(walkers, seconds, floor, this.random);
    for (const { daifuku } of this.residents.values()) {
      daifuku.update(seconds, this.pick);
      if (daifuku.takeLanding()) this.land(daifuku);
    }
    for (const { daifuku } of this.leaving) daifuku.update(seconds, () => null);
    for (const resident of this.leaving.filter((one) => one.daifuku.isGone)) {
      this.scene.remove(resident.daifuku.root, resident.daifuku.shadow);
      resident.daifuku.dispose();
      resident.label.remove();
      this.leaving.splice(this.leaving.indexOf(resident), 1);
    }
    for (const puff of this.puffs) {
      puff.age += seconds;
      const share = puff.age / 0.9;
      puff.sprite.position.x += puff.vx * seconds * (1 - share);
      puff.sprite.position.z += puff.vz * seconds * (1 - share);
      puff.sprite.position.y += seconds * 0.5;
      puff.sprite.scale.setScalar(0.3 + share * 0.6);
      puff.sprite.material.opacity = 0.8 * (1 - share);
    }
    for (const puff of this.puffs.filter((one) => one.age >= 0.9)) {
      this.scene.remove(puff.sprite);
      puff.sprite.material.dispose();
      this.puffs.splice(this.puffs.indexOf(puff), 1);
    }
    this.room.update(seconds);
    if (this.room.isSignShown) this.onSignMove(this.faceOnPage(this.room.signCorners()));
    this.draw();
  };

  private draw(): void {
    this.renderer.render(this.scene, this.camera);
    // The names, over each head, nearer ones in front of those behind.
    for (const { daifuku, label } of [...this.residents.values(), ...this.leaving]) {
      const [x, y] = this.onPage(daifuku.nameAt(this.point));
      label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      label.style.zIndex = String(Math.round((daifuku.walker.z + 20) * 10));
      label.hidden = !daifuku.isNameShown;
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    for (const { daifuku, label } of [...this.residents.values(), ...this.leaving]) {
      daifuku.dispose();
      label.remove();
    }
    for (const puff of this.puffs) puff.sprite.material.dispose();
    this.burst.clear();
    this.race.dispose();
    this.gains.dispose();
    this.flour.dispose();
    this.room.dispose();
    this.renderer.dispose();
  }
}
