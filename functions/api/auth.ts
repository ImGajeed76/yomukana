// Who is calling, from the token Neon Auth gave them.
//
// The function's address is public, so every request that changes something
// proves who it is with a signed token, checked here against Neon Auth's own
// published keys. The reader's id comes from the token and nowhere else: a
// request cannot name someone else and act as them.

import { createRemoteJWKSet, jwtVerify } from "jose";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is not set`);
  return value;
}

const keys = createRemoteJWKSet(new URL(requireEnv("NEON_AUTH_JWKS_URL")));
// Neon Auth names its origin as the issuer of a signed-in reader's token.
const issuer = new URL(requireEnv("NEON_AUTH_BASE_URL")).origin;

const BEARER = "bearer ";

/** The signed-in reader's id, or null if the request has no valid token. */
export async function readerOf(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;

  // An invalid, expired or forged token is refused by jwtVerify throwing. That
  // is a caller's mistake or an attack, not a fault here, so it is not logged.
  try {
    const { payload } = await jwtVerify(header.slice(BEARER.length), keys, { issuer });
    // Anonymous tokens exist too, for reading public data. They are nobody.
    if (payload.role !== "authenticated" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}
