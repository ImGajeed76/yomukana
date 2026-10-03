<script lang="ts">
  import { Presentation, Settings2, UserPlus } from "@lucide/svelte";
  import { goto } from "$app/navigation";
  import BoardList from "$lib/components/BoardList.svelte";
  import ScreenDialog from "$lib/components/ScreenDialog.svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Button } from "$lib/components/ui/button";
  import { Spinner } from "$lib/components/ui/spinner";
  import type { Progress } from "$lib/db";
  import type { ItemStore } from "$lib/srs";
  import { scoreOf } from "$lib/stats/score";
  import { loadTextShare, type TextShare } from "$lib/stats/text-share";
  import { sync } from "$lib/sync/sync";
  import { m } from "$lib/paraglide/messages";
  import { chooseTrack, chosenTrack } from "$lib/session/track-choice";
  import { timeAgo } from "$lib/stats";
  import { rankBoard, standingOf, type RankedEntry, type Standing } from "$lib/sync/board";
  import { canEnter, liveScore, marathonStatus } from "$lib/sync/marathon-rules";
  import {
    enterMarathon,
    leaveMarathon,
    loadMarathon,
    makeMarathonDisplay,
    openTrack,
    stopMarathonDisplay,
    type Marathon,
    type MarathonHeader,
    type MarathonProblem,
  } from "$lib/sync/marathons";
  import { isFinalDay, statusLine } from "./format";
  import MarathonInviteDialog from "./MarathonInviteDialog.svelte";
  import MarathonSettingsDialog from "./MarathonSettingsDialog.svelte";
  import { marathonProblemMessage } from "./problems";

  interface Props {
    progress: Progress;
    marathonId: string;
    /** Whether to open the invite as soon as it has loaded, as after making one. */
    isInviting?: boolean;
    /** Called when the reader is no longer in it: they left, or it is gone. */
    onGone: () => void;
  }

  let { progress, marathonId, isInviting = false, onGone }: Props = $props();

  // Raw: replaced whole on every load. See CLAUDE.md 1.8.
  let marathon = $state.raw<Marathon | null>(null);
  let hasFailed = $state(false);
  let problem = $state<MarathonProblem | null>(null);
  let isInviteOpen = $state(false);
  let isScreenOpen = $state(false);
  let isSettingsOpen = $state(false);
  let isLeaving = $state(false);
  let isEntering = $state(false);

  /** The board is shown from what the server said and this clock, which ticks on its own. */
  let now = $state(Date.now());

  /** How often the board asks the server again: scores arrive with each runner's sync. */
  const REFRESH_MS = 60_000;

  async function refresh(id: string): Promise<void> {
    const result = await loadMarathon(id);
    if (id !== marathonId) return;
    if ("problem" in result) {
      if (result.problem === "not-found") {
        await progress.saveShown(`marathon:${id}`, undefined);
        onGone();
        return;
      }
      hasFailed = true;
      return;
    }
    hasFailed = false;
    marathon = result.value;
    await progress.saveShown(`marathon:${id}`, result.value);
  }

  // The board as last shown, at once, then from the server, then again every
  // minute while it is open. Switching to another marathon starts over.
  $effect(() => {
    const id = marathonId;
    marathon = null;
    hasFailed = false;
    ownStore = null;
    void (async () => {
      const kept = (await progress.lastShown(`marathon:${id}`)) as Marathon | undefined;
      if (kept !== undefined && id === marathonId) marathon = kept;
      await refresh(id);
      if (isInviting && marathon?.isAdmin === true) isInviteOpen = true;
      if (marathon?.isRunning === true) await readOwnTrack(id, marathon.endsAt);
    })();
    const timer = setInterval(() => {
      void refresh(id);
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  });

  /**
   * The reader's own track on this device, once synced, so their line shows
   * what they have read here and on their other devices, not the last score
   * the server got: the same as their line on every other board.
   */
  let ownStore = $state.raw<ItemStore | null>(null);
  let textShare = $state.raw<TextShare | null>(null);

  async function readOwnTrack(id: string, endsAt: number): Promise<void> {
    const [track, share] = await Promise.all([openTrack(id), loadTextShare()]);
    await track.load();
    // Brings in what other devices read, and sends this device's score. A
    // failed sync leaves what this device has, which is still its own.
    if ((await sync(track, { kind: "marathon", id, endsAt })) === "synced") await refresh(id);
    if (id !== marathonId) return;
    ownStore = track.store;
    textShare = share;
    track.close();
  }

  // Scores drift down between syncs, and the last day counts down by the
  // second, so the clock ticks: every second on the last day, otherwise
  // every half minute, which is finer than any score moves.
  $effect(() => {
    const step = marathon !== null && isFinalDay(marathon, now) ? 1000 : 30_000;
    const timer = setInterval(() => {
      now = Date.now();
    }, step);
    return () => {
      clearInterval(timer);
    };
  });

  let status = $derived(marathon === null ? null : marathonStatus(marathon, now));
  /**
   * The reader's own score: worked out on this device when its track is
   * here, otherwise the server's, falling between syncs like everyone else's.
   * Past the end it is the score at the end, which places are decided by.
   */
  let ownLive = $derived.by(() => {
    if (marathon === null) return 0;
    if (ownStore !== null && textShare !== null) {
      return scoreOf(ownStore, new Date(Math.min(now, marathon.endsAt)), textShare);
    }
    const own = marathon.runners.find((runner) => runner.isYou);
    return own === undefined ? 0 : liveScore(own, marathon.endsAt, now);
  });
  let ranked = $derived(
    marathon === null
      ? []
      : rankBoard(
          marathon.runners.map((runner) => ({
            userId: runner.username,
            username: runner.username,
            displayName: runner.displayName,
            score: liveScore(runner, marathon?.endsAt ?? 0, now),
            scoredAt: runner.scoredAt,
            isYou: runner.isYou,
            badges: runner.badges,
          })),
          ownLive,
        ),
  );
  let standing = $derived(standingOf(ranked));

  /** Whether the footer has something to do or say for the reader: read, run, or "watching". */
  let canAct = $derived(
    marathon !== null && (marathon.isRunning ? status === "running" : status !== "finished"),
  );

  function describe(state: Standing): string | null {
    if (state.kind === "leading") return m.leaderboards_following_standing_leading();
    if (state.kind === "tied")
      return m.leaderboards_following_standing_tied({ username: state.name });
    if (state.kind === "behind") {
      return m.leaderboards_following_standing_behind({
        points: String(state.points),
        username: state.name,
      });
    }
    return null;
  }

  function lineFor(entry: RankedEntry): string {
    // Before the start nobody has read anything, and once it is over the
    // places say it all: how far behind, or when someone was last active,
    // only matters while it runs.
    if (status === "upcoming" || status === "finished") return "";
    if (entry.isYou) return describe(standing) ?? "";
    if (entry.scoredAt === null) return m.leaderboards_following_label_never();
    return m.leaderboards_following_label_active({ when: timeAgo(entry.scoredAt) });
  }

  /** Switches the practice page to this marathon, and goes there. */
  async function readHere(): Promise<void> {
    chooseTrack(marathonId);
    await goto("/");
  }

  async function enter(): Promise<void> {
    isEntering = true;
    const result = await enterMarathon(marathonId);
    isEntering = false;
    problem = "problem" in result ? result.problem : null;
    if ("value" in result) await refresh(marathonId);
  }

  async function leave(): Promise<void> {
    const result = await leaveMarathon(marathonId);
    isLeaving = false;
    if ("problem" in result) {
      problem = result.problem;
      return;
    }
    if (chosenTrack() === marathonId) chooseTrack(null);
    await progress.saveShown(`marathon:${marathonId}`, undefined);
    onGone();
  }
</script>

<!--
  A marathon's board: everyone running, best first, the same for all of them.
  The one thing to do next is the button under it: read in it, start running,
  or nothing once it is over.
-->
<section class="flex flex-col gap-5 rounded-lg border border-border bg-background p-6">
  <div class="flex flex-wrap items-start justify-between gap-2">
    <div class="flex min-w-0 flex-col gap-1">
      <h2 class="truncate text-lg leading-snug font-medium">{marathon?.name ?? ""}</h2>
      {#if marathon !== null}
        <span class="text-sm text-muted-foreground tabular-nums">{statusLine(marathon, now)}</span>
      {/if}
    </div>
    {#if marathon !== null}
      <div class="-mr-2 flex items-center gap-1">
        {#if marathon.isAdmin}
          <!-- Inviting ends with the race: nobody joins one that is over. -->
          {#if status === "upcoming" || status === "running"}
            <Button
              variant="ghost"
              size="sm"
              onclick={() => {
                isInviteOpen = true;
              }}
            >
              <UserPlus class="size-4" />
              {m.leaderboards_groups_button_invite()}
            </Button>
          {/if}
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.leaderboards_groups_screen_button()}
            title={m.leaderboards_groups_screen_button()}
            onclick={() => {
              isScreenOpen = true;
            }}
          >
            <Presentation class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.marathon_settings_title()}
            title={m.marathon_settings_title()}
            onclick={() => {
              isSettingsOpen = true;
            }}
          >
            <Settings2 class="size-4" />
          </Button>
        {:else}
          <!-- The organiser leaves through deleting, as a group's admin does. -->
          <Button
            variant="ghost"
            size="sm"
            class="text-muted-foreground"
            onclick={() => {
              isLeaving = true;
            }}
          >
            {m.marathon_board_button_leave()}
          </Button>
        {/if}
      </div>
    {/if}
  </div>

  {#if marathon === null}
    {#if hasFailed}
      <p class="text-sm text-destructive" role="alert">{m.leaderboards_groups_error_load()}</p>
    {:else}
      <p class="text-sm text-muted-foreground" role="status">{m.leaderboards_groups_loading()}</p>
    {/if}
  {:else}
    {#if status === "counting" && marathon.isRunning}
      <p class="rounded-md bg-muted p-4 text-sm">{m.marathon_board_counting_hint()}</p>
    {/if}

    {#if ranked.length === 0}
      <p class="text-sm text-muted-foreground">{m.marathon_board_empty()}</p>
    {:else}
      <BoardList {ranked} describe={lineFor} />
    {/if}

    <!--
      Who watches, and the one thing to do next. Only there when there is
      either: before the start a runner has nothing to press yet.
    -->
    {#if marathon.watchers > 0 || canAct}
      <div class="flex flex-wrap items-center justify-between gap-4">
        <!-- The runners are the list above; only those watching need saying. -->
        <span class="text-sm text-muted-foreground">
          {#if marathon.watchers > 0}
            {m.marathon_board_label_watchers({ count: String(marathon.watchers) })}
          {/if}
        </span>
        {#if marathon.isRunning && status === "running"}
          <Button
            onclick={() => {
              void readHere();
            }}
          >
            {m.marathon_board_button_read()}
          </Button>
        {:else if !marathon.isRunning && canEnter(marathon, now)}
          <Button
            disabled={isEntering}
            onclick={() => {
              void enter();
            }}
          >
            {#if isEntering}<Spinner aria-label={m.common_status_loading()} />{/if}
            {m.marathon_board_button_enter()}
          </Button>
        {:else if !marathon.isRunning}
          <span class="text-sm text-muted-foreground">{m.marathon_board_label_watching()}</span>
        {/if}
      </div>
    {/if}

    {#if problem !== null}
      <StatusLine message={marathonProblemMessage(problem)} isError={true} />
    {/if}
  {/if}
</section>

{#if marathon?.isAdmin === true}
  <MarathonInviteDialog
    bind:open={isInviteOpen}
    {marathonId}
    name={marathon.name}
    inviteCode={marathon.inviteCode}
    onChange={(inviteCode: string | null) => {
      if (marathon !== null) marathon = { ...marathon, inviteCode };
    }}
  />
  <ScreenDialog
    bind:open={isScreenOpen}
    name={marathon.name}
    displayCode={marathon.displayCode}
    makeLink={async () => {
      const result = await makeMarathonDisplay(marathonId);
      return "problem" in result
        ? { problem: marathonProblemMessage(result.problem) }
        : result.value;
    }}
    stopLink={async () => {
      const result = await stopMarathonDisplay(marathonId);
      return "problem" in result ? marathonProblemMessage(result.problem) : null;
    }}
    onChange={(displayCode: string | null) => {
      if (marathon !== null) marathon = { ...marathon, displayCode };
    }}
  />
{/if}

{#if marathon?.isAdmin === true}
  <MarathonSettingsDialog
    bind:open={isSettingsOpen}
    {marathon}
    onChange={(header: MarathonHeader) => {
      if (marathon !== null) marathon = { ...marathon, ...header };
    }}
    onDeleted={async () => {
      if (chosenTrack() === marathonId) chooseTrack(null);
      await progress.saveShown(`marathon:${marathonId}`, undefined);
      onGone();
    }}
  />
{/if}

<!-- Leaving deletes what was read in it, so it asks first. -->
<AlertDialog.Root bind:open={isLeaving}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{m.marathon_leave_title({ name: marathon?.name ?? "" })}</AlertDialog.Title
      >
      <AlertDialog.Description>{m.marathon_leave_description()}</AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>{m.common_button_cancel()}</AlertDialog.Cancel>
      <AlertDialog.Action
        onclick={() => {
          void leave();
        }}
      >
        {m.marathon_leave_confirm()}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
