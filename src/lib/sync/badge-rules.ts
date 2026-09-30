// What a group badge may be. Shared by the app, which offers the choices, and
// the API function, which has the final say. Pure, so both can import it.
//
// A badge is a short tag in a colour, with an emoji if the admin wants one.
// A group's admin makes it and members wear it on their card, like a Discord
// server tag.

import { isHiragana, isKatakana, toCodePoints } from "../japanese/text";
import { CARD_COLORS, isCardColor, type CardColor } from "./profile-rules";
import type { WornSeal } from "./seal-rules";

/** A badge as it is shown. */
export interface Badge {
  /** Optional: a tag on its own is a whole badge. */
  readonly emoji: string | null;
  readonly tag: string;
  readonly color: CardColor;
}

/**
 * Something worn on a card: a group's badge, or a seal earned. Told apart by
 * whether it names a seal, which keeps badges saved before seals existed
 * readable as they are.
 */
export type Worn = Badge | WornSeal;

export function isWornSeal(worn: Worn): worn is WornSeal {
  return "seal" in worn;
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
  "animals" | "nature" | "food" | "japan" | "play" | "things" | "symbols" | "faces" | "flags";

/**
 * Every region with an emoji flag, as its two-letter code: the flags CLDR
 * names, less Sark (CQ), which is from Unicode 15 and shows as two letters on
 * older phones. Windows draws no flag emoji at all and shows these as letters
 * too; that is Windows, and every other system draws them.
 */
const FLAG_REGIONS =
  "AC AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CP CR CU CV CW CX CY CZ DE DG DJ DK DM DO DZ EA EC EE EG EH ER ES ET EU FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU IC ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TA TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM UN US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW";

/** The first of the 26 regional indicator letters, 🇦. A flag is two of them. */
const REGIONAL_A = 0x1f1e6;
/** Plain "A", which a region code counts its letters from. */
const LATIN_A = 0x41;

/** A region's flag: its two letters, each as a regional indicator. */
function flagOf(region: string): string {
  let flag = "";
  for (const letter of region) {
    flag += String.fromCodePoint(REGIONAL_A + (letter.codePointAt(0) ?? 0) - LATIN_A);
  }
  return flag;
}

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
 * weapons, no drink or smoking, nothing with a skin tone. Only
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
  {
    group: "flags",
    emoji: FLAG_REGIONS.split(" ").map(flagOf),
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
