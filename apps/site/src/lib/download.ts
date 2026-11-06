/**
 * What /download offers, and which of it the visitor's own device wants.
 *
 * ONE LINE PER PLATFORM, SO AN APP GOING LIVE IS ONE CHANGE: give its row an `href` and its button goes from "Coming soon"
 * on a press to a link. Nothing here says a store has an app until that store shows it: iPhone was rejected on 5 November
 * and Mac has no listing yet, and the page must not send anybody to a store that answers with nothing.
 */
import { APP, DOCS } from './links.ts';

export type PlatformId = 'windows' | 'iphone' | 'mac' | 'android' | 'web' | 'terminal';

export type Platform = {
  id: PlatformId;
  name: string;
  /** The one line under the name. */
  say: string;
  /** The button's words: the store's name, or what it does. */
  action: string;
  /** Where the button goes. No address means the app is not out, and a press says so. */
  href?: string;
  /** The mark, one filled path on a 24 box, or a glyph from `icons.ts` when no brand owns it. */
  mark?: string;
  glyph?: 'globe' | 'terminal';
};

/** Listed under Quartz Apps since 5 November (1.0.1). */
export const WINDOWS_STORE = 'https://apps.microsoft.com/detail/9nw4cq8dfbz4';
export const INSTALL = 'curl -fsSL https://brain.dog/cli/install.sh | sh';

const APPLE = 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701';
const ANDROID = 'M18.4395 5.5586c-.675 1.1664-1.352 2.3318-2.0274 3.498-.0366-.0155-.0742-.0286-.1113-.043-1.8249-.6957-3.484-.8-4.42-.787-1.8551.0185-3.3544.4643-4.2597.8203-.084-.1494-1.7526-3.021-2.0215-3.4864a1.1451 1.1451 0 0 0-.1406-.1914c-.3312-.364-.9054-.4859-1.379-.203-.475.282-.7136.9361-.3886 1.5019 1.9466 3.3696-.0966-.2158 1.9473 3.3593.0172.031-.4946.2642-1.3926 1.0177C2.8987 12.176.452 14.772 0 18.9902h24c-.119-1.1108-.3686-2.099-.7461-3.0683-.7438-1.9118-1.8435-3.2928-2.7402-4.1836a12.1048 12.1048 0 0 0-2.1309-1.6875c.6594-1.122 1.312-2.2559 1.9649-3.3848.2077-.3615.1886-.7956-.0079-1.1191a1.1001 1.1001 0 0 0-.8515-.5332c-.5225-.0536-.9392.3128-1.0488.5449zm-.0391 8.461c.3944.5926.324 1.3306-.1563 1.6503-.4799.3197-1.188.0985-1.582-.4941-.3944-.5927-.324-1.3307.1563-1.6504.4727-.315 1.1812-.1086 1.582.4941zM7.207 13.5273c.4803.3197.5506 1.0577.1563 1.6504-.394.5926-1.1038.8138-1.584.4941-.48-.3197-.5503-1.0577-.1563-1.6504.4008-.6021 1.1087-.8106 1.584-.4941z';
const WINDOWS = 'M0 3.449 9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801';

export const PLATFORMS: readonly Platform[] = [
  { id: 'windows', name: 'Windows', say: 'The desktop app, from the Microsoft Store.', action: 'Get it from Microsoft', href: WINDOWS_STORE, mark: WINDOWS },
  { id: 'iphone', name: 'iPhone', say: 'A notification the moment something needs you.', action: 'App Store', mark: APPLE },
  { id: 'mac', name: 'Mac', say: 'The desktop app, from the Mac App Store.', action: 'Mac App Store', mark: APPLE },
  { id: 'android', name: 'Android', say: 'BrainDog in your pocket, from Google Play.', action: 'Google Play', mark: ANDROID },
  { id: 'web', name: 'Web', say: 'Any browser on any device, with nothing to install.', action: 'Open BrainDog', href: APP, glyph: 'globe' },
  { id: 'terminal', name: 'Terminal', say: 'The command line, for you and your agents, on Mac and Linux.', action: 'Read the docs', href: DOCS, glyph: 'terminal' },
];

export const platformOf = (id: PlatformId): Platform => PLATFORMS.find((p) => p.id === id)!;

/** What a device is called in a sentence, with its own article. */
export type Device = { platform: PlatformId; said: string };

/**
 * The device this browser is on, from what the browser says about itself, or `null` when it says nothing useful.
 *
 * AN IPAD SAYS IT IS A MAC. Safari on iPadOS asks for desktop pages and reports `MacIntel`, so the touch points are what
 * tell it from a Mac. iPhone's row serves it, since the App Store is the same store.
 *
 * AFTER THE PAGE LOADS, NEVER AT THE EDGE. The page is one prerendered file, so search engines and everybody without
 * scripts read every platform, and this only marks which one is theirs.
 */
export function deviceOf(ua: string, platform: string, touchPoints: number): Device | null {
  if (/iPhone|iPod/.test(ua)) return { platform: 'iphone', said: 'an iPhone' };
  if (/iPad/.test(ua) || (platform === 'MacIntel' && touchPoints > 1)) return { platform: 'iphone', said: 'an iPad' };
  if (/Android/.test(ua)) return { platform: 'android', said: 'Android' };
  if (/Windows NT/.test(ua)) return { platform: 'windows', said: 'Windows' };
  if (/Macintosh|Mac OS X/.test(ua)) return { platform: 'mac', said: 'a Mac' };
  if (/CrOS/.test(ua)) return { platform: 'web', said: 'a Chromebook' };
  if (/Linux/.test(ua)) return { platform: 'web', said: 'Linux' };
  return null;
}
