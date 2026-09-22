<script lang="ts">
  import { ATTRIBUTION } from "$lib/corpus/types";
  import { m } from "$lib/paraglide/messages";
</script>

<!--
  The sentences are CC BY, so the credit is a licence condition and stays on
  every page rather than living on an about page nobody opens. It gets the same
  rule and the same gutter as the bar at the top, which is what keeps it reading
  as the edge of the page instead of as content.
-->
<footer class="border-t border-border">
  <div
    class="mx-auto flex w-full max-w-[1152px] flex-wrap items-baseline justify-between gap-x-8 gap-y-2 px-6 py-6 text-xs text-muted-foreground"
  >
    <p>
      Sentences from
      <a class="underline underline-offset-2" href={ATTRIBUTION.sourceUrl} rel="noreferrer">
        {ATTRIBUTION.source}
      </a>, used under
      <a class="underline underline-offset-2" href={ATTRIBUTION.licenceUrl} rel="noreferrer">
        {ATTRIBUTION.licence}
      </a>. Readings from {ATTRIBUTION.readings}.
    </p>

    <p>
      {m.footer_made_by()}
      <span aria-hidden="true">&#x2764;&#xfe0f;</span>
      by
      <a
        class="underline underline-offset-2"
        href="https://oseifert.ch"
        rel="noreferrer"
        target="_blank">Oliver</a
      >
    </p>
  </div>
</footer>
