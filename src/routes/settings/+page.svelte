<script lang="ts">
  import { setMode, userPrefersMode } from "mode-watcher";
  import ChoiceRow, { type Choice } from "$lib/components/ChoiceRow.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Button } from "$lib/components/ui/button";
  import { Progress } from "$lib/db";
  import { m } from "$lib/paraglide/messages";
  import { getLocale, locales, setLocale } from "$lib/paraglide/runtime";

  const progress = new Progress();

  let isLoaded = $state(false);

  // Shown in their own language, the way a language menu always is: someone who
  // only reads German should not have to find "German" written in English.
  const LANGUAGE_NAMES: Record<string, string> = { en: "English", de: "Deutsch" };

  let languages = $derived<Choice[]>(
    locales.map((locale) => ({ value: locale, label: LANGUAGE_NAMES[locale] ?? locale })),
  );

  let themes = $derived<Choice[]>([
    { value: "light", label: m.settings_appearance_light() },
    { value: "dark", label: m.settings_appearance_dark() },
    { value: "system", label: m.settings_appearance_system() },
  ]);

  $effect(() => {
    void (async () => {
      await progress.load();
      isLoaded = true;
    })();
  });

  /**
   * Hands the reader a file. Nothing is uploaded: the export is built in the
   * browser and downloaded from a blob URL that never leaves it.
   */
  async function exportData(): Promise<void> {
    const data = await progress.exportAll();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );

    const link = document.createElement("a");
    link.href = url;
    link.download = `yomukana-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function clearData(): Promise<void> {
    await progress.clear();
  }
</script>

<main class="flex w-full flex-1 flex-col gap-10">
  <h1 class="text-3xl leading-tight font-semibold tracking-tight">{m.settings_page_title()}</h1>

  <!--
    Two quick answers, then the serious one. Language and appearance are changed
    and forgotten; deleting a reading history cannot be undone, so it sits at the
    bottom where nobody lands on it by accident. See CLAUDE.md 12.4.
  -->
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

  <!--
    The sentence saying nothing leaves the browser is the reason this page
    exists, so it reads first, at a width that can actually be read, and the two
    buttons follow it.
  -->
  <section class="flex flex-col gap-5 rounded-lg border border-border bg-card p-6">
    <div class="flex flex-col gap-2">
      <h2 class="text-lg leading-snug font-medium">{m.settings_data_title()}</h2>
      <p class="max-w-[672px] text-sm text-muted-foreground">{m.settings_data_description()}</p>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        disabled={!isLoaded}
        onclick={() => {
          void exportData();
        }}
      >
        {m.settings_data_button_export()}
      </Button>

      <!--
        Irreversible, with no copy anywhere else, so it asks first and says what
        will be lost rather than asking whether the reader is sure.
        See CLAUDE.md 12.4.
      -->
      <AlertDialog.Root>
        <AlertDialog.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="destructive" disabled={!isLoaded}>
              {m.settings_data_button_clear()}
            </Button>
          {/snippet}
        </AlertDialog.Trigger>
        <AlertDialog.Content>
          <AlertDialog.Header>
            <AlertDialog.Title>{m.settings_delete_title()}</AlertDialog.Title>
            <AlertDialog.Description>{m.settings_delete_description()}</AlertDialog.Description>
          </AlertDialog.Header>
          <AlertDialog.Footer>
            <AlertDialog.Cancel>{m.common_button_cancel()}</AlertDialog.Cancel>
            <AlertDialog.Action>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="destructive"
                  onclick={() => {
                    void clearData();
                  }}
                >
                  {m.settings_delete_confirm()}
                </Button>
              {/snippet}
            </AlertDialog.Action>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </div>
  </section>
</main>
