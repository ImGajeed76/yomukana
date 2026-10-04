// Which element each kind of seal is made of. The element sets the seal's
// outline (see seal-shapes.ts), and on the rarest seals it gives off
// something: embers from fire, spray from water.
//
// Presentation only, so it lives with the components, not in seal-rules.ts,
// which the API function also reads.

import type { SealKind, SealTier } from "$lib/sync/seal-rules";
import type { SealScene } from "./seal-scenery";
import type { SealShapeName } from "./seal-shapes";

/**
 * The scene painted inside each kind: fire for a streak, water for days
 * kept, leaves for reading (言の葉, "leaves of words", is the old poetic word
 * for language), ice for flawless, wind for invites, blossom for followers,
 * mountains for years and for a marathon's places, wind for running one.
 */
const SCENE_OF: Record<SealKind, SealScene> = {
  streak: "fire",
  days: "water",
  sentences: "leaves",
  perfect: "ice",
  wins: "earth",
  podium: "earth",
  finished: "wind",
  invited: "wind",
  followers: "blossom",
  years: "earth",
  joined: "leaves",
};

export function sceneOfKind(kind: SealKind): SealScene {
  return SCENE_OF[kind];
}

const SHAPE_OF: Partial<Record<SealKind, SealShapeName>> = {
  streak: "fire",
  days: "water",
};

export function shapeOf(kind: SealKind): SealShapeName {
  return SHAPE_OF[kind] ?? "pill";
}

export interface Particle {
  /** Across the seal, as a share of its width. */
  readonly x: number;
  /** Into its loop, in seconds, so no two go up together. */
  readonly delay: number;
  /** In em. */
  readonly size: number;
}

/** What rises off a seal: nothing below tier 4, a few at 4, more at 5. */
export function particlesOf(tier: SealTier): readonly Particle[] {
  if (tier < 4) return [];
  const few: Particle[] = [
    { x: 0.14, delay: 0, size: 0.28 },
    { x: 0.62, delay: -1.4, size: 0.22 },
  ];
  if (tier === 4) return few;
  return [
    ...few,
    { x: 0.36, delay: -0.7, size: 0.2 },
    { x: 0.84, delay: -2.1, size: 0.26 },
    { x: 0.5, delay: -1.8, size: 0.18 },
  ];
}
