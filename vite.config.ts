import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv } from "vite";

/**
 * `/api/auth`, forwarded to Neon Auth, so the session cookie belongs to this
 * site rather than to Neon's. Safari discards the other kind. The live site
 * does the same through middleware.ts; this is for `bun run dev` and
 * `bun run preview`, which reach the branch `.env.local` names.
 */
const AUTH_PATH = "/api/auth";

function authProxy(target: string): Record<string, object> {
  return {
    [AUTH_PATH]: {
      target,
      changeOrigin: true,
      rewrite: (path: string) => path.slice(AUTH_PATH.length),
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "PUBLIC_");
  const proxy = authProxy(env.PUBLIC_NEON_AUTH_URL ?? "");
  return {
    server: { proxy },
    preview: { proxy },
    plugins: [
      tailwindcss(),
      sveltekit({
        compilerOptions: {
          // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
          runes: ({ filename }) =>
            filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
        },
        adapter: adapter(),
      }),

      paraglideVitePlugin({
        project: "./project.inlang",
        outdir: "./src/lib/paraglide",
        emitTsDeclarations: true,
        // The app is fully static and has no server, so locale cannot come from a
        // URL prefix or a server-set cookie. It is the reader's choice, remembered
        // in their own browser, falling back to what their browser asks for.
        strategy: ["localStorage", "preferredLanguage", "baseLocale"],
        // One module per message tree-shakes best, and in dev it means a couple
        // of hundred requests per page load and an output directory that is wiped
        // and rewritten under the dev server every time a message changes, which
        // is how `m.nav_link_practice is not a function` happens. Paraglide
        // recommends splitting by locale in dev for exactly this.
        outputStructure: command === "build" ? "message-modules" : "locale-modules",
      }),
    ],
  };
});
