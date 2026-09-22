// Keystrokes, counted, for anything that wants to react to the reader typing.
//
// A counter rather than a flag, because what reacts to it reacts per key. It
// holds two numbers and nothing else: whatever watches it is responsible for
// staying off the critical path, and the only thing that does watch it animates
// an opacity, which the compositor handles without a repaint. See CLAUDE.md 1.8.

import { CORRECT_IMPULSE, WRONG_IMPULSE } from "../charts/energy";

class Activity {
  /** Keys typed, over the life of the page. Only the change matters. */
  keystrokes = $state(0);
  /** What the last key was worth, which is most of what it was. */
  impulse = $state(0);

  record(isCorrect: boolean): void {
    this.impulse = isCorrect ? CORRECT_IMPULSE : WRONG_IMPULSE;
    this.keystrokes += 1;
  }
}

export const activity = new Activity();
