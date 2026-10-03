// What a marathon says to its runners along the way: where they stand after
// each sentence and whom they passed, the moment they reach the top three, and
// the news that one started or finished. Worked out between sentences, from
// the board the server sends once the sentence's score has gone out.

import { liveScore } from "../sync/marathon-rules";
import type { MarathonSummary } from "../sync/marathons";
import { placeChange } from "./place-change";

/** Where this browser remembers which marathons' start and results it already told. */
const TOLD_KEY = "yomukana:marathon-told";

interface Told {
  readonly started: readonly string[];
  readonly finished: readonly string[];
}

/** What a sentence did to the reader's place. */
/** A place in the top three just reached, for the popup that says so. */
export interface PodiumMoment {
  readonly place: number;
  /** The marathon's name. */
  readonly marathon: string;
  /** Names of the runners the sentence passed, nearest first. Never empty: a better place means passing someone. */
  readonly passed: readonly string[];
}

function readTold(): Told {
  // localStorage throws in some private windows. Then nothing was told, and
  // the reader may see a start once more, which is harmless.
  try {
    const raw = localStorage.getItem(TOLD_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "started" in parsed &&
      "finished" in parsed
    ) {
      return parsed as Told;
    }
  } catch {
    // As above.
  }
  return { started: [], finished: [] };
}

function writeTold(told: Told): void {
  try {
    localStorage.setItem(TOLD_KEY, JSON.stringify(told));
  } catch {
    // As above.
  }
}

class MarathonMoments {
  /** The reader's place after the last sentence, or null before the board has come back. */
  place = $state<number | null>(null);
  /** Whom the last sentence passed. */
  passed = $state.raw<readonly string[]>([]);
  /**
   * A place in the top three just reached, for a popup. At most once a
   * sitting: early in a race everyone passes everyone, and the last evening
   * of a close one should not stop every sentence.
   */
  podium = $state.raw<PodiumMoment | null>(null);

  /** Who was ahead after the last sentence, per marathon, to tell whom the next one passed. */
  readonly #ahead = new Map<string, ReadonlySet<string>>();
  #hasShownPodium = false;

  /** Forgets the last sentence's place, for a new one or another track. */
  clear(): void {
    this.place = null;
    this.passed = [];
  }

  /**
   * The board after a sentence, from the server. The first one only sets
   * where the reader stood: passing someone needs a before.
   */
  async afterSentence(marathon: MarathonSummary): Promise<void> {
    const { loadMarathon } = await import("../sync/marathons");
    const result = await loadMarathon(marathon.id);
    if ("problem" in result) return;
    const board = result.value;
    const now = Date.now();
    const change = placeChange(
      board.runners.map((runner) => ({
        name: runner.displayName ?? runner.username,
        isYou: runner.isYou,
        score: Math.round(liveScore(runner, board.endsAt, now)),
      })),
      this.#ahead.get(marathon.id),
    );
    if (change === null) return;
    this.#ahead.set(marathon.id, change.ahead);
    this.place = change.place;
    this.passed = change.passed;
    if (change.isPodium && !this.#hasShownPodium) {
      this.#hasShownPodium = true;
      this.podium = { place: change.place, marathon: board.name, passed: change.passed };
    }
  }

  /** A marathon the reader runs in that started and that they have not been told about. */
  startedToTell(
    running: readonly MarathonSummary[],
    selected: string | null,
  ): MarathonSummary | null {
    const told = readTold();
    return (
      running.find((marathon) => marathon.id !== selected && !told.started.includes(marathon.id)) ??
      null
    );
  }

  /** A marathon the reader ran in whose results are final and that they have not seen. */
  finishedToTell(finished: readonly MarathonSummary[]): MarathonSummary | null {
    const told = readTold();
    return finished.find((marathon) => !told.finished.includes(marathon.id)) ?? null;
  }

  rememberStartTold(id: string): void {
    const told = readTold();
    writeTold({ ...told, started: [...told.started, id] });
  }

  rememberFinishTold(id: string): void {
    const told = readTold();
    writeTold({ ...told, finished: [...told.finished, id] });
  }
}

export const marathonMoments = new MarathonMoments();
