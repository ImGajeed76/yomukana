<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Button } from "$lib/components/ui/button";
  import { Progress } from "$lib/db";
  import { m } from "$lib/paraglide/messages";
  import { deleteSyncedCopy, signOut } from "$lib/sync/account";

  const progress = new Progress();

  let isLoaded = $state(false);
  /** Whether the dialog is open, and whether it is past the point of no return. */
  let isAsking = $state(false);
  let isCleared = $state(false);
  let isClearing = $state(false);
  /** Whether the server copy could not be deleted, which stops the local one being deleted too. */
  let hasClearFailed = $state(false);
  /** The account this device syncs with, if any, which changes what deleting deletes. */
  let account = $state<string | null>(null);

  $effect(() => {
    void (async () => {
      await progress.load();
      account = (await progress.syncState()).account;
      isLoaded = true;
    })();
  });

  /**
   * Hands the reader a file. Nothing is uploaded: the export is built in the
   * browser and downloaded from a blob URL that never leaves it.
   */
  async function exportData(): Promise<void> {
    const data = await progress.exportAll();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = `yomukana-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function clearData(): Promise<void> {
    isClearing = true;
    hasClearFailed = false;
    // The server copy goes first. If it cannot be reached, nothing is deleted:
    // a reader who deleted everything and found it all back on their next
    // sign-in would have been lied to.
    if (account !== null && !(await deleteSyncedCopy())) {
      hasClearFailed = true;
      isClearing = false;
      return;
    }
    if (account !== null) await signOut(progress);
    await progress.clear();
    account = null;
    isClearing = false;
    isCleared = true;
  }

  function onDialogOpen(open: boolean): void {
    isAsking = open;
    // Closing puts it back to asking, so opening it again does not reopen on
    // last time's confirmation.
    if (!open) {
      isCleared = false;
      hasClearFailed = false;
    }
  }
</script>

<!--
    The sentence saying nothing leaves the browser is the reason this page
    exists, so it reads first, at a width that can actually be read, and the two
    buttons follow it.
  -->
<section class="flex flex-col gap-5 rounded-lg border border-border bg-card p-6">
  <div class="flex flex-col gap-2">
    <h2 class="text-lg leading-snug font-medium">{m.settings_data_title()}</h2>
    <p class="max-w-[672px] text-sm text-muted-foreground">{m.settings_data_description()}</p>
  </div>

  <div class="flex flex-wrap items-center gap-3">
    <Button
      variant="outline"
      disabled={!isLoaded}
      onclick={() => {
        void exportData();
      }}
    >
      {m.settings_data_button_export()}
    </Button>

    <!--
        Irreversible, with no copy anywhere else, so it asks first and says what
        will be lost rather than asking whether the reader is sure.
        See CLAUDE.md 12.4.
      -->
    <AlertDialog.Root bind:open={isAsking} onOpenChange={onDialogOpen}>
      <AlertDialog.Trigger>
        {#snippet child({ props })}
          <Button {...props} variant="destructive" disabled={!isLoaded}>
            {m.settings_data_button_clear()}
          </Button>
        {/snippet}
      </AlertDialog.Trigger>
      <AlertDialog.Content>
        <!--
            The dialog answers where it asked. Left unchanged, the one
            irreversible action in the app looked like the one that did nothing,
            and the reader is looking at the dialog: that is where focus is
            trapped. See CLAUDE.md 12.1.
          -->
        {#if isCleared}
          <AlertDialog.Header>
            <AlertDialog.Title>{m.settings_delete_done_title()}</AlertDialog.Title>
            <AlertDialog.Description>{m.settings_delete_done()}</AlertDialog.Description>
          </AlertDialog.Header>
          <AlertDialog.Footer>
            <!-- A real restart: the practice page builds a fresh reader on mount. -->
            <Button href="/">{m.stats_empty_button()}</Button>
          </AlertDialog.Footer>
        {:else}
          <AlertDialog.Header>
            <AlertDialog.Title>{m.settings_delete_title()}</AlertDialog.Title>
            <AlertDialog.Description>
              {account === null
                ? m.settings_delete_description()
                : m.settings_delete_description_synced()}
            </AlertDialog.Description>
          </AlertDialog.Header>
          {#if hasClearFailed}
            <p class="text-sm text-destructive" role="alert">{m.settings_delete_error_sync()}</p>
          {/if}
          <AlertDialog.Footer>
            <AlertDialog.Cancel>{m.common_button_cancel()}</AlertDialog.Cancel>
            <!--
                A plain button, not AlertDialog.Action: the Action closes the
                dialog on click, and there is something left to say afterwards.
              -->
            <Button
              variant="destructive"
              disabled={isClearing}
              onclick={() => {
                void clearData();
              }}
            >
              {m.settings_delete_confirm()}
            </Button>
          </AlertDialog.Footer>
        {/if}
      </AlertDialog.Content>
    </AlertDialog.Root>
  </div>
</section>
