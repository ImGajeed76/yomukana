<script lang="ts">
  import { Flame } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  interface Props {
    /** Whether today is read, which is what lights it. Unlit it is a grey outline. */
    isLit?: boolean;
    /** Its size, as a size utility. The heart scales with it. */
    class?: ClassValue;
  }

  let { isLit = true, class: className }: Props = $props();
</script>

<!--
  The streak's flame, the same wherever the streak is shown: orange, with a
  smaller yellow flame burning inside it, so it reads as fire and not as a
  shape. Decoration only: whatever shows it says what it means.
-->
<span class={["relative inline-flex shrink-0", className]} aria-hidden="true">
  {#if isLit}
    <Flame class="size-full fill-streak text-streak" />
    <Flame
      class="absolute bottom-[10%] left-1/4 size-1/2 fill-streak-core text-streak-core"
      strokeWidth={1}
    />
  {:else}
    <Flame class="size-full text-muted-foreground" />
  {/if}
</span>
