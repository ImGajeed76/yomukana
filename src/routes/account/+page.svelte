<script lang="ts">
  import { goto } from "$app/navigation";
  import CodeInput from "$lib/components/CodeInput.svelte";
  import ResendCode from "$lib/components/ResendCode.svelte";
  import StepBack from "$lib/components/StepBack.svelte";
  import StatusLine from "$lib/components/StatusLine.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Tabs from "$lib/components/ui/tabs";
  import { Progress } from "$lib/db";
  import { m } from "$lib/paraglide/messages";
  import {
    confirmEmail,
    createAccount,
    resetPassword,
    sendConfirmationCode,
    sendResetCode,
    signIn,
    type AccountProblem,
    type AccountResult,
  } from "$lib/sync/account";

  /**
   * Where the reader is in getting signed in.
   *
   * `enter` is the email and password, `confirm` the code that proves the
   * email is theirs, and `forgot` then `reset` the way back in without the
   * password.
   */
  type Step = "enter" | "confirm" | "forgot" | "reset";

  const progress = new Progress();

  let step = $state<Step>("enter");
  let tab = $state<"sign-in" | "create">("sign-in");
  let email = $state("");
  let password = $state("");
  let code = $state("");
  let isLoaded = $state(false);
  let isBusy = $state(false);
  let problem = $state<AccountProblem | null>(null);
  /** Whether a fresh code was just sent, which the reader should be told. */
  let isCodeResent = $state(false);

  const PROBLEM_MESSAGES: Record<AccountProblem, () => string> = {
    "wrong-credentials": m.account_error_wrong_credentials,
    "email-taken": m.account_error_email_taken,
    "password-too-short": m.account_error_password_too_short,
    "invalid-email": m.account_error_invalid_email,
    "wrong-code": m.account_error_wrong_code,
    "code-expired": m.account_error_code_expired,
    "too-many-attempts": m.account_error_too_many_attempts,
    "rate-limited": m.account_error_rate_limited,
    offline: m.account_error_offline,
    unknown: m.account_error_unknown,
  };

  /** The one line under the fields: what went wrong, or what is happening. */
  let status = $derived.by(() => {
    if (problem !== null) return PROBLEM_MESSAGES[problem]();
    if (isBusy && step === "confirm") return m.account_status_checking();
    if (isCodeResent) return m.account_status_code_sent();
    return null;
  });

  $effect(() => {
    void (async () => {
      await progress.load();
      isLoaded = true;
    })();
  });

  function moveTo(next: Step): void {
    step = next;
    problem = null;
    code = "";
    isCodeResent = false;
  }

  /** Runs one step, holding the buttons while it is in flight. */
  async function run(action: () => Promise<void>): Promise<void> {
    isBusy = true;
    problem = null;
    await action();
    isBusy = false;
  }

  /**
   * Where to go once signed in: back to the page that sent the reader here,
   * like an invite, or to settings. Only a path on this site, so a link
   * cannot use the sign-in page to send someone elsewhere.
   */
  function nextPage(): string {
    const next = new URL(location.href).searchParams.get("next");
    return next?.startsWith("/") === true && !next.startsWith("//") ? next : "/settings";
  }

  /** Where a sign-in, a new account, a confirmation or a reset leads next. */
  async function follow(result: AccountResult): Promise<void> {
    if (result.status === "refused") {
      problem = result.problem;
      return;
    }
    if (result.status === "signed-in") {
      await goto(nextPage());
      return;
    }
    const failed = await sendConfirmationCode(email);
    if (failed !== null) {
      problem = failed;
      return;
    }
    moveTo("confirm");
  }

  function submitEnter(): Promise<void> {
    return run(async () => {
      email = email.trim();
      const enter = tab === "create" ? createAccount : signIn;
      await follow(await enter(progress, email, password));
    });
  }

  function submitConfirm(): Promise<void> {
    return run(async () => {
      await follow(await confirmEmail(progress, email, code, password));
    });
  }

  function submitForgot(): Promise<void> {
    return run(async () => {
      email = email.trim();
      const failed = await sendResetCode(email);
      if (failed !== null) {
        problem = failed;
        return;
      }
      password = "";
      moveTo("reset");
    });
  }

  function submitReset(): Promise<void> {
    return run(async () => {
      await follow(await resetPassword(progress, email, code, password));
    });
  }

  function resend(): Promise<void> {
    return run(async () => {
      const send = step === "reset" ? sendResetCode : sendConfirmationCode;
      problem = await send(email);
      code = "";
      isCodeResent = problem === null;
    });
  }
</script>

<!--
  One card, one step at a time, in the middle of the page. A reader signing in
  has one thing to do, and a page that asks for one thing is the fastest one
  to finish.
-->
<main class="flex w-full flex-1 items-center justify-center">
  <div class="flex w-full max-w-[448px] flex-col gap-6 rounded-lg border border-border bg-card p-6">
    {#if step === "enter"}
      <div class="flex flex-col gap-2">
        <h1 class="text-2xl leading-tight font-semibold tracking-tight">
          {m.account_page_title()}
        </h1>
        <p class="text-sm text-muted-foreground">{m.account_page_description()}</p>
      </div>

      <Tabs.Root
        bind:value={tab}
        onValueChange={() => {
          problem = null;
        }}
      >
        <Tabs.List class="w-full">
          <Tabs.Trigger value="sign-in">{m.account_tab_sign_in()}</Tabs.Trigger>
          <Tabs.Trigger value="create">{m.account_tab_create()}</Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>

      <!--
        A fresh form per tab, not one form whose attributes change. Password
        managers read a form when it appears and mostly miss an autocomplete
        hint that flips later, so they would offer a saved password on
        "Create account" and never offer to generate one.
      -->
      {#key tab}
        <form
          class="flex flex-col gap-5"
          onsubmit={(event) => {
            event.preventDefault();
            void submitEnter();
          }}
        >
          <div class="flex flex-col gap-2">
            <Label for="{tab}-email">{m.account_label_email()}</Label>
            <!-- `username`, not `email`: it is what tells a manager whose password this is. -->
            <Input
              id="{tab}-email"
              name="email"
              type="email"
              autocomplete="username"
              required
              bind:value={email}
              disabled={!isLoaded || isBusy}
            />
          </div>
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <Label for="{tab}-password">{m.account_label_password()}</Label>
              {#if tab === "sign-in"}
                <Button
                  variant="link"
                  type="button"
                  class="h-auto p-0 text-sm"
                  disabled={isBusy}
                  onclick={() => {
                    moveTo("forgot");
                  }}
                >
                  {m.account_button_forgot()}
                </Button>
              {/if}
            </div>
            <Input
              id="{tab}-password"
              name={tab === "create" ? "new-password" : "password"}
              type="password"
              autocomplete={tab === "create" ? "new-password" : "current-password"}
              minlength={8}
              required
              aria-describedby={tab === "create" ? "account-password-hint" : undefined}
              bind:value={password}
              disabled={!isLoaded || isBusy}
            />
            {#if tab === "create"}
              <p id="account-password-hint" class="text-xs text-muted-foreground">
                {m.account_description_password()}
              </p>
            {/if}
          </div>

          <StatusLine message={status} isError={problem !== null} />

          <Button type="submit" class="w-full" disabled={!isLoaded || isBusy}>
            {tab === "create" ? m.account_button_create() : m.account_button_sign_in()}
          </Button>
        </form>
      {/key}
    {:else if step === "confirm"}
      <StepBack
        disabled={isBusy}
        onBack={() => {
          moveTo("enter");
        }}
      />
      <div class="flex flex-col gap-2">
        <h1 class="text-2xl leading-tight font-semibold tracking-tight">
          {m.account_confirm_title()}
        </h1>
        <p class="text-sm text-muted-foreground">{m.account_confirm_description({ email })}</p>
      </div>

      <!-- No confirm button: the code sends itself once the sixth digit is in. -->
      <div class="flex justify-center">
        <CodeInput
          bind:value={code}
          label={m.account_label_code()}
          disabled={isBusy}
          onComplete={() => {
            void submitConfirm();
          }}
        />
      </div>

      <ResendCode
        disabled={isBusy}
        message={status}
        isError={problem !== null}
        onResend={() => {
          void resend();
        }}
      />
    {:else if step === "forgot"}
      <StepBack
        disabled={isBusy}
        onBack={() => {
          moveTo("enter");
        }}
      />
      <div class="flex flex-col gap-2">
        <h1 class="text-2xl leading-tight font-semibold tracking-tight">
          {m.account_forgot_title()}
        </h1>
        <p class="text-sm text-muted-foreground">{m.account_forgot_description()}</p>
      </div>

      <form
        class="flex flex-col gap-5"
        onsubmit={(event) => {
          event.preventDefault();
          void submitForgot();
        }}
      >
        <div class="flex flex-col gap-2">
          <Label for="forgot-email">{m.account_label_email()}</Label>
          <Input
            id="forgot-email"
            name="email"
            type="email"
            autocomplete="username"
            required
            bind:value={email}
            disabled={isBusy}
          />
        </div>

        <StatusLine message={status} isError={problem !== null} />

        <Button type="submit" class="w-full" disabled={isBusy}>
          {m.account_button_send_code()}
        </Button>
      </form>
    {:else}
      <StepBack
        disabled={isBusy}
        onBack={() => {
          moveTo("enter");
        }}
      />
      <div class="flex flex-col gap-2">
        <h1 class="text-2xl leading-tight font-semibold tracking-tight">
          {m.account_reset_title()}
        </h1>
        <p class="text-sm text-muted-foreground">{m.account_reset_description({ email })}</p>
      </div>

      <form
        class="flex flex-col gap-5"
        onsubmit={(event) => {
          event.preventDefault();
          void submitReset();
        }}
      >
        <!--
          Hidden, and here only for password managers: without the account in
          the form, a manager cannot tell which saved login the new password
          replaces, and offers to save it as a new one.
        -->
        <input type="email" name="email" autocomplete="username" value={email} readonly hidden />
        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium">{m.account_label_code()}</span>
          <CodeInput
            bind:value={code}
            label={m.account_label_code()}
            disabled={isBusy}
            onComplete={() => document.getElementById("reset-password")?.focus()}
          />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="reset-password">{m.account_label_new_password()}</Label>
          <Input
            id="reset-password"
            name="new-password"
            type="password"
            autocomplete="new-password"
            minlength={8}
            required
            aria-describedby="reset-password-hint"
            bind:value={password}
            disabled={isBusy}
          />
          <p id="reset-password-hint" class="text-xs text-muted-foreground">
            {m.account_description_password()}
          </p>
        </div>

        <StatusLine message={status} isError={problem !== null} />

        <Button type="submit" class="w-full" disabled={isBusy || code.length < 6}>
          {m.account_button_set_password()}
        </Button>
      </form>

      <ResendCode
        disabled={isBusy}
        message={null}
        isError={false}
        onResend={() => {
          void resend();
        }}
      />
    {/if}
  </div>
</main>
