import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
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
}));
