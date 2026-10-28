// The lobby's hard surfaces, painted on canvases when the room is built rather
// than shipped as images: tatami, plaster, wood and shoji. Cloth and paper are
// in fabrics.ts. A few hundred lines of drawing weigh less than one photo.
//
// Each is also used as its own relief map (see `surface` in room.ts): what is
// painted lighter stands up and catches the light, what is darker sits low.
// So a rush strand is painted bright down its middle and dark at its edges,
// and comes out round.

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

/** A canvas of the given size, drawn on, as a texture. */
export function paint(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D) => void,
): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context !== null) draw(context);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Specks of a slightly different shade, for surfaces that should not look printed. */
export function speckle(
  context: CanvasRenderingContext2D,
  count: number,
  color: string,
  size: number,
  random: () => number,
): void {
  context.fillStyle = color;
  const { width, height } = context.canvas;
  for (let index = 0; index < count; index++) {
    context.fillRect(random() * width, random() * height, size, size);
  }
}

/** A CSS colour from channels, `alpha` 1 unless given. */
export function rgb(red: number, green: number, blue: number, alpha = 1): string {
  const channel = (value: number): string => String(Math.round(Math.max(0, Math.min(255, value))));
  return `rgba(${channel(red)}, ${channel(green)}, ${channel(blue)}, ${String(alpha)})`;
}

/**
 * One tatami mat, long side across. Rush strands run the short way, side by
 * side, each round (light down its middle, dark at its edges) and each its own
 * shade between fresh green and sun-faded gold. Binding threads cross them in
 * rows of tiny stitches. Along both long edges, the heri: woven cloth with a
 * fine twill and a pale stripe.
 */
export function tatami(random: () => number): CanvasTexture {
  const width = 2048;
  const height = 1024;
  const border = 30;
  return paint(width, height, (context) => {
    context.fillStyle = "#c9c294";
    context.fillRect(0, 0, width, height);
    const strand = 7;
    for (let x = 0; x < width; x += strand) {
      // Fresh rush is greener, older is golden; neighbours are close in shade.
      const age = 0.5 + Math.sin(x * 0.013) * 0.2 + (random() - 0.5) * 0.35;
      const red = 196 + age * 22;
      const green = 194 + age * 4;
      const blue = 138 - age * 18;
      const light = 0.93 + random() * 0.1;
      context.fillStyle = rgb(red * light * 0.82, green * light * 0.82, blue * light * 0.82);
      context.fillRect(x, 0, strand, height);
      context.fillStyle = rgb(red * light, green * light, blue * light);
      context.fillRect(x + 1, 0, strand - 2, height);
      context.fillStyle = rgb(255, 252, 228, 0.22);
      context.fillRect(x + 2.5, 0, 2, height);
    }
    // The binding threads, in rows across the strands: a short dark stitch
    // where each goes under a strand.
    for (let y = border + 36; y < height - border - 20; y += 44) {
      for (let x = 0; x < width; x += strand * 2) {
        context.fillStyle = rgb(110, 100, 62, 0.45);
        context.fillRect(x + strand * 0.5, y, strand, 3);
      }
    }
    // Wear: a few paler patches where feet go.
    for (let index = 0; index < 18; index++) {
      context.fillStyle = rgb(255, 248, 215, 0.035);
      context.beginPath();
      context.ellipse(
        random() * width,
        height / 2 + (random() - 0.5) * 500,
        60 + random() * 160,
        40 + random() * 90,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    speckle(context, 1600, rgb(95, 85, 50, 0.18), 2, random);
    // The heri, top and bottom.
    for (const top of [0, height - border]) {
      context.fillStyle = "#5f5a40";
      context.fillRect(0, top, width, border);
      for (let x = -border; x < width; x += 4) {
        context.strokeStyle = rgb(30, 28, 18, 0.35);
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, top);
        context.lineTo(x + border, top + border);
        context.stroke();
      }
      context.fillStyle = rgb(232, 222, 180, 0.45);
      context.fillRect(0, top + border / 2 - 1.5, width, 3);
      // A shadow where the cloth folds over the mat's edge.
      context.fillStyle = rgb(40, 34, 18, 0.35);
      context.fillRect(0, top === 0 ? border : top - 3, width, 3);
    }
    // The short ends, where two mats meet: no cloth, just a seam.
    context.fillStyle = rgb(80, 70, 40, 0.65);
    context.fillRect(0, 0, 5, height);
    context.fillRect(width - 5, 0, 5, height);
  });
}

/** Earth plaster, juraku: clay in soft clouds, straw chopped into it, sand. Tiles without a seam. */
export function plaster(random: () => number): CanvasTexture {
  const size = 512;
  const texture = paint(size, size, (context) => {
    context.fillStyle = "#e6d6b8";
    context.fillRect(0, 0, size, size);
    // Drawn again one tile over on every side it crosses, so the tiles meet without a seam.
    const wrapped = (draw: (x: number, y: number) => void, x: number, y: number): void => {
      for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) draw(x + dx, y + dy);
    };
    for (let index = 0; index < 140; index++) {
      const radius = 20 + random() * 70;
      const isDark = random() < 0.55;
      context.fillStyle = isDark ? rgb(150, 118, 76, 0.045) : rgb(255, 248, 232, 0.06);
      wrapped(
        (x, y) => {
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fill();
        },
        random() * size,
        random() * size,
      );
    }
    for (let index = 0; index < 220; index++) {
      const length = 3 + random() * 9;
      const angle = random() * Math.PI;
      context.strokeStyle = rgb(190 + random() * 40, 160, 90, 0.35 + random() * 0.3);
      context.lineWidth = 0.8;
      wrapped(
        (x, y) => {
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
          context.stroke();
        },
        random() * size,
        random() * size,
      );
    }
    speckle(context, 2600, rgb(120, 92, 60, 0.22), 1, random);
    speckle(context, 900, rgb(255, 250, 238, 0.35), 1, random);
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/**
 * Wood with its grain running along: growth rings as lines that drift
 * together and apart, some wide pale streaks and dark ones, pores, a knot or
 * two with the rings bending round them. `tone` darkens it, 0 for fresh
 * hinoki, 1 for old smoked cedar.
 */
export function wood(random: () => number, tone: number): CanvasTexture {
  const width = 1024;
  const height = 256;
  const texture = paint(width, height, (context) => {
    const mix = (light: number, dark: number): number => light + (dark - light) * tone;
    const base = [mix(214, 112), mix(178, 78), mix(132, 52)] as const;
    context.fillStyle = rgb(...base);
    context.fillRect(0, 0, width, height);
    // Broad streaks of lighter and darker wood.
    for (let index = 0; index < 10; index++) {
      const shade = random() < 0.5 ? 0.9 : 1.08;
      context.fillStyle = rgb(base[0] * shade, base[1] * shade, base[2] * shade, 0.35);
      context.fillRect(0, random() * height, width, 6 + random() * 30);
    }
    const knots = Array.from({ length: 1 + Math.floor(random() * 2) }, () => ({
      x: 100 + random() * (width - 200),
      y: 40 + random() * (height - 80),
      size: 6 + random() * 9,
    }));
    // Growth rings: each a wavy line, pushed aside near a knot.
    const phase = random() * 10;
    for (let ring = 0; ring < 70; ring++) {
      const y0 = (ring / 70) * height + (random() - 0.5) * 4;
      const darkness = 0.6 + random() * 0.25;
      context.strokeStyle = rgb(
        base[0] * darkness,
        base[1] * darkness,
        base[2] * darkness,
        0.25 + random() * 0.35,
      );
      context.lineWidth = 0.6 + random() * 2.2;
      context.beginPath();
      for (let x = 0; x <= width; x += 8) {
        let y = y0 + Math.sin(x / 140 + phase + ring * 0.07) * 7 + Math.sin(x / 47 + ring) * 1.5;
        for (const knot of knots) {
          const distance = Math.hypot(x - knot.x, y - knot.y);
          if (distance < knot.size * 5)
            y += Math.sign(y - knot.y || 1) * (knot.size * 5 - distance) * 0.35;
        }
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
    for (const knot of knots) {
      for (let ring = 4; ring >= 0; ring--) {
        context.fillStyle = rgb(
          base[0] * (0.45 + ring * 0.1),
          base[1] * (0.42 + ring * 0.1),
          base[2] * (0.4 + ring * 0.1),
          0.8,
        );
        context.beginPath();
        context.ellipse(
          knot.x,
          knot.y,
          knot.size * (0.4 + ring * 0.3) * 1.6,
          knot.size * (0.4 + ring * 0.3),
          0,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    }
    // Pores: tiny dark dashes along the grain.
    for (let index = 0; index < 2400; index++) {
      context.fillStyle = rgb(base[0] * 0.55, base[1] * 0.5, base[2] * 0.45, 0.25);
      context.fillRect(random() * width, random() * height, 2 + random() * 5, 1);
    }
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/**
 * Shoji: washi paper in a lattice of thin wooden bars, `across` by `up` panes.
 * The paper has fibres and is a touch uneven; each bar is lit on its upper
 * left edge and shaded on its lower right, and throws a soft line of shade on
 * the paper, so the lattice stands out from it.
 */
export function shoji(across: number, up: number, random: () => number): CanvasTexture {
  const width = 512;
  const height = 768;
  return paint(width, height, (context) => {
    context.fillStyle = "#faf5e9";
    context.fillRect(0, 0, width, height);
    for (let index = 0; index < 40; index++) {
      context.fillStyle = rgb(235, 225, 200, 0.12);
      context.beginPath();
      context.arc(random() * width, random() * height, 20 + random() * 60, 0, Math.PI * 2);
      context.fill();
    }
    // Fibres in the washi.
    for (let index = 0; index < 500; index++) {
      const x = random() * width;
      const y = random() * height;
      const angle = random() * Math.PI * 2;
      const length = 4 + random() * 14;
      context.strokeStyle = rgb(225, 212, 185, 0.35);
      context.lineWidth = 0.7;
      context.beginPath();
      context.moveTo(x, y);
      context.quadraticCurveTo(
        x + Math.cos(angle + 0.6) * length * 0.6,
        y + Math.sin(angle + 0.6) * length * 0.6,
        x + Math.cos(angle) * length,
        y + Math.sin(angle) * length,
      );
      context.stroke();
    }
    const bar = 9;
    const frame = 22;
    const drawBar = (x: number, y: number, w: number, h: number): void => {
      context.fillStyle = rgb(60, 40, 20, 0.12);
      context.fillRect(x + 3, y + 3, w, h);
      context.fillStyle = "#b48d5f";
      context.fillRect(x, y, w, h);
      context.fillStyle = rgb(255, 235, 200, 0.35);
      context.fillRect(x, y, w, 1.5);
      context.fillRect(x, y, 1.5, h);
      context.fillStyle = rgb(70, 45, 20, 0.35);
      context.fillRect(x, y + h - 1.5, w, 1.5);
      context.fillRect(x + w - 1.5, y, 1.5, h);
    };
    for (let column = 1; column < across; column++) {
      drawBar(frame + (column / across) * (width - frame * 2) - bar / 2, 0, bar, height);
    }
    for (let row = 1; row < up; row++) {
      drawBar(0, frame + (row / up) * (height - frame * 2) - bar / 2, width, bar);
    }
    drawBar(0, 0, width, frame);
    drawBar(0, height - frame, width, frame);
    drawBar(0, 0, frame, height);
    drawBar(width - frame, 0, frame, height);
  });
}

/** Waits for the brush font the noren and lanterns are written in, or gives up after a moment. */
export async function fontReady(): Promise<void> {
  await Promise.race([
    document.fonts.load('150px "Yuji Syuku"', "よむかな餅"),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
}

/** A soft round spot, white, for steam, dust and flour. */
export function softSpot(): CanvasTexture {
  return paint(64, 64, (context) => {
    const spot = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    spot.addColorStop(0, "rgba(255, 255, 255, 1)");
    spot.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = spot;
    context.fillRect(0, 0, 64, 64);
  });
}
