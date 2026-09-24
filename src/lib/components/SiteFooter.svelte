<script lang="ts">
  import { ATTRIBUTION } from "$lib/corpus/types";
  import { m } from "$lib/paraglide/messages";
  import { getLocale } from "$lib/paraglide/runtime";

  /** Where feedback goes. An alias, so it can be retired if it draws spam. */
  const FEEDBACK_EMAIL = "yomukana@alias.oseifert.ch";

  // "kuromoji and IPADic", "kuromoji und IPADic", "kuromoji、IPADic": the
  // browser knows how each language joins a list.
  const readings = new Intl.ListFormat(getLocale(), { type: "conjunction" }).format(
    ATTRIBUTION.readings,
  );
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
    <!--
      Built from pieces around the links, because the order changes with the
      language: Japanese puts the source first and the maker last. The pieces
      carry their own spaces, since Japanese has none between words.
    -->
    <p>
      {m.footer_credit_before_source()}<a
        class="underline underline-offset-2"
        href={ATTRIBUTION.sourceUrl}
        rel="noreferrer">{ATTRIBUTION.source}</a
      >{m.footer_credit_before_licence()}<a
        class="underline underline-offset-2"
        href={ATTRIBUTION.licenceUrl}
        rel="noreferrer">{ATTRIBUTION.licence}</a
      >{m.footer_credit_before_readings()}{readings}{m.footer_credit_after_readings()}
    </p>

    <!--
      A mail link, not a form: a form would need a server or a service to post
      to, and nothing here sends anything unless the reader does it themselves.
    -->
    <div class="flex flex-wrap items-baseline gap-x-6 gap-y-2">
      <a class="underline underline-offset-2" href="mailto:{FEEDBACK_EMAIL}?subject=yomukana">
        {m.footer_feedback()}
      </a>
      <p>
        {m.footer_made_before_heart()}<span aria-hidden="true">&#x2764;&#xfe0f;</span
        >{m.footer_made_before_name()}<a
          class="underline underline-offset-2"
          href="https://oseifert.ch"
          rel="noreferrer"
          target="_blank">Oliver</a
        >{m.footer_made_after_name()}
      </p>
    </div>
  </div>
</footer>
