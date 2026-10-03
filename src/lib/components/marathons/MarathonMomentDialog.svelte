<script lang="ts">
  import type { Component } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
    icon: Component<{ class?: string }>;
    title: string;
    description: string;
    action: string;
    /** What the button does besides closing. Without it, it only closes. */
    onAction?: () => void;
    /** A quiet second way out, like "Later". Without it, closing is the only other way. */
    secondary?: string;
  }

  let {
    // `$bindable()` marks the prop as bindable, it is not a default. The rule
    // cannot tell a rune from a value.
    // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
    open = $bindable(),
    icon: Icon,
    title,
    description,
    action,
    onAction,
    secondary,
  }: Props = $props();
</script>

<!--
  A marathon's moments worth stopping for: it started, you reached the top
  three, it is over. Built like the streak's: a picture, a title, a line, one
  button. See CLAUDE.md 12 on dialogs for people who do not read them.
-->
<Dialog.Root bind:open>
  <Dialog.Content class="items-center gap-5 text-center sm:max-w-[384px]">
    <Icon class="mx-auto size-12 text-primary" />
    <Dialog.Header class="items-center text-center">
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description class="text-balance">{description}</Dialog.Description>
    </Dialog.Header>
    <div class="flex w-full flex-col gap-2">
      <Button
        size="lg"
        class="w-full"
        onclick={() => {
          open = false;
          onAction?.();
        }}
      >
        {action}
      </Button>
      {#if secondary !== undefined}
        <Button
          variant="ghost"
          class="w-full"
          onclick={() => {
            open = false;
          }}
        >
          {secondary}
        </Button>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
