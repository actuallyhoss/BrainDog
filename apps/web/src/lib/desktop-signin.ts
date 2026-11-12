/**
 * Signing in to the Mac app through the browser (docs/55-DESKTOP-APP.md). Google refuses an app window, and an emailed
 * link opens in the default browser, so both finish there and come back: the window makes a PKCE verifier, keeps it,
 * and sends only its challenge (to Google's start, or with the link request as `app`). The browser ends on
 * `braindog://auth?code=` (Google's callback, or the link's page through `handOff`), the shell loads
 * `/signin/desktop?code=`, and that page posts the code and the verifier back here. The verifier never leaves this
 * window; no session token is in any address.
 */

const KEY = 'bd.desktop.verifier';
/** Where the window was headed when it began, so the sign-in lands there and not on Today. */
const NEXT = 'bd.desktop.next';
/** The shape of a challenge, as the link carries it in `?app=`. */
export const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

/** A fresh verifier and its S256 challenge. */
export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

/** The host's start in its desktop flavour, for the default browser. */
export function desktopStart(goTo: string, origin: string, challenge: string): string {
  const q = new URLSearchParams({ desktop: '1', challenge, ...(goTo === '/' ? {} : { next: goTo }) });
  return `${origin}/auth/google/start?${q}`;
}

/**
 * Keep the verifier for this window only, and where it was headed; a private window that refuses storage just cannot
 * finish. `next` is a path of the app (`onwardOf` already held it to one), kept beside the verifier because the way
 * back loses everything else.
 */
export function keepVerifier(
  verifier: string,
  store: Pick<Storage, 'setItem' | 'removeItem'> | undefined = globalThis.sessionStorage,
  next: string | null = null,
): boolean {
  try {
    store?.setItem(KEY, verifier);
    if (next !== null && next !== '/') store?.setItem(NEXT, next);
    else store?.removeItem(NEXT);
    return store !== undefined;
  } catch {
    return false;
  }
}

/** Take the verifier out once, with where to land; a second take finds nothing. */
export function takeVerifier(store: Pick<Storage, 'getItem' | 'removeItem'> | undefined = globalThis.sessionStorage): string | null {
  return takeKept(store).verifier;
}

/** Take out what the window kept: the verifier, and the path it was headed to (`null` for the start). */
export function takeKept(store: Pick<Storage, 'getItem' | 'removeItem'> | undefined = globalThis.sessionStorage): { verifier: string | null; next: string | null } {
  try {
    const verifier = store?.getItem(KEY) ?? null;
    const next = store?.getItem(NEXT) ?? null;
    store?.removeItem(KEY);
    store?.removeItem(NEXT);
    return { verifier, next };
  } catch {
    return { verifier: null, next: null };
  }
}

/**
 * In the browser an emailed link opened: seal the unspent link to the app's challenge and get the one-time code for
 * `braindog://auth?code=`. `null` when the host would not; the link is still good here then.
 */
export async function handOff(linkToken: string, challenge: string, origin: string, ask: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await ask(`${origin}/auth/desktop/handoff`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ linkToken, challenge }),
    });
    if (!res.ok) return null;
    const out = (await res.json()) as { ok?: unknown; value?: { code?: unknown } };
    return out.ok === true && typeof out.value?.code === 'string' ? out.value.code : null;
  } catch {
    return null;
  }
}

/** The address that hands a code to the Mac app. */
export const appLink = (code: string): string => `braindog://auth?code=${encodeURIComponent(code)}`;

/** The six digits a sign-in letter carried, with this window's verifier, for the session cookie; true when it is set. */
export async function signInWithCode(code: string, verifier: string, origin: string, label: string, ask: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await ask(`${origin}/auth/app/code`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: code.replace(/\D/g, ''), verifier, label }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Swap the one-time code for the session cookie; true when the host set it. */
export async function swapCode(code: string, verifier: string, origin: string, ask: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await ask(`${origin}/auth/desktop`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, verifier }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
