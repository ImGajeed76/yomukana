<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { m } from "$lib/paraglide/messages";

  let { children }: { children: Snippet } = $props();

  // One page per section, so each stays small and a section can grow without
  // pushing the others off the screen. Everyday things first, the one
  // irreversible thing last.
  const sections = [
    { href: "/settings/profile", label: () => m.settings_nav_profile() },
    { href: "/settings/account", label: () => m.settings_nav_account() },
    { href: "/settings/preferences", label: () => m.settings_nav_preferences() },
    { href: "/settings/app", label: () => m.settings_nav_app() },
    { href: "/settings/data", label: () => m.settings_nav_data() },
  ] as const;
</script>

<main class="flex w-full flex-1 flex-col gap-8">
  <h1 class="text-3xl leading-tight font-semibold tracking-tight">{m.settings_page_title()}</h1>

  <!--
    A list down the side on a wide screen. On a phone, where there is no side,
    the same links wrap across the top, all of them in view.
  -->
  <div class="flex flex-col gap-6 md:flex-row md:items-start md:gap-10">
    <nav aria-label={m.settings_page_title()} class="md:w-48 md:shrink-0">
      <ul class="flex flex-wrap gap-1 md:flex-col">
        {#each sections as section (section.href)}
          {@const isCurrent = page.url.pathname === section.href}
          <li>
            <a
              href={section.href}
              aria-current={isCurrent ? "page" : undefined}
              class={[
                "flex h-9 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
                isCurrent
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              ]}
            >
              {section.label()}
            </a>
          </li>
        {/each}
      </ul>
    </nav>

    <div class="flex min-w-0 flex-1 flex-col gap-6">
      {@render children()}
    </div>
  </div>
</main>
