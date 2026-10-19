/**
 * Google sign-in for the Mac app (docs/55-DESKTOP-APP.md). Google refuses an app window, so the browser does it: the
 * window makes a PKCE verifier, keeps it, and opens the host's start with only its challenge. The browser ends on
 * `braindog://auth?code=`, the shell loads `/signin/desktop?code=`, and that page posts the code and the verifier
 * back here. The verifier never leaves this window; no session token is in any address.
 */

const KEY = 'bd.desktop.verifier';

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
  const q = new URLSearchParams({ desktop: '1', challenge, ...(goTo === '/app/' ? {} : { next: goTo }) });
  return `${origin}/auth/google/start?${q}`;
}

/** Keep the verifier for this window only; a private window that refuses storage just cannot finish. */
export function keepVerifier(verifier: string, store: Pick<Storage, 'setItem'> | undefined = globalThis.sessionStorage): boolean {
  try {
    store?.setItem(KEY, verifier);
    return store !== undefined;
  } catch {
    return false;
  }
}

/** Take the verifier out once; a second take finds nothing. */
export function takeVerifier(store: Pick<Storage, 'getItem' | 'removeItem'> | undefined = globalThis.sessionStorage): string | null {
  try {
    const v = store?.getItem(KEY) ?? null;
    store?.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}

/** Swap the one-time code for the session cookie; true when the host set it. */
export async function swapCode(code: string, verifier: string, origin: string, ask: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await ask(`${origin}/auth/google/desktop`, {
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
