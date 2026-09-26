<script lang="ts">
  import UsernameDialog from "$lib/components/UsernameDialog.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Progress } from "$lib/db";
  import { m } from "$lib/paraglide/messages";
  import { ownUsername } from "$lib/sync/friends";
  import { sync } from "$lib/sync/sync";

  const progress = new Progress();

  let isLoaded = $state(false);
  let account = $state<string | null>(null);
  let username = $state<string | null>(null);
  let isRenaming = $state(false);

  $effect(() => {
    void (async () => {
      await progress.load();
      account = (await progress.syncState()).account;
      if (account !== null) {
        // A profile is made on the first sync, so a reader who just signed in
        // may not have one until this has run.
        await sync(progress);
        username = await ownUsername();
      }
      isLoaded = true;
    })();
  });
</script>

<section class="flex flex-col gap-5 rounded-lg border border-border bg-card p-6">
  <h2 class="text-lg leading-snug font-medium">{m.settings_profile_title()}</h2>

  {#if !isLoaded}
    <p class="text-sm text-muted-foreground" role="status">{m.settings_profile_loading()}</p>
  {:else if account === null}
    <!-- A profile is part of an account, which is a choice. See CLAUDE.md 1.7. -->
    <p class="text-sm text-muted-foreground">{m.settings_profile_signed_out()}</p>
    <div>
      <Button href="/account">{m.settings_sync_button_sign_in()}</Button>
    </div>
  {:else if username === null}
    <p class="text-sm text-destructive" role="alert">{m.settings_profile_error_load()}</p>
  {:else}
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex flex-col gap-1">
        <span class="text-sm text-muted-foreground"
          >{m.leaderboards_following_label_username()}</span
        >
        <span class="font-medium">{username}</span>
      </div>
      <Button
        variant="outline"
        onclick={() => {
          isRenaming = true;
        }}
      >
        {m.settings_profile_button_change()}
      </Button>
    </div>

    <UsernameDialog
      bind:open={isRenaming}
      current={username}
      onSaved={(renamed: string) => {
        username = renamed;
      }}
    />
  {/if}
</section>
