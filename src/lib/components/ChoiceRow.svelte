<script lang="ts">
  import { Button } from "$lib/components/ui/button";

  export interface Choice {
    readonly value: string;
    readonly label: string;
  }

  interface Props {
    /** What is on offer. Keep it to a handful: this is a glance, not a menu. */
    options: readonly Choice[];
    value: string;
    label: string;
    onChange: (value: string) => void;
  }

  let { options, value, label, onChange }: Props = $props();
</script>

<!--
  A row of choices where a select would hide them. With four or fewer options
  the reader can see every answer and the one they are on without opening
  anything. See CLAUDE.md 12.7.
-->
<div class="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
  {#each options as option (option.value)}
    <Button
      variant="ghost"
      size="sm"
      class={option.value === value ? "bg-accent text-accent-foreground" : "text-muted-foreground"}
      aria-pressed={option.value === value}
      onclick={() => {
        onChange(option.value);
      }}
    >
      {option.label}
    </Button>
  {/each}
</div>
