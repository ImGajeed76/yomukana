<script lang="ts">
  import type { ClassValue } from "svelte/elements";
  import { BADGE_STYLES } from "$lib/components/profile/colors";
  import type { Badge } from "$lib/sync/badge-rules";

  interface Props {
    badge: Badge;
    class?: ClassValue;
  }

  let { badge, class: className }: Props = $props();
</script>

<!--
  A group's badge: its tag, and emoji if it has one, as a tinted pill, like a
  server tag on Discord. The tag is read out as it is written, so it needs no
  label of its own.
-->
<span
  class={[
    "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-none font-semibold whitespace-nowrap ring-1 ring-inset",
    BADGE_STYLES[badge.color],
    className,
  ]}
>
  {#if badge.emoji !== null}<span aria-hidden="true">{badge.emoji}</span>{/if}{badge.tag}
</span>
