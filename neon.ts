import { defineConfig } from "@neon/config/v1";

// What Neon runs for yomukana. Apply with `neon deploy`.
//
// Auth signs readers in, with email and password. The Data API lets the static
// site read and write their progress straight from the browser, with Postgres
// row-level security deciding which rows each signed-in reader may touch. There
// is no server of ours in between, which is the point: see CLAUDE.md 0.
export default defineConfig({
  auth: true,
  dataApi: true,

  branch: (branch) => {
    if (branch.isDefault) return {};
    // New branches are for trying a migration against real data, then gone.
    if (!branch.exists) return { ttl: "7d" };
    return {};
  },
});
