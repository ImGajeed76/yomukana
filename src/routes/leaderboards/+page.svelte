<script lang="ts">
  import { Camera, Plus } from "@lucide/svelte";
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import BoardOverview from "$lib/components/BoardOverview.svelte";
  import FollowingBoard from "$lib/components/FollowingBoard.svelte";
  import GlobalBoard from "$lib/components/GlobalBoard.svelte";
  import AddBoardDialog from "$lib/components/AddBoardDialog.svelte";
  import MarathonBoard from "$lib/components/marathons/MarathonBoard.svelte";
  import ScanDialog from "$lib/components/ScanDialog.svelte";
  import GroupBoard from "$lib/components/groups/GroupBoard.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Progress } from "$lib/db";
  import { m } from "$lib/paraglide/messages";
  import { demoBoard, demoProgress, loadTextShare, scoreOf } from "$lib/stats";
  import {
    lastShownStandings,
    loadStandings,
    rememberStandings,
    type Standings,
  } from "$lib/sync/boards";
  import { canScan } from "$lib/qr/scanner";
  import { loadMarathons, type MarathonSummary } from "$lib/sync/marathons";
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
  /** Where the reader stands on every board, which also lists their groups. */
  let standings = $state.raw<Standings | null>(null);
  let groups = $derived(standings?.groups ?? []);
  // Raw: replaced whole on every load. See CLAUDE.md 1.8.
  /** The marathons the reader is in, newest first. */
  let marathons = $state.raw<readonly MarathonSummary[]>([]);

  /** What `board` holds for a marathon: its id after this. */
  const MARATHON = "marathon:";

  async function refreshMarathons(): Promise<void> {
    const result = await loadMarathons();
    if ("value" in result) marathons = result.value;
  }
  /** The board on show: FOLLOWING, GLOBAL, a group's id, or MARATHON and a marathon's id. */
  let board = $state(FOLLOWING);
  let isCreating = $state(false);
  /** Whether this is a phone or tablet with a camera, the only kind anyone scans with. */
  let isScanner = $state(false);
  let isScanning = $state(false);

  $effect(() => {
    void canScan().then((result) => {
      isScanner = result;
    });
  });
  /** A group just made, whose invite opens as soon as it loads. */
  let justCreated = $state<string | null>(null);

  /** A made-up board in dev with `?demo`, for looking at it with people on it. */
  let isDemo = $derived(import.meta.env.DEV && page.url.searchParams.has("demo"));
  let demo = $derived(isDemo ? demoBoard(score, new Date()) : null);

  async function refreshStandings(): Promise<void> {
    const fresh = await loadStandings();
    if (fresh === null) return;
    standings = fresh;
    await rememberStandings(progress, fresh);
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
      const share = await loadTextShare();
      if (isDemo) {
        score = scoreOf(demoProgress(new Date(), share).store, new Date(), share);
        return;
      }
      // Read here, in the browser: the page is prerendered, and there is no
      // address to read while it is.
      board = new URL(location.href).searchParams.get("board") ?? FOLLOWING;
      score = scoreOf(await progress.load(), new Date(), share);
      account = (await progress.syncState()).account;
      if (account === null) return;
      standings = await lastShownStandings(progress);
      void refreshStandings();
      void refreshMarathons();
      if ((await sync(progress)) === "synced") {
        score = scoreOf(progress.store, new Date(), share);
        // Asked again once the score just synced is on the server, so the
        // places match the score shown beside them.
        void refreshStandings();
      }
      isSynced = true;
    })();
  });
</script>

<main class="flex w-full flex-1 flex-col gap-8">
  <!--
    The scanner sits here, on the page where following and joining happen,
    and only on a phone: nobody holds a laptop up to a code.
  -->
  <div class="flex items-center justify-between gap-4">
    <h1 class="text-3xl leading-tight font-semibold tracking-tight">
      {m.leaderboards_page_title()}
    </h1>
    {#if isScanner && !isDemo}
      <Button
        variant="ghost"
        size="icon"
        class="-mr-2 size-11"
        aria-label={m.leaderboards_scan_button()}
        title={m.leaderboards_scan_button()}
        onclick={() => {
          isScanning = true;
        }}
      >
        <Camera class="size-6" />
      </Button>
    {/if}
  </div>

  <!--
    On a wide screen, every board and your place on it on the left, and the
    board you picked on the right. On a narrow one there is no room for both,
    so the boards become a row of tabs above the one on show.
  -->
  <div class="grid gap-6 lg:grid-cols-5 lg:items-start">
    {#if !isDemo}
      <div class="hidden lg:col-span-2 lg:block">
        <BoardOverview
          {standings}
          {marathons}
          {score}
          isSignedIn={account !== null}
          selected={board}
          onSelect={show}
          onCreate={() => {
            isCreating = true;
          }}
        />
      </div>
    {/if}

    <div class="flex min-w-0 flex-col gap-4 lg:col-span-3">
      {#if !isDemo}
        <div
          class="flex flex-wrap items-center gap-1 lg:hidden"
          role="group"
          aria-label={m.leaderboards_groups_label_boards()}
        >
          {#each [{ id: FOLLOWING, name: m.leaderboards_following_title() }, { id: GLOBAL, name: m.leaderboards_global_title() }, ...groups, ...marathons.map( (marathon) => ({ id: `${MARATHON}${marathon.id}`, name: marathon.name }) )] as option (option.id)}
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
              {m.leaderboards_groups_button_add()}
            </Button>
          {/if}
        </div>
      {/if}

      {#if board === GLOBAL}
        <GlobalBoard {progress} {account} ownScore={score} />
      {:else if board.startsWith(MARATHON) && account !== null}
        <MarathonBoard
          {progress}
          marathonId={board.slice(MARATHON.length)}
          isInviting={justCreated === board}
          onGone={() => {
            show(FOLLOWING);
            void refreshMarathons();
          }}
        />
      {:else if board === FOLLOWING || account === null}
        <FollowingBoard {account} {progress} {isSynced} ownScore={score} {demo} />
      {:else}
        <GroupBoard
          {progress}
          groupId={board}
          ownScore={score}
          isInviting={justCreated === board}
          onGone={() => {
            show(FOLLOWING);
            void refreshStandings();
          }}
          onRenamed={() => {
            void refreshStandings();
          }}
        />
      {/if}
    </div>
  </div>
</main>

<AddBoardDialog
  bind:open={isCreating}
  onCreated={(made: { kind: "group" | "marathon"; id: string }) => {
    const id = made.kind === "marathon" ? `${MARATHON}${made.id}` : made.id;
    justCreated = id;
    show(id);
    if (made.kind === "marathon") void refreshMarathons();
    else void refreshStandings();
  }}
/>

<ScanDialog bind:open={isScanning} />
