<script lang="ts">
  import { ChartColumn, Keyboard, Settings, Trophy, UserRound } from "@lucide/svelte";
  import { page } from "$app/state";
  import { m } from "$lib/paraglide/messages";

  // Labels are read where they are rendered rather than collected into a list of
  // callbacks. One less layer to walk when something goes wrong, and the message
  // call sites stay greppable.
  const links = [
    { href: "/", key: "practice", icon: Keyboard },
    { href: "/stats", key: "stats", icon: ChartColumn },
    { href: "/leaderboards", key: "leaderboards", icon: Trophy },
    { href: "/settings", key: "settings", icon: Settings },
    // Last, where an account usually sits. Your card and the code that lets
    // someone follow you, one tap away when they are standing next to you.
    { href: "/me", key: "profile", icon: UserRound },
  ] as const;

  /** Whether a link is the section the reader is in, including its subpages. */
  function isCurrent(href: string): boolean {
    const path = page.url.pathname;
    return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
  }

  function labelFor(key: (typeof links)[number]["key"]): string {
    if (key === "stats") return m.nav_link_stats();
    if (key === "leaderboards") return m.nav_link_leaderboards();
    if (key === "settings") return m.nav_link_settings();
    if (key === "profile") return m.nav_link_profile();
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
    <!--
      Five words do not fit beside the name on a phone, so there each link is
      its icon, with the word kept for screen readers and shown on hover. The
      tap target stays 44 pixels square. See CLAUDE.md 11.2.
    -->
    <ul class="ml-auto flex items-center gap-1 text-sm font-medium sm:gap-6">
      {#each links as link (link.href)}
        <li>
          <a
            href={link.href}
            title={labelFor(link.key)}
            class="flex size-11 items-center justify-center transition-colors hover:text-foreground sm:size-auto"
            class:text-muted-foreground={!isCurrent(link.href)}
            aria-current={isCurrent(link.href) ? "page" : undefined}
          >
            <link.icon class="size-5 sm:hidden" aria-hidden="true" />
            <span class="max-sm:sr-only">{labelFor(link.key)}</span>
          </a>
        </li>
      {/each}
    </ul>
  </nav>
</header>
