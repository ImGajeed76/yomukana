<script lang="ts">
  import { Share } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { install } from "$lib/install.svelte";
  import { m } from "$lib/paraglide/messages";

  let isPrompting = $state(false);

  async function openInstallDialog(): Promise<void> {
    isPrompting = true;
    await install.prompt();
    isPrompting = false;
  }
</script>

<!--
  Only where installing is possible and not yet done. A card that can only say
  "your browser cannot do this" would be one more thing to read for nothing.
-->
{#if install.route !== "none"}
  <section
    class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-6"
  >
    <div class="flex max-w-[672px] flex-col gap-2">
      <h2 class="text-lg leading-snug font-medium">{m.settings_install_title()}</h2>
      <p class="text-sm text-muted-foreground">{m.settings_install_description()}</p>
      {#if install.route === "home-screen"}
        <!--
          Safari gives a page no way to do this itself, so the most it can do
          is say where the button is. The icon is the one on Safari's toolbar.
        -->
        <p class="flex items-center gap-2 text-sm">
          <Share class="size-4 shrink-0" aria-hidden="true" />
          {m.settings_install_home_screen()}
        </p>
      {/if}
    </div>

    {#if install.route === "prompt"}
      <Button
        disabled={isPrompting}
        onclick={() => {
          void openInstallDialog();
        }}
      >
        {m.settings_install_button()}
      </Button>
    {/if}
  </section>
{/if}
