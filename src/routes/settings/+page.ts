import { redirect } from "@sveltejs/kit";

// Settings opens on its first everyday section. Prerendered as a page that
// forwards, so the site stays static.
export function load(): never {
  redirect(307, "/settings/preferences");
}
