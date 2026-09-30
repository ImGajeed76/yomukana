// The outline of a seal, as an SVG path worked out for its size. The border
// is the shape of the thing, not a pill with things on it: fire rises out of
// its top edge, water rolls along its bottom. Each shape is drawn after a
// traditional Japanese frame:
//
// - fire after the katōmado (火灯窓), the bell-shaped temple window whose name
//   means "fire lamp window", its top edge breaking into flame;
// - water after Hokusai's wave, a rolling bottom edge and a crest that curls
//   over the end;
// - everything else after the mokkō (木瓜), the lobed frame of family crests.
//
// Pure: a width, a height and a tier in, a path out. The seal measures itself
// and asks again only when its size changes.

import type { SealTier } from "$lib/sync/seal-rules";

export type SealShapeName = "fire" | "water" | "crest" | "pill";

interface Tongue {
  /** Where along the top it rises, from the left, in heights. Negative counts from the right. */
  readonly at: number;
  /** How tall above the edge, in heights. */
  readonly height: number;
  /** How wide at its root, in heights. */
  readonly width: number;
}

/** Flames on the top edge, more and taller the rarer the seal. */
const FLAMES: Readonly<Record<SealTier, readonly Tongue[]>> = {
  1: [],
  2: [{ at: 0.95, height: 0.28, width: 0.75 }],
  3: [
    { at: 0.9, height: 0.42, width: 0.85 },
    { at: -1.1, height: 0.28, width: 0.7 },
  ],
  4: [
    { at: 0.85, height: 0.6, width: 0.95 },
    { at: 1.75, height: 0.34, width: 0.7 },
    { at: -1.05, height: 0.45, width: 0.85 },
  ],
  5: [
    { at: 0.8, height: 0.85, width: 1.05 },
    { at: 1.75, height: 0.5, width: 0.8 },
    { at: 2.55, height: 0.3, width: 0.6 },
    { at: -1.9, height: 0.36, width: 0.7 },
    { at: -1, height: 0.62, width: 0.9 },
  ],
};

function round(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** A point, written for a path. */
function p(x: number, y: number): string {
  return `${round(x)},${round(y)}`;
}

/**
 * The ends every shape shares: rounder than a rectangle, squarer than a
 * circle, so the pill reads as made rather than drawn with a compass.
 */
function leftEnd(h: number): string {
  const r = h / 2;
  return `C ${p(0, h - r * 0.4)} ${p(0, r + r * 0.4)} ${p(0, r)} C ${p(0, r * 0.4)} ${p(r * 0.4, 0)} ${p(r, 0)}`;
}

function rightEnd(w: number, h: number): string {
  const r = h / 2;
  return `C ${p(w - r * 0.4, 0)} ${p(w, r * 0.4)} ${p(w, r)} C ${p(w, h - r * 0.4)} ${p(w - r * 0.4, h)} ${p(w - r, h)}`;
}

function pill(w: number, h: number): string {
  const r = h / 2;
  return `M ${p(r, h)} ${leftEnd(h)} L ${p(w - r, 0)} ${rightEnd(w, h)} Z`;
}

/** A flame rising from the top edge between two points, its tip leaning into the wind. */
function flame(from: number, to: number, height: number, lean: number): string {
  const width = to - from;
  const tipX = from + width * (0.5 + lean);
  return (
    `L ${p(from, 0)} ` +
    `C ${p(from + width * 0.3, -height * 0.12)} ${p(tipX - width * 0.35, -height * 0.7)} ${p(tipX, -height)} ` +
    `C ${p(tipX - width * 0.02, -height * 0.55)} ${p(to - width * 0.25, -height * 0.18)} ${p(to, 0)}`
  );
}

function fire(w: number, h: number, tier: SealTier): string {
  const r = h / 2;
  const tongues = FLAMES[tier]
    .map((tongue) => {
      const middle = tongue.at >= 0 ? tongue.at * h : w + tongue.at * h;
      return {
        from: middle - (tongue.width * h) / 2,
        to: middle + (tongue.width * h) / 2,
        ...tongue,
      };
    })
    // Only flames that fit between the ends, and never on top of each other.
    .filter((tongue) => tongue.from > r * 0.8 && tongue.to < w - r * 0.8)
    .sort((a, b) => a.from - b.from)
    .filter((tongue, index, all) => index === 0 || tongue.from >= (all[index - 1]?.to ?? 0));

  let top = "";
  for (const tongue of tongues) {
    // Flames at the left lean back over the kanji, at the right they lean out.
    const lean = tongue.at >= 0 ? -0.12 : 0.12;
    top += `${flame(tongue.from, tongue.to, tongue.height * h, lean)} `;
  }
  return `M ${p(r, h)} ${leftEnd(h)} ${top}L ${p(w - r, 0)} ${rightEnd(w, h)} Z`;
}

function water(w: number, h: number, tier: SealTier): string {
  const r = h / 2;
  // The bottom rolls: a wave every so often, deeper the rarer the seal.
  const depth = h * ([0, 0, 0.1, 0.14, 0.18, 0.22][tier] ?? 0);
  const span = w - 2 * r;
  const count = Math.max(1, Math.round(span / (h * 0.9)));
  const step = span / count;
  let bottom = "";
  for (let index = 0; index < count; index++) {
    const start = w - r - index * step;
    const end = start - step;
    bottom += `C ${p(start - step * 0.3, h + depth)} ${p(end + step * 0.3, h + depth)} ${p(end, h)} `;
  }

  // From tier 4, a crest breaks over the right end and curls back on itself.
  let right = rightEnd(w, h);
  if (tier >= 4) {
    const lift = h * (tier === 5 ? 0.75 : 0.5);
    right =
      `L ${p(w - r * 2.2, 0)} ` +
      `C ${p(w - r * 1.4, 0)} ${p(w - r * 0.2, -lift * 0.2)} ${p(w + r * 0.1, -lift * 0.75)} ` +
      `C ${p(w + r * 0.2, -lift * 1.05)} ${p(w - r * 0.6, -lift * 1.05)} ${p(w - r * 0.75, -lift * 0.7)} ` +
      `C ${p(w - r * 0.3, -lift * 0.75)} ${p(w - r * 0.1, -lift * 0.35)} ${p(w - r * 0.35, 0)} ` +
      `C ${p(w + r * 0.1, r * 0.3)} ${p(w, h - r * 0.4)} ${p(w - r, h)}`;
  }
  return `M ${p(r, h)} ${leftEnd(h)} L ${p(w - r, 0)} ${right} ${bottom}Z`;
}

/** The mokkō: each end made of two lobes that meet in a point. */
function crest(w: number, h: number): string {
  const r = h / 2;
  const notch = r * 0.28;
  return (
    `M ${p(r, h)} ` +
    `C ${p(r * 0.2, h)} ${p(0, h - r * 0.2)} ${p(notch, r)} ` +
    `C ${p(0, r * 0.2)} ${p(r * 0.2, 0)} ${p(r, 0)} ` +
    `L ${p(w - r, 0)} ` +
    `C ${p(w - r * 0.2, 0)} ${p(w, r * 0.2)} ${p(w - notch, r)} ` +
    `C ${p(w, h - r * 0.2)} ${p(w - r * 0.2, h)} ${p(w - r, h)} Z`
  );
}

/** The seal's outline at this size. Tier 1 is a plain pill whatever its kind. */
export function outlineOf(shape: SealShapeName, tier: SealTier, w: number, h: number): string {
  if (w <= 0 || h <= 0) return "";
  if (tier === 1) return pill(w, h);
  switch (shape) {
    case "fire":
      return fire(w, h, tier);
    case "water":
      return water(w, h, tier);
    case "crest":
      return crest(w, h);
    case "pill":
      return pill(w, h);
  }
}
