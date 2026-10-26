import { defineConfig } from "@neon/config/v1";

// What Neon runs for yomukana. Apply with `neon deploy`.
//
// Auth signs readers in, with email and password. The Data API lets the static
// site read and write their progress straight from the browser, with Postgres
// row-level security deciding which rows each signed-in reader may touch. There
// is no server of ours in between, which is the point: see CLAUDE.md 0.
/**
 * A value from the env file the deploy was given. Missing is an error, never
 * an empty string: deploying an empty value would delete the live one.
 */
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set. Deploy with --env .env.local (dev) or .env.prod.local.`);
  }
  return value;
}

export default defineConfig({
  auth: true,
  dataApi: true,

  // The writes that need a rule checked: names, and later scores and groups.
  // Everything else goes straight to the Data API. See functions/api/index.ts.
  functions: {
    api: {
      name: "yomukana api",
      source: "functions/api/index.ts",
      // Signs push messages: reminders and nudges. Each branch has its own
      // pair, in the env file deployed with it (`neon deploy --env <file>`).
      env: {
        VAPID_PUBLIC_KEY: required("VAPID_PUBLIC_KEY"),
        VAPID_PRIVATE_KEY: required("VAPID_PRIVATE_KEY"),
      },
    },
  },

  // Hourly reminders, see functions/api/notifications.ts. Each run wakes
  // Postgres for five minutes, so not more often. REMINDERS in the env file
  // turns it off on dev, since triggers cannot differ by branch.
  triggers: {
    reminders: {
      type: "schedule",
      function: "api",
      cron: "0 * * * *",
      functionPath: "/cron/reminders",
      enabled: required("REMINDERS") === "on",
    },
  },

  // `production` is what yomukana.app uses. `dev` is where the app is
  // developed and tested, with its own readers and its own auth, so testing
  // never touches a real reader's progress. Both are kept.
  branch: (branch) => {
    if (branch.isDefault || branch.name === "dev") return {};
    // Any other new branch is for trying a migration against real data, then gone.
    if (!branch.exists) return { ttl: "7d" };
    return {};
  },
});
