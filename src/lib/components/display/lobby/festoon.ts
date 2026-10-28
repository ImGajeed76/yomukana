// A string of five small paper lanterns tied to the big screen's bottom
// corners, each on its own short cord, dark until
// the last five seconds before a start, when they light one by one, left to
// right, a warm glow running along the room on the count.

import {
  AdditiveBlending,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  type Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Sprite,
  SpriteMaterial,
  TubeGeometry,
  Vector2,
  type Vector3,
  type Texture,
} from "three";

/** How many lanterns hang on the string. The count lights one per second. */
export const FESTOON_LANTERNS = 5;

export interface Festoon {
  /** Lights the first `count` lanterns, the rest dark. */
  setLit(count: number): void;
}

/**
 * Hangs the string from `from` to `to`, sagging in the middle, with the
 * lanterns along it. `paper` is the lanterns' face; `glow` a soft spot.
 */
export function addFestoon(
  group: Group,
  from: Vector3,
  to: Vector3,
  paper: Texture,
  glow: Texture,
): Festoon {
  const middle = from.clone().lerp(to, 0.5);
  middle.y -= 0.6;
  const rope = new CatmullRomCurve3([from, middle, to]);
  const cord = new MeshStandardMaterial({ color: new Color("#2a211a"), roughness: 0.9 });
  group.add(new Mesh(new TubeGeometry(rope, 40, 0.025, 5, false), cord));

  const shape = new LatheGeometry(
    Array.from({ length: 10 }, (_, index) => {
      const share = index / 9;
      return new Vector2(0.22 + 0.16 * Math.sin(Math.PI * share), share * 0.75 - 0.375);
    }),
    20,
  );
  const cap = new MeshStandardMaterial({ color: new Color("#1d1b1a"), roughness: 0.7 });
  const lanterns: { paper: MeshStandardMaterial; glow: Sprite }[] = [];
  for (let index = 0; index < FESTOON_LANTERNS; index++) {
    const at = rope.getPoint((index + 1) / (FESTOON_LANTERNS + 1));
    const material = new MeshStandardMaterial({
      map: paper,
      emissive: new Color("#ffb070"),
      emissiveIntensity: 0.12,
      roughness: 0.8,
    });
    // Each on a short cord from the string.
    const drop = 0.35;
    const tie = new Mesh(new CylinderGeometry(0.012, 0.012, drop, 4), cord);
    tie.position.set(at.x, at.y - drop / 2, at.z);
    const body = new Mesh(shape, material);
    body.position.set(at.x, at.y - drop - 0.41, at.z);
    const top = new Mesh(new CylinderGeometry(0.22, 0.22, 0.07, 14), cap);
    top.position.set(at.x, at.y - drop, at.z);
    const bottom = top.clone();
    bottom.position.y = at.y - drop - 0.82;
    const halo = new Sprite(
      new SpriteMaterial({
        map: glow,
        color: new Color("#ffb46e"),
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.position.copy(body.position);
    halo.scale.setScalar(2.4);
    group.add(tie, body, top, bottom, halo);
    lanterns.push({ paper: material, glow: halo });
  }

  return {
    setLit(count) {
      for (const [index, lantern] of lanterns.entries()) {
        const isLit = index < count;
        lantern.paper.emissiveIntensity = isLit ? 1.6 : 0.12;
        lantern.glow.material.opacity = isLit ? 0.55 : 0;
      }
    },
  };
}
