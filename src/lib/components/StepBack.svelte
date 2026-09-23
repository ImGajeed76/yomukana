<script lang="ts">
  import { ArrowLeft } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { m } from "$lib/paraglide/messages";

  interface Props {
    disabled: boolean;
    onBack: () => void;
  }

  let { disabled, onBack }: Props = $props();
</script>

<!-- Leaving a step is an escape hatch, not an action, so it is small and out of the way. -->
<Button variant="ghost" size="sm" class="-ml-3 self-start" {disabled} onclick={onBack}>
  <ArrowLeft class="size-4" />
  {m.account_button_back()}
</Button>
