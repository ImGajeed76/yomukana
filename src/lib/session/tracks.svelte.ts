// The tracks the practice page can read on: the reader's own, and each
// marathon they run in that is on right now, with the one chosen.
//
// Drawn first from what was last loaded on this device and then from the
// server, so the tabs are there before the first sentence rather than
// arriving over it and pushing it down the screen. See CLAUDE.md 16 on
// layout shift.

import { Progress } from "../db";
import { marathonStatus } from "../sync/marathon-rules";
import type { MarathonSummary } from "../sync/marathons";
import { chooseTrack, chosenTrack } from "./track-choice";

/** Where the list of marathons is remembered between visits. See SyncRecord.shown. */
const SHOWN = "marathons";

function isSummaryList(value: unknown): value is MarathonSummary[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry: unknown) =>
        typeof entry === "object" && entry !== null && "id" in entry && "endsAt" in entry,
    )
  );
}

class Tracks {
  /** Marathons the reader runs in that are on right now. */
  running = $state.raw<readonly MarathonSummary[]>([]);
  /** Marathons the reader ran in whose results are final. */
  finished = $state.raw<readonly MarathonSummary[]>([]);
  /** The marathon being read in, by id, or null for the reader's own track. */
  selected = $state<string | null>(null);
  /** Whether what this device knew has been read, so the page can start. */
  isReady = $state(false);

  /** Every marathon the reader is in, as last loaded. */
  #all: readonly MarathonSummary[] = [];

  /** Reads what this device last knew. Fast: no network. */
  async load(): Promise<void> {
    const progress = new Progress();
    const state = await progress.syncState();
    if (state.account !== null) {
      const kept = await progress.lastShown(SHOWN);
      if (isSummaryList(kept)) this.#all = kept;
    }
    this.recheck();
    this.isReady = true;
  }

  /**
   * Asks the server, for marathons joined elsewhere and places that moved.
   * Loaded on demand like everything else about sync, so a reader who never
   * signed in never downloads it.
   */
  async refresh(): Promise<void> {
    const progress = new Progress();
    if ((await progress.syncState()).account === null) return;
    const { loadMarathons } = await import("../sync/marathons");
    const result = await loadMarathons();
    if ("problem" in result) return;
    this.#all = result.value;
    await progress.saveShown(SHOWN, result.value);
    this.recheck();
  }

  /**
   * Works out again which marathons are on, as time passes: one that ended
   * since loses its tab, and if it was the one chosen, reading goes back to
   * the reader's own track.
   */
  recheck(): void {
    const now = Date.now();
    this.running = this.#all.filter(
      (marathon) => marathon.isRunning && marathonStatus(marathon, now) === "running",
    );
    this.finished = this.#all.filter(
      (marathon) => marathon.isRunning && marathonStatus(marathon, now) === "finished",
    );
    const chosen = chosenTrack();
    this.selected = this.running.some((marathon) => marathon.id === chosen) ? chosen : null;
  }

  /**
   * The reader's place in a marathon, just worked out after a sentence, so
   * its tab says the same as the summary without waiting for the list.
   */
  setPlace(id: string, place: number): void {
    this.running = this.running.map((marathon) =>
      marathon.id === id ? { ...marathon, place } : marathon,
    );
  }

  /** Reads on a marathon's track from now on, or the reader's own with null. */
  select(id: string | null): void {
    chooseTrack(id);
    this.selected = id;
  }

  /** The marathon being read in, or null. */
  get current(): MarathonSummary | null {
    return this.running.find((marathon) => marathon.id === this.selected) ?? null;
  }
}

export const tracks = new Tracks();
