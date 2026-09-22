<script lang="ts">
  import { type Snippet } from "svelte";
  import { ModeWatcher } from "mode-watcher";
  import { DitherBackdrop } from "$lib/charts";
  import SiteFooter from "$lib/components/SiteFooter.svelte";
  import SiteNav from "$lib/components/SiteNav.svelte";
  import { m } from "$lib/paraglide/messages";
  import { getLocale } from "$lib/paraglide/runtime";
  import "./layout.css";

  let { children }: { children: Snippet } = $props();

  // app.html is prerendered with lang="en" because there is no server to
  // substitute the reader's locale. Correct it once the runtime knows.
  $effect(() => {
    document.documentElement.lang = getLocale();
  });
</script>

<svelte:head>
  <title>{m.common_app_name()}</title>
  <meta name="description" content={m.common_app_tagline()} />
  <meta property="og:title" content={m.common_app_name()} />
  <meta property="og:description" content={m.common_app_tagline()} />
  <meta property="og:type" content="website" />
</svelte:head>

<ModeWatcher />

<!--
  Bar, page, credit. All three share one column width and one gutter, so every
  page starts at the same left edge and the two rules line up with it. The page
  itself is a flex child that grows, which is what lets the practice stage centre
  itself in whatever is left between the two rules.
-->
<div class="relative flex min-h-svh flex-col">
  <!--
    Inside the frame, not beside it: an absolute box with no positioned ancestor
    is laid out against the initial containing block, which is one window tall,
    so it would sit at the bottom of the first screen rather than of the page.
  -->
  <DitherBackdrop />

  <SiteNav />
  <div class="mx-auto flex w-full max-w-[1152px] flex-1 flex-col px-6 py-12">
    {@render children()}
  </div>
  <SiteFooter />
</div>
