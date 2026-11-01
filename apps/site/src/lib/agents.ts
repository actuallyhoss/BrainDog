/**
 * WHICH AI APPS THE SITE NAMES. Every list of apps on the site, the connect box, the demo and the docs read this file,
 * so one line below takes an app off the site or puts it back.
 */

/** Codex is off the site until its key (H24) is in, as the launch listings say; set this to true then to name it again. */
export const CODEX_LISTED: boolean = false;

/** Whether the site may name this app: every app but Codex, and Codex too once `CODEX_LISTED` is on. */
export const listed = (name: string): boolean => CODEX_LISTED || name.toLowerCase() !== 'codex';

/** The names the site may say, in the order given. */
export const named = (names: readonly string[]): string[] => names.filter(listed);

/** Names as a sentence says them: "Claude, Cursor and VS Code", or with `or`. */
export function sayList(names: readonly string[], last: 'and' | 'or' = 'and'): string {
  const shown = named(names);
  if (shown.length < 2) return shown.join('');
  return `${shown.slice(0, -1).join(', ')} ${last} ${shown.at(-1)}`;
}

/** The apps the site names, in the order it names them. */
export const APP_NAMES: readonly string[] = named(['Claude', 'ChatGPT', 'Codex', 'Cursor', 'VS Code']);

/** "Claude, ChatGPT, Cursor and VS Code", as a sentence lists them. */
export const APPS_AND = sayList(APP_NAMES);

/** "Claude, ChatGPT, Cursor or VS Code". */
export const APPS_OR = sayList(APP_NAMES, 'or');
