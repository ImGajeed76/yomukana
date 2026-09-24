<script lang="ts">
  import TypedKeys from "$lib/components/TypedKeys.svelte";
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

  // A word as the practice screen shows it once typed: each character with
  // what was typed for it underneath. Content, not copy, so not translated.
  const DEMO = [
    { kana: "ね", romaji: "ne" },
    { kana: "こ", romaji: "ko" },
  ] as const;
</script>

<!--
  Once, on a first visit. Someone who has just arrived wants three answers, in
  this order: what is this, what do I press, and what if I cannot read any of
  it. The title answers the first, the example the second, and the last line
  the third. The example does the explaining: it is the practice screen itself,
  small, so the reader has seen the exercise before they start it.
-->
<Dialog.Root bind:open>
  <Dialog.Content class="gap-6 text-center sm:max-w-[384px]" showCloseButton={false}>
    <Dialog.Header class="items-center text-center">
      <Dialog.Title class="text-2xl leading-tight font-semibold tracking-tight">
        {m.session_welcome_title()}
      </Dialog.Title>
    </Dialog.Header>

    <div class="flex justify-center rounded-lg bg-muted pt-6 pb-10" aria-hidden="true">
      <span class="font-japanese text-5xl leading-none" lang="ja">
        {#each DEMO as character (character.kana)}
          <span class="relative inline-block">
            {character.kana}<TypedKeys done={character.romaji} now="" stray="" />
          </span>
        {/each}
      </span>
    </div>

    <div class="flex flex-col gap-2 text-balance">
      <p>{m.session_welcome_how()}</p>
      <p class="text-muted-foreground">{m.session_welcome_stuck()}</p>
    </div>

    <Dialog.Close>
      {#snippet child({ props })}
        <Button {...props} size="lg" class="w-full">{m.session_welcome_button()}</Button>
      {/snippet}
    </Dialog.Close>
  </Dialog.Content>
</Dialog.Root>
