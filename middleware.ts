// Forwards /api/auth to Neon Auth, and /api/v1 to the API function, from this
// site's own address.
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

/**
 * Where each path on this site is forwarded to, in production. Public: they
 * name where to knock, not a way in. The API function needs no cookie of its
 * own, it is sent the reader's token, but reaching it from this site's own
 * address keeps the browser from needing permission to call another one.
 */
const ROUTES = [
  {
    prefix: "/api/auth",
    target: "https://ep-bitter-sky-b2binkni.neonauth.c-6.eu-central-1.aws.neon.tech/neondb/auth",
  },
  {
    prefix: "/api/v1",
    target: "https://br-purple-dream-b2zjpmst-api.compute.c-6.eu-central-1.aws.neon.tech",
  },
] as const;

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
  matcher: ["/api/auth/:path*", "/api/v1/:path*"],
};

export default async function middleware(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const route = ROUTES.find((candidate) => incoming.pathname.startsWith(`${candidate.prefix}/`));
  if (route === undefined) return new Response("Not found", { status: 404 });
  const target = new URL(
    route.target + incoming.pathname.slice(route.prefix.length) + incoming.search,
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
