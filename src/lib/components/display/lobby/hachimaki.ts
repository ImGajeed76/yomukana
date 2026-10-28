// The winner's headband: a white hachimaki with a red sun on the forehead
// and its two ends hanging at the back, tied round a daifuku. Every daifuku
// is pressed by hand into its own shape, so the band is measured from the
// dough itself where it sits, and fits.

import {
  Color,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type BufferGeometry,
} from "three";

/** Where on the daifuku the band sits, as a share of its height from the bottom. */
const BAND_AT = 0.62;
const BAND_HEIGHT = 0.13;

/**
 * The band for the dough `shape`, `height` tall, in the frame its body hangs
 * in: 0 at the bottom of the dough, as the daifuku's squash group has it.
 */
export function hachimaki(shape: BufferGeometry, height: number): Group {
  shape.computeBoundingBox();
  const bottom = shape.boundingBox?.min.y ?? 0;
  const at = bottom + height * BAND_AT;
  // How far the dough reaches across and front to back at the band's height.
  let across = 0.3;
  let deep = 0.3;
  const position = shape.getAttribute("position");
  for (let index = 0; index < position.count; index++) {
    if (Math.abs(position.getY(index) - at) > 0.03) continue;
    across = Math.max(across, Math.abs(position.getX(index)));
    deep = Math.max(deep, Math.abs(position.getZ(index)));
  }
  const cloth = new MeshStandardMaterial({
    color: new Color("#f7f4ee"),
    roughness: 0.9,
    side: DoubleSide,
  });
  const sun = new MeshStandardMaterial({ color: new Color("#d5322b"), roughness: 0.8 });

  const band = new Group();
  band.position.y = at - bottom;
  const ring = new Mesh(new CylinderGeometry(1, 1, BAND_HEIGHT, 48, 1, true), cloth);
  ring.scale.set(across * 1.04, 1, deep * 1.04);
  const mark = new Mesh(new CircleGeometry(0.075, 24), sun);
  mark.position.z = deep * 1.05;
  // The two ends, tied at the back, hanging down and apart.
  for (const side of [-1, 1]) {
    const end = new Mesh(new PlaneGeometry(0.09, 0.32), cloth);
    end.position.set(side * 0.05, -0.14, -deep * 1.06);
    end.rotation.set(0.25, 0, side * 0.35);
    band.add(end);
  }
  band.add(ring, mark);
  return band;
}
