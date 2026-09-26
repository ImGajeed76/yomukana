<script lang="ts">
  import { setMode, userPrefersMode } from "mode-watcher";
  import ChoiceRow, { type Choice } from "$lib/components/ChoiceRow.svelte";
  import { m } from "$lib/paraglide/messages";
  import { getLocale, locales, setLocale } from "$lib/paraglide/runtime";

  // Shown in their own language, the way a language menu always is: someone who
  // only reads German should not have to find "German" written in English.
  const LANGUAGE_NAMES: Record<string, string> = {
    en: "English",
    de: "Deutsch",
    ja: "日本語",
  };

  let languages = $derived<Choice[]>(
    locales.map((locale) => ({ value: locale, label: LANGUAGE_NAMES[locale] ?? locale })),
  );

  let themes = $derived<Choice[]>([
    { value: "light", label: m.settings_appearance_light() },
    { value: "dark", label: m.settings_appearance_dark() },
    { value: "system", label: m.settings_appearance_system() },
  ]);
</script>

<div class="flex flex-col gap-6">
  <section
    class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-6"
  >
    <h2 class="text-lg leading-snug font-medium">{m.settings_language_title()}</h2>
    <ChoiceRow
      options={languages}
      value={getLocale()}
      label={m.settings_language_title()}
      onChange={(locale: string) => {
        // Paraglide writes the choice down and reloads, because every message
        // on the page was resolved when it rendered.
        void setLocale(locale as (typeof locales)[number]);
      }}
    />
  </section>

  <section
    class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-6"
  >
    <h2 class="text-lg leading-snug font-medium">{m.settings_appearance_title()}</h2>
    <ChoiceRow
      options={themes}
      value={userPrefersMode.current}
      label={m.settings_appearance_title()}
      onChange={(theme: string) => {
        setMode(theme === "light" || theme === "dark" ? theme : "system");
      }}
    />
  </section>
</div>
