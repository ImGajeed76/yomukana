<script lang="ts">
  import { goto } from "$app/navigation";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Spinner } from "$lib/components/ui/spinner";
  import { m } from "$lib/paraglide/messages";
  import { scan, type CameraProblem } from "$lib/qr/scanner";
  import { scannedPath } from "$lib/qr/target";

  interface Props {
    /** Whether the dialog is showing. */
    open: boolean;
  }

  // `$bindable()` marks the prop as bindable, it is not a default. The rule
  // cannot tell a rune from a value.
  // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment
  let { open = $bindable() }: Props = $props();

  let video = $state<HTMLVideoElement | null>(null);
  let isStarting = $state(false);
  let problem = $state<CameraProblem | "foreign" | null>(null);

  const PROBLEM_MESSAGES: Record<CameraProblem | "foreign", () => string> = {
    blocked: m.leaderboards_scan_error_blocked,
    missing: m.leaderboards_scan_error_missing,
    unknown: m.leaderboards_scan_error_unknown,
    foreign: m.leaderboards_scan_error_foreign,
  };

  // The camera runs exactly as long as the dialog is open.
  $effect(() => {
    const element = video;
    if (!open || element === null) return;

    let stop: (() => void) | null = null;
    let isClosed = false;
    isStarting = true;
    problem = null;

    void scan(element, (text) => {
      const path = scannedPath(text, location.origin);
      if (path === null) {
        problem = "foreign";
        return;
      }
      open = false;
      void goto(path);
    }).then((result) => {
      isStarting = false;
      if ("problem" in result) {
        problem = result.problem;
        return;
      }
      // Closed while the camera was still starting: it has to go off again.
      if (isClosed) result.stop();
      else stop = result.stop;
    });

    return () => {
      isClosed = true;
      stop?.();
    };
  });
</script>

<!--
  The camera, and nothing to do but hold a code up to it. Any of the app's own
  codes works, so there is nothing to choose first: a reader's card opens their
  page, an invite opens the group.
-->
<Dialog.Root bind:open>
  <Dialog.Content class="gap-5 sm:max-w-[384px]">
    <Dialog.Header>
      <Dialog.Title>{m.leaderboards_scan_title()}</Dialog.Title>
    </Dialog.Header>
    <div class="relative aspect-square overflow-hidden rounded-lg bg-muted">
      <video bind:this={video} class="size-full object-cover" playsinline muted></video>
      {#if isStarting}
        <div class="absolute inset-0 flex items-center justify-center">
          <Spinner class="size-8" aria-label={m.common_status_loading()} />
        </div>
      {/if}
    </div>
    {#if problem !== null}
      <StatusLine message={PROBLEM_MESSAGES[problem]()} isError={true} />
    {/if}
  </Dialog.Content>
</Dialog.Root>
