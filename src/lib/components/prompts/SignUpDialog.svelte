<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import * as Carousel from "$lib/components/ui/carousel";
  import type { CarouselAPI } from "$lib/components/ui/carousel/context";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Label } from "$lib/components/ui/label";
  import { m } from "$lib/paraglide/messages";
  import { dismissPrompt, snoozePrompt } from "$lib/prompts";
  import SignUpSlide, { type SignUpSlideKey } from "./SignUpSlide.svelte";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { open = $bindable() }: Props = $props();

  /** The carousel's width on a desktop, in pixels: the size it is drawn for. */
  const STAGE_WIDTH = 416;
  let stageWidth = $state(STAGE_WIDTH);
  let stageZoom = $derived(Math.min(1, stageWidth / STAGE_WIDTH));

  /** How long each slide stays before the next comes forward. */
  const ADVANCE_MS = 5000;

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

  /** Whether the reader is pointing at or working the carousel, which holds it still. */
  let isHeld = $state(false);

  // On to the next slide every few seconds, round and round, unless the
  // reader is busy with it or has asked for less motion.
  $effect(() => {
    if (api === undefined || !open || isHeld) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      api?.scrollNext();
    }, ADVANCE_MS);
    return () => {
      clearInterval(timer);
    };
  });

  const SLIDES: readonly { key: SignUpSlideKey; title: () => string; text: () => string }[] = [
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
  ];
  let shown = $derived(SLIDES[selected] ?? SLIDES[0]);

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

    <!--
      The pictures either side wait smaller and dimmed, and step forward,
      when pressed or in their turn, as the one in front steps back. The words under them are not
      part of the slide, so they never shrink with it.
    -->
    <!--
      Laid out at the width it has on a desktop and shrunk whole to fit a
      narrower screen, so a phone sees the same carousel, only smaller.
    -->
    <div class="-mx-2 min-w-0" bind:clientWidth={stageWidth}>
      <Carousel.Root
        setApi={(next: CarouselAPI | undefined) => (api = next)}
        opts={{ loop: true, align: "center" }}
        style={`width: ${String(STAGE_WIDTH)}px; zoom: ${String(stageZoom)}`}
        onpointerenter={() => (isHeld = true)}
        onpointerleave={() => (isHeld = false)}
        onfocusin={() => (isHeld = true)}
        onfocusout={() => (isHeld = false)}
      >
        <Carousel.Content class="-ml-3">
          {#each SLIDES as slide, index (slide.key)}
            <Carousel.Item class="basis-[76%] pl-3">
              <!--
              A slide at the side is a way to it for a pointer: pressed, it
              comes forward. Out of the Tab order, since the dots below already
              take a keyboard to every slide and carry the focus ring.
            -->
              <button
                type="button"
                class={[
                  "block w-full rounded-2xl text-left transition-[scale,opacity] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] outline-none motion-reduce:transition-none",
                  selected === index
                    ? "scale-100 cursor-default opacity-100"
                    : "scale-90 opacity-50",
                ]}
                aria-label={m.prompt_label_slide({ number: String(index + 1) })}
                tabindex={-1}
                onclick={() => {
                  api?.scrollTo(index);
                }}
              >
                <SignUpSlide slide={slide.key} />
              </button>
            </Carousel.Item>
          {/each}
        </Carousel.Content>
      </Carousel.Root>
    </div>

    <div class="flex min-h-[4.5rem] flex-col gap-1 text-center" aria-live="polite">
      <h2 class="text-lg leading-snug font-semibold">{shown?.title()}</h2>
      <p class="text-sm text-balance text-muted-foreground">{shown?.text()}</p>
    </div>

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
