<script lang="ts">
  import type { ClassValue } from "svelte/elements";
  import type { Seal } from "$lib/sync/seal-rules";
  import SealKanji from "./SealKanji.svelte";
  import { sealMeaning, sealName } from "./seal-copy";
  import SealArt from "./SealArt.svelte";
  import SealDialog from "./SealDialog.svelte";

  interface Props {
    seal: Seal;
    /** When it was earned, in epoch milliseconds. 始 is named for it. */
    earnedAt?: number | null;
    /** Its size, as a text size utility. Worn on a card it is text-xs, like a group badge. */
    class?: ClassValue;
    /**
     * Whether it is drawn only, not something to press: inside a row that is
     * itself a button, such as the wear tray, where a button in a button is
     * not allowed.
     */
    isStatic?: boolean;
  }

  let { seal, earnedAt = null, class: className = "text-xs", isStatic = false }: Props = $props();

  let name = $derived(sealName(seal, earnedAt));
  let meaning = $derived(sealMeaning(seal, earnedAt));

  // The art is drawn for the seal's own size, so it is measured.
  let width = $state(0);
  let height = $state(0);

  let isOpen = $state(false);
</script>

<!--
  An achievement, worn like a group badge and close to its size, so
  everything on a card reads as one family: a kanji drawn as calligraphy, a
  hairline, a name. Built up in layers the rarer it is: a glossy body with
  its element painted inside, a bright rim, then a glow, then ribbons of
  light winding round it, and glints. Opened, it tells its story: see
  SealDialog.
-->
<svelte:element
  this={isStatic ? "span" : "button"}
  type={isStatic ? undefined : "button"}
  role={isStatic ? "img" : undefined}
  class={["seal", className]}
  data-tier={seal.tier}
  data-seal-look={seal.look}
  aria-label={`${name}: ${meaning}`}
  bind:clientWidth={width}
  bind:clientHeight={height}
  onclick={isStatic
    ? undefined
    : () => {
        isOpen = true;
      }}
>
  {#if width > 0}<SealArt {seal} {width} {height} />{/if}
  <SealKanji kanji={seal.kanji} tier={seal.tier} />
  <span class="seal-rule" aria-hidden="true"></span>
  <span class="seal-name" aria-hidden="true">{name}</span>
</svelte:element>

{#if !isStatic}<SealDialog bind:open={isOpen} {seal} {earnedAt} />{/if}

<style>
  .seal {
    position: relative;
    isolation: isolate;
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.35em;
    padding: 0.05em 0.95em 0.05em 0.45em;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    color: var(--ink);
    cursor: pointer;
    outline: none;
  }

  .seal:focus-visible :global(.seal-art) {
    outline: 2px solid var(--ring);
    outline-offset: 3px;
    border-radius: 9999px;
  }

  /* The hairline between the kanji and its name. */
  .seal-rule {
    width: 1px;
    height: 1.1em;
    background: oklch(from var(--ink) l c h / 40%);
  }

  .seal-name {
    text-shadow: 0 0.06em 0.1em oklch(from var(--body) calc(l - 0.3) c h / 50%);
  }
</style>
