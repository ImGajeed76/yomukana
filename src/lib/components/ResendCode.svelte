<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { m } from "$lib/paraglide/messages";

  interface Props {
    disabled: boolean;
    /**
     * What is happening with the code, said in place of "Didn't get it?". One
     * line either way, so nothing below it moves.
     */
    message: string | null;
    /** Whether the message is a refusal, shown in red and read out at once. */
    isError: boolean;
    onResend: () => void;
  }

  let { disabled, message, isError, onResend }: Props = $props();
</script>

<p class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
  <span class={isError ? "text-destructive" : undefined} role={isError ? "alert" : "status"}>
    {message ?? m.account_confirm_resend_prompt()}
  </span>
  <Button variant="link" class="h-auto p-0" {disabled} onclick={onResend}>
    {m.account_button_resend()}
  </Button>
</p>
