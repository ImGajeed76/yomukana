<script lang="ts">
  import { Check, Copy } from "@lucide/svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import UsernameDialog from "$lib/components/UsernameDialog.svelte";
  import { CARD_BACKGROUNDS } from "$lib/components/profile/colors";
  import ProfileCard from "$lib/components/profile/ProfileCard.svelte";
  import QrCode from "$lib/components/profile/QrCode.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Progress } from "$lib/db";
  import { m } from "$lib/paraglide/messages";
  import { scoreOf } from "$lib/stats";
  import {
    ensureProfile,
    updateProfile,
    type Profile,
    type ProfileChanges,
    type ProfileProblem,
  } from "$lib/sync/profile";
  import { CARD_COLORS, DISPLAY_NAME_MAX, type CardColor } from "$lib/sync/profile-rules";
  import { sync } from "$lib/sync/sync";

  const progress = new Progress();

  let isLoaded = $state(false);
  let account = $state<string | null>(null);
  let profile = $state.raw<Profile | null>(null);
  let score = $state(0);

  let displayName = $state("");
  let isSavingName = $state(false);
  let nameProblem = $state<ProfileProblem | null>(null);
  /** What went wrong saving the colour, which saves the moment it is picked. */
  let choiceProblem = $state<ProfileProblem | null>(null);
  let isRenaming = $state(false);
  let isCopied = $state(false);

  const PROBLEM_MESSAGES: Record<ProfileProblem, () => string> = {
    invalid: m.settings_profile_error_invalid,
    offensive: m.settings_profile_error_offensive,
    taken: m.leaderboards_following_rename_error_taken,
    offline: m.leaderboards_following_error_offline,
    unknown: m.leaderboards_following_error_unknown,
  };

  const COLOR_NAMES: Record<CardColor, () => string> = {
    green: m.settings_profile_color_green,
    blue: m.settings_profile_color_blue,
    violet: m.settings_profile_color_violet,
    rose: m.settings_profile_color_rose,
    amber: m.settings_profile_color_amber,
    slate: m.settings_profile_color_slate,
  };

  $effect(() => {
    void (async () => {
      score = scoreOf(await progress.load(), new Date());
      account = (await progress.syncState()).account;
      if (account !== null) {
        // Synced first, so the card shows the score the server has just been sent.
        await sync(progress);
        score = scoreOf(progress.store, new Date());
        profile = await ensureProfile();
        displayName = profile?.displayName ?? "";
      }
      isLoaded = true;
    })();
  });

  /** Where the profile is, on whichever address the reader has open. */
  let link = $derived(profile === null ? "" : `${location.origin}/@${profile.username}`);
  let isNameChanged = $derived(displayName.trim() !== (profile?.displayName ?? ""));

  async function saveName(): Promise<void> {
    isSavingName = true;
    const trimmed = displayName.trim();
    const result = await updateProfile({ displayName: trimmed === "" ? null : trimmed });
    isSavingName = false;
    if ("problem" in result) {
      nameProblem = result.problem;
      return;
    }
    nameProblem = null;
    profile = result.profile;
    displayName = result.profile.displayName ?? "";
  }

  /** Saves a colour the moment it is picked. Shown at once, put back if the server says no. */
  async function saveChoice(changes: ProfileChanges): Promise<void> {
    if (profile === null) return;
    const before = profile;
    profile = { ...profile, ...changes };
    const result = await updateProfile(changes);
    if ("problem" in result) {
      choiceProblem = result.problem;
      profile = before;
      return;
    }
    choiceProblem = null;
    profile = result.profile;
  }

  async function copyLink(): Promise<void> {
    await navigator.clipboard.writeText(link);
    isCopied = true;
    setTimeout(() => {
      isCopied = false;
    }, 1500);
  }
</script>

{#if !isLoaded}
  <section class="rounded-lg border border-border bg-card p-6">
    <p class="text-sm text-muted-foreground" role="status">{m.settings_profile_loading()}</p>
  </section>
{:else if account === null}
  <section class="flex flex-col gap-5 rounded-lg border border-border bg-card p-6">
    <h2 class="text-lg leading-snug font-medium">{m.settings_profile_title()}</h2>
    <!-- A profile is part of an account, which is a choice. See CLAUDE.md 1.7. -->
    <p class="text-sm text-muted-foreground">{m.settings_profile_signed_out()}</p>
    <div>
      <Button href="/account">{m.settings_sync_button_sign_in()}</Button>
    </div>
  </section>
{:else if profile === null}
  <section class="rounded-lg border border-border bg-card p-6">
    <p class="text-sm text-destructive" role="alert">{m.settings_profile_error_load()}</p>
  </section>
{:else}
  <div class="flex flex-col gap-6">
    <!-- The card as other people see it, redrawn as it is edited below. -->
    <ProfileCard
      username={profile.username}
      displayName={displayName.trim() === "" ? null : displayName.trim()}
      cardColor={profile.cardColor}
      {score}
    />

    <section class="flex flex-col gap-5 rounded-lg border border-border bg-card p-6">
      <h2 class="text-lg leading-snug font-medium">{m.settings_profile_title()}</h2>

      <form
        class="flex flex-col gap-2"
        onsubmit={(event) => {
          event.preventDefault();
          void saveName();
        }}
      >
        <Label for="display-name">{m.settings_profile_label_display_name()}</Label>
        <div class="flex gap-2">
          <Input
            id="display-name"
            bind:value={displayName}
            placeholder={profile.username}
            maxlength={DISPLAY_NAME_MAX}
            autocomplete="off"
            aria-describedby="display-name-hint"
            aria-invalid={nameProblem !== null}
            disabled={isSavingName}
          />
          <Button type="submit" variant="outline" disabled={isSavingName || !isNameChanged}>
            {m.common_button_save()}
          </Button>
        </div>
        <!-- The hint, or what was wrong, in the same line. See UsernameDialog. -->
        <p
          id="display-name-hint"
          class={["text-xs", nameProblem === null ? "text-muted-foreground" : "text-destructive"]}
          role={nameProblem === null ? undefined : "alert"}
        >
          {nameProblem === null
            ? m.settings_profile_hint_display_name()
            : PROBLEM_MESSAGES[nameProblem]()}
        </p>
      </form>

      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex flex-col gap-1">
          <span class="text-sm font-medium">{m.leaderboards_following_label_username()}</span>
          <span class="text-sm text-muted-foreground">@{profile.username}</span>
        </div>
        <Button
          variant="outline"
          onclick={() => {
            isRenaming = true;
          }}
        >
          {m.settings_profile_button_change()}
        </Button>
      </div>

      <fieldset class="flex flex-col gap-2">
        <legend class="mb-2 text-sm font-medium">{m.settings_profile_label_color()}</legend>
        <div class="flex flex-wrap gap-2">
          {#each CARD_COLORS as color (color)}
            {@const isPicked = profile.cardColor === color}
            <button
              type="button"
              class={[
                "flex size-11 items-center justify-center rounded-full text-profile-foreground ring-offset-2 ring-offset-card transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                CARD_BACKGROUNDS[color],
                isPicked && "ring-2 ring-foreground",
              ]}
              aria-label={COLOR_NAMES[color]()}
              aria-pressed={isPicked}
              onclick={() => {
                if (!isPicked) void saveChoice({ cardColor: color });
              }}
            >
              {#if isPicked}
                <Check class="size-5" />
              {/if}
            </button>
          {/each}
        </div>
      </fieldset>

      {#if choiceProblem !== null}
        <StatusLine message={PROBLEM_MESSAGES[choiceProblem]()} isError={true} />
      {/if}
    </section>

    <!--
      The link, and the same link as a code a phone camera opens. Showing
      someone this is how they follow you without typing anything.
    -->
    <section
      class="flex flex-col items-start gap-5 rounded-lg border border-border bg-card p-6 sm:flex-row sm:items-center"
    >
      <QrCode value={link} label={m.settings_profile_label_qr()} size={160} />
      <div class="flex min-w-0 flex-col gap-4">
        <div class="flex flex-col gap-1">
          <h2 class="text-lg leading-snug font-medium">{m.settings_profile_share_title()}</h2>
          <p class="text-sm text-muted-foreground">{m.settings_profile_share_description()}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onclick={() => {
              void copyLink();
            }}
          >
            {#if isCopied}
              <Check class="size-4" />
              {m.leaderboards_following_status_copied()}
            {:else}
              <Copy class="size-4" />
              {m.settings_profile_button_copy_link()}
            {/if}
          </Button>
          <Button variant="ghost" href="/@{profile.username}">
            {m.settings_profile_button_view()}
          </Button>
        </div>
      </div>
    </section>

    <UsernameDialog
      bind:open={isRenaming}
      current={profile.username}
      onSaved={(renamed: string) => {
        if (profile !== null) profile = { ...profile, username: renamed };
      }}
    />
  </div>
{/if}
