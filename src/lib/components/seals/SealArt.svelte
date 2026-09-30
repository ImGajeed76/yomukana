<script lang="ts">
  import type { Seal } from "$lib/sync/seal-rules";
  import { particlesOf, sceneOfKind, shapeOf } from "./seal-elements";
  import { glint, glintsOf, ribbonsOf, sceneOf } from "./seal-scenery";
  import { outlineOf } from "./seal-shapes";

  interface Props {
    seal: Seal;
    /** The size to draw it at, in pixels: the pill measures itself, the dialog's banner is set. */
    width: number;
    height: number;
    /**
     * Whether to draw it still: its shape, colours and scene, without the
     * ribbons, glints, rising particles and breathing. For many seals side by
     * side, where every one of them moving would drown the one that matters.
     */
    isCalm?: boolean;
  }

  let { seal, width, height, isCalm = false }: Props = $props();

  const id = $props.id();

  let shape = $derived(shapeOf(seal.kind));
  let outline = $derived(outlineOf(shape, seal.tier, width, height));
  /** The engraved line just inside the rim. */
  let inset = $derived(height * 0.13);
  // A plain line even inside a shaped seal: flames and crests stay outside it.
  let inner = $derived(
    seal.tier === 1 ? "" : outlineOf("pill", seal.tier, width - inset * 2, height - inset * 2),
  );
  let scene = $derived(seal.tier === 1 ? [] : sceneOf(sceneOfKind(seal.kind), width, height));
  let ribbons = $derived(isCalm ? [] : ribbonsOf(seal.tier, width, height));
  let glints = $derived(isCalm ? [] : glintsOf(seal.tier, width, height));
  let particles = $derived(isCalm ? [] : particlesOf(seal.tier));
  /** How strongly the scene shows: faint at first, full from epic. */
  let sceneStrength = $derived([0, 0, 0.55, 0.8, 1, 1][seal.tier] ?? 1);
</script>

<!--
  A seal's art, drawn for a size: its outline, a glossy body with its element
  painted inside, a bright rim, and for the rarer ones a glow, ribbons of
  light winding round it, glints and what rises off it. The pill draws it
  small behind its kanji and name, the dialog large as its banner. It sits
  behind whatever holds it, which sets its palette with data-seal-look.
-->
{#if outline !== ""}
  <svg
    class="seal-art"
    data-tier={seal.tier}
    data-calm={isCalm}
    {width}
    {height}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" class="stop-body-top" />
        <stop offset="55%" class="stop-body" />
        <stop offset="100%" class="stop-body-bottom" />
      </linearGradient>
      <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" class="stop-gloss" />
        <stop offset="100%" class="stop-gloss-end" />
      </linearGradient>
      <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" class="stop-rim-top" />
        <stop offset="100%" class="stop-rim-bottom" />
      </linearGradient>
      <linearGradient id={`${id}-ribbon`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" class="stop-ribbon-end" />
        <stop offset="40%" class="stop-ribbon" />
        <stop offset="70%" class="stop-ribbon-hot" />
        <stop offset="100%" class="stop-ribbon-end" />
      </linearGradient>
      <clipPath id={`${id}-clip`}>
        <path d={outline} />
      </clipPath>
    </defs>

    <!-- Light winding behind it. -->
    {#each ribbons as ribbon, index (index)}
      <path class="seal-ribbon-haze" d={ribbon} />
    {/each}

    <path class="seal-body" d={outline} fill={`url(#${id}-body)`} />

    <!-- Inside the outline: the scene, the gloss, the shade, the passing light. -->
    <g clip-path={`url(#${id}-clip)`}>
      {#each scene as part, index (index)}
        <path
          class={part.isLine ? "seal-scene-line" : "seal-scene"}
          d={part.d}
          style:opacity={part.strength * sceneStrength}
        />
      {/each}
      <ellipse
        class="seal-gloss"
        cx={width / 2}
        cy={height * 0.05}
        rx={width * 0.58}
        ry={height * 0.5}
        fill={`url(#${id}-gloss)`}
      />
      <path class="seal-shade" d={outline} />
      {#if seal.tier >= 4}<rect class="seal-sheen" x="0" y="-50%" height="200%" />{/if}
    </g>

    {#if inner !== ""}
      <path
        class="seal-inner"
        d={inner}
        transform={`translate(${String(inset)} ${String(inset)})`}
      />
    {/if}
    <path class="seal-rim" d={outline} stroke={`url(#${id}-rim)`} />

    <!-- Light winding in front, flowing along the ribbon. -->
    {#each ribbons as ribbon, index (index)}
      <path class="seal-ribbon" d={ribbon} stroke={`url(#${id}-ribbon)`} />
      <path
        class="seal-ribbon-flow"
        d={ribbon}
        pathLength="100"
        style:animation-delay={`${String(index * -1.4)}s`}
      />
    {/each}

    {#each glints as spot, index (index)}
      <path
        class="seal-glint"
        d={glint(spot.x, spot.y, spot.size)}
        style:animation-delay={`${String(spot.delay)}s`}
      />
    {/each}
  </svg>
{/if}
{#each particles as particle, index (index)}
  <span
    class="seal-particle"
    style:left={`${String(particle.x * 100)}%`}
    style:--size={`${String(particle.size)}em`}
    style:--delay={`${String(particle.delay)}s`}
    aria-hidden="true"
  ></span>
{/each}

<style>
  .seal-art {
    position: absolute;
    top: 0;
    left: 0;
    z-index: -1;
    overflow: visible;
    filter: drop-shadow(0 0.06em 0.14em oklch(from var(--body) calc(l - 0.35) c h / 45%));
  }

  /* The body: lit from above, darker towards the bottom. */
  .stop-body-top {
    stop-color: oklch(from var(--body) calc(l + 0.1) c h);
  }
  .stop-body {
    stop-color: var(--body);
  }
  .stop-body-bottom {
    stop-color: oklch(from var(--body) calc(l - 0.12) c h);
  }

  /* Gloss: a sheet of light over the upper half, as on enamel. */
  .stop-gloss {
    stop-color: var(--seal-paper);
    stop-opacity: 0.55;
  }
  .stop-gloss-end {
    stop-color: var(--seal-paper);
    stop-opacity: 0;
  }

  .seal-scene {
    fill: var(--scene);
  }
  .seal-scene-line {
    fill: none;
    stroke: var(--scene);
    stroke-width: 0.1em;
    stroke-linecap: round;
  }

  /* Shade inside the bottom of the rim, for depth. */
  .seal-shade {
    fill: none;
    stroke: oklch(from var(--body) calc(l - 0.2) c h / 70%);
    stroke-width: 0.3em;
    translate: 0 -0.12em;
  }

  .seal-inner {
    fill: none;
    stroke: oklch(from var(--seal-paper) l c h / 35%);
    stroke-width: 0.06em;
  }

  /* The rim: bright where the light catches it at the top, dark below. */
  .seal-rim {
    fill: none;
    stroke-width: 0.1em;
  }
  .stop-rim-top {
    stop-color: oklch(from var(--glow) calc(l + 0.15) c h);
  }
  .stop-rim-bottom {
    stop-color: oklch(from var(--body) calc(l - 0.2) c h);
  }

  /* Rare and up glow; epic and up breathe with it. */
  .seal-art[data-tier="3"] {
    filter: drop-shadow(0 0 0.35em oklch(from var(--glow) l c h / 55%));
  }
  .seal-art[data-tier="4"],
  .seal-art[data-tier="5"] {
    animation: seal-breathe 3.2s ease-in-out infinite;
  }

  @keyframes seal-breathe {
    0%,
    100% {
      filter: drop-shadow(0 0 0.3em oklch(from var(--glow) l c h / 50%));
    }
    50% {
      filter: drop-shadow(0 0 0.7em oklch(from var(--glow) l c h / 85%));
    }
  }

  /* A band of light crossing the seal every few seconds. */
  .seal-sheen {
    width: 1em;
    fill: oklch(from var(--seal-paper) l c h / 30%);
    transform-box: fill-box;
    rotate: 20deg;
    translate: -3em 0;
    animation: seal-sheen 4.5s ease-in-out infinite;
  }

  @keyframes seal-sheen {
    0% {
      translate: -3em 0;
    }
    24%,
    100% {
      translate: 30em 0;
    }
  }

  /* Ribbons of light: a haze behind, a bright line in front, a pulse running along it. */
  .seal-ribbon-haze {
    fill: none;
    stroke: oklch(from var(--glow) l c h / 45%);
    stroke-width: 0.35em;
    stroke-linecap: round;
    filter: blur(0.12em);
  }
  .seal-ribbon {
    fill: none;
    stroke-width: 0.1em;
    stroke-linecap: round;
  }
  .stop-ribbon {
    stop-color: var(--glow);
  }
  .stop-ribbon-hot {
    stop-color: var(--seal-paper);
  }
  .stop-ribbon-end {
    stop-color: var(--glow);
    stop-opacity: 0;
  }
  .seal-ribbon-flow {
    fill: none;
    stroke: var(--seal-paper);
    stroke-width: 0.12em;
    stroke-linecap: round;
    stroke-dasharray: 12 88;
    filter: drop-shadow(0 0 0.15em var(--glow));
    animation: seal-flow 2.8s linear infinite;
  }

  @keyframes seal-flow {
    from {
      stroke-dashoffset: 100;
    }
    to {
      stroke-dashoffset: 0;
    }
  }

  /* Four-pointed glints, flaring and gone again. */
  .seal-glint {
    fill: var(--seal-paper);
    filter: drop-shadow(0 0 0.15em var(--glow));
    transform-box: fill-box;
    transform-origin: center;
    animation: seal-glint 3.4s ease-in-out infinite;
  }

  @keyframes seal-glint {
    0%,
    60%,
    100% {
      scale: 0;
    }
    72% {
      scale: 1;
      rotate: 45deg;
    }
    85% {
      scale: 0.4;
    }
  }

  /* The rarest give off their element: embers, spray, going up and fading out. */
  .seal-particle {
    position: absolute;
    top: 0;
    z-index: 2;
    width: var(--size);
    height: var(--size);
    border-radius: 9999px;
    background: var(--glow);
    box-shadow: 0 0 0.3em var(--glow);
    opacity: 0;
    animation: seal-rise 2.6s ease-out infinite;
    animation-delay: var(--delay);
  }

  @keyframes seal-rise {
    0% {
      opacity: 0;
      transform: translateY(0.3em) scale(0.6);
    }
    20% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateY(-1.4em) scale(1);
    }
  }

  .seal-art[data-calm="true"] {
    animation: none;
  }
  .seal-art[data-calm="true"] .seal-sheen {
    display: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .seal-sheen,
    .seal-particle,
    .seal-ribbon-flow {
      display: none;
    }
    .seal-art,
    .seal-glint {
      animation: none;
    }
    .seal-glint {
      scale: 0.7;
    }
  }
</style>
