<script lang="ts">
  import ChoiceRow, { type Choice } from "./ChoiceRow.svelte";
  import { m } from "$lib/paraglide/messages";

  interface Props {
    /** Days the chart beside this covers. */
    value: number;
    onChange: (days: number) => void;
  }

  let { value, onChange }: Props = $props();

  /** The spans on offer, shortest first. Four is the whole choice. */
  const SPANS = [7, 30, 90, 365];

  let options = $derived<Choice[]>(
    SPANS.map((days) => ({
      value: String(days),
      label: days >= 365 ? m.stats_score_span_year() : m.stats_score_span_days({ days }),
    })),
  );
</script>

<!-- Sits in the corner of the card it changes, not above it. -->
<ChoiceRow
  {options}
  value={String(value)}
  label={m.stats_score_span_label()}
  onChange={(days: string) => {
    onChange(Number(days));
  }}
/>
