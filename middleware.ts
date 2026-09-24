// Forwards /api/auth to Neon Auth, from this site's own address.
//
// Safari throws away cookies set by any site other than the one the reader is
// on, and the session is a cookie. Set by Neon's address it was gone the
// moment after signing in. Set through this site it is the site's own, and
// Safari keeps it.
//
// This is the only code that runs anywhere but the reader's browser, and all
// it does is pass requests along. It reads nothing and keeps nothing. A plain
// rewrite in vercel.json cannot do this: Vercel adds an X-Forwarded-Host of
// this site to what it forwards, and Neon Auth refuses any request carrying
// a host other than its own.
//
// Locally, the Vite dev and preview servers do the same. See vite.config.ts.

/** Production Neon Auth. Public: it names where to knock, not a way in. */
const AUTH_ORIGIN = "https://ep-bitter-sky-b2binkni.neonauth.c-6.eu-central-1.aws.neon.tech";
const AUTH_BASE = "/neondb/auth";
const LOCAL_PREFIX = "/api/auth";

/** The request headers Neon Auth needs. Everything else stays behind, including every forwarded-host header. */
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "authorization",
  "content-type",
  "cookie",
  "origin",
  "user-agent",
];

export const config = {
  matcher: "/api/auth/:path*",
};

export default async function middleware(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const target = new URL(
    AUTH_BASE + incoming.pathname.slice(LOCAL_PREFIX.length) + incoming.search,
    AUTH_ORIGIN,
  );

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    // Auth redirects are for the browser to follow, not for this to follow.
    redirect: "manual",
  });

  // fetch has already unpacked a compressed body, so saying it is still
  // compressed would make the browser unpack it a second time.
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
