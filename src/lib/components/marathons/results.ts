import { m } from "$lib/paraglide/messages";
import type { ResultsDelay } from "$lib/sync/marathon-rules";

const LABELS: Readonly<Record<ResultsDelay, () => string>> = {
  0: m.marathon_create_choice_results_0,
  15: m.marathon_create_choice_results_15,
  60: m.marathon_create_choice_results_60,
  360: m.marathon_create_choice_results_360,
  1440: m.marathon_create_choice_results_1440,
};

/** "At the end", "1 hour after": when results are final, as the choice reads. */
export function resultsLabel(minutes: ResultsDelay): string {
  return LABELS[minutes]();
}
