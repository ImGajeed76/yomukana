<script lang="ts">
  import { UserRoundX } from "@lucide/svelte";
  import { page } from "$app/state";
  import ProfileCard from "$lib/components/profile/ProfileCard.svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Progress } from "$lib/db";
  import { m } from "$lib/paraglide/messages";
  import { addFriend, removeFriendByName, type FriendProblem } from "$lib/sync/friends";
  import { viewProfile, viewProfileSignedOut, type ProfileView } from "$lib/sync/profile";

  const progress = new Progress();

  let username = $derived(page.params.username ?? "");

  /** Null while loading, "missing" for a name nobody has, "failed" when the server could not be reached. */
  let view = $state.raw<ProfileView | "missing" | "failed" | null>(null);
  let isSignedIn = $state(false);
  let isBusy = $state(false);
  let problem = $state<FriendProblem | null>(null);

  const PROBLEM_MESSAGES: Record<FriendProblem, () => string> = {
    "not-found": m.leaderboards_following_error_not_found,
    self: m.leaderboards_following_error_self,
    offline: m.leaderboards_following_error_offline,
    unknown: m.leaderboards_following_error_unknown,
  };

  async function load(name: string): Promise<void> {
    // Only a signed-in reader loads the sign-in code. Anyone else, someone
    // who just scanned a code, asks as nobody. See CLAUDE.md 1.7.
    // Loaded only for the sync state, which is where "signed in" is kept.
    await progress.load();
    isSignedIn = (await progress.syncState()).account !== null;
    const found = isSignedIn ? await viewProfile(name) : await viewProfileSignedOut(name);
    view = found ?? "failed";
  }

  $effect(() => {
    view = null;
    void load(username);
  });

  async function follow(): Promise<void> {
    if (view === null || typeof view === "string") return;
    isBusy = true;
    problem = await addFriend(view.username);
    if (problem === null) await load(view.username);
    isBusy = false;
  }

  async function unfollow(): Promise<void> {
    if (view === null || typeof view === "string") return;
    isBusy = true;
    problem = (await removeFriendByName(view.username)) ? null : "unknown";
    if (problem === null) await load(view.username);
    isBusy = false;
  }
</script>

<svelte:head>
  <title>@{username} · {m.common_app_name()}</title>
</svelte:head>

<main class="flex w-full flex-1 flex-col items-center">
  <div class="flex w-full max-w-[448px] flex-col gap-4">
    {#if view === null}
      <p class="text-sm text-muted-foreground" role="status">{m.profile_view_loading()}</p>
    {:else if view === "failed"}
      <p class="text-sm text-destructive" role="alert">{m.profile_view_error_load()}</p>
    {:else if view === "missing"}
      <div class="flex flex-col items-center gap-2 py-12 text-center">
        <UserRoundX class="size-6 text-muted-foreground" />
        <h1 class="text-lg leading-snug font-medium">{m.profile_view_missing_title()}</h1>
        <p class="text-sm text-muted-foreground">
          {m.profile_view_missing_description({ username })}
        </p>
      </div>
    {:else}
      <ProfileCard
        username={view.username}
        displayName={view.displayName}
        cardColor={view.cardColor}
        score={view.score}
      />

      <div class="flex flex-wrap gap-2">
        {#if view.isYou}
          <Button variant="outline" href="/settings/profile">{m.profile_view_button_edit()}</Button>
        {:else if !isSignedIn}
          <Button href="/account">{m.profile_view_button_sign_in()}</Button>
        {:else if view.isFollowed}
          <Button
            variant="outline"
            disabled={isBusy}
            onclick={() => {
              void unfollow();
            }}
          >
            {m.profile_view_button_unfollow()}
          </Button>
        {:else}
          <Button
            disabled={isBusy}
            onclick={() => {
              void follow();
            }}
          >
            {m.leaderboards_following_button_add()}
          </Button>
        {/if}
      </div>
      {#if problem !== null}
        <StatusLine message={PROBLEM_MESSAGES[problem]()} isError={true} />
      {/if}
    {/if}
  </div>
</main>
