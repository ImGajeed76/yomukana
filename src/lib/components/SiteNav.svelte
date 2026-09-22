<script lang="ts">
  import { page } from "$app/state";
  import { m } from "$lib/paraglide/messages";

  // Labels are read where they are rendered rather than collected into a list of
  // callbacks. One less layer to walk when something goes wrong, and the message
  // call sites stay greppable.
  const links = [
    { href: "/", key: "practice" },
    { href: "/stats", key: "stats" },
    { href: "/settings", key: "settings" },
  ] as const;

  function labelFor(key: (typeof links)[number]["key"]): string {
    if (key === "stats") return m.nav_link_stats();
    if (key === "settings") return m.nav_link_settings();
    return m.nav_link_practice();
  }
</script>

<!--
  The rule under the bar is the only chrome the app needs: it separates the
  navigation from the page without a background, a shadow or a second colour, and
  it spans the window so the content column below reads as sitting under it.

  The links sit at the far edge rather than next to the wordmark. Two anchors,
  one per side, make the bar scannable at a glance instead of a row of words the
  eye has to parse from the left every time.
-->
<header class="border-b border-border">
  <nav
    class="mx-auto flex h-14 w-full max-w-[1152px] items-center gap-6 px-6"
    aria-label={m.nav_label_main()}
  >
    <a href="/" class="text-sm font-medium tracking-tight">{m.common_app_name()}</a>
    <ul class="ml-auto flex items-center gap-6 text-sm font-medium">
      {#each links as link (link.href)}
        <li>
          <a
            href={link.href}
            class="transition-colors hover:text-foreground"
            class:text-muted-foreground={page.url.pathname !== link.href}
            aria-current={page.url.pathname === link.href ? "page" : undefined}
          >
            {labelFor(link.key)}
          </a>
        </li>
      {/each}
    </ul>
  </nav>
</header>
