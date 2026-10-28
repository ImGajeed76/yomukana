// The lobby's soft surfaces and paper, painted on canvases like the hard ones
// in textures.ts, and like them used as their own relief: cushion cloth,
// felt, the noren, lantern and parasol paper, and the screen's brushed metal.

import { RepeatWrapping, type CanvasTexture } from "three";
import { paint, rgb, speckle } from "./textures";

/**
 * A zabuton's face: cotton in a fine plain weave with the odd thicker
 * thread, white so the cushion's colour tints it. A stitched seam runs round
 * just inside the edge, and the middle dips where the tuft pulls the
 * stuffing in.
 */
export function cloth(random: () => number): CanvasTexture {
  const size = 512;
  return paint(size, size, (context) => {
    context.fillStyle = "#f2f2f2";
    context.fillRect(0, 0, size, size);
    for (let line = 0; line < size; line += 3) {
      context.fillStyle = rgb(0, 0, 0, 0.07 + random() * 0.04);
      context.fillRect(0, line, size, 1);
      context.fillStyle = rgb(0, 0, 0, 0.05 + random() * 0.04);
      context.fillRect(line, 0, 1, size);
    }
    // Slubs: thicker threads here and there.
    for (let index = 0; index < 40; index++) {
      context.fillStyle = rgb(255, 255, 255, 0.5);
      const y = Math.floor(random() * size);
      context.fillRect(random() * size, y, 20 + random() * 60, 1.5);
    }
    // The dip in the middle.
    const dip = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size * 0.42,
    );
    dip.addColorStop(0, rgb(0, 0, 0, 0.28));
    dip.addColorStop(0.35, rgb(0, 0, 0, 0.08));
    dip.addColorStop(1, rgb(0, 0, 0, 0));
    context.fillStyle = dip;
    context.fillRect(0, 0, size, size);
    // The seam: a shallow groove with stitches in it.
    const inset = size * 0.07;
    context.strokeStyle = rgb(0, 0, 0, 0.3);
    context.lineWidth = 3;
    context.strokeRect(inset, inset, size - inset * 2, size - inset * 2);
    context.setLineDash([7, 5]);
    context.strokeStyle = rgb(255, 255, 255, 0.55);
    context.lineWidth = 1.5;
    context.strokeRect(inset, inset, size - inset * 2, size - inset * 2);
    context.setLineDash([]);
  });
}

/** Red felt, as on a tea house bench: no weave, just fibres every way. */
export function felt(random: () => number): CanvasTexture {
  const texture = paint(256, 256, (context) => {
    context.fillStyle = "#b8322e";
    context.fillRect(0, 0, 256, 256);
    for (let index = 0; index < 3000; index++) {
      const x = random() * 256;
      const y = random() * 256;
      const angle = random() * Math.PI * 2;
      const length = 2 + random() * 5;
      const shade = 0.75 + random() * 0.45;
      context.strokeStyle = rgb(184 * shade, 50 * shade, 46 * shade, 0.5);
      context.lineWidth = 0.7;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      context.stroke();
    }
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(3, 1);
  return texture;
}

/**
 * One panel of the noren over the door: cotton dyed indigo by hand, so the
 * blue is uneven, faded a little towards the bottom where hands brush it,
 * with one character of the shop's name left white, in brush. A hem at the
 * top where it hangs from the pole. The font is the seals' (Yuji Syuku), so it
 * must have loaded first: see `fontReady`.
 */
export function noren(character: string, random: () => number): CanvasTexture {
  return paint(256, 640, (context) => {
    context.fillStyle = "#22325a";
    context.fillRect(0, 0, 256, 640);
    for (let index = 0; index < 50; index++) {
      context.fillStyle = random() < 0.5 ? rgb(16, 26, 52, 0.18) : rgb(60, 80, 120, 0.12);
      context.beginPath();
      context.ellipse(
        random() * 256,
        random() * 640,
        20 + random() * 50,
        30 + random() * 90,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    const fade = context.createLinearGradient(0, 380, 0, 640);
    fade.addColorStop(0, rgb(120, 140, 175, 0));
    fade.addColorStop(1, rgb(120, 140, 175, 0.22));
    context.fillStyle = fade;
    context.fillRect(0, 380, 256, 260);
    for (let y = 0; y < 640; y += 3) {
      context.fillStyle = rgb(255, 255, 255, 0.035);
      context.fillRect(0, y, 256, 1);
    }
    context.fillStyle = "#f1ebde";
    context.font = '160px "Yuji Syuku", "Noto Sans JP", serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(character, 128, 300);
    // The hem: a fold of cloth, darker, with its stitch line.
    context.fillStyle = rgb(0, 0, 0, 0.3);
    context.fillRect(0, 0, 256, 34);
    context.setLineDash([6, 4]);
    context.strokeStyle = rgb(220, 220, 220, 0.4);
    context.beginPath();
    context.moveTo(0, 30);
    context.lineTo(256, 30);
    context.stroke();
    context.setLineDash([]);
  });
}

/** A paper lantern's face: red paper over bamboo ribs, black bands top and bottom, one character. */
export function lantern(character: string, random: () => number): CanvasTexture {
  return paint(1024, 512, (context) => {
    context.fillStyle = "#c8432f";
    context.fillRect(0, 0, 1024, 512);
    speckle(context, 1500, rgb(255, 200, 160, 0.12), 2, random);
    for (let y = 28; y < 512; y += 22) {
      context.fillStyle = rgb(80, 20, 10, 0.3);
      context.fillRect(0, y, 1024, 3);
      context.fillStyle = rgb(255, 190, 150, 0.15);
      context.fillRect(0, y + 3, 1024, 2);
    }
    context.fillStyle = "#1d1b1a";
    context.fillRect(0, 0, 1024, 40);
    context.fillRect(0, 472, 1024, 40);
    context.fillStyle = "#1d1b1a";
    context.font = '240px "Yuji Syuku", "Noto Sans JP", serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    // Twice, so one shows from each side of the lantern.
    context.fillText(character, 256, 264);
    context.fillText(character, 768, 264);
  });
}

/**
 * A janome parasol's oiled paper, wrapped round its cone: red with a white
 * ring part way out, the classic snake's-eye, the bamboo ribs a shade darker
 * showing through with the paper a touch brighter between them, fibres in
 * the paper, and a band of thread near the rim.
 */
export function parasolPaper(random: () => number): CanvasTexture {
  const width = 2048;
  const height = 512;
  return paint(width, height, (context) => {
    context.fillStyle = "#c63a2f";
    context.fillRect(0, 0, width, height);
    // The ring: the cone's texture runs from the rim at the bottom to the tip at the top.
    context.fillStyle = "#f3ece0";
    context.fillRect(0, height * 0.42, width, height * 0.13);
    context.fillStyle = "#1f1a18";
    context.fillRect(0, height * 0.82, width, height * 0.18);
    const ribs = 40;
    const gap = width / ribs;
    for (let rib = 0; rib < ribs; rib++) {
      context.fillStyle = rgb(255, 215, 180, 0.07);
      context.fillRect(rib * gap + 6, 0, gap - 12, height);
      context.fillStyle = rgb(80, 18, 10, 0.35);
      context.fillRect(rib * gap, 0, 3, height);
    }
    for (let index = 0; index < 900; index++) {
      context.strokeStyle = rgb(255, 230, 210, 0.08);
      context.lineWidth = 0.8;
      const x = random() * width;
      const y = random() * height;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + (random() - 0.5) * 16, y + (random() - 0.5) * 16);
      context.stroke();
    }
    context.fillStyle = rgb(240, 220, 160, 0.6);
    context.fillRect(0, height * 0.06, width, 4);
  });
}

/** Dark brushed metal, for the screen's casing: fine streaks along it. */
export function brushedMetal(random: () => number): CanvasTexture {
  const texture = paint(512, 128, (context) => {
    context.fillStyle = "#1c1d21";
    context.fillRect(0, 0, 512, 128);
    for (let line = 0; line < 400; line++) {
      const light = random() < 0.5;
      context.fillStyle = light ? rgb(255, 255, 255, 0.04) : rgb(0, 0, 0, 0.12);
      context.fillRect(random() * 512 - 100, random() * 128, 80 + random() * 300, 1);
    }
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}
