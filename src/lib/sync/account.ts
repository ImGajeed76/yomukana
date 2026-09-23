// Signing in and out, and deleting the synced copy.
//
// An account exists only so a second device can find the reader's progress. It
// is an email and a password and nothing else: no name, no profile.

import { NEVER_SYNCED, type Progress } from "../db";
import { AUTH_URL, connect } from "./client";
import { signedInRecord } from "./sync";

/** Why an account step did not work, in the terms the reader can act on. */
export type AccountProblem =
  | "wrong-credentials"
  | "email-taken"
  | "password-too-short"
  | "invalid-email"
  | "wrong-code"
  | "code-expired"
  | "too-many-attempts"
  | "rate-limited"
  | "offline"
  | "unknown";

export type AccountResult =
  /** Signed in, with a confirmed email. Sync can start. */
  | { readonly status: "signed-in" }
  /** The password was right, and the email still has to be confirmed with a code. */
  | { readonly status: "needs-code" }
  | { readonly status: "refused"; readonly problem: AccountProblem };

/**
 * Error codes, mapped to what the reader is told.
 *
 * Two vocabularies. The SDK rewrites Better Auth's codes into its own for
 * sign-in and sign-up, and folds every code it has no name for into
 * `validation_failed`, which is where the code steps lose theirs. So those
 * go to the auth service directly and come back in Better Auth's own words.
 */
const PROBLEMS: Readonly<Record<string, AccountProblem>> = {
  // From the SDK.
  invalid_credentials: "wrong-credentials",
  user_already_exists: "email-taken",
  email_exists: "email-taken",
  weak_password: "password-too-short",
  email_address_invalid: "invalid-email",
  over_request_rate_limit: "rate-limited",
  // From Better Auth, for the code steps.
  INVALID_OTP: "wrong-code",
  OTP_EXPIRED: "code-expired",
  TOO_MANY_ATTEMPTS: "too-many-attempts",
  INVALID_EMAIL: "invalid-email",
  VALIDATION_ERROR: "invalid-email",
  PASSWORD_TOO_SHORT: "password-too-short",
};

function codeOf(error: unknown): string {
  if (typeof error !== "object" || error === null || !("code" in error)) return "";
  return String(error.code);
}

function statusOf(error: unknown): number {
  if (typeof error !== "object" || error === null || !("status" in error)) return 0;
  return Number(error.status);
}

/**
 * Posts one code step straight to the auth service. Returns what went wrong,
 * or null if nothing did.
 */
async function postCodeStep(path: string, body: object): Promise<AccountProblem | null> {
  // A fetch that never reached the server rejects rather than resolving.
  const response = await fetch(`${AUTH_URL}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (response === null) return "offline";
  if (response.ok) return null;
  const payload: unknown = await response.json().catch(() => null);
  return PROBLEMS[codeOf(payload)] ?? "unknown";
}

function problemOf(error: unknown): AccountProblem {
  // A fetch that never reached the server rejects with a TypeError; one that
  // did comes back with a code.
  if (error instanceof TypeError) return "offline";
  return PROBLEMS[codeOf(error)] ?? "unknown";
}

interface AuthResponse {
  readonly data?: { readonly user?: { readonly emailVerified?: boolean } | null } | null;
  readonly error?: unknown;
}

/**
 * Runs one auth call, and turns both ways the SDK reports a refusal into one.
 *
 * It returns an `error` field for some refusals and throws from its fetch
 * wrapper for others, depending on where the refusal happened. Both mean the
 * same thing to the reader.
 */
async function attempt<Response extends { readonly error?: unknown }>(
  call: () => Promise<Response>,
): Promise<{ response: Response } | { error: unknown }> {
  try {
    const response = await call();
    if (response.error !== null && response.error !== undefined) return { error: response.error };
    return { response };
  } catch (error) {
    return { error };
  }
}

/** Remembers who is signed in on this device, which is what turns sync on. */
async function remember(progress: Progress, email: string): Promise<AccountResult> {
  await progress.saveSyncState(signedInRecord(await progress.syncState(), email));
  return { status: "signed-in" };
}

/**
 * What a sign-in or sign-up that went through means for the reader.
 *
 * An account whose email was never confirmed does not sync yet. Whether the
 * server lets it sign in is a setting on the auth service, so the app checks
 * for itself rather than depending on how that is set.
 */
async function landed(
  progress: Progress,
  email: string,
  response: AuthResponse,
): Promise<AccountResult> {
  if (response.data?.user?.emailVerified !== true) return { status: "needs-code" };
  return remember(progress, email);
}

export async function signIn(
  progress: Progress,
  email: string,
  password: string,
): Promise<AccountResult> {
  const client = await connect();
  const result = await attempt(() => client.auth.signIn.email({ email, password }));
  if ("response" in result) return landed(progress, email, result.response);
  // With confirmation required, the server refuses the sign-in itself. The
  // password was still right, so the next step is the same.
  if (codeOf(result.error) === "email_not_confirmed") return { status: "needs-code" };
  return { status: "refused", problem: problemOf(result.error) };
}

export async function createAccount(
  progress: Progress,
  email: string,
  password: string,
): Promise<AccountResult> {
  const client = await connect();
  // Better Auth wants a name. Nothing here shows one, so it gets the email
  // rather than something the reader has to invent.
  const result = await attempt(() => client.auth.signUp.email({ email, password, name: email }));
  if ("response" in result) return landed(progress, email, result.response);
  // Better Auth says the email is taken with a 422 and a code the SDK has no
  // name for, so it arrives as a bare validation failure with that status.
  if (statusOf(result.error) === 422) return { status: "refused", problem: "email-taken" };
  return { status: "refused", problem: problemOf(result.error) };
}

/** Emails a code that confirms the reader owns the address. Returns what went wrong, if anything. */
export function sendConfirmationCode(email: string): Promise<AccountProblem | null> {
  return postCodeStep("email-otp/send-verification-otp", { email, type: "email-verification" });
}

/** Emails a code for setting a new password. Returns what went wrong, if anything. */
export function sendResetCode(email: string): Promise<AccountProblem | null> {
  return postCodeStep("email-otp/send-verification-otp", { email, type: "forget-password" });
}

/**
 * Confirms the email with the code from it, then signs in.
 *
 * The password comes along because confirming does not always leave a session
 * behind, and asking for it a second time straight after would be absurd.
 */
export async function confirmEmail(
  progress: Progress,
  email: string,
  code: string,
  password: string,
): Promise<AccountResult> {
  const problem = await postCodeStep("email-otp/verify-email", { email, otp: code });
  if (problem !== null) return { status: "refused", problem };
  return signIn(progress, email, password);
}

/** Sets a new password with the code from the reset email, then signs in with it. */
export async function resetPassword(
  progress: Progress,
  email: string,
  code: string,
  password: string,
): Promise<AccountResult> {
  const problem = await postCodeStep("email-otp/reset-password", { email, otp: code, password });
  if (problem !== null) return { status: "refused", problem };
  return signIn(progress, email, password);
}

/** Signs this device out. The synced copy stays for the next sign-in. */
export async function signOut(progress: Progress): Promise<void> {
  await progress.saveSyncState(NEVER_SYNCED);
  const client = await connect();
  // Signing out locally is what matters, and it has already happened. If the
  // server cannot be told, its session cookie simply expires on its own.
  try {
    await client.auth.signOut();
  } catch (error) {
    console.warn("sign-out did not reach the server", error);
  }
}

/**
 * Deletes every row the signed-in reader has on the server.
 *
 * Returns whether it worked, so the caller can refuse to go on and delete the
 * local copy when the server one is still there. Deleting "everything" and
 * finding it back on the next sign-in would be worse than not deleting at all.
 */
export async function deleteSyncedCopy(): Promise<boolean> {
  const client = await connect();
  // PostgREST refuses a delete with no filter, as a guard against exactly
  // this. Row-level security already limits it to the reader's own rows, so
  // the filter is one every row matches.
  try {
    const results = await Promise.all([
      client.from("items").delete().neq("item_id", ""),
      client.from("attempts").delete().neq("attempt_id", ""),
      client.from("readers").delete().neq("user_id", ""),
      client.from("sessions").delete().neq("user_id", ""),
    ]);
    return results.every((result) => result.error === null);
  } catch (error) {
    console.warn("could not delete the synced copy", error);
    return false;
  }
}
