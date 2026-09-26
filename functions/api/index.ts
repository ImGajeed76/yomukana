// yomukana's API: the writes that need a rule checked before they happen.
//
// Progress goes straight from the browser to the database through the Data
// API, under row-level security. This handles what the database cannot judge
// well on its own: whether a name is acceptable, who may do what in a group,
// and later whether a score is plausible. It connects as the database owner,
// so every query here scopes itself to the caller.
//
// Reached through this site's /api/v1, forwarded by middleware.ts in
// production and by the Vite proxy locally. It sees only what sync already
// sends: a profile and a score, never a sentence or a keystroke.

import { Hono } from "hono";
import { groups } from "./groups";
import { profiles } from "./profiles";
import { scores } from "./scores";

const app = new Hono();

app.get("/", (c) => c.json({ ok: true }));
app.route("/", profiles);
app.route("/", groups);
app.route("/", scores);

export default app;
