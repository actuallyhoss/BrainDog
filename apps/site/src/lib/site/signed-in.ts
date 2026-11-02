/**
 * The two cookies the site reads, both set by the app and never by the site.
 *
 * THE WORKER SETS `bd_in` BESIDE THE SESSION (`apps/worker/src/signed-in.ts`) and clears it at sign-out. It holds the
 * record's address or `1`, never a credential, and it is readable by a page (not HttpOnly) so this site, which is
 * prerendered and has no server, can draw "Open BrainDog" in place of "Get early access" and "Sign in".
 *
 * THE APP KEEPS ITS LOOK FOR THIS DEVICE IN `bd_pref` (`apps/web/src/lib/pref.ts`, path `/`), which its shell reads
 * before the first paint to set `data-scheme` and, for high contrast, `data-theme="hc"` (`apps/web/src/app.html`). The
 * site reads the same two the same way (the redo of 2 November: the site wears the scheme the app wears), and the
 * generated palette (`@braindog/skin/house.css`) answers both attributes. THE APP WRITES IT FOR ITS OWN HOST TODAY
 * (`app.brain.dog`, no `domain`), so the site on `brain.dog` reads it only once the app writes it for the parent name
 * as the Worker writes `bd_in`; until then the site follows the operating system, which is what the app does for
 * anyone who has chosen nothing.
 *
 * `static/signed-in.js` IS THESE FUNCTIONS AGAIN, in plain script with no imports, because it runs in the `<head>`
 * before the first paint and the CSP allows no inline script. `test/shell.test.ts` runs both on the same cookies and
 * holds them equal.
 */
export const SIGNED_IN = 'bd_in';
export const PREF = 'bd_pref';

/** The value of one cookie in `cookie` (as `document.cookie` gives it), or null. */
const valueOf = (cookie: string, name: string): string | null => {
  for (const part of cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
};

/** True when `cookie` holds `bd_in` with a value that is not empty. */
export const isSignedIn = (cookie: string): boolean => (valueOf(cookie, SIGNED_IN) ?? '') !== '';

/** The scheme and contrast the app's Settings chose on this device, as the app's shell reads them; nothing chosen is `{}`. */
export function schemeOf(cookie: string): { scheme?: 'light' | 'dark'; contrast?: true } {
  const raw = valueOf(cookie, PREF);
  if (!raw) return {};
  try {
    const p = JSON.parse(decodeURIComponent(raw)) as { scheme?: unknown; contrast?: unknown } | null;
    return {
      ...(p?.scheme === 'light' || p?.scheme === 'dark' ? { scheme: p.scheme } : {}),
      ...(p?.contrast === true ? { contrast: true as const } : {}),
    };
  } catch {
    return {};
  }
}
