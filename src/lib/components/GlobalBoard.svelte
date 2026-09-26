<script lang="ts">
  import { Presentation } from "@lucide/svelte";
  import BoardList from "$lib/components/BoardList.svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import type { Progress } from "$lib/db";
  import { m } from "$lib/paraglide/messages";
  import { timeAgo } from "$lib/stats";
  import { rankBoard, type BoardEntry, type RankedEntry } from "$lib/sync/board";
  import { loadGlobalBoard, type GlobalBoard } from "$lib/sync/global";
  import { lastShownProfile, updateProfile, type Profile } from "$lib/sync/profile";

  interface Props {
    progress: Progress;
    /** The email this device syncs as, or null when signed out. */
    account: string | null;
    /** The reader's score right now, newer than the one on the server. */
    ownScore: number;
  }

  let { progress, account, ownScore }: Props = $props();

  // Raw: replaced whole on every load. See CLAUDE.md 1.8.
  let board = $state.raw<GlobalBoard | null>(null);
  let profile = $state.raw<Profile | null>(null);
  let hasFailed = $state(false);
  let isJoining = $state(false);
  let hasJoinFailed = $state(false);

  async function refresh(): Promise<void> {
    const loaded = await loadGlobalBoard(account !== null);
    hasFailed = loaded === null;
    if (loaded !== null) board = loaded;
  }

  $effect(() => {
    void (async () => {
      if (account !== null) profile = await lastShownProfile(progress);
      await refresh();
    })();
  });

  let isListed = $derived(
    board !== null &&
      (board.you !== null || board.lines.some((line) => line.isYou) || profile?.isListed === true),
  );

  let ranked = $derived(
    board === null
      ? []
      : rankBoard(
          board.lines.map((line): BoardEntry => ({
            userId: line.username,
            username: line.username,
            displayName: line.displayName,
            score: line.score,
            scoredAt: line.scoredAt,
            isYou: line.isYou,
          })),
          ownScore,
        ),
  );

  function describe(entry: RankedEntry): string {
    if (entry.scoredAt === null) return m.leaderboards_following_label_never();
    return m.leaderboards_following_label_active({ when: timeAgo(entry.scoredAt) });
  }

  async function join(): Promise<void> {
    isJoining = true;
    const result = await updateProfile({ isListed: true });
    isJoining = false;
    hasJoinFailed = "problem" in result;
    if ("profile" in result) {
      profile = result.profile;
      await refresh();
    }
  }
</script>

<!--
  Everyone who chose to be on it, best first. Being on it is the one place a
  name can be found by strangers, so nobody is on it until they say so.
-->
<section class="flex flex-col gap-5 rounded-lg border border-border bg-background p-6">
  <div class="flex items-center justify-between gap-2">
    <h2 class="text-lg leading-snug font-medium">{m.leaderboards_global_title()}</h2>
    <!-- Public already, so a screen needs no link of its own: this is it. -->
    <Button
      variant="ghost"
      size="icon"
      class="-mr-2"
      href="/display/global"
      target="_blank"
      aria-label={m.leaderboards_groups_screen_button()}
      title={m.leaderboards_groups_screen_button()}
    >
      <Presentation class="size-4" />
    </Button>
  </div>

  {#if account !== null && board !== null && !isListed}
    <div class="flex flex-col gap-3 rounded-md bg-muted p-4">
      <p class="text-sm">{m.leaderboards_global_join_description()}</p>
      <div class="flex flex-col gap-1">
        <div>
          <Button
            size="sm"
            disabled={isJoining}
            onclick={() => {
              void join();
            }}
          >
            {#if isJoining}<Spinner aria-label={m.common_status_loading()} />{/if}
            {m.leaderboards_global_join_button()}
          </Button>
        </div>
        {#if hasJoinFailed}
          <StatusLine message={m.leaderboards_following_error_unknown()} isError={true} />
        {/if}
      </div>
    </div>
  {/if}

  {#if board === null}
    {#if hasFailed}
      <p class="text-sm text-destructive" role="alert">{m.leaderboards_groups_error_load()}</p>
    {:else}
      <p class="text-sm text-muted-foreground" role="status">{m.leaderboards_groups_loading()}</p>
    {/if}
  {:else if board.lines.length === 0}
    <p class="text-sm text-muted-foreground">{m.leaderboards_global_empty()}</p>
  {:else}
    <BoardList {ranked} {describe} />
    {#if board.you !== null}
      <!-- Below the top of the board, still somewhere on it. -->
      <p class="text-sm text-muted-foreground">
        {m.leaderboards_global_your_rank({ rank: String(board.you.rank) })}
      </p>
    {/if}
  {/if}
</section>
