<script lang="ts">
  import type { PinInput } from "bits-ui";
  import * as InputOTP from "$lib/components/ui/input-otp";

  /** One box of the code. bits-ui does not export the snippet's own type. */
  type Cell = PinInput.CellProps["cell"];

  interface Props {
    /** The digits typed so far. */
    value: string;
    /** Labels the field, since six boxes carry no label of their own. */
    label: string;
    disabled?: boolean;
    /** Called once all six digits are in, so the reader does not also have to press a button. */
    onComplete: (code: string) => void;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { value = $bindable(), label, disabled = false, onComplete }: Props = $props();

  /** The auth service sends six-digit codes. */
  const LENGTH = 6;

  const inputId = $props.id();

  // The code is the only thing to do on the step that shows this, so the
  // reader can type or paste it straight away rather than clicking first.
  // Waits for the field to be enabled: the step appears while the request
  // that led to it is still finishing, and a disabled field cannot take focus.
  // It also puts the reader back in the field after a wrong code.
  $effect(() => {
    if (disabled) return;
    document.getElementById(inputId)?.focus();
  });
</script>

<!--
  One-time-code autocomplete lets a phone offer the code straight from the
  email notification, and numeric input brings up the number pad.
-->
<InputOTP.Root
  maxlength={LENGTH}
  {inputId}
  bind:value
  {disabled}
  aria-label={label}
  autocomplete="one-time-code"
  inputmode="numeric"
  {onComplete}
>
  <!-- Three and three, the way the code reads in the email. -->
  {#snippet children({ cells }: { cells: Cell[] })}
    <InputOTP.Group>
      {#each cells.slice(0, 3) as cell (cell)}
        <InputOTP.Slot {cell} />
      {/each}
    </InputOTP.Group>
    <InputOTP.Separator />
    <InputOTP.Group>
      {#each cells.slice(3, 6) as cell (cell)}
        <InputOTP.Slot {cell} />
      {/each}
    </InputOTP.Group>
  {/snippet}
</InputOTP.Root>
