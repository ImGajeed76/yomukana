// Kana in, keystrokes out. Nothing here imports Svelte, storage or timers, so
// the whole engine runs in a test. See CLAUDE.md 3.2.

export { preferredRomaji, segmentKana } from "./segment";
export type { Segment, SegmentKind } from "./segment";

export {
  acceptableKeys,
  backspace,
  press,
  startTyping,
  startTypingKana,
  typedInCurrentSegment,
} from "./matcher";
export type { PressResult, TypingState } from "./matcher";
