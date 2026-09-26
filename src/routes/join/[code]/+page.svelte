<script lang="ts">
  import { Clock, Users } from "@lucide/svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import { groupProblemMessage } from "$lib/components/groups/problems";
  import { Button } from "$lib/components/ui/button";
  import { Progress } from "$lib/db";
  import { m } from "$lib/paraglide/messages";
  import {
    joinGroup,
    previewInvite,
    type GroupProblem,
    type InvitePreview,
  } from "$lib/sync/groups";
  import { sync } from "$lib/sync/sync";

  const progress = new Progress();

  let code = $derived(page.params.code ?? "");
  let preview = $state.raw<InvitePreview | null>(null);
  /** Why the invite cannot be used, or null while it can. */
  let problem = $state<GroupProblem | null>(null);
  let isSignedIn = $state(false);
  let isJoining = $state(false);

  $effect(() => {
    const invite = code;
    void (async () => {
      await progress.load();
      isSignedIn = (await progress.syncState()).account !== null;
      const result = await previewInvite(invite, isSignedIn);
      if ("problem" in result) problem = result.problem;
      else preview = result.value;
    })();
  });

  function boardOf(id: string): string {
    return `/leaderboards?board=${id}`;
  }

  async function join(): Promise<void> {
    isJoining = true;
    // A reader who signed in but has not synced yet has no profile, and a
    // group needs one to show them. A sync makes it.
    await sync(progress);
    const result = await joinGroup(code);
    isJoining = false;
    if ("problem" in result) {
      problem = result.problem;
      return;
    }
    await goto(boardOf(result.value.id));
  }
</script>

<!--
  Where a scanned invite lands. Says what the group is before anyone joins,
  so nobody joins a board by accident, and asks a visitor with no account to
  sign in first.
-->
<main class="flex w-full flex-1 flex-col items-center">
  <div class="flex w-full max-w-[448px] flex-col gap-6">
    {#if problem === "expired" || problem === "not-found"}
      <div class="flex flex-col items-center gap-2 py-12 text-center">
        <Clock class="size-6 text-muted-foreground" />
        <h1 class="text-lg leading-snug font-medium">{m.leaderboards_groups_join_gone_title()}</h1>
        <p class="text-sm text-muted-foreground">{groupProblemMessage(problem)}</p>
      </div>
    {:else if preview === null}
      {#if problem === null}
        <p class="text-sm text-muted-foreground" role="status">
          {m.leaderboards_groups_join_loading()}
        </p>
      {:else}
        <p class="text-sm text-destructive" role="alert">{groupProblemMessage(problem)}</p>
      {/if}
    {:else}
      <section class="flex flex-col gap-5 rounded-lg border border-border bg-background p-6">
        <div class="flex flex-col gap-1">
          <p class="text-sm text-muted-foreground">{m.leaderboards_groups_join_invited()}</p>
          <h1 class="text-2xl leading-tight font-semibold tracking-tight">{preview.name}</h1>
          <p class="flex items-center gap-2 text-sm text-muted-foreground">
            <Users class="size-4" />
            {m.leaderboards_groups_label_members({ count: String(preview.memberCount) })}
          </p>
        </div>
        <p class="text-sm text-muted-foreground">{m.leaderboards_groups_join_description()}</p>
        <div class="flex flex-col gap-2">
          <div>
            {#if preview.isMember}
              <Button href={boardOf(preview.id)}>{m.leaderboards_groups_join_button_open()}</Button>
            {:else if !isSignedIn}
              <Button href="/account?next=/join/{code}"
                >{m.leaderboards_groups_join_button_sign_in()}</Button
              >
            {:else}
              <Button
                disabled={isJoining}
                onclick={() => {
                  void join();
                }}
              >
                {m.leaderboards_groups_join_button_join()}
              </Button>
            {/if}
          </div>
          {#if problem !== null}
            <StatusLine message={groupProblemMessage(problem)} isError={true} />
          {/if}
        </div>
      </section>
    {/if}
  </div>
</main>
