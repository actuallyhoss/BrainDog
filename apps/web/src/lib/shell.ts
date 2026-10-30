/**
 * The one door to the outside (docs/55-DESKTOP-APP.md). The app asks here to open a link, notify, set the badge
 * or hear the shell; in a browser each does the web thing, and the Mac app will hook `__BRAINDOG_SHELL__` later.
 */

import { fromLegacy, pathOnly, split } from './at.ts';

export type ShellEvent = 'slash' | 'goto';

/** What the Mac app puts on `window`; every part is optional so a partial shell still works. */
interface Shell {
  open?(url: string): void;
  notify?(title: string, body: string, goto?: string): void;
  badge?(n: number): void;
  inset?: number;
  on?(event: ShellEvent, fn: (arg?: string) => void): () => void;
}

const shell = (): Shell | undefined => (globalThis as { __BRAINDOG_SHELL__?: Shell }).__BRAINDOG_SHELL__;

/** False unless the Mac app has put its shell on the window. */
export const isApp: boolean = shell() !== undefined;

/**
 * An outside link: the shell's browser in the app, a new tab with noopener in a browser. `here` leaves this tab
 * instead (a payment page opened after a wait, which a popup blocker would drop as a new tab).
 */
export function openOutside(url: string, opts: { here?: boolean } = {}): void {
  const s = shell();
  if (s?.open) return s.open(url);
  if (opts.here === true && globalThis.location) return globalThis.location.assign(url);
  globalThis.open?.(url, '_blank', 'noopener,noreferrer');
}

/** Hear things locally where there is no shell (a browser notification's click), so `goto` works in both. */
const local: Record<ShellEvent, Set<(arg?: string) => void>> = { slash: new Set(), goto: new Set() };

/**
 * A notification: the shell's, else a web one only if already granted (never asks here). `goto` is the app's address a
 * click takes the window to; the shell focuses the window first.
 */
export function notify(title: string, body: string, goto?: string): void {
  const s = shell();
  if (s?.notify) return s.notify(title, body, goto);
  const N = (globalThis as { Notification?: typeof Notification }).Notification;
  if (N && N.permission === 'granted') {
    const n = new N(title, { body });
    n.onclick = () => {
      globalThis.focus?.();
      if (goto) local.goto.forEach((fn) => fn(goto));
    };
  }
}

const KEY = 'braindog.macNotifications';

/** The "Mac notifications" switch: on by default in the app, off in a browser, until the person sets it. */
export function macNotifications(): boolean {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    if (v === 'on') return true;
    if (v === 'off') return false;
  } catch {
    /* Storage can be blocked; the default stands. */
  }
  return isApp;
}

export function setMacNotifications(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* Not kept this time; the switch still reads its default. */
  }
}

/** True while this window is the one in front, where a notification would only repeat what is on screen. */
export function windowFocused(): boolean {
  const d = (globalThis as { document?: Document }).document;
  return !!d && d.visibilityState === 'visible' && d.hasFocus();
}

/** The app badge count; nothing where the browser has no badge. */
export function setBadge(n: number): void {
  const s = shell();
  if (s?.badge) return s.badge(n);
  const nav = (globalThis as { navigator?: Navigator & { setAppBadge?(n: number): Promise<void> } }).navigator;
  void nav?.setAppBadge?.(n)?.catch(() => {});
}

/** Hear the shell ("slash", "goto"); a browser never sends either, so this is a no-op there. Returns the stopper. */
export function onShell(event: ShellEvent, fn: (arg?: string) => void): () => void {
  const s = shell();
  if (s?.on) return s.on(event, fn);
  local[event].add(fn);
  return () => void local[event].delete(fn);
}

/** Room for the window's title bar, read by the page head as `--shell-inset`; 0 in a browser. */
export function applyInset(): void {
  const root = (globalThis as { document?: Document }).document?.documentElement;
  if (root) root.style.setProperty('--shell-inset', `${isApp ? (shell()?.inset ?? 78) : 0}px`);
}

/**
 * Where a shell `goto` may take the window: an address of the app and nothing else. Anything with a scheme, a host,
 * a backslash or a `..` is ignored, and so is one of the host's doors (`/api`, `/auth`, `DOORS` in `at.ts`), so a link
 * from outside cannot steer the app off itself. The app is the root now, and an address from when it was under `/app`
 * is read as the one it names (`fromLegacy`), because the Mac app's Go menu may still hold one. Null means ignore.
 */
export function appPath(arg: string | undefined): string | null {
  if (typeof arg !== 'string' || arg.length > 512 || /[\\\u0000-\u001f]|\.\./.test(arg) || !arg.startsWith('/') || arg.startsWith('//')) return null;
  const path = fromLegacy(arg);
  /* CHECKED AGAIN ONCE `/app` IS OFF (SEC4): `/app//evil.example` passed every check above as typed. */
  if (!pathOnly(path.replace(/[?#].*$/, ''))) return null;
  return split(path.replace(/[?#].*$/, '')) === null ? null : path;
}
