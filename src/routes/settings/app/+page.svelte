<script lang="ts">
  import InstallSettings from "$lib/components/InstallSettings.svelte";
  import { install } from "$lib/install.svelte";
  import { m } from "$lib/paraglide/messages";
</script>

{#if install.route === "none"}
  <!--
    Said rather than left blank: the section is in the list either way, and an
    empty page would read as broken.
  -->
  <section class="flex flex-col gap-2 rounded-lg border border-border bg-card p-6">
    <h2 class="text-lg leading-snug font-medium">{m.settings_install_title()}</h2>
    <p class="text-sm text-muted-foreground">{m.settings_install_unavailable()}</p>
  </section>
{:else}
  <InstallSettings />
{/if}
