<script lang="ts">
  import TypingPane from "$lib/components/TypingPane.svelte";
  import ScoreChangeDialog from "$lib/components/ScoreChangeDialog.svelte";
  import WelcomeDialog from "$lib/components/WelcomeDialog.svelte";
  import StreakCelebration from "$lib/components/streak/StreakCelebration.svelte";
  import StreakDialog from "$lib/components/streak/StreakDialog.svelte";
  import SealDialog from "$lib/components/seals/SealDialog.svelte";
  import { sealOf } from "$lib/sync/seal-rules";
  import { seals } from "$lib/sync/seals-state.svelte";
  import StreakToday from "$lib/components/streak/StreakToday.svelte";
  import { Button } from "$lib/components/ui/button";
  import { m } from "$lib/paraglide/messages";
  import { Practice } from "$lib/session/practice.svelte";
  import { tracks } from "$lib/session/tracks.svelte";
  import TrackTabs from "$lib/components/marathons/TrackTabs.svelte";
  import { openTrack, type MarathonSummary } from "$lib/sync/marathons";
  import { Flag, Medal, Trophy } from "@lucide/svelte";
  import { goto } from "$app/navigation";
  import MarathonMomentDialog from "$lib/components/marathons/MarathonMomentDialog.svelte";
  import { formatWhen, placeWord } from "$lib/components/marathons/format";
  import { marathonStatus, resultsAt } from "$lib/sync/marathon-rules";
  import { marathonMoments, type PodiumMoment } from "$lib/session/marathon-moments.svelte";
  import type { Attempt } from "$lib/session";
  import { freezeSaveToTell, isBigMoment, type StreakNews } from "$lib/stats/streak";
  import { streak } from "$lib/stats/streak-state.svelte";
  import { page } from "$app/state";
  import InstallDialog from "$lib/components/prompts/InstallDialog.svelte";
  import NotifyDialog from "$lib/components/prompts/NotifyDialog.svelte";
  import NudgeDialog from "$lib/components/prompts/NudgeDialog.svelte";
  import SignUpDialog from "$lib/components/prompts/SignUpDialog.svelte";
  import {
    currentSubscription,
    isPushSupported,
    loadNudgeable,
    type Nudgeable,
  } from "$lib/sync/push";
  import { Progress } from "$lib/db";
  import { install } from "$lib/install.svelte";
  import {
    forcedPrompt,
    INSTALL_AFTER_DAYS,
    isPromptDue,
    SIGN_UP_AFTER_SENTENCES,
    type PromptKind,
  } from "$lib/prompts";

  // Raw, and replaced whole when the reader switches track: each track has
  // its own store, its own sentence and its own sync. See CLAUDE.md 1.8.
  let practice = $state.raw(new Practice());

  /** Friends for `?prompt=nudge` in dev: made up, and never really nudged. */
  const DEMO_NUDGEABLE: readonly Nudgeable[] = [
    { username: "calm-mimizuku-18", displayName: "Aiko", cardColor: "violet", streak: 41 },
    { username: "swift-kitsune-71", displayName: null, cardColor: "orange", streak: 12 },
    { username: "sleepy-neko-55", displayName: "Ren", cardColor: "teal", streak: 6 },
  ];

  // IndexedDB only exists in the browser, so the prerendered page starts from an
  // empty model and the reader's own history replaces it on hydration. Which
  // track comes first: the one chosen last time, if it is still on.
  $effect(() => {
    void (async () => {
      await tracks.load();
      void tracks.refresh();
    })();
  });

  /** The track the practice on screen reads, once one has been started. */
  let shownTrack: string | null | undefined = undefined;

  // Starts reading on whichever track is chosen, and again whenever that
  // changes: a tab, or a marathon that ended under the reader.
  $effect(() => {
    const id = tracks.selected;
    if (!tracks.isReady || id === shownTrack) return;
    shownTrack = id;
    void startTrack(id);
  });

  /** Reads on a marathon's track, or the reader's own with null. */
  async function startTrack(id: string | null): Promise<void> {
    const marathon = tracks.running.find((each) => each.id === id);
    const next =
      marathon === undefined
        ? new Practice()
        : new Practice(await openTrack(marathon.id), {
            kind: "marathon",
            id: marathon.id,
            endsAt: marathon.endsAt,
          });
    // Another switch may have come in while the track opened.
    if (id !== tracks.selected) return;
    practice = next;
    await next.load();
  }

  /** Where the first-visit welcome remembers it was closed. */
  const WELCOMED_KEY = "yomukana:welcomed";

  let isWelcoming = $state(false);

  /** Where the notice about the score changing remembers it was shown. */
  const SCORE_CHANGE_KEY = "yomukana:score-change-2026-09";

  let isExplainingScore = $state(false);

  /**
   * Whether the welcome has been closed in this browser before.
   *
   * localStorage, not IndexedDB: this is a convenience for one browser, not
   * progress, and losing it only means seeing three lines once more. It
   * throws in some private windows and with blocked site data, which cannot
   * be prevented, and then the answer is simply "no".
   */
  function hasBeenWelcomed(): boolean {
    try {
      return localStorage.getItem(WELCOMED_KEY) !== null;
    } catch {
      return false;
    }
  }

  function rememberWelcome(): void {
    try {
      localStorage.setItem(WELCOMED_KEY, "1");
    } catch {
      // Same failure as above. The welcome may show again, which is harmless.
    }
  }

  /** Whether the notice about the score has been shown in this browser. Same storage, same failures. */
  function hasSeenScoreChange(): boolean {
    try {
      return localStorage.getItem(SCORE_CHANGE_KEY) !== null;
    } catch {
      return false;
    }
  }

  function rememberScoreChange(): void {
    try {
      localStorage.setItem(SCORE_CHANGE_KEY, "1");
    } catch {
      // It may show again, which is harmless.
    }
  }

  // A reader with no history in this browser, who has not closed it before.
  // Someone signing in on a new device already knows the page, and brings
  // their history with them on the first sync.
  // Remembered as soon as it shows, not when it closes: it has been seen, and
  // a reload with it still open should not show it again.
  $effect(() => {
    if (!practice.isLoaded || !practice.isNewReader || hasBeenWelcomed()) return;
    rememberWelcome();
    isWelcoming = true;
  });

  // Once, for a reader who had a score before it changed. A new reader never
  // saw the old number, so there is nothing to explain to them.
  $effect(() => {
    if (!practice.isLoaded || !practice.hadOldScore || hasSeenScoreChange()) return;
    rememberScoreChange();
    isExplainingScore = true;
  });

  let isStreakOpen = $state(false);
  let streakNews = $state.raw<StreakNews | null>(null);

  // A freeze that kept the streak alive on a day the reader was away works
  // silently, so it is told once, when they are back. Not over the welcome or
  // the score notice: those come first, and this waits for the next visit.
  $effect(() => {
    const value = streak.value;
    if (!practice.isLoaded || value === null || isWelcoming || isExplainingScore) return;
    const day = freezeSaveToTell(value, streak.freezeToldUpTo());
    if (day === null) return;
    streak.rememberFreezeTold(day);
    streakNews = { kind: "saved", days: value.current };
    isStreakOpen = true;
  });

  function isFromDialog(event: KeyboardEvent): boolean {
    return event.target instanceof Element && event.target.closest('[role="dialog"]') !== null;
  }

  // The popup's button says keep reading, so closing it goes on to the next
  // sentence rather than back to the summary it covered, which would want a
  // second Enter before typing works again.
  let isNextAfterStreak = false;

  // A seal just earned is shown between sentences, never over one being
  // typed, and never over another popup. Closing it moves on, as the streak
  // popup does, since both cover the summary the reader would otherwise
  // have to leave with a second Enter.
  let isSealOpen = $state(false);
  let newSeal = $state.raw<{ seal: string; earnedAt: number } | null>(null);
  let newSealRules = $derived(newSeal === null ? null : sealOf(newSeal.seal));
  let isNextAfterSeal = false;
  $effect(() => {
    if (seals.fresh.length === 0 || practice.summary === null) return;
    if (isWelcoming || isExplainingScore || isStreakOpen || isSealOpen || isMomentOpen) return;
    // A nudge is for this moment only; a seal can wait for the next summary.
    if (isNudgeOpen || nudgeFriends.length > 0) return;
    newSeal = seals.takeFresh();
    if (newSeal === null) return;
    isSealOpen = true;
    isNextAfterSeal = true;
  });
  $effect(() => {
    if (isSealOpen || !isNextAfterSeal) return;
    isNextAfterSeal = false;
    next();
  });

  // Asking to sign up, then to install: last in line behind every other
  // popup, between sentences, and one ask a visit at most, so a reader is
  // never asked twice in a row. See $lib/prompts for when each is due.
  let asking = $state<PromptKind | null>(null);
  let isAskOpen = $state(false);
  let hasAsked = false;
  let isSignedIn: boolean | null = null;
  let isNextAfterAsk = false;

  /**
   * Whether the streak reminder may be offered: signed in, a browser that can
   * take pushes, not on here yet, and not turned down.
   */
  let isReminderOfferDue = $state(false);
  /** The dev preview's own say, which the check above cannot overwrite. */
  let isReminderOfferForced = $state(false);

  $effect(() => {
    void (async () => {
      const state = await new Progress().syncState();
      isSignedIn = state.account !== null;
      isReminderOfferDue =
        isSignedIn &&
        isPushSupported() &&
        isPromptDue("notifications", Date.now()) &&
        (await currentSubscription()) === null;
    })();
  });

  /** Which ask is due now, if any. */
  function dueAsk(): PromptKind | null {
    const now = Date.now();
    const days = streak.value?.days ?? [];
    const sentences = days.reduce((total, day) => total + day.sentences, 0);
    const daysRead = days.filter((day) => day.sentences > 0).length;
    // On a goal day, the reminder first: it is what keeps the streak. A first
    // streak offers it in its own popup instead.
    if (isReminderOfferDue && streak.moment?.isGoalReached === true && !streak.moment.isStarted) {
      return "notifications";
    }
    if (
      isSignedIn === false &&
      sentences >= SIGN_UP_AFTER_SENTENCES &&
      isPromptDue("sign-up", now)
    ) {
      return "sign-up";
    }
    if (install.route !== "none" && daysRead >= INSTALL_AFTER_DAYS && isPromptDue("install", now)) {
      return "install";
    }
    return null;
  }

  $effect(() => {
    if (practice.summary === null || hasAsked) return;
    if (isWelcoming || isExplainingScore || isStreakOpen || isSealOpen || isMomentOpen) return;
    if (isNudgeOpen || nudgeFriends.length > 0) return;
    const kind = dueAsk();
    if (kind === null) return;
    hasAsked = true;
    asking = kind;
    isAskOpen = true;
    isNextAfterAsk = true;
  });
  $effect(() => {
    if (isAskOpen || !isNextAfterAsk) return;
    isNextAfterAsk = false;
    next();
  });

  // `?prompt=sign-up` or `?prompt=install` in dev: that ask at once, for looking at it.
  $effect(() => {
    const forced = forcedPrompt(page.url);
    if (forced === null) return;
    hasAsked = true;
    asking = forced;
    isAskOpen = true;
  });
  $effect(() => {
    if (isStreakOpen || !isNextAfterStreak) return;
    isNextAfterStreak = false;
    // Friends to nudge come next, over the same summary, and they move on.
    if (nudgeFriends.length === 0) next();
  });

  // Right after the reader's own goal, while they are ahead: friends whose
  // streak is still at risk today, to nudge. Asked for on the sentence that
  // reached the goal, shown once any streak popup has had its turn.
  let nudgeFriends = $state.raw<readonly Nudgeable[]>([]);
  let nudgeShown = $state.raw<readonly Nudgeable[]>([]);
  let isNudgeOpen = $state(false);
  let isNudgeDemo = $state(false);
  let isNextAfterNudge = false;
  $effect(() => {
    if (nudgeFriends.length === 0 || practice.summary === null) return;
    if (isWelcoming || isExplainingScore || isStreakOpen || isSealOpen || isNudgeOpen) return;
    nudgeShown = nudgeFriends;
    nudgeFriends = [];
    isNudgeOpen = true;
    isNextAfterNudge = true;
  });
  $effect(() => {
    if (isNudgeOpen || !isNextAfterNudge) return;
    isNextAfterNudge = false;
    next();
  });

  // `?prompt=first-streak` in dev: the first-streak popup with the reminder
  // offer, as a signed-in reader whose browser can take pushes would see it.
  $effect(() => {
    if (!import.meta.env.DEV || page.url.searchParams.get("prompt") !== "first-streak") return;
    streakNews = {
      kind: "moment",
      moment: {
        streak: 1,
        isGoalReached: true,
        isStarted: true,
        isWeek: false,
        isFreezeEarned: false,
        freezes: 1,
      },
    };
    isReminderOfferForced = true;
    isStreakOpen = true;
  });

  // `?prompt=nudge` in dev: the dialog at once, with made-up friends.
  $effect(() => {
    if (!import.meta.env.DEV || page.url.searchParams.get("prompt") !== "nudge") return;
    nudgeShown = DEMO_NUDGEABLE;
    isNudgeDemo = true;
    isNudgeOpen = true;
  });

  // A marathon's moments: it started, you reached the top three, it is over.
  // Start and results come when the page opens, after the welcome and the
  // streak's news; a place in the top three comes over the summary of the
  // sentence that reached it, and moves on when closed, as the others do.
  type MarathonMoment =
    | { readonly kind: "started" | "finished" | "over"; readonly marathon: MarathonSummary }
    | ({ readonly kind: "podium" } & PodiumMoment);
  let marathonMoment = $state.raw<MarathonMoment | null>(null);
  let isMomentOpen = $state(false);
  let isNextAfterMoment = false;

  // `?prompt=marathon-started`, `-podium`, `-over`, `-over-final` or
  // `-results` in dev: that marathon popup at once, about a made-up race,
  // for looking at it. Its buttons lead nowhere real.
  $effect(() => {
    if (!import.meta.env.DEV) return;
    const asked = page.url.searchParams.get("prompt");
    const now = Date.now();
    const demo = (endsAt: number, resultsDelay: number): MarathonSummary => ({
      id: "demo",
      name: "Spring Marathon",
      startsAt: endsAt - 30 * 86_400_000,
      endsAt,
      allowsLateEntry: true,
      resultsDelay,
      isAdmin: false,
      isRunning: true,
      runnerCount: 23,
      place: 3,
    });
    if (asked === "marathon-started") {
      marathonMoment = { kind: "started", marathon: demo(now + 86_400_000, 60) };
    } else if (asked === "marathon-podium") {
      marathonMoment = {
        kind: "podium",
        place: 2,
        marathon: "Spring Marathon",
        passed: ["Kenji", "Mia", "Lukas"],
      };
    } else if (asked === "marathon-over") {
      marathonMoment = { kind: "over", marathon: demo(now - 1000, 60) };
    } else if (asked === "marathon-over-final") {
      marathonMoment = { kind: "over", marathon: demo(now - 1000, 0) };
    } else if (asked === "marathon-results") {
      marathonMoment = { kind: "finished", marathon: demo(now - 3_600_000, 0) };
    } else {
      return;
    }
    isMomentOpen = true;
  });

  $effect(() => {
    if (!practice.isLoaded || !tracks.isReady || isMomentOpen) return;
    if (isWelcoming || isExplainingScore || isStreakOpen || isSealOpen || isAskOpen) return;
    const finished = marathonMoments.finishedToTell(tracks.finished);
    if (finished !== null) {
      marathonMoments.rememberFinishTold(finished.id);
      marathonMoment = { kind: "finished", marathon: finished };
      isMomentOpen = true;
      return;
    }
    const started = marathonMoments.startedToTell(tracks.running, tracks.selected);
    if (started !== null) {
      marathonMoments.rememberStartTold(started.id);
      marathonMoment = { kind: "started", marathon: started };
      isMomentOpen = true;
    }
  });

  $effect(() => {
    const podium = marathonMoments.podium;
    if (podium === null || practice.summary === null || isMomentOpen) return;
    if (isWelcoming || isExplainingScore || isStreakOpen || isSealOpen || isNudgeOpen) return;
    marathonMoments.podium = null;
    marathonMoment = { kind: "podium", ...podium };
    isMomentOpen = true;
    isNextAfterMoment = true;
  });
  $effect(() => {
    if (isMomentOpen || !isNextAfterMoment) return;
    isNextAfterMoment = false;
    next();
  });

  async function finish(attempt: Attempt, revealed: ReadonlySet<number>): Promise<void> {
    await practice.finish(attempt, revealed);
    const marathon = tracks.current;
    // The race ended while this sentence was being read: it does not count
    // (see Practice.finish), and the reader is told now, while they look up,
    // rather than finding the tab gone on the next sentence. Closing moves
    // on, back to their own reading. When the results are final already,
    // this is the results popup too, so that one is not shown again.
    if (marathon !== null && practice.isOver()) {
      if (marathonStatus(marathon, Date.now()) === "finished") {
        marathonMoments.rememberFinishTold(marathon.id);
      }
      marathonMoment = { kind: "over", marathon };
      isMomentOpen = true;
      isNextAfterMoment = true;
      return;
    }
    // In a marathon: where the reader stands now, once the score has gone
    // out. Not awaited, so the summary is there at once and the place joins
    // it a moment later, in a slot already kept for it.
    if (marathon !== null) {
      const reading = practice;
      void (async () => {
        await reading.whenSynced();
        await marathonMoments.afterSentence(marathon);
        if (marathonMoments.place !== null) tracks.setPlace(marathon.id, marathonMoments.place);
      })();
    }
    // The goal just reached: who could do with a nudge. Between sentences,
    // so the short wait for it is never felt while typing.
    if (streak.moment?.isGoalReached === true && isSignedIn === true) {
      nudgeFriends = await loadNudgeable();
    }
    // Day one, a week, a freeze: worth a popup. An ordinary goal day is
    // celebrated in the summary instead, since it comes every day.
    const moment = streak.moment;
    if (moment === null || !isBigMoment(moment)) return;
    streakNews = { kind: "moment", moment };
    isStreakOpen = true;
    isNextAfterStreak = true;
  }

  function next(): void {
    // A marathon that ended while the reader was in it loses its tab here,
    // between sentences, and reading goes back to their own track.
    tracks.recheck();
    marathonMoments.clear();
    streak.clearMoment();
    practice.next();
  }

  function handleKeydown(event: KeyboardEvent) {
    // A key pressed inside a dialog belongs to it. Checked by where the key
    // came from, not by whether the dialog is still open: the dialog closes on
    // this same Escape before it reaches here, and would read as a skip.
    if (
      isWelcoming ||
      isExplainingScore ||
      isStreakOpen ||
      isSealOpen ||
      isAskOpen ||
      isNudgeOpen ||
      isMomentOpen ||
      isFromDialog(event)
    ) {
      return;
    }
    if (practice.summary !== null) {
      if (event.key === "Enter") next();
      return;
    }
    // Escape is the way out of a sentence the reader cannot read. The typing
    // pane ignores it, so it reaches here untouched.
    if (event.key === "Escape") practice.skip();
  }

  function percent(value: number): string {
    return `${String(Math.round(value * 100))}%`;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<WelcomeDialog bind:open={isWelcoming} />
<ScoreChangeDialog bind:open={isExplainingScore} />
<StreakDialog
  bind:open={isStreakOpen}
  news={streakNews}
  streak={streak.value}
  offersReminders={(isReminderOfferDue || isReminderOfferForced) &&
    streakNews?.kind === "moment" &&
    streakNews.moment.isStarted}
/>
{#if newSeal !== null && newSealRules !== null}
  <SealDialog bind:open={isSealOpen} seal={newSealRules} earnedAt={newSeal.earnedAt} isNew={true} />
{/if}
{#if marathonMoment !== null}
  {@const shown = marathonMoment}
  {#if shown.kind === "started"}
    <MarathonMomentDialog
      bind:open={isMomentOpen}
      icon={Flag}
      title={m.marathon_started_title({ name: shown.marathon.name })}
      description={m.marathon_started_description()}
      action={m.marathon_started_button()}
      secondary={m.marathon_started_later()}
      onAction={() => {
        tracks.select(shown.marathon.id);
      }}
    />
  {:else if shown.kind === "finished"}
    <MarathonMomentDialog
      bind:open={isMomentOpen}
      icon={Medal}
      title={m.marathon_results_title({ name: shown.marathon.name })}
      description={shown.marathon.place === null
        ? ""
        : m.marathon_results_description({
            place: placeWord(shown.marathon.place),
            count: String(shown.marathon.runnerCount),
          })}
      action={m.marathon_results_button()}
      onAction={() => {
        void goto(`/leaderboards?board=marathon:${shown.marathon.id}`);
      }}
    />
  {:else if shown.kind === "over"}
    {@const place = shown.marathon.place}
    <MarathonMomentDialog
      bind:open={isMomentOpen}
      icon={Medal}
      title={m.marathon_results_title({ name: shown.marathon.name })}
      description={place === null
        ? ""
        : marathonStatus(shown.marathon, Date.now()) === "finished"
          ? m.marathon_results_description({
              place: placeWord(place),
              count: String(shown.marathon.runnerCount),
            })
          : m.marathon_over_description_counting({
              place: placeWord(place),
              when: formatWhen(resultsAt(shown.marathon)),
            })}
      action={m.marathon_over_button_board()}
      secondary={m.marathon_over_button_back()}
      onAction={() => {
        void goto(`/leaderboards?board=marathon:${shown.marathon.id}`);
      }}
    />
  {:else if shown.kind === "podium"}
    <MarathonMomentDialog
      bind:open={isMomentOpen}
      icon={Trophy}
      title={shown.place === 1
        ? m.marathon_podium_title_lead()
        : m.marathon_podium_title_place({ place: placeWord(shown.place) })}
      description={shown.passed.length > 1
        ? m.marathon_podium_description_many({
            name: shown.passed[0] ?? "",
            count: String(shown.passed.length - 1),
            marathon: shown.marathon,
          })
        : m.marathon_podium_description_one({
            name: shown.passed[0] ?? "",
            marathon: shown.marathon,
          })}
      action={m.marathon_podium_button()}
    />
  {/if}
{/if}
<NudgeDialog bind:open={isNudgeOpen} friends={nudgeShown} isDemo={isNudgeDemo} />
{#if asking === "sign-up"}
  <SignUpDialog bind:open={isAskOpen} />
{:else if asking === "install"}
  <InstallDialog bind:open={isAskOpen} />
{:else if asking === "notifications"}
  <NotifyDialog bind:open={isAskOpen} />
{/if}

<!--
  This screen has one job and one thing on it. The sentence sits on the optical
  centre line of the space between the two rules, where the eye lands without
  being sent there, and nothing above it competes for that landing. Everything
  else here either arrives after the sentence is finished or is a warning the
  reader has to see.
-->
<!--
  On a phone the keyboard takes the bottom half of the screen, so the sentence
  sits at the top where it stays visible above it, not on a centre line the
  keyboard would cover. See CLAUDE.md 11.
-->
<main class="flex w-full flex-1 flex-col md:justify-center">
  <div class="mx-auto flex w-full max-w-[896px] flex-col gap-8">
    {#if tracks.running.length > 0}
      <TrackTabs
        class="-mx-3"
        running={tracks.running}
        selected={tracks.selected}
        onSelect={(id: string | null) => {
          tracks.select(id);
        }}
      />
    {/if}
    {#if practice.current}
      <!--
        Not rebuilt per sentence. It resets on the round instead, because
        rebuilding it would take the phone keyboard's field with it and close
        the keyboard between every sentence.
      -->
      {#key practice}
        <TypingPane
          segments={practice.current.segments}
          tokens={practice.current.tokens}
          round={practice.round}
          isPaused={isWelcoming ||
            isExplainingScore ||
            isStreakOpen ||
            isSealOpen ||
            isNudgeOpen ||
            isAskOpen ||
            isMomentOpen}
          onFinished={(attempt: Attempt, revealed: ReadonlySet<number>) => {
            void finish(attempt, revealed);
          }}
          onSkip={() => {
            practice.skip();
          }}
          onNext={next}
        />
      {/key}

      <!--
        Said once, plainly, where it matters: a reader in a private window should
        know their session will not be there tomorrow before they spend an hour on
        it. See CLAUDE.md 1.7.
      -->
      {#if practice.isLoaded && !practice.isPersistent}
        <p class="text-sm text-destructive">{m.session_typing_warning_unsaved()}</p>
      {/if}

      <!--
        Said out loud rather than left to be guessed at. Without it a failed
        download just looks like an app that only has six sentences in it.
      -->
      {#if practice.hasCorpusFailed}
        <p class="text-sm text-destructive">{m.session_typing_error_corpus()}</p>
      {/if}

      <!--
        The summary appears below the sentence the reader just finished rather than
        replacing it, so their eye does not have to go looking for it.
      -->
      <!--
        The summary is always here, holding its own space, and only becomes
        visible once the sentence is finished. Appearing from nothing would push
        the sentence up the screen at the exact moment the reader's eye is still
        on it, and the sentence is the one thing on this page that must not move.
        See CLAUDE.md 16.

        The meaning is in the reserved copy too, held to two lines. Otherwise the
        block would be a different height for every sentence and the stage would
        settle somewhere new each time, which is the same problem one sentence
        later. Two lines covers almost every translation in the corpus, and the
        few that run longer lose their tail rather than moving the sentence.

        Invisible rather than absent, which also keeps it out of the
        accessibility tree and the button out of the tab order.
      -->
      {@const summary = practice.summary}
      <div
        class="flex flex-col gap-6 border-t border-border pt-8"
        class:invisible={summary === null}
        aria-hidden={summary === null}
      >
        <p class="line-clamp-2 min-h-12 text-base leading-normal text-muted-foreground">
          {practice.current.meaning}
        </p>

        <div class="flex flex-wrap items-end justify-between gap-6">
          <!--
            The sentence that reached today's goal gets the streak in place of
            its stats. Every other one shows its stats, and today's progress
            beside them.
          -->
          {#if summary !== null && streak.moment?.isGoalReached === true && streak.value !== null}
            <StreakCelebration streak={streak.value} />
          {:else}
            <dl class="flex flex-wrap gap-x-10 gap-y-4">
              <div class="flex flex-col gap-1">
                <dt class="text-xs text-muted-foreground">{m.session_summary_label_speed()}</dt>
                <dd class="text-2xl font-semibold tabular-nums">
                  {Math.round(summary?.segmentsPerMinute ?? 0)}
                </dd>
              </div>
              <div class="flex flex-col gap-1">
                <dt class="text-xs text-muted-foreground">{m.session_summary_label_accuracy()}</dt>
                <dd class="text-2xl font-semibold tabular-nums">
                  {percent(summary?.accuracy ?? 0)}
                </dd>
              </div>
              <div class="flex flex-col gap-1">
                <dt class="text-xs text-muted-foreground">{m.session_summary_label_errors()}</dt>
                <dd class="text-2xl font-semibold tabular-nums">{summary?.errors ?? 0}</dd>
              </div>
              {#if tracks.current !== null}
                <!--
                  The place takes its slot at once, blank, so its number
                  arriving a moment later moves nothing. Whom the sentence
                  passed replaces the label rather than adding a line.
                -->
                <div class="flex max-w-56 flex-col gap-1">
                  <dt class="truncate text-xs text-muted-foreground">
                    {#if marathonMoments.passed.length === 1}
                      {m.marathon_place_passed_one({ name: marathonMoments.passed[0] ?? "" })}
                    {:else if marathonMoments.passed.length > 1}
                      {m.marathon_place_passed_many({
                        name: marathonMoments.passed[0] ?? "",
                        count: String(marathonMoments.passed.length - 1),
                      })}
                    {:else}
                      {m.marathon_place_label()}
                    {/if}
                  </dt>
                  <dd class="text-2xl font-semibold tabular-nums">
                    {marathonMoments.place === null ? "\u00a0" : placeWord(marathonMoments.place)}
                  </dd>
                </div>
              {/if}
              {#if streak.value !== null}
                <StreakToday streak={streak.value} />
              {/if}
            </dl>
          {/if}

          <!-- On touch the button is up by the sentence instead, see TypingPane. -->
          <div class="flex items-center gap-3 touch:hidden">
            <span class="text-xs text-muted-foreground">{m.session_summary_hint_enter()}</span>
            <Button onclick={next}>{m.session_summary_button_next()}</Button>
          </div>
        </div>
      </div>
    {:else}
      <!-- The first chunk is a download, and a blank stage looks broken. -->
      <p class="text-sm text-muted-foreground">{m.session_typing_status_loading()}</p>
    {/if}
  </div>
</main>
