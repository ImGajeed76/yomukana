<script lang="ts">
  import { page } from "$app/state";
  import FollowingBoard from "$lib/components/FollowingBoard.svelte";
  import { Progress } from "$lib/db";
  import { m } from "$lib/paraglide/messages";
  import { demoBoard, demoProgress, scoreOf } from "$lib/stats";
  import { sync } from "$lib/sync/sync";

  const progress = new Progress();

  let score = $state(0);
  /** The email this device syncs as, or null, which decides what the board shows. */
  let account = $state<string | null>(null);
  /** Whether this page's sync has finished. The board loads without waiting for it. */
  let isSynced = $state(false);

  /** A made-up board in dev with `?demo`, for looking at it with people on it. */
  let isDemo = $derived(import.meta.env.DEV && page.url.searchParams.has("demo"));
  let demo = $derived(isDemo ? demoBoard(score, new Date()) : null);

  $effect(() => {
    void (async () => {
      if (isDemo) {
        score = scoreOf(demoProgress(new Date()).store, new Date());
        return;
      }
      score = scoreOf(await progress.load(), new Date());
      account = (await progress.syncState()).account;
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

  <div class="w-full max-w-[672px]">
    <FollowingBoard {account} {progress} {isSynced} ownScore={score} {demo} />
  </div>
</main>
