// A burst of flour thrown up like confetti, white with a few pink petals in
// it, that drifts back down and fades: at a marathon's start, round the
// crowd, and when its results are final, round the podium.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  PointsMaterial,
  type Scene,
  type Texture,
} from "three";
import type { Spot } from "./wander";

/** How many flakes fly in a burst, and how long they take to settle. */
const FLAKES = 260;
const SECONDS = 3.2;
/** How hard they are thrown up, and how hard they fall back. */
const THROW = 7;
const GRAVITY = 7;

export class FlourBurst {
  private flakes: {
    points: Points;
    velocity: Float32Array;
    count: number;
    age: number;
  } | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly flour: Texture,
    private readonly random: () => number,
  ) {}

  /**
   * Throws a burst up from round the given spots on the floor. `strength`
   * below 1 is a smaller puff: fewer flakes, not so high, all flour.
   */
  throw(from: readonly Spot[], height = 0.6, strength = 1): void {
    this.clear();
    const count = Math.max(1, Math.round(FLAKES * strength));
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocity = new Float32Array(count * 3);
    const white = new Color("#fbf8f0");
    const petal = new Color("#f4b6c6");
    for (let index = 0; index < count; index++) {
      const at = from[Math.floor(this.random() * from.length)] ?? { x: 0, z: -4 };
      positions.set(
        [at.x + (this.random() - 0.5) * 2, height, at.z + (this.random() - 0.5) * 2],
        index * 3,
      );
      velocity.set(
        [
          (this.random() - 0.5) * 3,
          THROW * strength * (0.6 + this.random() * 0.6),
          (this.random() - 0.5) * 3,
        ],
        index * 3,
      );
      const color = strength >= 1 && this.random() < 0.18 ? petal : white;
      colors.set([color.r, color.g, color.b], index * 3);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    const points = new Points(
      geometry,
      new PointsMaterial({
        map: this.flour,
        size: 0.32,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.scene.add(points);
    this.flakes = { points, velocity, count, age: 0 };
  }

  step(seconds: number): void {
    if (this.flakes === null) return;
    const { points, velocity } = this.flakes;
    this.flakes.age += seconds;
    const position = points.geometry.getAttribute("position");
    for (let index = 0; index < this.flakes.count; index++) {
      const vy = (velocity[index * 3 + 1] ?? 0) - GRAVITY * seconds;
      // Light as flour: the air slows it, so it drifts down rather than drops.
      velocity[index * 3 + 1] = Math.max(vy, -1.2);
      position.setXYZ(
        index,
        position.getX(index) + (velocity[index * 3] ?? 0) * seconds,
        Math.max(0.05, position.getY(index) + vy * seconds),
        position.getZ(index) + (velocity[index * 3 + 2] ?? 0) * seconds,
      );
    }
    position.needsUpdate = true;
    const material = points.material as PointsMaterial;
    const fading = Math.max(0, this.flakes.age - SECONDS * 0.6) / (SECONDS * 0.4);
    material.opacity = Math.max(0, 1 - fading);
    if (this.flakes.age >= SECONDS) this.clear();
  }

  clear(): void {
    if (this.flakes === null) return;
    this.scene.remove(this.flakes.points);
    this.flakes.points.geometry.dispose();
    (this.flakes.points.material as PointsMaterial).dispose();
    this.flakes = null;
  }
}
