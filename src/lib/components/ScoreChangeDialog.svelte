<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { m } from "$lib/paraglide/messages";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { open = $bindable() }: Props = $props();
</script>

<!--
  Once, for readers who had a score before it changed in September 2026: their
  number is different, and nothing else on screen would say why. An apology
  people actually read: a title, a picture, two short lines.
-->
<Dialog.Root bind:open>
  <Dialog.Content class="gap-6 text-center sm:max-w-[384px]" showCloseButton={false}>
    <Dialog.Header class="items-center text-center">
      <Dialog.Title class="text-2xl leading-tight font-semibold tracking-tight">
        {m.session_score_change_title()}
      </Dialog.Title>
    </Dialog.Header>

    <img
      src="/images/sorry-cat.webp"
      alt={m.session_score_change_image_alt()}
      width="240"
      height="240"
      class="mx-auto size-60 rounded-lg object-cover"
    />

    <div class="flex flex-col gap-2 text-balance">
      <p>{m.session_score_change_what()}</p>
      <p class="text-muted-foreground">{m.session_score_change_kept()}</p>
    </div>

    <Dialog.Close>
      {#snippet child({ props })}
        <Button {...props} size="lg" class="w-full">{m.session_score_change_button()}</Button>
      {/snippet}
    </Dialog.Close>
  </Dialog.Content>
</Dialog.Root>
