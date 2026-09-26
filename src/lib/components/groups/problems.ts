import { m } from "../../paraglide/messages";
import type { GroupProblem } from "../../sync/groups";

const MESSAGES: Readonly<Record<GroupProblem, () => string>> = {
  invalid: m.leaderboards_groups_error_invalid,
  offensive: m.settings_profile_error_offensive,
  limit: m.leaderboards_groups_error_limit,
  expired: m.leaderboards_groups_error_expired,
  "not-found": m.leaderboards_groups_error_not_found,
  offline: m.leaderboards_following_error_offline,
  unknown: m.leaderboards_following_error_unknown,
};

/** What a refusal from a group call tells the reader. */
export function groupProblemMessage(problem: GroupProblem): string {
  return MESSAGES[problem]();
}
