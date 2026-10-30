/**
 * A TOOL'S OWN FACTS, SAID AS A PERSON SAYS THEM: the machines it was seen on and the keys it needs.
 *
 * A tool's page read "Seen on: kiln-mbp" and "Keys it needs: header:Authorization=credentials#1", which is the record's
 * own spelling of both: a host name its runs gave the machine, and a key filed by its number behind the way it is sent.
 * A machine is said by its name (`machineSaid`: "MacBook Pro"), and a key by the name its row has, with how it reaches the
 * tool in words ("Sends the Fenwick deploy key in a header"). Never a value: the record holds none, and a key's name is
 * all that is said.
 *
 * ONLY FOR DRAWING. The field keeps what the record stores, so an edit, a search and the command line still read it.
 *
 * PURE, AND NODE LOADS IT.
 */

import { machineSaid } from './machine-name.ts';

/** The words this file says. */
export const toolWords = {
  header: (key: string) => `Sends ${key} in a header`,
  started: (key: string) => `Is given ${key} when it starts`,
  /** A key the tool reads by a name the record does not keep, such as `BRAINDOG_TOKEN`. */
  named: (name: string) => `a key called ${name}`,
  /** A key the record keeps but whose name this screen was not given. */
  yours: 'one of your keys',
  /** A header the tool sends with no key the record keeps. */
  set: 'a key you set yourself',
} as const;

/** A key's row, said inside a sentence: "the Fenwick deploy key", or "the key Nordhaven API" where its name says no key. */
const keyCalled = (label: string): string => (/\b(?:key|keys|token|password|secret|codes?)$/iu.test(label.trim()) ? `the ${label.trim()}` : `the key ${label.trim()}`);

/** A key's row as `needs` names it, `credentials#3`. */
const SPOKEN = /^[a-z][a-z0-9_]*#[1-9][0-9]*$/u;

/** One element of `needs` as a sentence, or `null` for one with nothing to say. */
function needSaid(need: string, names: ReadonlyMap<string, string> | undefined): string | null {
  const raw = need.trim();
  if (raw === '') return null;
  const header = raw.startsWith('header:');
  const rest = header ? raw.slice('header:'.length) : raw;
  const eq = rest.indexOf('=');
  const name = (eq === -1 ? rest : rest.slice(0, eq)).trim();
  const held = eq === -1 ? '' : rest.slice(eq + 1).trim();
  let key: string;
  if (held !== '') {
    const label = SPOKEN.test(held) ? names?.get(held)?.trim() : undefined;
    key = label ? keyCalled(label) : toolWords.yours;
  } else key = header ? toolWords.set : toolWords.named(name);
  return header ? toolWords.header(key) : toolWords.started(key);
}

/**
 * THE KEYS A TOOL NEEDS, as one line: each in a sentence, the first with its capital and the rest after a semicolon.
 * `names` holds the titles of the rows on the screen (`credentials#1` -> "Fenwick deploy key").
 */
export function needsSaid(needs: readonly unknown[], names?: ReadonlyMap<string, string>): string | null {
  const said = needs.filter((n): n is string => typeof n === 'string').map((n) => needSaid(n, names)).filter((s): s is string => s !== null);
  if (said.length === 0) return null;
  return said.map((s, i) => (i === 0 ? s : s.charAt(0).toLowerCase() + s.slice(1))).join('; ');
}

/** THE MACHINES A TOOL WAS SEEN ON, each by its name, two that would read the same keeping their own words. */
export function hostsSaid(hosts: readonly unknown[]): string | null {
  const all = hosts.filter((h): h is string => typeof h === 'string' && h.trim() !== '').map((h) => h.trim());
  const said = [...new Set(all.map((h) => machineSaid(h, all)))];
  return said.length === 0 ? null : said.join(', ');
}

/** A machine's own name at the end of a line: one word with no space or slash, a hyphen or a dot inside it. */
const HOST_AT_END = /^(.*\s(?:on|from)\s)([A-Za-z0-9][A-Za-z0-9.-]*-[A-Za-z0-9.-]*[A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*\.local)$/u;

/**
 * WHERE A TOOL OR A KEY CAME FROM, its machine said by its name: "~/.claude.json on kiln-mbp" is "~/.claude.json on
 * MacBook Pro", as the command line writes it (`apps/cli/src/tools.ts`, "<file> on <machine>"). Anything else as written.
 */
export function originSaid(origin: string): string {
  const m = HOST_AT_END.exec(origin.trim());
  return m ? `${m[1]!}${machineSaid(m[2]!)}` : origin;
}
