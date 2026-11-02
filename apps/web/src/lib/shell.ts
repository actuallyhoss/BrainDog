/**
 * The one door to the outside (docs/55-DESKTOP-APP.md). The app asks here to open a link, notify, set the badge
 * or hear the shell; in a browser each does the web thing, and the Mac app will hook `__BRAINDOG_SHELL__` later.
 *
 * THREE SHELLS, ONE DOOR (apps plan of 2 Nov, §3.2). The Tauri desktop app puts a shell with no `kind`; the native
 * iPhone and Mac apps put one with `kind: 'ios' | 'mac'`, before the page's scripts, on the app's origin only. Every
 * member past the first five is optional and every helper below is a no-op where the shell does not have it, so a
 * browser, and the old desktop shell, behave exactly as they did.
 */

import { fromLegacy, pathOnly, split } from './at.ts';

/**
 * What the Mac app says: `slash` opens Ask (⌥Space, ⌘J), `search` opens the search (⌘K), `goto` moves the window, and
 * `saved` / `unsaved` name a download that did or did not land in Downloads. `refresh` is the native pull to refresh:
 * the screen reads again (`reread` in `data/live.svelte.ts`).
 */
export type ShellEvent = 'slash' | 'search' | 'goto' | 'saved' | 'unsaved' | 'refresh';

/** Which shell draws the page: none, the Tauri desktop app (no `kind`), or one of the native apps. */
export type ShellKind = 'web' | 'desktop' | 'mac' | 'ios';

/** What a press is felt as on an iPhone. */
export type Haptic = 'press' | 'success' | 'warning' | 'select';

/** One of the web's tabs as the native tab bar takes it (`tabsOf` in `lib/nav.ts`): plain JSON, an address in the record. */
export type ShellPlace = { key: string; href: string; label: string; icon: string };

/** How native shows a screen the web asks for (M2): pushed, in place, as a sheet, or as a tab. */
export type VisitMode = 'push' | 'replace' | 'sheet' | 'tab';

/** What the apps put on `window`; every part is optional so a partial shell still works. */
interface Shell {
  kind?: 'mac' | 'ios';
  open?(url: string): void;
  notify?(title: string, body: string, goto?: string): void;
  badge?(n: number): void;
  /** Room for the title bar: 78 in the Mac app, 0 on an iPhone. */
  inset?: number;
  /** The iPhone's Dynamic Type as a factor, 1 at Large. Native zooms the page by it; the web may read it. */
  textScale?: number;
  on?(event: ShellEvent, fn: (arg?: string) => void): () => void;
  /** The first screen has drawn, so the launch picture can go. */
  ready?(): void;
  haptic?(kind: Haptic): void;
  share?(what: { url: string; title?: string }): void;
  tell?(prefill?: string): void;
  ask?(prefill?: string): void;
  /** The native notification permission, in place of the web's push card. It may answer whether it was given. */
  pushAsk?(): void | boolean | Promise<boolean | void>;
  /** The session is gone: native signs in again, and the web's sign-in page is never drawn in an app. */
  signedOut?(): void;
  /** The page's name for the native nav bar. */
  title?(name: string, sub?: string): void;
  /** The tabs the web would draw, for the native tab bar. */
  places?(tabs: readonly ShellPlace[]): void;
  /** M2: native pushes a screen for this address instead of the page moving in place. Declared, not used yet. */
  visit?(path: string, opts: { mode: VisitMode }): void;
}

const shell = (): Shell | undefined => (globalThis as { __BRAINDOG_SHELL__?: Shell }).__BRAINDOG_SHELL__;

/** False unless an app (the desktop app, or the native iPhone or Mac app) has put its shell on the window. */
export const isApp: boolean = shell() !== undefined;

/** Which shell this page is drawn in, read once: the shell is put on the window before any script of the page runs. */
export function shellKind(): ShellKind {
  const s = shell();
  if (s === undefined) return 'web';
  return s.kind === 'ios' || s.kind === 'mac' ? s.kind : 'desktop';
}

/** In the native iPhone app, where native draws the bars, the tabs and the sign-in, and the web draws the work. */
export const inIosApp: boolean = shellKind() === 'ios';

/** In the native Mac app, which keeps the web's own frame under its title bar. */
export const inMacApp: boolean = shellKind() === 'mac';

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
const local: Record<ShellEvent, Set<(arg?: string) => void>> = { slash: new Set(), search: new Set(), goto: new Set(), saved: new Set(), unsaved: new Set(), refresh: new Set() };

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

/**
 * The "Mac notifications" switch: on by default in the app, off in a browser, until the person sets it. NEVER IN THE
 * IPHONE APP, whose notifications are the record's pushes (`pushAsk`): a second ring from the page would say each twice.
 */
export function macNotifications(): boolean {
  if (inIosApp) return false;
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

/** Hear the shell ("slash", "search", "goto", "refresh"); a browser never sends them, so this is a no-op there. Returns the stopper. */
export function onShell(event: ShellEvent, fn: (arg?: string) => void): () => void {
  const s = shell();
  if (s?.on) return s.on(event, fn);
  local[event].add(fn);
  return () => void local[event].delete(fn);
}

/**
 * Room for the window's title bar, read by the page head as `--shell-inset`; 0 in a browser and on an iPhone, whose bar
 * is native's. AND THE NATIVE KIND ON THE ROOT (`data-shell`), which the stylesheets read to leave out what native draws
 * itself; a browser and the desktop app get no attribute, so nothing of theirs moves.
 */
export function applyInset(): void {
  const root = (globalThis as { document?: Document }).document?.documentElement;
  if (!root) return;
  const room = isApp ? (shell()?.inset ?? (inIosApp ? 0 : 78)) : 0;
  /* THE MAC APP'S 78 IS ROOM BESIDE THE TRAFFIC LIGHTS, NOT ABOVE THEM (apps M01, 2 November): read as height it put a
     78px empty strip over the bar and the sidebar's head, 134 tall in all. In the Mac app the lights sit in the bar's
     own row, so the room is `--shell-lead`, at the start of that row, and nothing is added above it. The desktop app
     keeps its overlay title bar's room above. */
  root.style.setProperty('--shell-inset', `${inMacApp ? 0 : room}px`);
  root.style.setProperty('--shell-lead', `${inMacApp ? room : 0}px`);
  if (inIosApp || inMacApp) root.dataset.shell = shellKind();
}

/* ── the native apps' members: each a no-op where the shell does not have it ───────────────────────────────── */

let readySaid = false;

/** The first screen has drawn (`data/first-drawn.ts`): said once, so the iPhone's launch picture fades out. */
export function shellReady(): void {
  if (readySaid) return;
  readySaid = true;
  shell()?.ready?.();
}

/** A press the hand should feel and a refusal it should notice; one felt within `FELT_MS` of the last is the same one. */
const FELT_MS = 150;
let feltAt = Number.NEGATIVE_INFINITY;

/**
 * The iPhone's haptic, where the app has one, and nothing in a browser. Two points that answer one press (an answer and
 * the toast it pushes) are felt once: the first to ask wins, so the more particular point says it.
 */
export function haptic(kind: Haptic): void {
  const s = shell();
  if (!s?.haptic) return;
  const now = Date.now();
  if (now - feltAt < FELT_MS) return;
  feltAt = now;
  s.haptic(kind);
}

/** Whether the shell can feel a press: a browser's own way (`phone/device.ts`) stands down for it. */
export const shellFeels = (): boolean => typeof shell()?.haptic === 'function';

/**
 * A link handed to the native share sheet, else the browser's (`navigator.share`). True when one of them took it; a
 * browser without either answers false and the caller does its own thing (copying the link, say).
 */
export async function shareOut(what: { url: string; title?: string }): Promise<boolean> {
  const s = shell();
  if (s?.share) {
    s.share(what.title === undefined ? { url: what.url } : { url: what.url, title: what.title });
    return true;
  }
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  if (typeof nav?.share !== 'function') return false;
  try {
    await nav.share(what.title === undefined ? { url: what.url } : { url: what.url, title: what.title });
    return true;
  } catch {
    /* Dismissed, or refused by the browser: nothing was shared. */
    return false;
  }
}

/** Whether the app asks for notifications itself, in place of the web's push subscription. */
export const pushNative = (): boolean => typeof shell()?.pushAsk === 'function';

/**
 * The native notification permission. Answers what native said when it says it (`true` given, `false` refused), `null`
 * when it does not answer or there is no shell to ask.
 */
export async function askPush(): Promise<boolean | null> {
  const s = shell();
  if (!s?.pushAsk) return null;
  try {
    const said = await s.pushAsk();
    return typeof said === 'boolean' ? said : null;
  } catch {
    return null;
  }
}

let outSaid = false;

/**
 * The session is gone. In an app that signs in itself (`signedOut`), native is told once and this answers true, so the
 * caller never sends the page to the web's sign-in; anywhere else it answers false and the caller does as it always did.
 */
export function shellSignedOut(): boolean {
  if (!(inIosApp || inMacApp)) return false;
  const s = shell();
  if (!s?.signedOut) return false;
  if (!outSaid) {
    outSaid = true;
    s.signedOut();
  }
  return true;
}

let titled = '';

/** The page's name (and a quiet second line) for the native nav bar; said again only when it changes. */
export function shellTitle(name: string, sub?: string): void {
  const s = shell();
  if (!s?.title) return;
  const said = JSON.stringify([name, sub ?? null]);
  if (said === titled) return;
  titled = said;
  if (sub === undefined) s.title(name);
  else s.title(name, sub);
}

let placed = '';

/** The tabs the web would draw (`tabsOf`), as plain JSON for the native tab bar; said again only when they change. */
export function shellPlaces(tabs: readonly { key: string; href: string; label: string; icon: string }[]): void {
  const s = shell();
  if (!s?.places) return;
  const plain: ShellPlace[] = tabs.map((t) => ({ key: t.key, href: t.href, label: t.label, icon: t.icon }));
  const said = JSON.stringify(plain);
  if (said === placed) return;
  placed = said;
  s.places(plain);
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
