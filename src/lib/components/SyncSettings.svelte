<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { Progress } from "$lib/db";
  import { m } from "$lib/paraglide/messages";
  import { getLocale } from "$lib/paraglide/runtime";
  import { signOut } from "$lib/sync/account";
  import { sync, type SyncOutcome } from "$lib/sync/sync";

  interface Props {
    progress: Progress;
    /** Whether stored progress has been read back, so the account is known. */
    isLoaded: boolean;
    /**
     * The email this device syncs as, or null. Bound, because the page deletes
     * everything too and signs the device out when it does.
     */
    account: string | null;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { progress, isLoaded, account = $bindable() }: Props = $props();

  let syncedAt = $state<number | null>(null);
  let outcome = $state<SyncOutcome | null>(null);
  let isSyncing = $state(false);
  /** An expired sign-in counts as signed out, with a line saying why. */
  let isSignedIn = $derived(account !== null && outcome !== "expired");

  // Syncs on opening the page, which also finds out whether the sign-in is
  // still good. Coming straight from signing in, it is the first sync.
  $effect(() => {
    if (!isLoaded || account === null) return;
    void syncNow();
  });

  async function syncNow(): Promise<void> {
    isSyncing = true;
    outcome = await sync(progress);
    syncedAt = (await progress.syncState()).syncedAt;
    isSyncing = false;
  }

  async function leave(): Promise<void> {
    await signOut(progress);
    account = null;
    outcome = null;
    syncedAt = null;
  }

  /** "3 minutes ago", in the reader's language, from the largest unit that fits. */
  function ago(at: number): string {
    const seconds = Math.round((at - Date.now()) / 1000);
    const format = new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" });
    if (seconds > -3600) return format.format(Math.round(seconds / 60), "minute");
    if (seconds > -86_400) return format.format(Math.round(seconds / 3600), "hour");
    return format.format(Math.round(seconds / 86_400), "day");
  }

  let status = $derived.by(() => {
    if (isSyncing) return m.settings_sync_status_syncing();
    if (outcome === "failed") return m.settings_sync_error_failed();
    if (syncedAt === null) return m.settings_sync_status_never();
    if (Date.now() - syncedAt < 60_000) return m.settings_sync_status_just_now();
    return m.settings_sync_status_synced({ when: ago(syncedAt) });
  });
</script>

<section class="flex flex-col gap-5 rounded-lg border border-border bg-card p-6">
  <div class="flex flex-col gap-2">
    <h2 class="text-lg leading-snug font-medium">{m.settings_sync_title()}</h2>
    {#if isSignedIn}
      <p class="text-sm">{m.settings_sync_label_account({ email: account ?? "" })}</p>
      <p class="text-sm text-muted-foreground" aria-live="polite">{status}</p>
    {:else}
      <p class="max-w-[672px] text-sm text-muted-foreground">{m.settings_sync_description()}</p>
    {/if}
  </div>

  {#if isSignedIn}
    <div class="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        disabled={isSyncing}
        onclick={() => {
          void syncNow();
        }}
      >
        {m.settings_sync_button_now()}
      </Button>
      <Button
        variant="ghost"
        onclick={() => {
          void leave();
        }}
      >
        {m.settings_sync_button_sign_out()}
      </Button>
    </div>
  {:else}
    {#if outcome === "expired"}
      <p class="text-sm text-destructive" role="alert">{m.settings_sync_error_expired()}</p>
    {/if}
    <div>
      <Button href="/account">{m.settings_sync_button_sign_in()}</Button>
    </div>
  {/if}
</section>
