// The lobby's room: a wagashi shop with a tatami floor to wait on, and in it
// a big screen like the ones at a stadium, which shows the board.
//
// The screen stands on two steel legs in front of the back wall. Its face is
// left black here: the page lays the board over it as HTML, so the text stays
// sharp (see quad.ts and LobbyStage.svelte). Round it, the shop: a counter
// with a glass case of sweets under a shoji window with flour dust drifting
// in its light, a door with a noren reading よむかな, paper lanterns, a low
// table with steaming tea and cushions to sit on, a red bench under a red
// parasol, a paper floor lamp, a vase with a plum branch. Always daytime: it
// is a place, not part of the app's theme.
//
// Everything is simple shapes and canvas textures, so nothing is downloaded.

import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoBlending,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  type Material,
  type Texture,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { doughShape, randomFrom, sweetMaterial } from "./dough";
import { brushedMetal, cloth, felt, lantern, noren, parasolPaper } from "./fabrics";
import { addFestoon } from "./festoon";
import { addPodium, type PodiumStep } from "./podium";
import { plaster, shoji, softSpot, tatami, wood } from "./textures";
import type { Clearing, Spot } from "./wander";

/** The back wall, the side walls either side of the middle, and how tall they are. */
const WALL_Z = -14;
const SIDE_X = 18;
const WALL_HEIGHT = 20;
const FRONT_Z = 14;
/** The screen's face: its size, the middle of its bottom edge, and how far it tips towards the room. */
export const SCREEN = { width: 20, height: 11.25, x: 0, bottom: 3.2, z: -10.6, tilt: 0.18 };
/** Where the podium stands during a race: in front of the screen, behind the floor people walk on. */
const PODIUM_Z = -9.2;
/** How high the podium falls from, how long the fall takes, and how long it then settles. */
const PODIUM_DROP = 16;
const PODIUM_FALL = 0.85;
const PODIUM_SETTLE = 0.6;
/** How much wall one tile of the plaster texture covers, in scene units. */
const PLASTER_TILE = 10;
/** Where the screen's legs stand, behind the back of its casing. */
const LEGS_Z = SCREEN.z - 2.2;
/** The doorway in the back wall, right of the screen. */
const DOOR = { left: 11, right: 15, top: 5 };
const TABLE = { x: -11, z: -2, radius: 1.0 };
const BENCH = { x: 11.5, z: 2.5 };
const LAMP = { x: -15.5, z: 3 };
/**
 * The shop sign that shows the invite, hung from the ceiling left of the
 * screen: where it hangs, its face's size, near square for the code, its
 * height off the floor, and how far it turns towards the room.
 */
const SIGN = { x: -14, z: -9, width: 4.8, height: 5.6, bottom: 4, turn: 0.15 };
/** How far above its place the sign starts out of sight, and how long it takes to come down or go up. */
const SIGN_LIFT = 14;
const SIGN_TRAVEL = 1.4;
/** How hard its cords pull it back to hanging straight, and how quickly its swing dies away. */
const SWING_PULL = 9;
const SWING_DAMP = 1.1;
const VASE = { x: 15.5, z: -5.5 };

export interface Room {
  readonly group: Group;
  /** Cushions to sit on, and furniture to go round. */
  readonly seats: readonly Spot[];
  readonly obstacles: readonly (Spot & { readonly radius: number })[];
  /** The screen's face, top left, top right, bottom left, bottom right, in the world. */
  readonly screenCorners: readonly [Vector3, Vector3, Vector3, Vector3];
  /** The sign's face, for the invite, the same way round, as it hangs this moment. */
  signCorners(): [Vector3, Vector3, Vector3, Vector3];
  /** Whether the sign is out, swaying, so its face moves from frame to frame. */
  readonly isSignShown: boolean;
  /**
   * Lowers the sign in from the ceiling, or pulls it back up out of sight:
   * out only while the screen shows the invite.
   */
  setSignShown(isShown: boolean): void;
  /** Lights the first `count` lanterns of the string under the screen, for the count. */
  setLanternsLit(count: number): void;
  /** The middle of the screen's face, for everyone to look at during the count. */
  readonly screenMiddle: Vector3;
  /** The podium's steps, first to third. */
  readonly podiumSteps: readonly PodiumStep[];
  /**
   * The podium out, there at once, or dropped from the sky to land with a
   * thud; or away, before a race.
   */
  showPodium(how: "now" | "drop" | "away"): void;
  /** Whether the podium stands on the floor, out and landed. */
  readonly isPodiumDown: boolean;
  /** The podium's ground and room to walk round it, kept clear once a race is on. */
  readonly podiumClearing: Clearing;
  /** Moves what moves on its own: the noren, the sign, steam, dust. */
  update(seconds: number): void;
  dispose(): void;
}

/**
 * A box, positioned by its centre, its edges eased a little as worked wood and
 * finished metal are: a razor-sharp edge is what makes a box look drawn.
 */
function box(
  material: Material,
  size: [number, number, number],
  at: [number, number, number],
): Mesh {
  const ease = Math.min(0.06, Math.min(...size) * 0.2);
  const shape = ease < 0.01 ? new BoxGeometry(...size) : new RoundedBoxGeometry(...size, 2, ease);
  const mesh = new Mesh(shape, material);
  mesh.position.set(...at);
  return mesh;
}

/** A texture repeated `across` by `up` times. */
function repeated(texture: Texture, across: number, up: number): Texture {
  const copy = texture.clone();
  copy.repeat.set(across, up);
  copy.needsUpdate = true;
  return copy;
}

/**
 * A matte surface: rough, not metal, lit by the sun and the room's soft fill
 * like everything else here. Lambert in name, physically based underneath.
 */
const lambert = (color: string, roughness = 0.85): MeshStandardMaterial =>
  new MeshStandardMaterial({ color: new Color(color), roughness });

/**
 * A textured surface whose texture is also its relief: the darker lines of
 * the weave, the grain or the straw sit a little lower, so they catch the
 * light and throw tiny shadows the way the real thing does.
 */
const surface = (texture: Texture, roughness: number, relief: number): MeshStandardMaterial =>
  new MeshStandardMaterial({ map: texture, bumpMap: texture, bumpScale: relief, roughness });

/** Builds the room. `light` is the sun as the camera sees it, for the sweets' dough. */
export function buildRoom(light: Vector3): Room {
  const random = randomFrom("yomukana lobby");
  const group = new Group();
  const textures: Texture[] = [];
  const keep = <T extends Texture>(texture: T): T => {
    textures.push(texture);
    return texture;
  };

  // Light: daylight filling the room from high up, a little from the windows'
  // side, so what stands on the floor throws a short soft shadow under and
  // just beside itself, and the room's own fill (the scene's environment, see
  // lobby-scene.ts) so nothing in shade goes flat. Not a sun outside: the
  // walls would shade the floor, which no room lit from inside does.
  group.add(new HemisphereLight(new Color("#fff3e0"), new Color("#9c8f62"), 0.45));
  const sun = new DirectionalLight(new Color("#ffe9c8"), 1.9);
  sun.position.set(-5, 30, 7);
  sun.target.position.set(0, 0, -3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 5;
  group.add(sun, sun.target);

  // The room's shell, from here to the windows: it takes shadows but casts none.
  const shellFrom = group.children.length;
  addFloor(group, keep(tatami(random)), random);

  // Walls: wood below, plaster above, posts and a beam, a hole for the door.
  const lightWood = keep(wood(random, 0.15));
  const darkWood = keep(wood(random, 0.65));
  // Plaster repeated by each piece's own size, so a narrow piece beside the
  // door shows the clay at the same scale as the long wall, not stretched.
  const clay = keep(plaster(random));
  const wall = (across: number, up: number): MeshStandardMaterial =>
    surface(keep(repeated(clay, across / PLASTER_TILE, up / PLASTER_TILE)), 0.95, 3);
  const panel = (across: number): MeshStandardMaterial =>
    surface(keep(repeated(lightWood, across / 2.5, 1)), 0.7, 1.5);
  const post = surface(darkWood, 0.65, 1.5);
  // Posts stand up, so their grain runs up them, not across.
  const upright = keep(repeated(darkWood, 4, 1));
  upright.center.set(0.5, 0.5);
  upright.rotation = Math.PI / 2;
  const standing = surface(upright, 0.65, 1.5);
  const wainscot = 1.6;
  const leftOfDoor = DOOR.left + SIDE_X;
  const rightOfDoor = SIDE_X - DOOR.right;
  group.add(
    box(
      wall(leftOfDoor, WALL_HEIGHT),
      [leftOfDoor, WALL_HEIGHT, 0.2],
      [-SIDE_X + leftOfDoor / 2, WALL_HEIGHT / 2, WALL_Z],
    ),
    box(
      wall(rightOfDoor, WALL_HEIGHT),
      [rightOfDoor, WALL_HEIGHT, 0.2],
      [DOOR.right + rightOfDoor / 2, WALL_HEIGHT / 2, WALL_Z],
    ),
    box(
      wall(DOOR.right - DOOR.left, WALL_HEIGHT - DOOR.top),
      [DOOR.right - DOOR.left, WALL_HEIGHT - DOOR.top, 0.2],
      [(DOOR.left + DOOR.right) / 2, (WALL_HEIGHT + DOOR.top) / 2, WALL_Z],
    ),
    box(
      panel(leftOfDoor),
      [leftOfDoor, wainscot, 0.1],
      [-SIDE_X + leftOfDoor / 2, wainscot / 2, WALL_Z + 0.12],
    ),
    box(
      panel(rightOfDoor),
      [rightOfDoor, wainscot, 0.1],
      [DOOR.right + rightOfDoor / 2, wainscot / 2, WALL_Z + 0.12],
    ),
    box(post, [SIDE_X * 2, 0.35, 0.3], [0, 8, WALL_Z + 0.2]),
  );
  for (const side of [-1, 1]) {
    const length = FRONT_Z - WALL_Z;
    group.add(
      box(
        wall(length, WALL_HEIGHT),
        [0.2, WALL_HEIGHT, length],
        [side * SIDE_X, WALL_HEIGHT / 2, (WALL_Z + FRONT_Z) / 2],
      ),
      box(
        panel(length),
        [0.1, wainscot, length],
        [side * (SIDE_X - 0.12), wainscot / 2, (WALL_Z + FRONT_Z) / 2],
      ),
      box(post, [0.3, 0.35, length], [side * (SIDE_X - 0.2), 8, (WALL_Z + FRONT_Z) / 2]),
    );
    for (const z of [WALL_Z + 0.2, -4, 6]) {
      group.add(
        box(standing, [0.4, WALL_HEIGHT, 0.4], [side * (SIDE_X - 0.2), WALL_HEIGHT / 2, z]),
      );
    }
  }
  for (const x of [-7, DOOR.left - 0.2, DOOR.right + 0.2]) {
    group.add(box(standing, [0.4, WALL_HEIGHT, 0.4], [x, WALL_HEIGHT / 2, WALL_Z + 0.2]));
  }
  group.add(
    box(
      post,
      [DOOR.right - DOOR.left + 0.4, 0.3, 0.4],
      [(DOOR.left + DOOR.right) / 2, DOOR.top, WALL_Z + 0.2],
    ),
  );

  // Shoji windows on the back wall and down the left wall, bright with the day.
  const paper = keep(shoji(4, 6, random));
  const shojiMaterial = new MeshStandardMaterial({
    map: paper,
    emissive: new Color("#fff8ea"),
    emissiveIntensity: 0.55,
  });
  const backWindow = new Mesh(new PlaneGeometry(4.6, 3.6), shojiMaterial);
  backWindow.position.set(-13, 5.4, WALL_Z + 0.12);
  group.add(backWindow);
  for (const z of [-9, 1]) {
    const sideWindow = new Mesh(new PlaneGeometry(4.6, 3.6), shojiMaterial);
    sideWindow.position.set(-SIDE_X + 0.12, 4.6, z);
    sideWindow.rotation.y = Math.PI / 2;
    group.add(sideWindow);
  }
  const shell = new Set(group.children.slice(shellFrom));

  // Outside the door: a sunlit street, too bright to make out, and the noren.
  const street = new Mesh(
    new PlaneGeometry(6, DOOR.top + 1),
    new MeshBasicMaterial({ color: new Color("#fbf3e1") }),
  );
  street.position.set((DOOR.left + DOOR.right) / 2, DOOR.top / 2, WALL_Z - 1.5);
  group.add(street);
  const norenPanels = addNoren(group, post, keep, random);

  addScreen(group, keep(brushedMetal(random)));
  const screenCorners = screenFaceCorners();
  const sign = addSign(group, darkWood, lightWood, keep);
  /** Seconds since the podium was dropped, while it falls and settles; null otherwise. */
  let fallen: number | null = null;
  const { podium, steps: podiumSteps } = addPodium(
    group,
    SCREEN.x,
    PODIUM_Z,
    surface(keep(repeated(lightWood, 1, 1)), 0.6, 1.2),
    keep,
  );

  addCounter(group, darkWood, lightWood, keep, light, random);
  const steam = addTable(group, darkWood, keep(softSpot()), random, keep);
  const lanternPaper = keep(lantern("餅", random));
  addLanterns(group, lanternPaper);
  // Tied to the screen's two bottom corners, for the count before a start.
  const casingBottom = -SCREEN.height / 2 - 0.45;
  const festoon = addFestoon(
    group,
    onScreen(-SCREEN.width / 2 - 0.3, casingBottom, 0.05),
    onScreen(SCREEN.width / 2 + 0.3, casingBottom, 0.05),
    lanternPaper,
    keep(softSpot()),
  );
  addBench(group, keep(parasolPaper(random)), keep(felt(random)));
  addLamp(group);
  addVase(group, random);

  // The windows' light falling in, and flour dust drifting in it.
  const beam = new Mesh(
    new PlaneGeometry(4.2, 12),
    new MeshBasicMaterial({
      map: keep(beamFalloff()),
      transparent: true,
      opacity: 0.14,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  beam.position.set(-12.2, 3.4, -9.6);
  beam.rotation.set(-1.0, 0.3, 0.1);
  group.add(beam);
  const dustCount = 90;
  const dust = new Float32Array(dustCount * 3);
  const motes = Array.from({ length: dustCount }, () => ({
    x: -15.5 + random() * 6,
    y: 0.5 + random() * 6,
    z: -13 + random() * 7,
    phase: random() * Math.PI * 2,
    speed: 0.05 + random() * 0.1,
  }));
  const dustGeometry = new BufferGeometry();
  dustGeometry.setAttribute("position", new BufferAttribute(dust, 3));
  group.add(
    new Points(
      dustGeometry,
      new PointsMaterial({
        map: keep(softSpot()),
        size: 0.12,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        color: new Color("#fffaf0"),
      }),
    ),
  );

  const seats: Spot[] = [
    { x: TABLE.x - 1.6, z: TABLE.z + 0.2 },
    { x: TABLE.x + 1.6, z: TABLE.z },
    { x: TABLE.x, z: TABLE.z + 1.6 },
    { x: TABLE.x, z: TABLE.z - 1.6 },
    { x: 6.5, z: 3.5 },
    { x: -5.5, z: 4.5 },
  ];
  addCushions(group, seats, random, keep);

  // Everything standing in the room casts a shadow and takes one. The shell
  // only takes them, and what glows or floats in the air neither: light,
  // dust, steam, the street beyond the door.
  group.traverse((object) => {
    if (!(object instanceof Mesh) || object === beam || object === street) return;
    object.castShadow = !shell.has(object);
    object.receiveShadow = true;
  });

  let clock = 0;
  return {
    group,
    seats,
    obstacles: [
      { ...TABLE },
      { x: BENCH.x, z: BENCH.z, radius: 1.6 },
      { x: LAMP.x, z: LAMP.z, radius: 0.5 },
      { x: VASE.x, z: VASE.z, radius: 0.4 },
      // The screen's legs.
      { x: SCREEN.x - 6, z: LEGS_Z + 0.4, radius: 1.2 },
      { x: SCREEN.x + 6, z: LEGS_Z + 0.4, radius: 1.2 },
    ],
    screenCorners,
    screenMiddle: new Vector3(SCREEN.x, SCREEN.bottom + SCREEN.height / 2, SCREEN.z),
    signCorners: sign.corners,
    get isSignShown() {
      // Out, or on its way in or out: its face moves and the page follows it.
      return sign.group.visible;
    },
    podiumSteps,
    showPodium(how) {
      podium.visible = how !== "away";
      fallen = how === "drop" ? 0 : null;
      podium.position.y = how === "drop" ? PODIUM_DROP : 0;
      podium.scale.set(1, 1, 1);
    },
    podiumClearing: { x: SCREEN.x, z: PODIUM_Z, across: 5.2, deep: 2.6 },
    get isPodiumDown() {
      return podium.visible && (fallen === null || fallen >= PODIUM_FALL + PODIUM_SETTLE);
    },
    setLanternsLit(count) {
      festoon.setLit(count);
    },
    setSignShown(isShown) {
      sign.setShown(isShown);
    },
    update(seconds) {
      clock += seconds;
      sign.step(seconds, clock);
      // The podium falling: faster and faster, then a thud, squashing a touch
      // and springing back, like something heavy and a little soft landing.
      if (fallen !== null) {
        fallen += seconds;
        const share = Math.min(1, fallen / PODIUM_FALL);
        podium.position.y = PODIUM_DROP * (1 - share * share);
        const after = Math.max(0, fallen - PODIUM_FALL);
        const squash =
          fallen < PODIUM_FALL ? 0 : 0.12 * Math.exp(-7 * after) * Math.cos(18 * after);
        podium.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
        if (fallen >= PODIUM_FALL + PODIUM_SETTLE) {
          fallen = null;
          podium.scale.set(1, 1, 1);
        }
      }
      // The noren stirs in a breeze from the street, each panel on its own.
      for (const [index, pivot] of norenPanels.entries()) {
        pivot.rotation.x =
          -0.06 - 0.05 * Math.sin(clock * 0.9 + index * 0.8) * Math.sin(clock * 0.37);
      }
      // Steam rises from the cups, spreading and fading.
      for (const puff of steam) {
        puff.age = (puff.age + seconds) % 2.7;
        const share = puff.age / 2.7;
        puff.sprite.position.set(puff.x + Math.sin(puff.age * 2) * 0.05, 0.7 + share * 0.9, puff.z);
        puff.sprite.scale.setScalar(0.12 + share * 0.35);
        puff.sprite.material.opacity = 0.35 * Math.sin(Math.PI * share);
      }
      // Dust drifts slowly in the window's light.
      for (const [index, mote] of motes.entries()) {
        dust[index * 3] = mote.x + Math.sin(clock * mote.speed + mote.phase) * 0.5;
        dust[index * 3 + 1] = mote.y + Math.sin(clock * mote.speed * 0.7 + mote.phase * 2) * 0.4;
        dust[index * 3 + 2] = mote.z + Math.cos(clock * mote.speed * 0.5 + mote.phase) * 0.4;
      }
      dustGeometry.getAttribute("position").needsUpdate = true;
    },
    dispose() {
      group.traverse((object) => {
        if (object instanceof Mesh || object instanceof Points || object instanceof Sprite) {
          const drawn = object as Mesh;
          drawn.geometry.dispose();
          const materials = Array.isArray(drawn.material) ? drawn.material : [drawn.material];
          for (const material of materials) material.dispose();
        }
      });
      for (const texture of textures) texture.dispose();
    },
  };
}

/**
 * Tatami in staggered rows, each row half a mat along from the last, so four
 * corners never meet, as they are laid. Big and quiet, so the floor sits back
 * behind the daifuku. Each mat a slightly different shade, some fresher and
 * greener, some faded by the sun, as real ones are.
 */
function addFloor(group: Group, texture: Texture, random: () => number): void {
  const long = 3.4;
  const short = long / 2;
  const across = Math.ceil((SIDE_X * 2) / long) + 1;
  const deep = Math.ceil((FRONT_Z - WALL_Z) / short);
  const mats = new InstancedMesh(
    new PlaneGeometry(long, short),
    surface(texture, 0.9, 2.5),
    across * deep,
  );
  const place = new Object3D();
  const fresh = new Color("#eef3cf");
  const shade = new Color();
  let count = 0;
  for (let row = 0; row < deep; row++) {
    const offset = row % 2 === 0 ? 0 : short;
    for (let column = 0; column < across; column++) {
      place.position.set(-SIDE_X + offset + column * long, 0, WALL_Z + short / 2 + row * short);
      place.rotation.set(-Math.PI / 2, 0, 0);
      place.updateMatrix();
      mats.setMatrixAt(count, place.matrix);
      shade
        .setScalar(0.95 + random() * 0.06)
        .lerp(fresh, random() * 0.25)
        .multiplyScalar(0.97 + random() * 0.04);
      mats.setColorAt(count, shade);
      count += 1;
    }
  }
  group.add(mats);
}

/** The noren: よむかな, a character on each of four panels, hung from a pole. Returns their pivots. */
function addNoren(
  group: Group,
  pole: Material,
  keep: <T extends Texture>(texture: T) => T,
  random: () => number,
): Group[] {
  const width = (DOOR.right - DOOR.left - 0.2) / 4;
  const rod = new Mesh(new CylinderGeometry(0.06, 0.06, DOOR.right - DOOR.left + 0.4, 8), pole);
  rod.rotation.z = Math.PI / 2;
  rod.position.set((DOOR.left + DOOR.right) / 2, DOOR.top - 0.25, WALL_Z + 0.5);
  group.add(rod);
  return ["よ", "む", "か", "な"].map((character, index) => {
    const pivot = new Group();
    pivot.position.set(DOOR.left + 0.1 + width * (index + 0.5), DOOR.top - 0.25, WALL_Z + 0.5);
    // Cloth hangs in soft folds, deepest towards the bottom where it is free.
    const folds = new PlaneGeometry(width - 0.05, 2.4, 16, 8);
    const position = folds.getAttribute("position");
    const phase = random() * Math.PI * 2;
    for (let vertex = 0; vertex < position.count; vertex++) {
      const x = position.getX(vertex);
      const down = (1.2 - position.getY(vertex)) / 2.4;
      position.setZ(vertex, Math.sin(x * 9 + phase) * 0.05 * (0.3 + down));
    }
    folds.computeVertexNormals();
    const texture = keep(noren(character, random));
    const cloth = new Mesh(
      folds,
      new MeshStandardMaterial({
        map: texture,
        bumpMap: texture,
        bumpScale: 0.6,
        side: DoubleSide,
        roughness: 0.95,
      }),
    );
    cloth.position.y = -1.2;
    pivot.add(cloth);
    group.add(pivot);
    return pivot;
  });
}

/** The big screen on its legs, tipped a little towards the room, like one at a stadium. */
function addScreen(group: Group, metal: Texture): void {
  const steel = new MeshStandardMaterial({
    color: new Color("#4a4e57"),
    roughness: 0.45,
    metalness: 0.6,
  });
  const casing = new MeshStandardMaterial({
    map: metal,
    roughness: 0.38,
    metalness: 0.55,
  });
  const middle = SCREEN.bottom + SCREEN.height / 2;
  const screen = new Group();
  screen.position.set(SCREEN.x, middle, SCREEN.z);
  screen.rotation.x = SCREEN.tilt;
  screen.add(box(casing, [SCREEN.width + 0.9, SCREEN.height + 0.9, 0.7], [0, 0, -0.35]));
  // The face is a hole: it clears the canvas to see-through, and the board,
  // which the page draws underneath the canvas, shows through it. Anything in
  // front of the screen still draws over it, as it should.
  const face = new Mesh(
    new PlaneGeometry(SCREEN.width, SCREEN.height),
    new MeshBasicMaterial({ color: new Color("#000000"), opacity: 0, blending: NoBlending }),
  );
  face.position.z = 0.01;
  screen.add(face);
  // A strip of lights along the bottom edge, and a red one that says it is on.
  screen.add(
    box(
      new MeshBasicMaterial({ color: new Color("#3b3f48") }),
      [SCREEN.width + 0.9, 0.18, 0.1],
      [0, -SCREEN.height / 2 - 0.45, 0.02],
    ),
  );
  screen.add(
    box(
      new MeshBasicMaterial({ color: new Color("#ff4d3d") }),
      [0.22, 0.12, 0.08],
      [SCREEN.width / 2 - 0.3, -SCREEN.height / 2 - 0.45, 0.08],
    ),
  );
  group.add(screen);
  // The legs, a cross brace, and feet, behind the screen all the way down:
  // it tips forward, so its bottom edge sits further back than its middle.
  for (const side of [-1, 1]) {
    const x = SCREEN.x + side * 6;
    group.add(box(steel, [0.45, middle, 0.45], [x, middle / 2, LEGS_Z]));
    group.add(box(steel, [1.4, 0.2, 2.6], [x, 0.1, LEGS_Z + 0.4]));
  }
  group.add(box(steel, [12, 0.3, 0.3], [SCREEN.x, SCREEN.bottom - 0.9, LEGS_Z]));
}

/**
 * A wooden shop sign hung from the ceiling on two cords, a beam across its
 * top, its face a hole like the screen's, for the page to show the invite
 * through. It sways a little, as anything hanging in a room does. Out of
 * sight until the invite is shown.
 */
function addSign(
  group: Group,
  darkWood: Texture,
  lightWood: Texture,
  keep: <T extends Texture>(texture: T) => T,
): {
  group: Group;
  corners: () => [Vector3, Vector3, Vector3, Vector3];
  /** Lowers it into the room, or pulls it back up out of sight. */
  setShown: (isShown: boolean) => void;
  /** Moves it on: down or up if on its way, and always a gentle sway. */
  step: (seconds: number, clock: number) => void;
} {
  const frame = surface(keep(repeated(darkWood, 1, 1)), 0.6, 1.5);
  const beam = surface(keep(repeated(lightWood, 2, 1)), 0.55, 1);
  const { width, height } = SIGN;
  const middle = SIGN.bottom + height / 2;
  // Hung from a point at the ceiling, so swaying it swings cords and board together.
  const hanging = new Group();
  hanging.position.set(SIGN.x, WALL_HEIGHT, SIGN.z);
  hanging.rotation.y = SIGN.turn;
  hanging.visible = false;
  const board = new Group();
  board.position.y = middle - WALL_HEIGHT;
  const rim = 0.18;
  board.add(
    box(frame, [width + rim * 2, height + rim * 2, 0.16], [0, 0, -0.1]),
    box(beam, [width + 0.8, 0.24, 0.34], [0, height / 2 + rim + 0.12, -0.05]),
  );
  const face = new Mesh(
    new PlaneGeometry(width, height),
    new MeshBasicMaterial({ color: new Color("#000000"), opacity: 0, blending: NoBlending }),
  );
  face.position.z = 0.01;
  board.add(face);
  hanging.add(board);
  // The cords, from the ends of the beam straight up to the ceiling.
  const cord = lambert("#3a2c20", 0.9);
  const top = middle + height / 2 + rim + 0.2;
  for (const side of [-1, 1]) {
    const length = WALL_HEIGHT - top;
    const line = new Mesh(new CylinderGeometry(0.03, 0.03, length, 6), cord);
    line.position.set(side * (width / 2 + 0.3), -length / 2, -0.05);
    hanging.add(line);
  }
  group.add(hanging);

  const at = (x: number, y: number): Vector3 =>
    new Vector3(x, y, 0.02).applyMatrix4(board.matrixWorld);
  /** On its way down or up, and how far in, in seconds. */
  let travel: { down: boolean; age: number } | null = null;
  /** Its swing on the cords, in radians and radians a second. */
  const swing = { angle: 0, speed: 0 };
  return {
    group: hanging,
    corners() {
      board.updateWorldMatrix(true, false);
      return [
        at(-width / 2, height / 2),
        at(width / 2, height / 2),
        at(-width / 2, -height / 2),
        at(width / 2, -height / 2),
      ];
    },
    setShown(isShown) {
      const isOut = hanging.visible && travel?.down !== false;
      if (isShown === isOut) return;
      // Turned round partway, it carries on from where it is.
      const done = travel === null ? 1 : Math.min(1, travel.age / SIGN_TRAVEL);
      travel = { down: isShown, age: (1 - done) * SIGN_TRAVEL };
      hanging.visible = true;
      // Setting off jolts it into a swing.
      swing.speed += isShown ? 0.12 : -0.1;
    },
    step(seconds, clock) {
      let lift = 0;
      if (travel !== null) {
        travel.age += seconds;
        const share = Math.min(1, travel.age / SIGN_TRAVEL);
        // Down: fast at first, slowing to a stop. Up: slow at first, then away.
        lift = travel.down ? SIGN_LIFT * Math.pow(1 - share, 3) : SIGN_LIFT * share * share * share;
        // On the move, the air and the cords keep it swinging.
        swing.speed += Math.sin(travel.age * 5) * 0.5 * seconds;
        if (share >= 1) {
          // Stopping short at the bottom throws it into its biggest swing.
          if (travel.down) swing.speed += 0.3;
          else hanging.visible = false;
          travel = null;
        }
      }
      // A pendulum on long cords: pulled back to hanging straight, slowly losing its swing.
      swing.speed += (-SWING_PULL * swing.angle - SWING_DAMP * swing.speed) * seconds;
      swing.angle += swing.speed * seconds;
      hanging.position.y = WALL_HEIGHT + lift;
      // Two slow motions that never quite repeat, side to side and a slight
      // turn, under whatever swing it has.
      hanging.rotation.z =
        0.012 * Math.sin(clock * 0.8) + 0.004 * Math.sin(clock * 1.9) + swing.angle;
      hanging.rotation.x = 0.006 * Math.sin(clock * 0.6 + 1) + swing.angle * 0.4;
      hanging.rotation.y = SIGN.turn + 0.035 * Math.sin(clock * 0.35);
    },
  };
}

/** A point on the screen, given from its middle in its own tipped frame, in the world. */
function onScreen(x: number, y: number, z: number): Vector3 {
  const frame = new Object3D();
  frame.position.set(SCREEN.x, SCREEN.bottom + SCREEN.height / 2, SCREEN.z);
  frame.rotation.x = SCREEN.tilt;
  frame.updateMatrixWorld();
  return new Vector3(x, y, z).applyMatrix4(frame.matrixWorld);
}

/** The screen's face's corners in the world, top left, top right, bottom left, bottom right. */
function screenFaceCorners(): [Vector3, Vector3, Vector3, Vector3] {
  const halfWidth = SCREEN.width / 2;
  const halfHeight = SCREEN.height / 2;
  const corner = (x: number, y: number): Vector3 => onScreen(x, y, 0.02);
  return [
    corner(-halfWidth, halfHeight),
    corner(halfWidth, halfHeight),
    corner(-halfWidth, -halfHeight),
    corner(halfWidth, -halfHeight),
  ];
}

/** The counter under the back window: wood, a glass case on it, sweets on dishes inside. */
function addCounter(
  group: Group,
  darkWood: Texture,
  lightWood: Texture,
  keep: <T extends Texture>(texture: T) => T,
  light: Vector3,
  random: () => number,
): void {
  const at = { x: -13, z: WALL_Z + 1.2 };
  group.add(
    box(surface(keep(repeated(darkWood, 2, 1)), 0.65, 1.5), [6, 1.6, 1.6], [at.x, 0.8, at.z]),
    box(surface(keep(repeated(lightWood, 2, 1)), 0.55, 1), [6.3, 0.12, 1.8], [at.x, 1.66, at.z]),
  );
  // Glass: barely tinted, smooth, so it shows the room's light on its faces.
  const glass = new MeshStandardMaterial({
    color: new Color("#e8f4f2"),
    transparent: true,
    opacity: 0.16,
    roughness: 0.05,
    depthWrite: false,
  });
  group.add(box(glass, [5.6, 0.9, 1.3], [at.x, 2.17, at.z]));
  const frame = lambert("#8a6b48");
  for (const dx of [-2.8, 2.8]) group.add(box(frame, [0.06, 0.9, 1.3], [at.x + dx, 2.17, at.z]));
  group.add(box(frame, [5.66, 0.06, 1.36], [at.x, 2.62, at.z]));
  const dish = lambert("#f4f1ea", 0.3);
  // Sweets of the same dough as the daifuku, each pressed by hand, without a face.
  const colors = [
    "#f0a9b6",
    "#f4ede0",
    "#9cc08a",
    "#f0a9b6",
    "#e6c67a",
    "#f4ede0",
    "#9cc08a",
    "#c49ad6",
  ];
  for (const [index, color] of colors.entries()) {
    const x = at.x - 2.45 + index * 0.7;
    const sweet = new Mesh(doughShape(random), sweetMaterial(color, random, light));
    sweet.scale.setScalar(0.34);
    sweet.rotation.y = random() * Math.PI * 2;
    sweet.position.set(x, 1.93, at.z);
    const plate = new Mesh(new CylinderGeometry(0.3, 0.26, 0.04, 20), dish);
    plate.position.set(x, 1.79, at.z);
    group.add(sweet, plate);
  }
}

/** The low table, with a teapot and cups of green tea that steam. Returns the steam. */
function addTable(
  group: Group,
  darkWood: Texture,
  spot: Texture,
  random: () => number,
  keep: <T extends Texture>(texture: T) => T,
): { sprite: Sprite; x: number; z: number; age: number }[] {
  const tableWood = surface(keep(repeated(darkWood, 1, 1)), 0.5, 1);
  const top = new Mesh(new CylinderGeometry(TABLE.radius, TABLE.radius, 0.1, 40), tableWood);
  top.position.set(TABLE.x, 0.5, TABLE.z);
  group.add(top);
  for (let leg = 0; leg < 4; leg++) {
    const angle = Math.PI / 4 + (leg * Math.PI) / 2;
    group.add(
      box(
        tableWood,
        [0.1, 0.46, 0.1],
        [TABLE.x + Math.cos(angle) * 0.62, 0.23, TABLE.z + Math.sin(angle) * 0.62],
      ),
    );
  }
  // Glazed: the pot and cups shine where the light catches them.
  const clay = lambert("#9a553a", 0.3);
  const pot = new Mesh(new SphereGeometry(0.22, 24, 16), clay);
  pot.scale.set(1, 0.8, 1);
  pot.position.set(TABLE.x + 0.2, 0.72, TABLE.z - 0.2);
  const spout = new Mesh(new CylinderGeometry(0.03, 0.045, 0.2, 10), clay);
  spout.position.set(TABLE.x + 0.45, 0.76, TABLE.z - 0.2);
  spout.rotation.z = -1.0;
  group.add(pot, spout);
  const cupMaterial = lambert("#efe7d6", 0.25);
  const tea = lambert("#8fa64a", 0.1);
  const steam: { sprite: Sprite; x: number; z: number; age: number }[] = [];
  for (const [dx, dz] of [
    [-0.45, 0.25],
    [0.1, 0.5],
    [-0.3, -0.4],
  ] as const) {
    const cup = new Mesh(new CylinderGeometry(0.1, 0.075, 0.15, 18), cupMaterial);
    cup.position.set(TABLE.x + dx, 0.62, TABLE.z + dz);
    const surface = new Mesh(new CylinderGeometry(0.088, 0.088, 0.01, 18), tea);
    surface.position.set(TABLE.x + dx, 0.685, TABLE.z + dz);
    group.add(cup, surface);
    for (let puff = 0; puff < 3; puff++) {
      const sprite = new Sprite(
        new SpriteMaterial({ map: spot, transparent: true, opacity: 0, depthWrite: false }),
      );
      group.add(sprite);
      steam.push({ sprite, x: TABLE.x + dx, z: TABLE.z + dz, age: puff * 0.9 + random() });
    }
  }
  return steam;
}

/**
 * Zabuton: square cushions, plump in the middle, in deep colours of woven
 * cloth, with a tuft of thread at the centre and tassels at the corners.
 */
function addCushions(
  group: Group,
  seats: readonly Spot[],
  random: () => number,
  keep: <T extends Texture>(texture: T) => T,
): void {
  const shape = new RoundedBoxGeometry(1.2, 0.16, 1.2, 4, 0.07);
  const position = shape.getAttribute("position");
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const y = position.getY(index);
    // Stuffed: thickest in the middle, thin at the seams.
    const middle = Math.max(0, 1 - (x * x + z * z) / 0.72);
    position.setY(index, y + Math.sign(y) * 0.07 * middle);
  }
  shape.computeVertexNormals();
  const weave = keep(cloth(random));
  const tassel = lambert("#d8b45a", 0.7);
  const colors = ["#7a2f3a", "#2f4a6b", "#b07a2c", "#4f6b3a", "#6a3a5c", "#2f4a6b"];
  for (const [index, seat] of seats.entries()) {
    const cushion = new Group();
    cushion.position.set(seat.x, 0.12, seat.z);
    cushion.rotation.y = random() * 0.6;
    const color = colors[index % colors.length] ?? "#7a2f3a";
    cushion.add(
      new Mesh(
        shape,
        new MeshStandardMaterial({
          color: new Color(color),
          map: weave,
          bumpMap: weave,
          bumpScale: 2,
          roughness: 0.95,
        }),
      ),
    );
    const tuft = new Mesh(new SphereGeometry(0.05, 10, 8), tassel);
    tuft.position.y = 0.16;
    cushion.add(tuft);
    for (const [dx, dz] of [
      [-0.58, -0.58],
      [0.58, -0.58],
      [-0.58, 0.58],
      [0.58, 0.58],
    ] as const) {
      const end = new Mesh(new SphereGeometry(0.045, 8, 6), tassel);
      end.position.set(dx, 0, dz);
      cushion.add(end);
    }
    group.add(cushion);
  }
}

/** Red paper lanterns, by the door and over the counter. */
function addLanterns(group: Group, texture: Texture): void {
  const shape = new LatheGeometry(
    Array.from({ length: 12 }, (_, index) => {
      const share = index / 11;
      return new Vector2(0.4 + 0.25 * Math.sin(Math.PI * share), share * 1.3 - 0.65);
    }),
    24,
  );
  const paper = new MeshStandardMaterial({
    map: texture,
    emissive: new Color("#ff9a6a"),
    emissiveIntensity: 0.25,
  });
  const cap = lambert("#1d1b1a");
  for (const [x, y] of [
    [10, 6.2],
    [-9.5, 6.2],
  ] as const) {
    const body = new Mesh(shape, paper);
    body.position.set(x, y, WALL_Z + 1);
    const top = new Mesh(new CylinderGeometry(0.4, 0.4, 0.12, 20), cap);
    top.position.set(x, y + 0.7, WALL_Z + 1);
    const bottom = top.clone();
    bottom.position.y = y - 0.7;
    group.add(body, top, bottom);
  }
}

/** A bench with red felt on it, under a big red parasol, as outside a tea house. */
function addBench(group: Group, paper: Texture, cover: Texture): void {
  const legs = lambert("#5a3d28");
  const felt = surface(cover, 1, 1.5);
  group.add(box(felt, [3.2, 0.12, 1.1], [BENCH.x, 0.9, BENCH.z]));
  group.add(box(legs, [3.2, 0.1, 1.0], [BENCH.x, 0.8, BENCH.z]));
  for (const dx of [-1.4, 1.4]) {
    for (const dz of [-0.4, 0.4])
      group.add(box(legs, [0.12, 0.8, 0.12], [BENCH.x + dx, 0.4, BENCH.z + dz]));
  }
  // The parasol: oiled paper on bamboo ribs, the ribs showing through, a
  // ring of thread under the rim, the shaft bamboo too.
  const parasol = new Group();
  parasol.position.set(BENCH.x + 1.9, 0, BENCH.z - 0.5);
  parasol.rotation.z = -0.06;
  const bamboo = lambert("#c9a86a", 0.6);
  const shaft = new Mesh(new CylinderGeometry(0.05, 0.06, 4.3, 10), bamboo);
  shaft.position.y = 2.15;
  const shade = new Mesh(
    new ConeGeometry(2.7, 0.85, 48, 1, true),
    new MeshStandardMaterial({ map: paper, side: DoubleSide, roughness: 0.75 }),
  );
  shade.position.y = 4.05;
  const knob = new Mesh(new CylinderGeometry(0.08, 0.12, 0.18, 12), legs);
  knob.position.y = 4.55;
  parasol.add(shaft, shade, knob);
  // The ribs underneath, from the shaft out to the rim.
  for (let rib = 0; rib < 16; rib++) {
    const angle = (rib / 16) * Math.PI * 2;
    const stick = new Mesh(new CylinderGeometry(0.015, 0.015, 2.6, 4), bamboo);
    stick.position.set(Math.cos(angle) * 1.3, 3.95, Math.sin(angle) * 1.3);
    stick.rotation.set(0, -angle, Math.PI / 2 - 0.27);
    parasol.add(stick);
  }
  group.add(parasol);
}

/** A paper floor lamp, andon, lit a little even by day. */
function addLamp(group: Group): void {
  const frame = lambert("#3b2a1e");
  const paper = new MeshStandardMaterial({
    color: new Color("#fbf3e2"),
    emissive: new Color("#ffd9a0"),
    emissiveIntensity: 0.45,
  });
  group.add(box(paper, [0.6, 1.1, 0.6], [LAMP.x, 0.8, LAMP.z]));
  for (const dx of [-0.32, 0.32]) {
    for (const dz of [-0.32, 0.32])
      group.add(box(frame, [0.06, 1.45, 0.06], [LAMP.x + dx, 0.72, LAMP.z + dz]));
  }
  group.add(box(frame, [0.72, 0.05, 0.72], [LAMP.x, 1.38, LAMP.z]));
}

/** A blue vase with a branch of plum blossom. */
function addVase(group: Group, random: () => number): void {
  const vase = new Mesh(
    new LatheGeometry(
      [
        new Vector2(0.001, 0),
        new Vector2(0.28, 0.06),
        new Vector2(0.34, 0.4),
        new Vector2(0.16, 0.85),
        new Vector2(0.14, 1.0),
      ],
      24,
    ),
    lambert("#2f4f63"),
  );
  vase.position.set(VASE.x, 0, VASE.z);
  group.add(vase);
  const bark = lambert("#4a3426");
  const blossom = new MeshStandardMaterial({
    color: new Color("#f6c6d0"),
    emissive: new Color("#f6c6d0"),
    emissiveIntensity: 0.15,
  });
  for (const [length, tilt, twist] of [
    [1.8, 0.25, 0.1],
    [1.4, -0.55, 0.2],
    [1.2, 0.65, -0.3],
  ] as const) {
    const branch = new Group();
    branch.position.set(VASE.x, 0.95, VASE.z);
    branch.rotation.set(twist, 0, tilt);
    const stick = new Mesh(new CylinderGeometry(0.02, 0.04, length, 6), bark);
    stick.position.y = length / 2;
    branch.add(stick);
    for (let flower = 0; flower < 7; flower++) {
      const point = new Mesh(new SphereGeometry(0.06, 8, 6), blossom);
      point.position.set(
        (random() - 0.5) * 0.18,
        length * (0.35 + flower * 0.09),
        (random() - 0.5) * 0.18,
      );
      branch.add(point);
    }
    group.add(branch);
  }
}

/** The window's light, brightest where it comes in and fading to nothing on the floor. */
function beamFalloff(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context !== null) {
    const fade = context.createLinearGradient(0, 0, 0, 128);
    fade.addColorStop(0, "rgba(255, 246, 225, 0.9)");
    fade.addColorStop(1, "rgba(255, 246, 225, 0)");
    context.fillStyle = fade;
    context.fillRect(0, 0, 8, 128);
  }
  return new CanvasTexture(canvas);
}
