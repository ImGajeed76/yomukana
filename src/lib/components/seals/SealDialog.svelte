<script lang="ts">
  import { X } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { m } from "$lib/paraglide/messages";
  import { getLocale } from "$lib/paraglide/runtime";
  import type { Seal } from "$lib/sync/seal-rules";
  import SealArt from "./SealArt.svelte";
  import SealKanji from "./SealKanji.svelte";
  import {
    sealClassic,
    sealLine,
    sealMeaning,
    sealMotto,
    sealName,
    sealTierName,
  } from "./seal-copy";
  import { SEAL_POEMS } from "./seal-poems";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
    seal: Seal;
    /** When it was earned, in epoch milliseconds, or null where that is not known. */
    earnedAt: number | null;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { open = $bindable(), seal, earnedAt }: Props = $props();

  let name = $derived(sealName(seal, earnedAt));
  let poem = $derived(SEAL_POEMS[seal.kind]);
  let earned = $derived(
    earnedAt === null
      ? null
      : new Intl.DateTimeFormat(getLocale(), { dateStyle: "long" }).format(earnedAt),
  );

  // The banner is drawn for its own size, so it is measured.
  let width = $state(0);
  let height = $state(0);
</script>

<!--
  A seal, opened. Its art lies across the top of the card and breaks out over
  its edge, larger than it is worn: the same outline, scene and light, with
  the kanji drawn big and the name in brush script. Below it, how rare it
  is, what earned it, a line written for it, and a classical poem in the
  original with what it says, for a reader who is learning to read exactly
  that.
-->
<Dialog.Root bind:open>
  <Dialog.Content
    class="overflow-visible pt-0 sm:max-w-[448px]"
    data-seal-look={seal.look}
    showCloseButton={false}
  >
    <div
      class="banner relative -mx-2 -mt-16 h-36"
      bind:clientWidth={width}
      bind:clientHeight={height}
      aria-hidden="true"
    >
      {#if width > 0}<SealArt {seal} {width} {height} />{/if}
      <div class="banner-face">
        <span class="banner-kanji"><SealKanji kanji={seal.kanji} tier={seal.tier} /></span>
        <span class="flex min-w-0 flex-col gap-2">
          <span class="banner-name">{name}</span>
          <span class="banner-motto">{sealMotto(seal)}</span>
        </span>
      </div>
    </div>

    <div class="mt-4 flex flex-col gap-3">
      <!-- Close sits by the rarity, clear of the art, which fills the top. -->
      <div class="flex items-center justify-between">
        <span class="tier">{sealTierName(seal)}</span>
        <Dialog.Close>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon-sm" class="-mr-2">
              <X />
              <span class="sr-only">{m.common_button_close()}</span>
            </Button>
          {/snippet}
        </Dialog.Close>
      </div>
      <Dialog.Title class="text-2xl leading-tight font-semibold">
        {sealMeaning(seal, earnedAt)}
      </Dialog.Title>
      <Dialog.Description class="text-base text-muted-foreground">
        {sealLine(seal, earnedAt)}
      </Dialog.Description>
    </div>

    <!-- The classical poem, then when it was earned. -->
    <figure class="flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 p-5">
      <blockquote class="poem" lang="ja">{poem.text}</blockquote>
      <p class="text-sm text-muted-foreground italic">{sealClassic(seal)}</p>
      <figcaption class="flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
        <span lang="ja">{poem.author}</span>
        {#if earned !== null}
          <span>{m.seal_label_earned()} {earned}</span>
        {/if}
      </figcaption>
    </figure>
  </Dialog.Content>
</Dialog.Root>

<style>
  /* The art sets its strokes in em, so the banner's type size sets their weight. */
  .banner {
    font-size: 1.25rem;
    isolation: isolate;
  }

  .banner-face {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.9rem;
    height: 100%;
    padding: 0 1.6rem 0 1.2rem;
    color: var(--ink);
  }

  .banner-kanji {
    font-size: 2.9rem;
    line-height: 1;
  }

  .banner-name {
    font-family: var(--font-seal);
    font-size: 1.7rem;
    line-height: 1;
    text-shadow: 0 0.06em 0.2em oklch(from var(--body) calc(l - 0.3) c h / 60%);
  }

  .banner-motto {
    font-size: 0.55rem;
    font-weight: 600;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    opacity: 0.85;
  }

  /* How rare it is, in its glow, after a short rule in the same colour. */
  .tier {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--glow);
  }
  .tier::before {
    content: "";
    width: 1.5rem;
    height: 1px;
    background: var(--glow);
  }

  .poem {
    font-family: var(--font-seal);
    font-size: 1.35rem;
    line-height: 1.6;
  }
</style>
