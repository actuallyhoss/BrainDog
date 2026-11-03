/**
 * What an installed plugin may do here, as structure: the record's own lines (`addon {id}` `here.may`, worded by
 * `grantsOf` in `packages/record/src/methods/addons.ts` and by `@braindog/declare/may-lines`) read into rows a person
 * scans, each with its glyph, a short title, one meta line and its hosts and keys as chips.
 *
 * THE RECORD'S WORD STAYS THE SOURCE. Nothing here is guessed from the file: a line this does not know is kept whole as
 * a row of its own, so a new kind of line the record learns is still shown, only plainer.
 *
 * WHAT IS SAID ELSEWHERE ON THE PAGE IS NOT SAID AGAIN. Its lists and its pages are the "What it adds" card's, so they are
 * handed back apart (`lists`, `pages`) for a page that has no such card. Scripts that call nothing outside are folded
 * into one row ("26 scripts run inside BrainDog"), since a wall of 26 lines that each say "calls nothing outside" is
 * the same fact 26 times.
 *
 * PLAIN NODE LOADS THIS FILE: no import but a type.
 */

import type { IconName } from '$lib/ui/icons.ts';

/** One thing it may do, drawn as a row. `outside` marks a row that reaches past this BrainDog. */
export type MayRow = { key: string; glyph: IconName; title: string; meta: string | null; chips: string[]; outside: boolean };

/** A script that runs inside BrainDog only, folded under one row. */
export type InsideScript = { title: string; when: string };

export type MayRead = {
  lists: string[];
  pages: string[];
  /** Pages drawn once for each row of a list, said as a count rather than as `{{name}}`. */
  rowPages: number;
  rows: MayRow[];
  inside: InsideScript[];
};

const split = (s: string): string[] =>
  s
    .replace(/\.$/u, '')
    .split(/, | and /u)
    .map((x) => x.trim())
    .filter((x) => x !== '');

const UNITS: Readonly<Record<string, [string, string]>> = {
  s: ['second', 'seconds'],
  m: ['minute', 'minutes'],
  h: ['hour', 'hours'],
  d: ['day', 'days'],
  w: ['week', 'weeks'],
};
const ONCE: Readonly<Record<string, string>> = { h: 'Hourly', d: 'Daily', w: 'Weekly' };

/** "every 1d" is "Daily", "every 15m" is "Every 15 minutes"; anything else is the record's words with a capital. */
export function whenWords(when: string): string {
  const m = /^every (\d+)\s*([smhdw])$/u.exec(when.trim());
  if (m) {
    const n = Number(m[1]);
    const unit = UNITS[m[2]!]!;
    if (n === 1) return ONCE[m[2]!] ?? `Every ${unit[0]}`;
    return `Every ${n} ${unit[1]}`;
  }
  const t = when.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The record's lines, read into rows. */
export function mayOf(lines: readonly string[]): MayRead {
  const out: MayRead = { lists: [], pages: [], rowPages: 0, rows: [], inside: [] };
  let i = 0;
  const row = (r: Omit<MayRow, 'key'>) => out.rows.push({ ...r, key: `${i++}` });
  for (const raw of lines) {
    const line = raw.trim();
    let m: RegExpExecArray | null;
    if ((m = /^Lists: (.+)$/u.exec(line))) {
      out.lists.push(...split(m[1]!));
      continue;
    }
    if ((m = /^Pages: (.+)$/u.exec(line))) {
      for (const p of split(m[1]!)) if (/\{\{/u.test(p)) out.rowPages += 1;
      else out.pages.push(p);
      continue;
    }
    if ((m = /^Script (.+?): runs (.+?)(?:, may call (.+?)|, calls nothing outside)(?: with the key (.+?))?\.$/u.exec(line))) {
      const [, title, when, hosts, keys] = m;
      const chips = [...(hosts ? split(hosts) : []), ...(keys ? split(keys).map((k) => `Key: ${k}`) : [])];
      if (!hosts && !keys) out.inside.push({ title: title!, when: whenWords(when!) });
      else row({ glyph: hosts ? 'globe' : 'key', title: title!, meta: `${whenWords(when!)}${hosts ? ', calls out' : ''}`, chips, outside: Boolean(hosts) });
      continue;
    }
    if ((m = /^(An automation|(\d+) automations) that run while nobody is looking\.$/u.exec(line))) {
      const n = m[2] ? Number(m[2]) : 1;
      row({ glyph: 'refresh', title: n === 1 ? '1 automation' : `${n} automations`, meta: 'Run on their own when something changes', chips: [], outside: false });
      continue;
    }
    if ((m = /^(A digest|(\d+) digests) it sends you\.$/u.exec(line))) {
      const n = m[2] ? Number(m[2]) : 1;
      row({ glyph: 'mail', title: n === 1 ? '1 digest' : `${n} digests`, meta: 'Sent to you', chips: [], outside: false });
      continue;
    }
    if ((m = /^(.+) may send you notifications, at most (\d+) a day\.$/u.exec(line))) {
      row({ glyph: 'bell', title: 'Sends you notifications', meta: `${m[1]}, at most ${m[2]} a day`, chips: [], outside: false });
      continue;
    }
    if ((m = /^(.+) asks Slash's model on your allowance, at most (\d+) times? a run\.$/u.exec(line))) {
      row({ glyph: 'slash', title: "Uses Slash's model", meta: `${m[1]}, at most ${m[2]} a run, on your allowance`, chips: [], outside: false });
      continue;
    }
    if ((m = /^Its view on (.+?) can (.+), as whoever is looking\.$/u.exec(line))) {
      row({ glyph: 'edit', title: `Its view on ${m[1]}`, meta: `Can ${m[2]}`, chips: [], outside: false });
      continue;
    }
    if (/^Keeps a little state of its own/u.test(line)) {
      row({ glyph: 'archive', title: 'Keeps a little state of its own', meta: 'At most 1 MB, removed with its data', chips: [], outside: false });
      continue;
    }
    if ((m = /^A tool for your agents, addon\.[^.\s]+\.([^:\s]+): (.+)$/u.exec(line))) {
      const writes = / It may change rows, as whoever calls it\.$/u.test(m[2]!);
      row({ glyph: 'skill', title: `A tool for your agents: ${m[1]}`, meta: m[2]!.replace(/ It may change rows, as whoever calls it\.$/u, '').replace(/\.$/u, '') + (writes ? '. May change rows' : ''), chips: [], outside: false });
      continue;
    }
    if ((m = /^In the command bar: (.+)$/u.exec(line))) {
      row({ glyph: 'keyboard', title: 'In the command bar', meta: null, chips: split(m[1]!), outside: false });
      continue;
    }
    if ((m = /^An action on (.+?) rows: (.+)$/u.exec(line))) {
      row({ glyph: 'more', title: `An action on ${m[1]} rows`, meta: null, chips: split(m[2]!), outside: false });
      continue;
    }
    if ((m = /^(A door others can post to|A [a-z][\w -]*?)(?: to ([^\s:]+))?(?: with the key ([^:]+?))?: (.+)$/u.exec(line))) {
      const [, how, host, key, what] = m;
      const chips = [...(host ? [host] : []), ...(key ? [`Key: ${key}`] : [])];
      row({ glyph: 'inbox', title: cap(what!.replace(/\.$/u, '')), meta: how === 'A door others can post to' ? 'A door others can post to' : `Comes in by ${how!.replace(/^A /u, '')}`, chips, outside: how === 'A door others can post to' });
      continue;
    }
    row({ glyph: 'check', title: line.replace(/\.$/u, ''), meta: null, chips: [], outside: false });
  }
  /* WHAT REACHES OUTSIDE FIRST: it is the part of the plan a person weighs. */
  out.rows.sort((a, b) => Number(b.outside) - Number(a.outside));
  return out;
}

/** The folded row's words: "26 scripts run inside BrainDog". */
export const insideWords = (n: number): string => (n === 1 ? '1 script runs inside BrainDog' : `${n} scripts run inside BrainDog`);
