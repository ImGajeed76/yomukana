<script lang="ts">
  import { Snowflake } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  interface Props {
    /** Its size, as a size utility. Everything inside scales with it. */
    class?: ClassValue;
  }

  let { class: className }: Props = $props();
</script>

<!--
  A streak freeze, the same wherever one is shown: a drop of ice with two
  icicles hanging off it. The icicles are placed in shares of the drop, so it
  holds its shape at any size. Decoration only: whatever shows it says what it
  means.
-->
<span
  class={[
    "relative inline-flex shrink-0 items-center justify-center rounded-full bg-freeze text-streak-foreground ring-2 ring-freeze/35",
    className,
  ]}
  aria-hidden="true"
>
  <Snowflake class="size-1/2" />
  <span class="absolute top-[88%] left-[31%] h-[22%] w-[18%] rounded-b-full bg-freeze"></span>
  <span class="absolute top-[88%] left-[53%] h-[16%] w-[18%] rounded-b-full bg-freeze"></span>
</span>
