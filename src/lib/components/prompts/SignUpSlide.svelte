<script lang="ts">
  import { Cloud } from "@lucide/svelte";
  import BoardList from "$lib/components/BoardList.svelte";
  import TypedKeys from "$lib/components/TypedKeys.svelte";
  import ProfileCard from "$lib/components/profile/ProfileCard.svelte";
  import QrCode from "$lib/components/profile/QrCode.svelte";
  import SealPill from "$lib/components/seals/SealPill.svelte";
  import StreakFlame from "$lib/components/streak/StreakFlame.svelte";
  import { demoBoard } from "$lib/stats";
  import type { Badge, Worn } from "$lib/sync/badge-rules";
  import { rankBoard } from "$lib/sync/board";
  import { sealOf, type Seal } from "$lib/sync/seal-rules";

  export type SignUpSlideKey = "sync" | "friends" | "groups" | "seals" | "card";

  interface Props {
    slide: SignUpSlideKey;
  }

  let { slide }: Props = $props();

  // Everything here is made up, and drawn with the app's own parts, so a
  // reader sees the real thing rather than a picture of it.
  const SCORE = 1240;
  const now = Date.now();
  const CLASS_BADGE: Badge = { emoji: "🌸", tag: "3B", color: "pink" };

  function worn(id: string): Worn {
    return { seal: id, earnedAt: now };
  }

  const board = demoBoard(SCORE, new Date(now)).slice(0, 4);
  /** What each of the made-up friends wears, so the board looks lived in. */
  const FRIENDS_WEAR: readonly (readonly Worn[])[] = [
    [worn("streak-200")],
    [worn("sentences-5000"), CLASS_BADGE],
    [worn("streak-30")],
    [],
  ];
  const friends = rankBoard(
    board.map((entry, index) => ({ ...entry, badges: FRIENDS_WEAR[index] ?? [] })),
    SCORE,
  );
  const classmates = rankBoard(
    board.slice(0, 3).map((entry) => ({ ...entry, badges: [CLASS_BADGE] })),
    SCORE,
  );
  const seals = ["streak-500", "perfect-10000", "days-1000"].flatMap((id): Seal[] => {
    const seal = sealOf(id);
    return seal === null ? [] : [seal];
  });

  /** The sentence on the made-up laptop, and how much of it is read. */
  const SENTENCE = [
    { kana: "ね", romaji: "ne" },
    { kana: "こ", romaji: "ko" },
    { kana: "が", romaji: "ga" },
    { kana: "す", romaji: "su" },
    { kana: "き", romaji: "ki" },
  ] as const;
  const TYPED = 3;

  /** Where the made-up class's code leads. Never scanned, only drawn. */
  const JOIN_LINK = "https://yomukana.app/join/k7q29xpm";
</script>

<!--
  One picture for the sign-up carousel: the app itself, made up and not to be
  pressed. Each shows one thing an account gives.
-->
<div
  class="pointer-events-none relative flex h-52 items-center justify-center overflow-hidden rounded-2xl bg-muted p-4 select-none"
  aria-hidden="true"
  inert
>
  {#if slide === "sync"}
    <!--
      One reader, two devices, the same moment: the sentence half read on the
      laptop, and the same streak on the phone, kept level through the cloud
      between them.
    -->
    <div class="flex items-end gap-3">
      <div class="flex flex-col items-center">
        <div class="flex h-28 w-44 flex-col rounded-lg border-2 border-border bg-background p-2">
          <span class="flex items-center justify-between text-[0.55rem] font-medium">
            yomukana
            <span class="flex items-center gap-0.5 tabular-nums"
              ><StreakFlame class="size-2.5" />23</span
            >
          </span>
          <span class="flex flex-1 items-center justify-center">
            <span class="font-japanese text-xl leading-none" lang="ja">
              {#each SENTENCE as character, index (index)}
                <span class={["relative inline-block", index >= TYPED && "text-muted-foreground"]}
                  >{character.kana}{#if index < TYPED}<TypedKeys
                      done={character.romaji}
                      now=""
                      stray=""
                    />{/if}</span
                >
              {/each}
            </span>
          </span>
        </div>
        <div class="h-1.5 w-52 rounded-b-md bg-border"></div>
      </div>

      <!-- The sync between them. -->
      <div class="flex flex-col items-center gap-1 self-center pb-2 text-muted-foreground">
        <Cloud class="size-6" />
        <span class="h-px w-10 border-t-2 border-dashed border-muted-foreground/50"></span>
      </div>

      <div
        class="flex h-32 w-[4.75rem] flex-col items-center gap-2 rounded-2xl border-2 border-border bg-background px-2 pt-2"
      >
        <span class="h-1 w-6 rounded-full bg-border"></span>
        <StreakFlame class="mt-1 size-7" />
        <span class="text-lg leading-none font-semibold tabular-nums">23</span>
        <span class="flex gap-0.5">
          {#each { length: 7 }, day (day)}
            <span
              class={[
                "size-1.5 rounded-full",
                day < 5 ? "bg-streak" : "border border-muted-foreground/40",
              ]}
            ></span>
          {/each}
        </span>
      </div>
    </div>
  {:else if slide === "friends"}
    <!-- Drawn smaller with zoom, not scale, so the rows lay out narrow and nothing spills. -->
    <div class="w-full [zoom:0.8]">
      <BoardList ranked={friends} describe={() => ""} />
    </div>
  {:else if slide === "groups"}
    <!--
      A group as a class meets it: the code on the board at the front, to
      scan or type, and everyone who did on one board, wearing its badge.
    -->
    <div class="flex w-full items-center gap-3">
      <div class="flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-xl bg-background p-2">
        <QrCode value={JOIN_LINK} label="" class="w-full" />
        <span class="font-mono text-[0.6rem] tracking-widest">K7Q2 9XPM</span>
      </div>
      <div class="min-w-0 flex-1 [zoom:0.75]">
        <BoardList ranked={classmates} describe={() => ""} />
      </div>
    </div>
  {:else if slide === "seals"}
    <div class="flex flex-col items-center gap-5 pt-2">
      {#each seals as seal (seal.id)}
        <SealPill {seal} class="text-sm" isStatic={true} />
      {/each}
    </div>
  {:else}
    <!-- Laid out at its own width, then shrunk whole, so it keeps its wide layout. -->
    <div class="w-[28rem] shrink-0 [zoom:0.64]">
      <ProfileCard
        username="quiet-tanuki-42"
        displayName="Aiko"
        cardColor="violet"
        score={SCORE}
        streak={23}
        badges={[worn("streak-500"), CLASS_BADGE]}
      />
    </div>
  {/if}
</div>
