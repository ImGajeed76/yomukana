<script lang="ts">
  import { flagFont } from "$lib/flag-font.svelte";
  import { m } from "$lib/paraglide/messages";

  const TWEMOJI_URL = "https://github.com/twitter/twemoji";
  const CC_BY_URL = "https://creativecommons.org/licenses/by/4.0/";
</script>

<!--
  The flag font's artwork is Twemoji's, under CC BY, so it is credited where
  it is used: only on Windows, where flags come from it. A browser that never
  loads the font has nothing to credit. See flag-font.svelte.ts.
-->
{#if flagFont.isUsed}
  <p>
    {m.footer_credit_flags()}
    <a class="underline underline-offset-2" href={TWEMOJI_URL} rel="noreferrer">Twemoji</a>,
    <a class="underline underline-offset-2" href={CC_BY_URL} rel="noreferrer">CC BY 4.0</a>
  </p>
{/if}
