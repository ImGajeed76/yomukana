// The reader's seals as the server last said: what they have, and what is
// new since they last looked. Asked after a sync, since the server works
// seals out from the sentences a sync has just sent it.

import { callApi } from "./api";
import { sealOf, type SealFacts, type WornSeal } from "./seal-rules";

/**
 * At most this often. Sync runs after every sentence, and each check has the
 * server count the reader's whole history, so a milestone may show a few
 * minutes after it was reached rather than cost that on every sentence.
 */
const CHECK_EVERY_MS = 3 * 60_000;

interface SealCheck {
  readonly seals: readonly WornSeal[];
  readonly fresh: readonly string[];
  readonly facts: SealFacts;
}

class SealsState {
  /** Every seal the reader has, oldest first. Empty until the first check. */
  owned = $state.raw<readonly WornSeal[]>([]);
  /** Seals earned since the reader last saw one celebrated, to show them next. */
  fresh = $state.raw<readonly string[]>([]);
  /** What the seals were worked out from, for how far the next one is. */
  facts = $state.raw<SealFacts | null>(null);

  #checkedAt = 0;

  /** Asks the server, unless it was asked a moment ago. Quiet when it cannot be reached. */
  async check(): Promise<void> {
    const now = Date.now();
    if (now - this.#checkedAt < CHECK_EVERY_MS) return;
    this.#checkedAt = now;

    const response = await callApi("/achievements", {
      method: "POST",
      body: JSON.stringify({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    });
    if (response?.ok !== true) return;
    const result = (await response.json()) as SealCheck;
    this.owned = result.seals;
    this.facts = result.facts;
    if (result.fresh.length > 0) this.fresh = [...this.fresh, ...result.fresh];
  }

  /**
   * The one new seal worth stopping for: the rarest. A reader's first check
   * can award a dozen at once from their history, and a dozen dialogs in a
   * row would be a chore, not a celebration. The rest wait in the chooser.
   */
  takeFresh(): { seal: string; earnedAt: number } | null {
    const ranked = this.fresh
      .flatMap((id) => {
        const seal = sealOf(id);
        return seal === null ? [] : [seal];
      })
      .sort((a, b) => b.tier - a.tier);
    this.fresh = [];
    const best = ranked[0];
    if (best === undefined) return null;
    const earnedAt = this.owned.find((own) => own.seal === best.id)?.earnedAt ?? Date.now();
    return { seal: best.id, earnedAt };
  }
}

export const seals = new SealsState();
