import { m } from "../../paraglide/messages";
import type { MarathonProblem } from "../../sync/marathons";

const MESSAGES: Readonly<Record<MarathonProblem, () => string>> = {
  invalid: m.marathon_error_invalid,
  offensive: m.settings_profile_error_offensive,
  limit: m.marathon_error_limit,
  expired: m.marathon_error_expired,
  forbidden: m.marathon_error_forbidden,
  "not-found": m.marathon_error_not_found,
  offline: m.leaderboards_following_error_offline,
  unknown: m.leaderboards_following_error_unknown,
};

/** What a refusal from a marathon call tells the reader. */
export function marathonProblemMessage(problem: MarathonProblem): string {
  return MESSAGES[problem]();
}
