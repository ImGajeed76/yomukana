// The podium in front of the big screen, out from the start of a race: three
// wooden steps, the winner's in the middle and tallest, each with its place
// painted on the front in brush, 一, 二, 三. The top three on the board stand
// on it, and change places on it as the board does.

import {
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Material,
  type Texture,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { paint, rgb } from "./textures";

/** A step's top, where its daifuku stands. */
export interface PodiumStep {
  readonly x: number;
  readonly z: number;
  readonly height: number;
  /** Where to stand on the floor in front of it, to jump up from. */
  readonly front: { readonly x: number; readonly z: number };
}

const STEP_WIDTH = 2.3;
const STEP_DEPTH = 1.7;
/** First, second and third: across from the middle, and how tall. */
const STEPS: readonly {
  readonly across: number;
  readonly height: number;
  readonly numeral: string;
}[] = [
  { across: 0, height: 1.15, numeral: "一" },
  { across: -STEP_WIDTH, height: 0.8, numeral: "二" },
  { across: STEP_WIDTH, height: 0.55, numeral: "三" },
];

/** A step's front: the wood it is made of with its place painted on, in brush. */
function stepFace(numeral: string): Texture {
  return paint(256, 128, (context) => {
    context.fillStyle = rgb(0, 0, 0, 0);
    context.fillRect(0, 0, 256, 128);
    context.fillStyle = "#2a1d12";
    context.font = '96px "Yuji Syuku", "Noto Sans JP", serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(numeral, 128, 68);
  });
}

/**
 * Builds the podium with its middle front at `x`, `z` and adds it to `group`,
 * hidden. Returns it, and its steps in place order, first to third.
 */
export function addPodium(
  group: Group,
  x: number,
  z: number,
  wood: Material,
  keep: <T extends Texture>(texture: T) => T,
): { podium: Group; steps: PodiumStep[] } {
  // Its pieces placed from its own middle, so it can fall and squash as one.
  const podium = new Group();
  podium.position.set(x, 0, z);
  podium.visible = false;
  const steps: PodiumStep[] = [];
  for (const step of STEPS) {
    const block = new Mesh(
      new RoundedBoxGeometry(STEP_WIDTH - 0.04, step.height, STEP_DEPTH, 2, 0.04),
      wood,
    );
    block.position.set(step.across, step.height / 2, 0);
    // As tall as the step allows, and twice as wide, as the painted face is.
    const faceHeight = step.height * 0.8;
    const face = new Mesh(
      new PlaneGeometry(faceHeight * 2, faceHeight),
      new MeshStandardMaterial({
        map: keep(stepFace(step.numeral)),
        transparent: true,
        roughness: 0.8,
        color: new Color("#ffffff"),
      }),
    );
    face.position.set(step.across, step.height / 2, STEP_DEPTH / 2 + 0.005);
    podium.add(block, face);
    steps.push({
      x: x + step.across,
      z,
      height: step.height,
      front: { x: x + step.across, z: z + STEP_DEPTH / 2 + 0.7 },
    });
  }
  group.add(podium);
  return { podium, steps };
}
