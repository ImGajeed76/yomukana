<script lang="ts">
  import StatusLine from "$lib/components/StatusLine.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Spinner } from "$lib/components/ui/spinner";
  import { Switch } from "$lib/components/ui/switch";
  import { Progress } from "$lib/db";
  import { install } from "$lib/install.svelte";
  import { m } from "$lib/paraglide/messages";
  import {
    currentSubscription,
    isPushSupported,
    loadNotificationSettings,
    saveNotificationSettings,
    sendTestPush,
    turnOffPush,
    turnOnPush,
    type NotificationSettings,
  } from "$lib/sync/push";

  let isSignedIn = $state<boolean | null>(null);
  let isOnHere = $state(false);
  let settings = $state.raw<NotificationSettings | null>(null);
  let pending = $state<"on" | "off" | "test" | null>(null);
  let problem = $state<"denied" | "service" | "failed" | null>(null);
  /** How the last test went: taken by the push service, or not. */
  let test = $state<"sent" | "refused" | null>(null);

  // Signed in, and on here? Both need the browser, so both are asked here.
  $effect(() => {
    void (async () => {
      const state = await new Progress().syncState();
      isSignedIn = state.account !== null;
      if (!isSignedIn) return;
      isOnHere = (await currentSubscription()) !== null;
      if (isOnHere) settings = await loadNotificationSettings();
    })();
  });

  /** On iPhone and iPad a page can only take pushes once it is installed. */
  let needsInstall = $derived(install.route === "home-screen");

  async function turnOn(): Promise<void> {
    pending = "on";
    const outcome = await turnOnPush();
    pending = null;
    problem = outcome === "on" ? null : outcome;
    if (outcome !== "on") return;
    isOnHere = true;
    settings = await loadNotificationSettings();
  }

  /**
   * A push to this reader's own devices, to see that one arrives. The server
   * says whether the push service took it, which tells "it never left" apart
   * from "it left and the device did not show it".
   */
  async function sendTest(): Promise<void> {
    pending = "test";
    const delivered = await sendTestPush();
    pending = null;
    problem = delivered === null ? "failed" : null;
    test = delivered === null ? null : delivered > 0 ? "sent" : "refused";
  }

  async function turnOff(): Promise<void> {
    pending = "off";
    const isOff = await turnOffPush();
    pending = null;
    problem = isOff ? null : "failed";
    if (isOff) isOnHere = false;
  }

  /** Saves one change at once, as a switch does, and shows it back if it did not save. */
  async function change(next: Partial<NotificationSettings>): Promise<void> {
    if (settings === null) return;
    const before = settings;
    settings = { ...settings, ...next };
    const saved = await saveNotificationSettings(next);
    problem = saved === null ? "failed" : null;
    settings = saved ?? before;
  }

  /** The reminder time as the time field wants it, HH:MM. */
  let time = $derived(
    settings === null
      ? "19:00"
      : `${String(Math.floor(settings.reminderMinute / 60)).padStart(2, "0")}:${String(settings.reminderMinute % 60).padStart(2, "0")}`,
  );

  function minuteOf(value: string): number | null {
    const [hours, minutes] = value.split(":").map(Number);
    if (hours === undefined || minutes === undefined) return null;
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
    return hours * 60 + minutes;
  }
</script>

<!--
  Reminders and nudges, for a signed-in reader who wants them. Turned on once
  a device, since a device is what the browser asks permission for; what
  comes and when is the reader's, and the same on every device they use.
  A browser that cannot take pushes gets no section at all.
-->
{#if isPushSupported() || needsInstall}
  <section class="flex flex-col gap-5 rounded-lg border border-border bg-card p-6">
    <div class="flex flex-col gap-1">
      <h2 class="text-lg leading-snug font-medium">{m.settings_notifications_title()}</h2>
      <p class="text-sm text-muted-foreground">{m.settings_notifications_description()}</p>
    </div>

    {#if isSignedIn === false}
      <p class="text-sm">{m.settings_notifications_signed_out()}</p>
    {:else if needsInstall}
      <p class="text-sm">{m.settings_notifications_hint_install()}</p>
    {:else if isSignedIn === null}
      <p class="text-sm text-muted-foreground" role="status">{m.common_status_loading()}</p>
    {:else if !isOnHere}
      <div>
        <Button
          disabled={pending !== null}
          onclick={() => {
            void turnOn();
          }}
        >
          {#if pending === "on"}<Spinner aria-label={m.common_status_loading()} />{/if}
          {m.settings_notifications_button_on()}
        </Button>
      </div>
    {:else if settings !== null}
      <div class="flex flex-col gap-4">
        <div class="flex items-center justify-between gap-4">
          <Label for="notify-reminder">{m.settings_notifications_label_reminder()}</Label>
          <Switch
            id="notify-reminder"
            checked={settings.isReminderOn}
            onCheckedChange={(checked: boolean) => {
              void change({ isReminderOn: checked });
            }}
          />
        </div>
        <div class="flex items-center justify-between gap-4">
          <Label for="notify-time" class={[!settings.isReminderOn && "text-muted-foreground"]}>
            {m.settings_notifications_label_time()}
          </Label>
          <Input
            id="notify-time"
            type="time"
            class="w-32"
            value={time}
            disabled={!settings.isReminderOn}
            onchange={(event: Event) => {
              const minute = minuteOf((event.currentTarget as HTMLInputElement).value);
              if (minute !== null) void change({ reminderMinute: minute });
            }}
          />
        </div>
        <div class="flex items-center justify-between gap-4">
          <Label for="notify-nudged">{m.settings_notifications_label_nudged()}</Label>
          <Switch
            id="notify-nudged"
            checked={settings.canBeNudged}
            onCheckedChange={(checked: boolean) => {
              void change({ canBeNudged: checked });
            }}
          />
        </div>
        <div class="flex items-center justify-between gap-4">
          <Label for="notify-suggestions">{m.settings_notifications_label_suggestions()}</Label>
          <Switch
            id="notify-suggestions"
            checked={settings.showsNudges}
            onCheckedChange={(checked: boolean) => {
              void change({ showsNudges: checked });
            }}
          />
        </div>
      </div>
      <!-- The two things done with this device's pushes, quietly, under the settings. -->
      <div class="-ml-3 flex flex-wrap gap-1 border-t border-border pt-4">
        <Button
          variant="ghost"
          size="sm"
          class="text-muted-foreground"
          disabled={pending !== null}
          onclick={() => {
            void sendTest();
          }}
        >
          {#if pending === "test"}<Spinner aria-label={m.common_status_loading()} />{/if}
          {m.settings_notifications_button_test()}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="text-muted-foreground"
          disabled={pending !== null}
          onclick={() => {
            void turnOff();
          }}
        >
          {#if pending === "off"}<Spinner aria-label={m.common_status_loading()} />{/if}
          {m.settings_notifications_button_off()}
        </Button>
      </div>
      {#if test === "sent"}
        <StatusLine message={m.settings_notifications_status_test()} isError={false} />
      {:else if test === "refused"}
        <StatusLine message={m.settings_notifications_status_test_failed()} isError={true} />
      {/if}
    {/if}

    {#if problem === "denied"}
      <StatusLine message={m.settings_notifications_error_denied()} isError={true} />
    {:else if problem === "service"}
      <StatusLine message={m.settings_notifications_error_service()} isError={true} />
    {:else if problem === "failed"}
      <StatusLine message={m.settings_profile_badges_error_save()} isError={true} />
    {/if}
  </section>
{/if}
