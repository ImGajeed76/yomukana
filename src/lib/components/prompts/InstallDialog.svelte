<script lang="ts">
  import { Share } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Label } from "$lib/components/ui/label";
  import { install } from "$lib/install.svelte";
  import { m } from "$lib/paraglide/messages";
  import { dismissPrompt, snoozePrompt } from "$lib/prompts";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { open = $bindable() }: Props = $props();

  let isNever = $state(false);
  let isPrompting = $state(false);

  function decline(): void {
    if (isNever) dismissPrompt("install");
    else snoozePrompt("install", Date.now());
  }

  async function installNow(): Promise<void> {
    isPrompting = true;
    const isInstalled = await install.prompt();
    isPrompting = false;
    if (isInstalled) dismissPrompt("install");
    else decline();
    open = false;
  }
</script>

<!--
  The ask to install, for a reader who has come back on another day and whose
  browser can do it. A title, the app icon, a line, one button. On iPhone and
  iPad no page can install itself, so it says where Safari's Share button is
  instead, and the reader closes it when done.
-->
<Dialog.Root
  bind:open
  onOpenChange={(isOpen: boolean) => {
    if (!isOpen) decline();
  }}
>
  <Dialog.Content class="items-center gap-5 text-center sm:max-w-[384px]">
    <img src="/icons/icon-192.png" alt="" class="mx-auto size-20 rounded-2xl shadow-md" />
    <Dialog.Header class="items-center text-center">
      <Dialog.Title>{m.prompt_install_title()}</Dialog.Title>
      <Dialog.Description class="text-balance">{m.prompt_install_description()}</Dialog.Description>
    </Dialog.Header>

    {#if install.route === "home-screen"}
      <p class="flex items-center justify-center gap-2 text-sm">
        <Share class="size-4 shrink-0" aria-hidden="true" />
        {m.settings_install_home_screen()}
      </p>
    {:else}
      <Button
        size="lg"
        class="w-full"
        disabled={isPrompting}
        onclick={() => {
          void installNow();
        }}
      >
        {m.prompt_install_button()}
      </Button>
    {/if}

    <div class="flex w-full items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <Checkbox id="install-never" bind:checked={isNever} />
        <Label for="install-never" class="text-sm font-normal text-muted-foreground">
          {m.prompt_label_never()}
        </Label>
      </div>
      <Button
        variant="ghost"
        size="sm"
        class="-mr-3"
        onclick={() => {
          open = false;
          decline();
        }}
      >
        {m.prompt_button_later()}
      </Button>
    </div>
  </Dialog.Content>
</Dialog.Root>
