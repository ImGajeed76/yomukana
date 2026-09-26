<script lang="ts">
  import SyncSettings from "$lib/components/SyncSettings.svelte";
  import { Progress } from "$lib/db";

  const progress = new Progress();

  let isLoaded = $state(false);
  let account = $state<string | null>(null);

  $effect(() => {
    void (async () => {
      await progress.load();
      account = (await progress.syncState()).account;
      isLoaded = true;
    })();
  });
</script>

<SyncSettings {progress} {isLoaded} bind:account />
