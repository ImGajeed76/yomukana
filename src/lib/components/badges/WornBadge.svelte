<script lang="ts">
  import type { ClassValue } from "svelte/elements";
  import GroupBadge from "./GroupBadge.svelte";
  import SealPill from "$lib/components/seals/SealPill.svelte";
  import { isWornSeal, type Worn } from "$lib/sync/badge-rules";
  import { sealOf } from "$lib/sync/seal-rules";

  interface Props {
    worn: Worn;
    /** For a group badge. */
    class?: ClassValue;
    /** For a seal, which sizes itself by its text size: text-xs unless this says otherwise. */
    sealClass?: ClassValue;
  }

  let { worn, class: className, sealClass = "text-xs" }: Props = $props();

  // A seal the app does not know yet, from a newer server, is left off
  // rather than drawn wrong.
  let seal = $derived(isWornSeal(worn) ? sealOf(worn.seal) : null);
</script>

<!-- One thing a reader wears: a group's badge, or a seal they earned. -->
{#if isWornSeal(worn)}
  {#if seal !== null}<SealPill {seal} earnedAt={worn.earnedAt} class={sealClass} />{/if}
{:else}
  <GroupBadge badge={worn} class={className} />
{/if}
