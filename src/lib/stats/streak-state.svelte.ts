// The reader's streak, live, for every page that shows it.
//
// Loaded once from the finished sentences, then kept up to date as sentences
// are finished and as sync brings in ones read on another device. Worked out
// between sentences, never on the way from a key to the screen: the practice
// page hands a finished sentence over once it has been saved.

import { Progress, marathonDatabaseName, marathonDatabases } from "../db";
import { momentOf, streakOf, type Streak, type StreakMoment } from "./streak";

/** Where this browser remembers the newest freeze save it already told the reader about. */
const FREEZE_TOLD_KEY = "yomukana:freeze-told";

class StreakState {
  /** The streak now, or null before the reader's sentences have been read. */
  value = $state.raw<Streak | null>(null);
  /** What the last finished sentence did to the streak, or null when nothing. */
  moment = $state.raw<StreakMoment | null>(null);
  #times: number[] = [];

  /**
   * Reads every finished sentence and works the streak out from scratch. Each
   * call reads afresh, so one made after a sync merge sees what it brought in.
   * It is only the index's keys, a few milliseconds even for years of reading.
   */
  async load(): Promise<void> {
    // Sentences read in a marathon count too: reading is reading.
    const tracks = [
      new Progress(),
      ...(await marathonDatabases()).map((id) => new Progress(marathonDatabaseName(id))),
    ];
    const times = await Promise.all(
      tracks.map(async (track, index) => {
        const finished = await track.finishTimes();
        // Marathon tracks are put down again, so none of them is held open.
        if (index > 0) track.close();
        return finished;
      }),
    );
    this.#times = times.flat().sort((a, b) => a - b);
    this.refresh();
  }

  /** A sentence just finished and saved. */
  record(finishedAt: number): void {
    const before = this.value;
    this.#times.push(finishedAt);
    this.refresh();
    // Before the first load there is no "before" to compare with, and every
    // sentence would look like the start of a streak.
    this.moment = before === null || this.value === null ? null : momentOf(before, this.value);
  }

  /** The next sentence has begun, so the last one's moment is over. */
  clearMoment(): void {
    this.moment = null;
  }

  /**
   * Works the streak out again from what is already here. Also for when the
   * day may have turned while the page stayed open.
   */
  refresh(): void {
    this.value = streakOf(this.#times, Date.now());
  }

  /**
   * The newest day a freeze saved the streak that this browser has already
   * told the reader about. localStorage: it only decides whether a popup shows
   * again, and it throws in some private windows, where the answer is "none".
   */
  freezeToldUpTo(): number | null {
    try {
      const told = localStorage.getItem(FREEZE_TOLD_KEY);
      return told === null ? null : Number(told);
    } catch {
      return null;
    }
  }

  rememberFreezeTold(day: number): void {
    try {
      localStorage.setItem(FREEZE_TOLD_KEY, String(day));
    } catch {
      // Same failure as above. The popup may show once more, which is harmless.
    }
  }
}

export const streak = new StreakState();
