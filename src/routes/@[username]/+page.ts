// One page per reader, so there is nothing to prerender. The static build
// serves its shell (200.html, see vite.config.ts and vercel.json) and the
// profile is asked for in the browser.
export const prerender = false;
export const ssr = false;
