// Flag emoji where the system draws none.
//
// Windows has no flag emoji: 🇯🇵 shows as the two letters "JP", which a badge
// then wears. So where the browser cannot draw a flag, a font that holds only
// flags is registered, and every other system never loads it. The artwork is
// Twemoji's, credited in the footer on the systems that use it. See
// static/fonts/TWEMOJI-FLAGS-LICENSE.md.

/** The font's family name, first in the font stacks in layout.css. */
const FLAG_FONT = "Twemoji Country Flags";
const FLAG_FONT_URL = "/fonts/twemoji-country-flags.woff2";

/** The characters flags are made of: the 26 regional indicator letters. */
const FLAG_RANGE = "U+1F1E6-1F1FF";

/**
 * Every system's own emoji font, named outright, so the test asks each system
 * for its real emoji and not whatever its default font falls back to. The same
 * list the TalkJS polyfill this is modelled on tests with.
 */
const EMOJI_FONTS =
  '"Twemoji Mozilla", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", "EmojiOne Color", "Android Emoji", sans-serif';

/** Whether this browser draws flags with the font, and so owes Twemoji its credit. */
export const flagFont = $state({ isUsed: false });

/**
 * Whether the system draws this emoji in colour: drawn once in white and once
 * in black, a colour emoji comes out the same both times, and text, including
 * the two letters a missing flag becomes, takes the colour it is given.
 */
function isDrawnInColour(emoji: string): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return true;
  context.textBaseline = "top";
  context.font = `100px ${EMOJI_FONTS}`;
  // Scaled down, so the one pixel read is the middle of the glyph.
  context.scale(0.01, 0.01);

  const pixelIn = (color: string): string => {
    context.clearRect(0, 0, 100, 100);
    context.fillStyle = color;
    context.fillText(emoji, 0, 0);
    return context.getImageData(0, 0, 1, 1).data.join(",");
  };
  const white = pixelIn("#fff");
  const black = pixelIn("#000");
  // All zero is nothing drawn at all, not a colour glyph.
  return white === black && !black.startsWith("0,0,0,");
}

/**
 * Registers the font if this browser needs it: one that draws other emoji in
 * colour but not flags. Only the flag characters come from it, so everything
 * else still falls through to the app's own fonts, and the file is fetched
 * only once a flag is on screen.
 */
export function drawFlagsWhereMissing(): void {
  if (!isDrawnInColour("😊") || isDrawnInColour("🇨🇭")) return;
  const style = document.createElement("style");
  style.textContent = `@font-face {
    font-family: "${FLAG_FONT}";
    unicode-range: ${FLAG_RANGE};
    src: url("${FLAG_FONT_URL}") format("woff2");
    font-display: swap;
  }`;
  document.head.append(style);
  flagFont.isUsed = true;
}
