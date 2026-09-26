<script lang="ts">
  import { Plus } from "@lucide/svelte";
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import FollowingBoard from "$lib/components/FollowingBoard.svelte";
  import GlobalBoard from "$lib/components/GlobalBoard.svelte";
  import CreateGroupDialog from "$lib/components/groups/CreateGroupDialog.svelte";
  import GroupBoard from "$lib/components/groups/GroupBoard.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Progress } from "$lib/db";
  import { m } from "$lib/paraglide/messages";
  import { demoBoard, demoProgress, scoreOf } from "$lib/stats";
  import { lastShownGroups, listGroups, rememberGroups, type GroupSummary } from "$lib/sync/groups";
  import { sync } from "$lib/sync/sync";

  const progress = new Progress();

  /** What `board` holds when the board on show is the people the reader follows. */
  const FOLLOWING = "following";
  /** What `board` holds when the board on show is the global one. */
  const GLOBAL = "global";

  let score = $state(0);
  /** The email this device syncs as, or null, which decides what the board shows. */
  let account = $state<string | null>(null);
  /** Whether this page's sync has finished. The boards load without waiting for it. */
  let isSynced = $state(false);
  // Raw: replaced whole on every load, never edited in place. See CLAUDE.md 1.8.
  let groups = $state.raw<readonly GroupSummary[]>([]);
  /** The board on show: FOLLOWING, GLOBAL, or a group's id. */
  let board = $state(FOLLOWING);
  let isCreating = $state(false);
  /** A group just made, whose invite opens as soon as it loads. */
  let justCreated = $state<string | null>(null);

  /** A made-up board in dev with `?demo`, for looking at it with people on it. */
  let isDemo = $derived(import.meta.env.DEV && page.url.searchParams.has("demo"));
  let demo = $derived(isDemo ? demoBoard(score, new Date()) : null);

  async function refreshGroups(): Promise<void> {
    const result = await listGroups();
    if ("problem" in result) return;
    groups = result.value;
    await rememberGroups(progress, result.value);
  }

  /** Shows a board, and puts it in the address so a reload or a shared link lands on it. */
  function show(next: string): void {
    board = next;
    const url = new URL(location.href);
    if (next === FOLLOWING) url.searchParams.delete("board");
    else url.searchParams.set("board", next);
    replaceState(url, {});
  }

  $effect(() => {
    void (async () => {
      if (isDemo) {
        score = scoreOf(demoProgress(new Date()).store, new Date());
        return;
      }
      // Read here, in the browser: the page is prerendered, and there is no
      // address to read while it is.
      board = new URL(location.href).searchParams.get("board") ?? FOLLOWING;
      score = scoreOf(await progress.load(), new Date());
      account = (await progress.syncState()).account;
      if (account === null) return;
      groups = (await lastShownGroups(progress)) ?? [];
      void refreshGroups();
      if ((await sync(progress)) === "synced") score = scoreOf(progress.store, new Date());
      isSynced = true;
    })();
  });
</script>

<main class="flex w-full flex-1 flex-col gap-10">
  <div class="flex flex-col gap-2">
    <h1 class="text-3xl leading-tight font-semibold tracking-tight">
      {m.leaderboards_page_title()}
    </h1>
    <p class="text-sm text-muted-foreground">{m.leaderboards_page_description()}</p>
  </div>

  <div class="flex w-full max-w-[672px] flex-col gap-4">
    <!--
      The boards the reader has: the people they follow, then each group in
      the order they joined. A row that wraps rather than a menu, so every
      board is one tap away. See CLAUDE.md 12.7.
    -->
    {#if !isDemo}
      <div
        class="flex flex-wrap items-center gap-1"
        role="group"
        aria-label={m.leaderboards_groups_label_boards()}
      >
        {#each [{ id: FOLLOWING, name: m.leaderboards_following_title() }, { id: GLOBAL, name: m.leaderboards_global_title() }, ...groups] as option (option.id)}
          <Button
            variant="ghost"
            size="sm"
            class={option.id === board
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground"}
            aria-pressed={option.id === board}
            onclick={() => {
              show(option.id);
            }}
          >
            {option.name}
          </Button>
        {/each}
        {#if account !== null}
          <Button
            variant="ghost"
            size="sm"
            class="text-muted-foreground"
            onclick={() => {
              isCreating = true;
            }}
          >
            <Plus class="size-4" />
            {m.leaderboards_groups_create_title()}
          </Button>
        {/if}
      </div>
    {/if}

    {#if board === GLOBAL}
      <GlobalBoard {progress} {account} ownScore={score} />
    {:else if board === FOLLOWING || account === null}
      <FollowingBoard {account} {progress} {isSynced} ownScore={score} {demo} />
    {:else}
      <GroupBoard
        {progress}
        groupId={board}
        ownScore={score}
        isInviting={justCreated === board}
        onGone={() => {
          groups = groups.filter((group) => group.id !== board);
          show(FOLLOWING);
          void refreshGroups();
        }}
        onRenamed={(name: string) => {
          groups = groups.map((group) => (group.id === board ? { ...group, name } : group));
        }}
      />
    {/if}
  </div>
</main>

<CreateGroupDialog
  bind:open={isCreating}
  onCreated={(id: string) => {
    justCreated = id;
    show(id);
    void refreshGroups();
  }}
/>
