<script lang="ts">
  import { Users } from "@lucide/svelte";
  import { goto } from "$app/navigation";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import type { Progress } from "$lib/db";
  import { m } from "$lib/paraglide/messages";
  import { joinMarathon, type MarathonInvite, type MarathonProblem } from "$lib/sync/marathons";
  import { sync } from "$lib/sync/sync";
  import { statusLine } from "./format";
  import { marathonProblemMessage } from "./problems";

  interface Props {
    progress: Progress;
    code: string;
    invite: MarathonInvite;
    isSignedIn: boolean;
  }

  let { progress, code, invite, isSignedIn }: Props = $props();

  let pending = $state<"runner" | "watcher" | null>(null);
  let problem = $state<MarathonProblem | null>(null);

  let board = $derived(`/leaderboards?board=marathon:${invite.id}`);

  async function join(as: "runner" | "watcher"): Promise<void> {
    pending = as;
    // A reader who signed in but has not synced yet has no profile, and a
    // marathon needs one to show them. A sync makes it.
    await sync(progress);
    const result = await joinMarathon(code, as);
    pending = null;
    if ("problem" in result) {
      problem = result.problem;
      return;
    }
    await goto(board);
  }
</script>

<!--
  Where a marathon invite lands, mostly on a phone held up to a projector.
  Says what it is and when, answers the one worry before anyone asks ("does
  this reset my progress?"), and offers the two ways in: run, or watch.
-->
<section class="flex flex-col gap-5 rounded-lg border border-border bg-background p-6">
  <div class="flex flex-col gap-1">
    <p class="text-sm text-muted-foreground">{m.leaderboards_groups_join_invited()}</p>
    <h1 class="text-2xl leading-tight font-semibold tracking-tight">{invite.name}</h1>
    <p class="text-sm text-muted-foreground">{statusLine(invite, Date.now())}</p>
    <p class="flex items-center gap-2 text-sm text-muted-foreground">
      <Users class="size-4" />
      {m.marathon_board_label_runners({ count: String(invite.runnerCount) })}
    </p>
  </div>

  <div class="flex flex-col gap-1 text-sm">
    <p>{invite.canEnter ? m.marathon_join_fresh() : m.marathon_join_closed()}</p>
    <p class="text-muted-foreground">{m.marathon_join_public()}</p>
  </div>

  <div class="flex flex-col gap-2">
    {#if invite.isMember}
      <div>
        <Button href={board}>{m.leaderboards_groups_join_button_open()}</Button>
      </div>
    {:else if !isSignedIn}
      <div>
        <Button href="/account?next=/join/{code}">
          {m.leaderboards_groups_join_button_sign_in()}
        </Button>
      </div>
    {:else if invite.canEnter}
      <div class="flex flex-wrap items-center gap-2">
        <Button
          disabled={pending !== null}
          onclick={() => {
            void join("runner");
          }}
        >
          {#if pending === "runner"}<Spinner aria-label={m.common_status_loading()} />{/if}
          {m.marathon_join_button_run()}
        </Button>
        <Button
          variant="ghost"
          disabled={pending !== null}
          onclick={() => {
            void join("watcher");
          }}
        >
          {#if pending === "watcher"}<Spinner aria-label={m.common_status_loading()} />{/if}
          {m.marathon_join_button_watch()}
        </Button>
      </div>
    {:else}
      <div>
        <Button
          disabled={pending !== null}
          onclick={() => {
            void join("watcher");
          }}
        >
          {#if pending === "watcher"}<Spinner aria-label={m.common_status_loading()} />{/if}
          {m.marathon_join_button_watch_only()}
        </Button>
      </div>
    {/if}
    {#if problem !== null}
      <StatusLine message={marathonProblemMessage(problem)} isError={true} />
    {/if}
  </div>
</section>
