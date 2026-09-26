<script lang="ts">
  import { Check, Copy, Pencil } from "@lucide/svelte";
  import ProfileCard from "$lib/components/profile/ProfileCard.svelte";
  import QrCode from "$lib/components/profile/QrCode.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Progress } from "$lib/db";
  import { m } from "$lib/paraglide/messages";
  import { scoreOf } from "$lib/stats";
  import { showOwnProfile, type Profile } from "$lib/sync/profile";

  const progress = new Progress();

  let isLoaded = $state(false);
  let account = $state<string | null>(null);
  let profile = $state.raw<Profile | null>(null);
  let hasFailed = $state(false);
  let score = $state(0);
  let isCopied = $state(false);

  $effect(() => {
    void (async () => {
      score = scoreOf(await progress.load(), new Date());
      account = (await progress.syncState()).account;
      isLoaded = true;
      if (account === null) return;
      // No sync here: this page is for holding a phone up to someone, and the
      // card's score is worked out on this device anyway.
      hasFailed = !(await showOwnProfile(progress, (next) => (profile = next)));
    })();
  });

  let link = $derived(profile === null ? "" : `${location.origin}/@${profile.username}`);

  async function copyLink(): Promise<void> {
    await navigator.clipboard.writeText(link);
    isCopied = true;
    setTimeout(() => {
      isCopied = false;
    }, 1500);
  }
</script>

<!--
  Your card, and under it the code that opens it. Made for a phone held up to
  someone: the code is as wide as the screen, so it scans from across a table.
-->
<main class="flex w-full flex-1 flex-col items-center">
  <div class="flex w-full max-w-[448px] flex-col gap-6">
    {#if !isLoaded}
      <p class="text-sm text-muted-foreground" role="status">{m.settings_profile_loading()}</p>
    {:else if account === null}
      <div class="flex flex-col gap-4">
        <h1 class="text-3xl leading-tight font-semibold tracking-tight">
          {m.settings_profile_title()}
        </h1>
        <p class="text-sm text-muted-foreground">{m.settings_profile_signed_out()}</p>
        <div>
          <Button href="/account?next=/me">{m.settings_sync_button_sign_in()}</Button>
        </div>
      </div>
    {:else if profile === null}
      {#if hasFailed}
        <p class="text-sm text-destructive" role="alert">{m.settings_profile_error_load()}</p>
      {:else}
        <p class="text-sm text-muted-foreground" role="status">{m.settings_profile_loading()}</p>
      {/if}
    {:else}
      <ProfileCard
        username={profile.username}
        displayName={profile.displayName}
        cardColor={profile.cardColor}
        {score}
      />
      <QrCode value={link} label={m.settings_profile_label_qr()} class="w-full" />
      <div class="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onclick={() => {
            void copyLink();
          }}
        >
          {#if isCopied}
            <Check class="size-4" />
            {m.leaderboards_following_status_copied()}
          {:else}
            <Copy class="size-4" />
            {m.settings_profile_button_copy_link()}
          {/if}
        </Button>
        <Button variant="ghost" href="/settings/profile">
          <Pencil class="size-4" />
          {m.profile_view_button_edit()}
        </Button>
      </div>
    {/if}
  </div>
</main>
