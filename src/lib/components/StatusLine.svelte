<script lang="ts">
  interface Props {
    /** What to say, or null to say nothing. The line keeps its height either way. */
    message: string | null;
    /** Whether the message is a refusal, which is read out at once and shown in red. */
    isError: boolean;
  }

  let { message, isError }: Props = $props();
</script>

<!--
  Always rendered, one line tall, so a message appearing never pushes the
  buttons under it down. See CLAUDE.md 16 on layout shift.
-->
<p
  class={["min-h-5 text-sm", isError ? "text-destructive" : "text-muted-foreground"]}
  role={isError ? "alert" : "status"}
>
  {message ?? ""}
</p>
