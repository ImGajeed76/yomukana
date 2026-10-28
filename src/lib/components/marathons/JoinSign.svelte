<script lang="ts">
  import QrCode from "$lib/components/profile/QrCode.svelte";
  import { m } from "$lib/paraglide/messages";

  // The invite on a marathon's screen, for the room to join from: a title and
  // the code. Dark on light whatever the theme, as a QR code must be for some
  // cameras to read it. It fills the box it is given; the code takes all the
  // room the title leaves, because the code is what has to reach the back of
  // the classroom. The title is sized in em, so whoever places it sets that
  // with the font size.

  interface Props {
    /** The invite link. */
    link: string;
    /** The blank margin round the code, in squares. See QrCode. */
    quietZone?: number;
  }

  let { link, quietZone = 4 }: Props = $props();
</script>

<div class="flex size-full flex-col items-center gap-[0.2em] bg-qr-light p-[0.5em] text-qr-dark">
  <p class="shrink-0 text-[1.2em] leading-tight font-semibold tracking-tight">
    {m.marathon_display_join_title()}
  </p>
  <div class="flex min-h-0 w-full flex-1 items-center justify-center">
    <QrCode
      value={link}
      label={m.leaderboards_groups_invite_label_qr()}
      class="aspect-square h-full max-w-full"
      {quietZone}
    />
  </div>
</div>
