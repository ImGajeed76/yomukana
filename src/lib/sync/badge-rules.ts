// What a group badge may be. Shared by the app, which offers the choices, and
// the API function, which has the final say. Pure, so both can import it.
//
// A badge is a short tag in a colour, with an emoji if the admin wants one.
// A group's admin makes it and members wear it on their card, like a Discord
// server tag.

import { isHiragana, isKatakana, toCodePoints } from "../japanese/text";
import { CARD_COLORS, isCardColor, type CardColor } from "./profile-rules";

/** A badge as it is shown. */
export interface Badge {
  /** Optional: a tag on its own is a whole badge. */
  readonly emoji: string | null;
  readonly tag: string;
  readonly color: CardColor;
}

/** How many badges a reader may wear at once. */
export const BADGES_WORN_MAX = 3;

/** A tag is this many characters long, and no longer. */
export const BADGE_TAG_MIN = 2;
export const BADGE_TAG_MAX = 4;

/** Badge colours are the card colours, so a badge looks right on any card and in both themes. */
export const BADGE_COLORS = CARD_COLORS;
export const isBadgeColor = isCardColor;

export type BadgeEmojiGroup =
  "animals" | "nature" | "food" | "japan" | "play" | "things" | "symbols" | "faces";

/** An emoji string split into single emoji, keeping each variation selector with its emoji. */
function emojiIn(text: string): string[] {
  const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

/**
 * Every emoji a badge may use, in the groups the picker shows them in.
 *
 * Chosen by hand rather than taken from all of Unicode, so nothing offensive
 * can end up on someone's card and no list of exceptions has to be kept. No
 * weapons, no drink or smoking, no flags, nothing with a skin tone. Only
 * emoji from Unicode 13 or before, so every phone still in use draws them.
 */
export const BADGE_EMOJI: readonly {
  readonly group: BadgeEmojiGroup;
  readonly emoji: readonly string[];
}[] = [
  {
    group: "animals",
    emoji: emojiIn(
      "🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🙈🙉🙊🐔🐧🐦🐤🦆🦅🦉🦇🐺🐗🐴🦄🐝🐛🦋🐌🐞🐢🐍🦎🐙🦑🦐🦀🐡🐠🐟🐬🐳🐋🦈🐊🐅🐆🦓🦍🐘🦛🦏🐪🦒🦘🐂🐄🐎🐖🐑🦙🐐🦌🐕🐩🐈🐓🦚🦜🦢🦩🐇🦝🦦🦥🐁🦔🐉🐲🦕🦖🦭🐾",
    ),
  },
  {
    group: "nature",
    emoji: emojiIn(
      "🌸🌺🌻🌼🌷🌹💐🌱🌿☘️🍀🍁🍂🍃🌾🌵🌴🌳🌲🍄🌰🐚🌊🌋⛰️🏔️🌙🌛🌝🌞⭐🌟✨⚡🔥💧❄️☃️⛄🌈☀️⛅☁️🌧️🌍🌏🪐☄️💫",
    ),
  },
  {
    group: "food",
    emoji: emojiIn(
      "🍣🍙🍘🍚🍛🍜🍝🍠🍢🍤🍥🍡🥟🥠🥡🍱🍲🥢🍵🧋☕🍩🍪🎂🍰🧁🍫🍬🍭🍮🍯🍦🍧🍨🍎🍏🍐🍊🍋🍌🍉🍇🍓🍈🍒🥭🍍🥥🥝🍅🥑🥦🥕🌽🌶️🥔🍞🥐🥨🧀🥚🍳🥞🧇🍔🍟🍕🌭🥪🌮🌯🥗🍿🧃🥤",
    ),
  },
  {
    group: "japan",
    emoji: emojiIn("⛩️🗾🎌🏯🗼🗻🎎🎏🎐🎑🎋🎍🏮🎴🀄👘🎭🚅🔰💮🏣🈁🈂️🈷️🈯🈳🈵🈶🈚🈸🈴🈺🉐🉑㊗️㊙️"),
  },
  {
    group: "play",
    emoji: emojiIn(
      "📚📖📝✏️🖊️🖋️📓📔📒📕📗📘📙🗒️🎓🏫🎒🔬🔭🧪🧮📐📏🎨🎵🎶🎸🎹🎺🎻🥁🎤🎧🎮🕹️🎲🧩♟️🎯🎳⚽🏀🏈⚾🥎🎾🏐🏉🏓🏸🥋⛳🎣🛹🛼⛸️🎿🏆🥇🥈🥉🏅🎖️",
    ),
  },
  {
    group: "things",
    emoji: emojiIn(
      "🚀✈️🚲🚂🚃🚗🚕🚌⛵🚢🛸🏠🏡🏰🎡🎢🎠⛺🌁💡🔦🕯️🔑🗝️🔔📷📸📱💻⌨️🖥️🕰️⏰⌛🧭🗺️🎁🎀🎈🎉🎊🪁🧸🪀🔮🧿💎👑🎩🧢👓🕶️🧣🧤☂️🧵🧶🪴🛍️💌📮✉️🏷️🧲⚙️🔧🧰⚓",
    ),
  },
  {
    group: "symbols",
    emoji: emojiIn(
      "❤️🧡💛💚💙💜🤎🖤🤍💖💗💓💞💕💘💝⭕✅✔️💯♾️⚜️🔱🌀💠🔷🔶🔺🔻⬛⬜🟥🟧🟨🟩🟦🟪🟫🔴🟠🟡🟢🔵🟣🟤⚫⚪♠️♥️♦️♣️🃏💤💢💥💦💨‼️❓❗💬💭🆒🆕🆗🆙🆓🔝♻️",
    ),
  },
  {
    group: "faces",
    emoji: emojiIn(
      "😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘😋😛😜🤪😝🤓😎🥳🤩🤔🤗🤭🤫😴😮😲🥺😤🤠🤡👻👽🤖🎃😺😸😹😻😼🙀👀👋👍✌️🤞🤟🤘👌🙌👏💪🧠",
    ),
  },
];
const ALL_EMOJI: ReadonlySet<string> = new Set(BADGE_EMOJI.flatMap((group) => group.emoji));

export function isBadgeEmoji(value: unknown): value is string {
  return typeof value === "string" && ALL_EMOJI.has(value);
}

/** The long vowel mark, which is katakana to a reader but sits outside the katakana block. */
const LONG_VOWEL = "ー";

function isTagCharacter(character: string): boolean {
  return (
    (character >= "A" && character <= "Z") ||
    (character >= "0" && character <= "9") ||
    isHiragana(character) ||
    isKatakana(character) ||
    character === LONG_VOWEL
  );
}

/**
 * A tag as it is kept, or null if it cannot be one: 2 to 4 of Latin letters,
 * digits and kana. Latin is shown in capitals, like every tag on Discord, and
 * full-width letters and half-width kana are folded to the ordinary ones, so
 * what a Japanese keyboard types is accepted too.
 */
export function badgeTagFrom(text: string): string | null {
  const tag = text.normalize("NFKC").trim().toUpperCase();
  const characters = toCodePoints(tag);
  if (characters.length < BADGE_TAG_MIN || characters.length > BADGE_TAG_MAX) return null;
  return characters.every(isTagCharacter) ? tag : null;
}
