<script lang="ts">
  import { Maximize, Minimize } from "@lucide/svelte";
  import { page } from "$app/state";
  import { CARD_BACKGROUNDS } from "$lib/components/profile/colors";
  import { groupProblemMessage } from "$lib/components/groups/problems";
  import { Button } from "$lib/components/ui/button";
  import { m } from "$lib/paraglide/messages";
  import { nameOf, rankBoard } from "$lib/sync/board";
  import {
    boardOf,
    loadDisplayBoard,
    type DisplayBoard,
    type GroupProblem,
  } from "$lib/sync/groups";

  let code = $derived(page.params.code ?? "");
  let board = $state.raw<DisplayBoard | null>(null);
  let problem = $state<GroupProblem | null>(null);
  let isFullscreen = $state(false);

  /**
   * How often the screen asks again. Scores arrive with each reader's sync,
   * between sentences, so a minute is as fresh as they get, and a screen left
   * on all day asks a few hundred times rather than thousands.
   */
  const REFRESH_MS = 60_000;
  /** As many lines as a classroom can read from the back. */
  const SHOWN = 20;

  async function refresh(invite: string): Promise<void> {
    const result = await loadDisplayBoard(invite);
    if ("problem" in result) {
      // A screen that loses its connection keeps the last board it had.
      if (board === null || result.problem === "not-found") problem = result.problem;
      return;
    }
    problem = null;
    board = result.value;
  }

  $effect(() => {
    const invite = code;
    void refresh(invite);
    const timer = setInterval(() => {
      void refresh(invite);
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  });

  $effect(() => {
    const track = (): void => {
      isFullscreen = document.fullscreenElement !== null;
    };
    document.addEventListener("fullscreenchange", track);
    return () => {
      document.removeEventListener("fullscreenchange", track);
    };
  });

  let ranked = $derived(board === null ? [] : rankBoard(boardOf(board.members), 0).slice(0, SHOWN));
  let colors = $derived(
    new Map(board?.members.map((member) => [member.username, member.cardColor]) ?? []),
  );

  async function toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement === null) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }
</script>

<svelte:head>
  <title>{board?.name ?? m.common_app_name()}</title>
</svelte:head>

<!--
  A group's board for a screen in a classroom. No navigation and no sign-in:
  the screen belongs to nobody. Big enough to read from the back of the room.
-->
<main class="flex w-full flex-1 flex-col gap-8 p-8 lg:p-12">
  {#if board === null}
    {#if problem === null}
      <p class="text-muted-foreground" role="status">{m.leaderboards_following_loading()}</p>
    {:else}
      <p class="text-destructive" role="alert">
        {problem === "not-found"
          ? m.leaderboards_groups_display_gone()
          : groupProblemMessage(problem)}
      </p>
    {/if}
  {:else}
    <header class="flex items-center justify-between gap-4">
      <div class="flex flex-col">
        <h1 class="text-4xl leading-tight font-semibold tracking-tight">{board.name}</h1>
        <span class="text-muted-foreground">{m.common_app_name()}</span>
      </div>
      {#if document.fullscreenEnabled}
        <Button
          variant="ghost"
          size="icon"
          aria-label={isFullscreen
            ? m.leaderboards_groups_display_button_exit()
            : m.leaderboards_groups_display_button_fullscreen()}
          title={isFullscreen
            ? m.leaderboards_groups_display_button_exit()
            : m.leaderboards_groups_display_button_fullscreen()}
          onclick={() => {
            void toggleFullscreen();
          }}
        >
          {#if isFullscreen}
            <Minimize class="size-5" />
          {:else}
            <Maximize class="size-5" />
          {/if}
        </Button>
      {/if}
    </header>
    <!--
      One column while it fits. Past ten lines, two, filled down the first
      column before the second, so the order still reads top to bottom.
    -->
    <ol
      class={[
        "grid gap-x-12 gap-y-3",
        ranked.length > 10 ? "lg:grid-flow-col lg:grid-cols-2 lg:grid-rows-10" : "max-w-[896px]",
      ]}
    >
      {#each ranked as entry (entry.userId)}
        <li class="flex items-center gap-4 text-2xl">
          <span class="w-10 shrink-0 text-muted-foreground tabular-nums">{entry.rank}</span>
          <span
            class={[
              "size-4 shrink-0 rounded-full",
              CARD_BACKGROUNDS[colors.get(entry.username) ?? "green"],
            ]}
            aria-hidden="true"
          ></span>
          <!-- The username beside a display name, as on every board. See BoardList. -->
          <span class="flex min-w-0 flex-1 items-baseline gap-3">
            <span class="max-w-full shrink-0 truncate">{nameOf(entry)}</span>
            {#if entry.displayName !== null}
              <span class="min-w-0 truncate text-lg text-muted-foreground">@{entry.username}</span>
            {/if}
          </span>
          <span class="shrink-0 font-semibold tabular-nums">{Math.round(entry.score)}</span>
        </li>
      {/each}
    </ol>
  {/if}
</main>
