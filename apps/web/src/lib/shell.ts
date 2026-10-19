/**
 * The one door to the outside (docs/55-DESKTOP-APP.md). The app asks here to open a link, notify, set the badge
 * or hear the shell; in a browser each does the web thing, and the Mac app will hook `__BRAINDOG_SHELL__` later.
 */

export type ShellEvent = 'slash' | 'goto';

/** What the Mac app puts on `window`; every part is optional so a partial shell still works. */
interface Shell {
  open?(url: string): void;
  notify?(title: string, body: string): void;
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

/** A notification: the shell's, else a web one only if already granted (never asks here). */
export function notify(title: string, body: string): void {
  const s = shell();
  if (s?.notify) return s.notify(title, body);
  const N = (globalThis as { Notification?: typeof Notification }).Notification;
  if (N && N.permission === 'granted') new N(title, { body });
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
  return shell()?.on?.(event, fn) ?? (() => {});
}

/** Room for the window's title bar, read by the page head as `--shell-inset`; 0 in a browser. */
export function applyInset(): void {
  const root = (globalThis as { document?: Document }).document?.documentElement;
  if (root) root.style.setProperty('--shell-inset', `${isApp ? (shell()?.inset ?? 78) : 0}px`);
}
