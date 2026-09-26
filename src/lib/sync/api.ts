// Calls to yomukana's API function, at this site's own /api/v1.
//
// The function handles the writes that need a rule checked (names now, scores
// and groups later). It is told who is calling by the reader's sign-in token,
// the same one the Data API is sent. See functions/api.

import { connect } from "./client";

/** The reader's current sign-in token, or null when nobody is signed in. */
async function tokenOf(): Promise<string | null> {
  const client = await connect();
  const session = await client.auth.getSession();
  return session.data?.session.token ?? null;
}

/**
 * Calls the function. Null when it could not be reached at all, which callers
 * report as being offline. A request that reached it and was refused comes
 * back as its response, for the caller to read the reason from.
 */
export async function callApi(path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = await tokenOf();
  const headers = new Headers(init.headers);
  if (token !== null) headers.set("authorization", `Bearer ${token}`);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  // A fetch that never reached the function rejects rather than resolving.
  return fetch(`/api/v1${path}`, { ...init, headers }).catch(() => null);
}

/**
 * Calls the function as nobody in particular, for what anyone may see.
 *
 * Separate from callApi so a visitor who never signed in does not download
 * the sign-in SDK only to learn that they have no token.
 */
export function callApiSignedOut(path: string): Promise<Response | null> {
  return fetch(`/api/v1${path}`).catch(() => null);
}
