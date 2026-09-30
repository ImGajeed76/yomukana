// What is painted inside and around a seal, as SVG paths worked out for its
// size: the element as a small scene behind the name, the ribbons of light
// that wrap the rarest ones, and glints. Pure, so the shapes can be
// changed without touching the component that draws them.

import type { SealTier } from "$lib/sync/seal-rules";

export type SealScene = "fire" | "water" | "leaves" | "ice" | "wind" | "blossom" | "earth";

/** One shape in a scene: filled, or drawn as a line. */
export interface ScenePart {
  readonly d: string;
  readonly isLine: boolean;
  /** How strongly it shows, from 0 to 1, before the tier's own strength. */
  readonly strength: number;
}

function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function pt(x: number, y: number): string {
  return `${n(x)},${n(y)}`;
}

/** A small random but fixed sequence, so a scene looks the same on every card. */
function spread(count: number, seed: number): number[] {
  const values: number[] = [];
  let state = seed;
  for (let index = 0; index < count; index++) {
    state = (state * 9301 + 49297) % 233280;
    values.push(state / 233280);
  }
  return values;
}

function flames(w: number, h: number): ScenePart[] {
  const parts: ScenePart[] = [];
  const count = Math.max(3, Math.round(w / (h * 0.9)));
  const jitter = spread(count * 2, 7);
  for (let index = 0; index < count; index++) {
    const middle = w * (0.28 + (0.72 * (index + 0.5)) / count);
    const width = h * (0.55 + (jitter[index] ?? 0) * 0.35);
    const tall = h * (0.45 + (jitter[count + index] ?? 0) * 0.45);
    const from = middle - width / 2;
    const to = middle + width / 2;
    const tipX = middle + width * 0.12;
    parts.push({
      d:
        `M ${pt(from, h)} C ${pt(from + width * 0.1, h - tall * 0.5)} ${pt(tipX - width * 0.3, h - tall * 0.7)} ${pt(tipX, h - tall)} ` +
        `C ${pt(tipX + width * 0.05, h - tall * 0.6)} ${pt(to, h - tall * 0.45)} ${pt(to, h)} Z`,
      isLine: false,
      strength: 0.35 + (jitter[index] ?? 0) * 0.35,
    });
  }
  return parts;
}

function waves(w: number, h: number): ScenePart[] {
  const parts: ScenePart[] = [];
  const step = h * 0.9;
  // Rows of seigaiha arcs rising from the bottom right, and a curling crest.
  for (let row = 0; row < 2; row++) {
    for (let x = w * 0.4 + (row % 2) * step * 0.5; x < w + step; x += step) {
      const y = h + row * -h * 0.28;
      const radius = step * 0.5;
      parts.push({
        d: `M ${pt(x - radius, y)} A ${n(radius)} ${n(radius)} 0 0 1 ${pt(x + radius, y)}`,
        isLine: true,
        strength: 0.55 - row * 0.2,
      });
      parts.push({
        d: `M ${pt(x - radius * 0.55, y)} A ${n(radius * 0.55)} ${n(radius * 0.55)} 0 0 1 ${pt(x + radius * 0.55, y)}`,
        isLine: true,
        strength: 0.4 - row * 0.15,
      });
    }
  }
  const crestX = w * 0.62;
  parts.push({
    d:
      `M ${pt(crestX - h * 0.9, h)} C ${pt(crestX - h * 0.5, h * 0.2)} ${pt(crestX + h * 0.4, h * 0.05)} ${pt(crestX + h * 0.55, h * 0.45)} ` +
      `C ${pt(crestX + h * 0.3, h * 0.25)} ${pt(crestX, h * 0.4)} ${pt(crestX + h * 0.15, h * 0.62)} ` +
      `C ${pt(crestX - h * 0.1, h * 0.7)} ${pt(crestX - h * 0.3, h * 0.85)} ${pt(crestX - h * 0.35, h)} Z`,
    isLine: false,
    strength: 0.5,
  });
  return parts;
}

/** An almond leaf about a centre, turned. */
function leaf(cx: number, cy: number, size: number, turn: number): string {
  const angle = (turn * Math.PI) / 180;
  const at = (x: number, y: number): string =>
    pt(
      cx + x * Math.cos(angle) - y * Math.sin(angle),
      cy + x * Math.sin(angle) + y * Math.cos(angle),
    );
  const half = size / 2;
  return (
    `M ${at(-half, 0)} C ${at(-half * 0.4, -half * 0.6)} ${at(half * 0.4, -half * 0.6)} ${at(half, 0)} ` +
    `C ${at(half * 0.4, half * 0.6)} ${at(-half * 0.4, half * 0.6)} ${at(-half, 0)} Z`
  );
}

function leaves(w: number, h: number): ScenePart[] {
  const count = Math.max(4, Math.round(w / (h * 0.7)));
  const values = spread(count * 3, 11);
  const parts: ScenePart[] = [];
  for (let index = 0; index < count; index++) {
    const x = w * (0.3 + 0.7 * (values[index] ?? 0));
    const y = h * (0.2 + 0.7 * (values[count + index] ?? 0));
    const turn = -60 + 120 * (values[count * 2 + index] ?? 0);
    parts.push({
      d: leaf(x, y, h * 0.42, turn),
      isLine: false,
      strength: 0.3 + 0.3 * (values[index] ?? 0),
    });
  }
  // A stem sweeping through them.
  parts.push({
    d: `M ${pt(w * 0.35, h * 1.05)} C ${pt(w * 0.55, h * 0.6)} ${pt(w * 0.75, h * 0.9)} ${pt(w * 1.02, h * 0.15)}`,
    isLine: true,
    strength: 0.4,
  });
  return parts;
}

function ice(w: number, h: number): ScenePart[] {
  const parts: ScenePart[] = [];
  const shards = [
    { at: 0.62, tall: 0.75, wide: 0.28, lean: -0.1 },
    { at: 0.74, tall: 1.05, wide: 0.34, lean: 0.05 },
    { at: 0.86, tall: 0.8, wide: 0.3, lean: 0.12 },
    { at: 0.95, tall: 0.55, wide: 0.24, lean: 0.2 },
    { at: 0.45, tall: 0.5, wide: 0.22, lean: -0.15 },
  ];
  for (const shard of shards) {
    const x = w * shard.at;
    const half = h * shard.wide * 0.5;
    const tip = x + h * shard.lean;
    parts.push({
      d: `M ${pt(x - half, h)} L ${pt(tip, h - h * shard.tall)} L ${pt(x + half, h)} Z`,
      isLine: false,
      strength: 0.45,
    });
    // The facet line down its middle.
    parts.push({
      d: `M ${pt(tip, h - h * shard.tall)} L ${pt(x, h)}`,
      isLine: true,
      strength: 0.5,
    });
  }
  return parts;
}

function wind(w: number, h: number): ScenePart[] {
  const parts: ScenePart[] = [];
  // Cloud puffs along the bottom right.
  const puffs = [
    { x: 0.6, y: 1, r: 0.32 },
    { x: 0.72, y: 0.9, r: 0.4 },
    { x: 0.86, y: 0.95, r: 0.34 },
    { x: 0.97, y: 0.85, r: 0.36 },
  ];
  for (const puff of puffs) {
    const r = h * puff.r;
    const cx = w * puff.x;
    const cy = h * puff.y;
    parts.push({
      d: `M ${pt(cx - r, cy)} A ${n(r)} ${n(r)} 0 1 1 ${pt(cx + r, cy)} A ${n(r)} ${n(r)} 0 1 1 ${pt(cx - r, cy)} Z`,
      isLine: false,
      strength: 0.35,
    });
  }
  // Wind lines ending in a curl.
  for (const [index, y] of [0.3, 0.5].entries()) {
    const from = w * (0.35 + index * 0.1);
    const to = w * (0.8 - index * 0.05);
    parts.push({
      d: `M ${pt(from, h * y)} L ${pt(to, h * y)} C ${pt(to + h * 0.25, h * y)} ${pt(to + h * 0.25, h * (y - 0.25))} ${pt(to + h * 0.05, h * (y - 0.22))}`,
      isLine: true,
      strength: 0.5,
    });
  }
  return parts;
}

/** Five petals round a centre. */
function blossom(cx: number, cy: number, size: number, turn: number): string {
  let d = "";
  for (let petal = 0; petal < 5; petal++) {
    d += `${leaf(cx + Math.cos(((turn + petal * 72) * Math.PI) / 180) * size * 0.45, cy + Math.sin(((turn + petal * 72) * Math.PI) / 180) * size * 0.45, size * 0.55, turn + petal * 72)} `;
  }
  return d;
}

function blossoms(w: number, h: number): ScenePart[] {
  const count = Math.max(3, Math.round(w / h));
  const values = spread(count * 3, 5);
  const parts: ScenePart[] = [];
  for (let index = 0; index < count; index++) {
    const x = w * (0.35 + 0.65 * (values[index] ?? 0));
    const y = h * (0.15 + 0.75 * (values[count + index] ?? 0));
    const size = h * (0.35 + 0.3 * (values[count * 2 + index] ?? 0));
    parts.push({ d: blossom(x, y, size, 90 * (values[index] ?? 0)), isLine: false, strength: 0.4 });
  }
  return parts;
}

function earth(w: number, h: number): ScenePart[] {
  const parts: ScenePart[] = [];
  // The sun, then two ranges of mountains in front of it.
  const sunR = h * 0.28;
  const sunX = w * 0.78;
  parts.push({
    d: `M ${pt(sunX - sunR, h * 0.45)} A ${n(sunR)} ${n(sunR)} 0 1 1 ${pt(sunX + sunR, h * 0.45)} A ${n(sunR)} ${n(sunR)} 0 1 1 ${pt(sunX - sunR, h * 0.45)} Z`,
    isLine: false,
    strength: 0.45,
  });
  const ranges = [
    { peaks: [0.4, 0.58, 0.7, 0.9, 1.05], tall: [0.45, 0.8, 0.55, 0.95, 0.5], strength: 0.3 },
    { peaks: [0.5, 0.64, 0.8, 0.96], tall: [0.35, 0.55, 0.4, 0.6], strength: 0.55 },
  ];
  for (const range of ranges) {
    let d = `M ${pt(w * (range.peaks[0] ?? 0) - h * 0.5, h)}`;
    for (const [index, peak] of range.peaks.entries()) {
      d += ` L ${pt(w * peak, h - h * (range.tall[index] ?? 0.5))}`;
      const next = range.peaks[index + 1];
      if (next !== undefined) d += ` L ${pt(w * ((peak + next) / 2), h - h * 0.15)}`;
    }
    d += ` L ${pt(w * 1.1, h)} Z`;
    parts.push({ d, isLine: false, strength: range.strength });
  }
  return parts;
}

/** The scene painted inside a seal of this element, at this size. */
export function sceneOf(scene: SealScene, w: number, h: number): ScenePart[] {
  if (w <= 0 || h <= 0) return [];
  switch (scene) {
    case "fire":
      return flames(w, h);
    case "water":
      return waves(w, h);
    case "leaves":
      return leaves(w, h);
    case "ice":
      return ice(w, h);
    case "wind":
      return wind(w, h);
    case "blossom":
      return blossoms(w, h);
    case "earth":
      return earth(w, h);
  }
}

/**
 * Ribbons of light wrapping the ends of the rarest seals: one round the
 * kanji end from epic, a second round the other end at legendary. Drawn
 * outside the outline, so they seem to wind round it.
 */
export function ribbonsOf(tier: SealTier, w: number, h: number): string[] {
  if (tier < 4 || w <= 0) return [];
  const r = h / 2;
  const left =
    `M ${pt(r * 2.2, h + h * 0.28)} C ${pt(-r * 0.9, h * 1.15)} ${pt(-r * 0.9, -h * 0.25)} ${pt(r * 1.6, -h * 0.2)} ` +
    `C ${pt(w * 0.35, -h * 0.28)} ${pt(w * 0.45, -h * 0.02)} ${pt(w * 0.55, -h * 0.12)}`;
  if (tier === 4) return [left];
  const right =
    `M ${pt(w - r * 2.2, -h * 0.28)} C ${pt(w + r * 0.9, -h * 0.15)} ${pt(w + r * 0.9, h * 1.25)} ${pt(w - r * 1.6, h * 1.2)} ` +
    `C ${pt(w * 0.65, h * 1.28)} ${pt(w * 0.55, h * 1.02)} ${pt(w * 0.45, h * 1.12)}`;
  return [left, right];
}

/** A four-pointed glint. */
export function glint(cx: number, cy: number, size: number): string {
  return (
    `M ${pt(cx, cy - size)} Q ${pt(cx, cy)} ${pt(cx + size, cy)} Q ${pt(cx, cy)} ${pt(cx, cy + size)} ` +
    `Q ${pt(cx, cy)} ${pt(cx - size, cy)} Q ${pt(cx, cy)} ${pt(cx, cy - size)} Z`
  );
}

/** Where the glints go: none below rare, more the rarer the seal. */
export function glintsOf(
  tier: SealTier,
  w: number,
  h: number,
): { x: number; y: number; size: number; delay: number }[] {
  if (tier < 3) return [];
  const all = [
    { x: w - h * 0.35, y: h * 0.12, size: h * 0.28, delay: 0 },
    { x: h * 0.2, y: h * 0.85, size: h * 0.22, delay: -1.3 },
    { x: w * 0.5, y: -h * 0.05, size: h * 0.2, delay: -2.4 },
    { x: w - h * 0.1, y: h * 0.95, size: h * 0.18, delay: -0.7 },
  ];
  return all.slice(0, tier - 2 + (tier === 5 ? 1 : 0));
}
