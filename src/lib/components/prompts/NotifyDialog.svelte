<script lang="ts">
  import { Bell } from "@lucide/svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import StreakFlame from "$lib/components/streak/StreakFlame.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Label } from "$lib/components/ui/label";
  import { Spinner } from "$lib/components/ui/spinner";
  import { m } from "$lib/paraglide/messages";
  import { dismissPrompt, snoozePrompt } from "$lib/prompts";
  import { turnOnPush } from "$lib/sync/push";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { open = $bindable() }: Props = $props();

  let isNever = $state(false);
  let isTurningOn = $state(false);
  let problem = $state<"denied" | "service" | "failed" | null>(null);

  function decline(): void {
    if (isNever) dismissPrompt("notifications");
    else snoozePrompt("notifications", Date.now());
  }

  async function turnOn(): Promise<void> {
    isTurningOn = true;
    const outcome = await turnOnPush();
    isTurningOn = false;
    problem = outcome === "on" ? null : outcome;
    if (outcome !== "on") return;
    dismissPrompt("notifications");
    open = false;
  }
</script>

<!--
  The ask to turn on the streak reminder, on a goal day, for a signed-in
  reader whose browser can take pushes and who has not turned them on here.
  The streak's own flame, a title, a line, one button.
-->
<Dialog.Root
  bind:open
  onOpenChange={(isOpen: boolean) => {
    if (!isOpen) decline();
  }}
>
  <Dialog.Content class="items-center gap-5 text-center sm:max-w-[384px]">
    <StreakFlame class="mx-auto size-16" />
    <Dialog.Header class="items-center text-center">
      <Dialog.Title>{m.prompt_notify_title()}</Dialog.Title>
      <Dialog.Description class="text-balance">{m.prompt_notify_description()}</Dialog.Description>
    </Dialog.Header>

    <Button
      size="lg"
      class="w-full"
      disabled={isTurningOn}
      onclick={() => {
        void turnOn();
      }}
    >
      {#if isTurningOn}
        <Spinner aria-label={m.common_status_loading()} />
      {:else}
        <Bell class="size-4" />
      {/if}
      {m.prompt_notify_button()}
    </Button>

    {#if problem === "denied"}
      <StatusLine message={m.settings_notifications_error_denied()} isError={true} />
    {:else if problem === "service"}
      <StatusLine message={m.settings_notifications_error_service()} isError={true} />
    {:else if problem === "failed"}
      <StatusLine message={m.settings_profile_badges_error_save()} isError={true} />
    {/if}

    <div class="flex w-full items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <Checkbox id="notify-never" bind:checked={isNever} />
        <Label for="notify-never" class="text-sm font-normal text-muted-foreground">
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
