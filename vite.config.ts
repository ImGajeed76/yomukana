import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv } from "vite";

/** A path on this site, forwarded to `target` with the path's own prefix taken off. */
function forward(prefix: string, target: string): Record<string, object> {
  return {
    [prefix]: {
      target,
      changeOrigin: true,
      rewrite: (path: string) => path.slice(prefix.length),
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), ["PUBLIC_", "NEON_"]);
  // Auth, and the API function (see functions/api), both from this site's own
  // address, the way middleware.ts does it in production. For auth that is
  // what keeps the session cookie: Safari discards one set by Neon's address.
  // This covers `bun run dev` and `bun run preview`, which reach the branch
  // `.env.local` names.
  const proxy = {
    ...forward("/api/auth", env.PUBLIC_NEON_AUTH_URL ?? ""),
    ...forward("/api/v1", env.NEON_FUNCTION_API_BASE_URL ?? ""),
  };
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
        // The pages all prerender. /@username cannot, there is one per reader,
        // so it is served this shell and draws itself in the browser.
        adapter: adapter({ fallback: "200.html" }),
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
