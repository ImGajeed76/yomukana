// Builds the installed app's icons from static/favicon.svg.
//
// Run with `bun run icons` after the logo changes. Needs `rsvg-convert`
// (librsvg), which renders the SVG exactly as a browser would.
//
// Three shapes, because each platform crops differently:
// - "any": the logo as drawn, rounded corners and all, for browsers that show
//   the icon as it is.
// - "maskable": Android cuts every icon to its own shape, a circle on one
//   phone and a squircle on the next, so this one fills the whole square and
//   keeps the glyph inside the middle 80%, the part every mask leaves alone.
// - apple-touch-icon: iOS rounds the corners itself, so it wants a plain
//   square with nothing in the corners to cut off.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = readFileSync("static/favicon.svg", "utf8");
const outDir = "static/icons";
mkdirSync(outDir, { recursive: true });

/** The logo on a square with no rounded corners, the glyph scaled about the centre. */
function fullBleed(glyphScale: number): string {
  const glyph = source.slice(source.indexOf("<g "), source.lastIndexOf("</g>") + "</g>".length);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">',
    '  <rect width="64" height="64" fill="#2f8f68"/>',
    `  <g transform="translate(32 32) scale(${String(glyphScale)}) translate(-32 -32)">${glyph}</g>`,
    "</svg>",
  ].join("\n");
}

function render(svg: string, size: number, name: string): void {
  const input = join(tmpdir(), `yomukana-icon-${name}.svg`);
  writeFileSync(input, svg);
  const result = Bun.spawnSync([
    "rsvg-convert",
    "--width",
    String(size),
    "--height",
    String(size),
    "--output",
    join(outDir, name),
    input,
  ]);
  rmSync(input);
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  console.log(`wrote ${join(outDir, name)}`);
}

render(source, 192, "icon-192.png");
render(source, 512, "icon-512.png");
// 0.7 keeps the glyph well inside the safe zone even under a circular mask.
render(fullBleed(0.7), 512, "icon-maskable-512.png");
render(fullBleed(0.8), 180, "apple-touch-icon.png");
