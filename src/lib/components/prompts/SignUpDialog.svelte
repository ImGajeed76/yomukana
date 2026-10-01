<script lang="ts">
  import { goto } from "$app/navigation";
  import BoardList from "$lib/components/BoardList.svelte";
  import ProfileCard from "$lib/components/profile/ProfileCard.svelte";
  import SealPill from "$lib/components/seals/SealPill.svelte";
  import StreakFlame from "$lib/components/streak/StreakFlame.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Carousel from "$lib/components/ui/carousel";
  import type { CarouselAPI } from "$lib/components/ui/carousel/context";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Label } from "$lib/components/ui/label";
  import { m } from "$lib/paraglide/messages";
  import { dismissPrompt, snoozePrompt } from "$lib/prompts";
  import { demoBoard } from "$lib/stats";
  import type { Badge } from "$lib/sync/badge-rules";
  import { rankBoard } from "$lib/sync/board";
  import { sealOf, type Seal } from "$lib/sync/seal-rules";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { open = $bindable() }: Props = $props();

  let isNever = $state(false);
  let api = $state<CarouselAPI | undefined>(undefined);
  let selected = $state(0);

  $effect(() => {
    if (api === undefined) return;
    const update = (): void => {
      selected = api?.selectedScrollSnap() ?? 0;
    };
    api.on("select", update);
    return () => {
      api?.off("select", update);
    };
  });

  // What the slides show: made up, and drawn with the app's own parts, so a
  // reader sees the real thing rather than a picture of it.
  const SCORE = 1240;
  const now = new Date();
  const friends = rankBoard(demoBoard(SCORE, now).slice(0, 4), SCORE);
  const CLASS_BADGE: Badge = { emoji: "🌸", tag: "3B", color: "pink" };
  const classmates = rankBoard(
    demoBoard(SCORE, now)
      .slice(0, 4)
      .map((entry) => ({ ...entry, badges: [CLASS_BADGE] })),
    SCORE,
  );
  const seals = ["streak-500", "perfect-10000", "days-1000"].flatMap((id): Seal[] => {
    const seal = sealOf(id);
    return seal === null ? [] : [seal];
  });

  const SLIDES = [
    { key: "sync", title: m.prompt_signup_sync_title, text: m.prompt_signup_sync_description },
    {
      key: "friends",
      title: m.prompt_signup_friends_title,
      text: m.prompt_signup_friends_description,
    },
    {
      key: "groups",
      title: m.prompt_signup_groups_title,
      text: m.prompt_signup_groups_description,
    },
    { key: "seals", title: m.prompt_signup_seals_title, text: m.prompt_signup_seals_description },
    { key: "card", title: m.prompt_signup_card_title, text: m.prompt_signup_card_description },
  ] as const;

  /** Closing in any way but signing up: not now, or never, as the box says. */
  function decline(): void {
    if (isNever) dismissPrompt("sign-up");
    else snoozePrompt("sign-up", Date.now());
  }

  async function signUp(): Promise<void> {
    // Asked again tomorrow if they leave the form without an account; never
    // again once they have one, which the page checks for itself.
    if (isNever) dismissPrompt("sign-up");
    else snoozePrompt("sign-up", Date.now());
    open = false;
    await goto("/account");
  }
</script>

<!--
  The ask to sign up, shown once a reader has read enough to have something
  to keep. It shows rather than tells: each slide is the thing an account
  gives, drawn with the app's own parts, under a heading and one line. One
  button to sign up; not now asks again on the next reading day, and the box
  stops it for good.
-->
<Dialog.Root
  bind:open
  onOpenChange={(isOpen: boolean) => {
    if (!isOpen) decline();
  }}
>
  <Dialog.Content class="gap-5 sm:max-w-[448px]">
    <Dialog.Title class="sr-only">{m.prompt_signup_title()}</Dialog.Title>

    <Carousel.Root setApi={(next: CarouselAPI | undefined) => (api = next)} class="-mx-2 min-w-0">
      <Carousel.Content>
        {#each SLIDES as slide (slide.key)}
          <Carousel.Item class="flex flex-col gap-4 px-2">
            <!-- The picture: the app itself, made up and not to be pressed. -->
            <div
              class="pointer-events-none relative flex h-52 items-center justify-center overflow-hidden rounded-2xl bg-muted/50 p-4 select-none"
              aria-hidden="true"
              inert
            >
              {#if slide.key === "sync"}
                <div class="relative">
                  <div
                    class="flex h-28 w-48 flex-col items-center justify-center gap-1 rounded-lg border-2 border-border bg-background"
                  >
                    <span class="flex items-center gap-1 text-2xl font-semibold tabular-nums">
                      <StreakFlame class="size-6" />23
                    </span>
                    <span class="text-xs text-muted-foreground">{m.streak_day_streak()}</span>
                  </div>
                  <div class="mx-auto h-2 w-56 -translate-x-4 rounded-b-md bg-border"></div>
                  <div
                    class="absolute -right-8 -bottom-4 flex h-28 w-16 flex-col items-center justify-center gap-1 rounded-xl border-2 border-border bg-background"
                  >
                    <span class="flex items-center gap-0.5 text-base font-semibold tabular-nums">
                      <StreakFlame class="size-4" />23
                    </span>
                  </div>
                </div>
              {:else if slide.key === "friends"}
                <div class="w-full scale-90">
                  <BoardList ranked={friends} describe={() => ""} />
                </div>
              {:else if slide.key === "groups"}
                <div class="w-full scale-90">
                  <BoardList ranked={classmates} describe={() => ""} />
                </div>
              {:else if slide.key === "seals"}
                <div class="flex flex-col items-center gap-5 pt-2">
                  {#each seals as seal (seal.id)}
                    <SealPill {seal} class="text-sm" isStatic={true} />
                  {/each}
                </div>
              {:else}
                <div class="w-full scale-90">
                  <ProfileCard
                    username="quiet-tanuki-42"
                    displayName="Aiko"
                    cardColor="violet"
                    score={SCORE}
                    streak={23}
                    badges={[{ seal: "streak-500", earnedAt: now.getTime() }, CLASS_BADGE]}
                  />
                </div>
              {/if}
            </div>
            <div class="flex flex-col gap-1 text-center">
              <h2 class="text-lg leading-snug font-semibold">{slide.title()}</h2>
              <p class="text-sm text-balance text-muted-foreground">{slide.text()}</p>
            </div>
          </Carousel.Item>
        {/each}
      </Carousel.Content>
    </Carousel.Root>

    <!-- Where in the slides the reader is, and a way to any of them. -->
    <div class="flex justify-center gap-1">
      {#each SLIDES as slide, index (slide.key)}
        <button
          type="button"
          class="flex size-6 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={m.prompt_label_slide({ number: String(index + 1) })}
          aria-current={selected === index}
          onclick={() => {
            api?.scrollTo(index);
          }}
        >
          <span
            class={[
              "h-1.5 rounded-full transition-[width,background-color] duration-200",
              selected === index ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/40",
            ]}
          ></span>
        </button>
      {/each}
    </div>

    <div class="flex flex-col gap-3">
      <Button
        size="lg"
        class="w-full"
        onclick={() => {
          void signUp();
        }}
      >
        {m.prompt_signup_button()}
      </Button>
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-2">
          <Checkbox id="sign-up-never" bind:checked={isNever} />
          <Label for="sign-up-never" class="text-sm font-normal text-muted-foreground">
            {m.prompt_label_never()}
          </Label>
        </div>
        <Button
          variant="ghost"
          size="sm"
          class="-mr-3"
          onclick={() => {
            open = false;
            decline();
          }}
        >
          {m.prompt_button_later()}
        </Button>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
