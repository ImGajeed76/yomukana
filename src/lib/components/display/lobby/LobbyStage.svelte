<script lang="ts">
  import type { Snippet } from "svelte";
  import { LobbyScene, type Faces, type LobbyMember, type ScreenCorners } from "./lobby-scene";
  import type { RoomPhase } from "./race";
  import type { Countdown } from "./start-count";
  import { quadTransform } from "./quad";
  import ScreenCountdown from "./ScreenCountdown.svelte";
  import { fontReady } from "./textures";

  // The room a marathon happens in, with a daifuku for each runner: the
  // lobby before it starts, the race while it runs (race.ts), the podium
  // after. The board is on the big screen at the back and, if the organiser
  // chose, the invite on a shop sign. Board and invite are the page's own
  // HTML, laid onto those faces, so text stays sharp, rows still move and
  // phones can read the code. Loaded only once the room is on screen, so
  // three.js never downloads for anyone else.

  interface Props {
    members: readonly LobbyMember[];
    /** The board, for the screen. */
    children: Snippet;
    /** The invite, for the sign. None, and the sign is not out. */
    sign?: Snippet;
    /** Where the marathon is in its life. */
    phase: RoomPhase;
    /**
     * Through the last minute before the start or the end: the screen counts
     * down instead of showing the board, and the room gathers to watch. Null
     * the rest of the time.
     */
    countdown: Countdown | null;
    /** Points each runner gained in the board's last refresh, and when that was. */
    gains: ReadonlyMap<string, number>;
    gainsFrom: number | null;
  }

  let { members, children, sign, phase, countdown, gains, gainsFrom }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let labels = $state<HTMLElement | null>(null);
  let scene = $state.raw<LobbyScene | null>(null);
  /** Where the screen's and the sign's faces are, once the room is drawn. */
  let faces = $state.raw<Faces | null>(null);
  /** Whether the room could not be drawn, so the board shows on its own. */
  let hasFailed = $state(false);

  /**
   * Text sizes as a share of a face's height: sized to what it is on, as on
   * a real screen, so about a dozen rows show on the board.
   */
  const SCREEN_LINE = 0.055;
  const SIGN_LINE = 0.075;

  interface Placed {
    /** The element's own size, about what it shows at, so its text is barely stretched. */
    readonly width: number;
    readonly height: number;
    readonly line: string;
    readonly transform: string;
  }

  /** An element laid onto a face. */
  function placed(corners: ScreenCorners | undefined, line: number): Placed | null {
    if (corners === undefined) return null;
    const [topLeft, topRight, bottomLeft, bottomRight] = corners;
    const length = (from: readonly number[], to: readonly number[]): number =>
      Math.hypot((to[0] ?? 0) - (from[0] ?? 0), (to[1] ?? 0) - (from[1] ?? 0));
    const width = (length(topLeft, topRight) + length(bottomLeft, bottomRight)) / 2;
    const height = (length(topLeft, bottomLeft) + length(topRight, bottomRight)) / 2;
    return {
      width,
      height,
      line: `${String(height * line)}px`,
      transform: quadTransform(width, height, corners),
    };
  }

  const px = (value: number | undefined): string | undefined =>
    value === undefined ? undefined : `${String(value)}px`;

  let screen = $derived(placed(faces?.screen, SCREEN_LINE));
  let signFace = $derived(placed(faces?.sign, SIGN_LINE));
  let signElement = $state<HTMLElement | null>(null);

  /**
   * Keeps the invite on the sign as it sways: only the transform, written
   * straight to the element, never its size, so the code is not redrawn.
   */
  function followSign(corners: ScreenCorners): void {
    if (signElement === null || signFace === null) return;
    signElement.style.transform = quadTransform(signFace.width, signFace.height, corners);
  }

  /** Washi fibres, drawn once, laid over the paper colour of the sign. */
  function paperFibres(): string {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (context === null) return "none";
    for (let index = 0; index < 260; index++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const angle = Math.random() * Math.PI * 2;
      const length = 4 + Math.random() * 16;
      context.strokeStyle =
        Math.random() < 0.5 ? "rgba(150, 120, 80, 0.16)" : "rgba(255, 255, 255, 0.5)";
      context.lineWidth = 0.8;
      context.beginPath();
      context.moveTo(x, y);
      context.quadraticCurveTo(
        x + Math.cos(angle + 0.7) * length * 0.6,
        y + Math.sin(angle + 0.7) * length * 0.6,
        x + Math.cos(angle) * length,
        y + Math.sin(angle) * length,
      );
      context.stroke();
    }
    return `url(${canvas.toDataURL()})`;
  }
  const fibres = paperFibres();

  $effect(() => {
    const surface = canvas;
    const layer = labels;
    if (surface === null || layer === null) return;
    let made: LobbyScene | null = null;
    let isStopped = false;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) made?.resize(entry.contentRect.width, entry.contentRect.height);
    });
    // The noren and lanterns are written in the seals' brush font.
    void fontReady().then(() => {
      if (isStopped) return;
      // A browser without WebGL, or with it switched off, throws here. The
      // board works without the room, so the room is simply left out.
      try {
        made = new LobbyScene(
          surface,
          layer,
          (placedFaces) => {
            faces = placedFaces;
          },
          followSign,
        );
      } catch (error) {
        console.warn("could not draw the lobby", error);
        hasFailed = true;
        return;
      }
      made.resize(surface.clientWidth, surface.clientHeight);
      observer.observe(surface);
      scene = made;
    });
    return () => {
      isStopped = true;
      observer.disconnect();
      made?.dispose();
      scene = null;
    };
  });

  $effect(() => {
    scene?.sync(members);
  });

  /**
   * The invite on the sign, kept a moment after it is withdrawn, so it goes
   * up with the sign rather than vanishing off it.
   */
  let signShown = $state.raw<Snippet | undefined>(undefined);
  /** How long the sign takes to go up out of sight, and then a little. */
  const SIGN_AWAY_MS = 1600;

  $effect(() => {
    scene?.setSignShown(sign !== undefined);
    if (sign !== undefined) {
      signShown = sign;
      return;
    }
    const timer = setTimeout(() => {
      signShown = undefined;
    }, SIGN_AWAY_MS);
    return () => {
      clearTimeout(timer);
    };
  });

  $effect(() => {
    scene?.setCountdown(countdown);
  });

  $effect(() => {
    scene?.setPhase(phase);
  });

  $effect(() => {
    scene?.showGains(gains, gainsFrom);
  });
</script>

{#if hasFailed}
  <div class="flex min-h-0 flex-1 flex-col">{@render children()}</div>
{:else}
  <div class="absolute inset-0 overflow-hidden">
    <!--
      Board and invite lie under the room, which leaves see-through holes
      where the screen's and the sign's faces are (see room.ts), so a daifuku
      in front of either draws over it. The screen shows light on dark
      whatever the app's theme, as a real one does, so the board is drawn in
      the dark theme.
    -->
    <div
      class="lobby-face lobby-screen dark flex flex-col bg-background text-foreground"
      style:width={px(screen?.width)}
      style:height={px(screen?.height)}
      style:--line={screen?.line}
      style:transform={screen?.transform}
      style:visibility={screen === null ? "hidden" : undefined}
    >
      {#if countdown === null}
        {@render children()}
      {:else}
        <ScreenCountdown at={countdown.at} kind={countdown.kind} />
      {/if}
    </div>
    {#if signShown !== undefined}
      <div
        bind:this={signElement}
        class="lobby-face lobby-sign"
        style:width={px(signFace?.width)}
        style:height={px(signFace?.height)}
        style:font-size={signFace?.line}
        style:background-image={fibres}
        style:transform={signFace?.transform}
        style:visibility={signFace === null ? "hidden" : undefined}
      >
        {@render signShown()}
      </div>
    {/if}
    <canvas
      bind:this={canvas}
      class="pointer-events-none absolute inset-0 block size-full"
      aria-hidden="true"
    ></canvas>
    <div
      bind:this={labels}
      class="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    ></div>
  </div>
{/if}

<style>
  .lobby-face {
    position: absolute;
    top: 0;
    left: 0;
    overflow: hidden;
    transform-origin: 0 0;
  }

  /*
    The invite on the sign: ink on washi rather than black on white, the
    paper showing through around the code, and a little shade where it sits
    in the frame, so it belongs to the room.
  */
  .lobby-sign {
    --qr-light: transparent;
    --qr-dark: var(--lobby-ink);
    background-color: var(--lobby-paper);
    box-shadow: inset 0 0 0.9em color-mix(in oklab, var(--lobby-ink) 30%, transparent);
  }

  /*
    The board's spacing is set in viewport units for a board that fills the
    page. On the screen it is sized from the screen instead, like its text.
  */
  .lobby-screen {
    font-size: var(--line);
  }

  .lobby-screen :global(.display-header) {
    padding: calc(var(--line) * 1.4) calc(var(--line) * 1.6) calc(var(--line) * 0.8);
  }

  .lobby-screen :global(.display-rows) {
    padding: 0 calc(var(--line) * 2.6) calc(var(--line) * 1.2) calc(var(--line) * 1.6);
  }

  /* A name over a daifuku's head. Made by lobby-scene.ts, so global. */
  :global(.lobby-name) {
    position: absolute;
    top: 0;
    left: 0;
    max-width: 12em;
    overflow: hidden;
    padding: 0.15em 0.6em;
    border-radius: 9999px;
    background: var(--lobby-name);
    color: var(--profile-foreground);
    font-size: calc(var(--line) * 0.32 * var(--crowd, 1));
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: opacity 400ms;
    will-change: transform;
  }

  :global(.lobby-name.is-leaving) {
    opacity: 0;
  }

  /* Points over a head when a score rises. Made by gain-pops.ts, so global. */
  :global(.lobby-gain) {
    position: absolute;
    top: 0;
    left: 0;
    padding: 0.1em 0.5em;
    border-radius: 9999px;
    background: var(--lobby-name);
    color: var(--lobby-gain);
    font-size: calc(var(--line) * 0.42 * var(--crowd, 1));
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    z-index: 1000;
  }
</style>
