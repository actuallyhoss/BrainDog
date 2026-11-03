/**
 * `braindog feed propose <file>`: a setup file of live feeds, each asked on Decide as the add-on it fills.
 *
 * THE FILE IS A LIST OF FILLS IN THE FILL'S OWN SHAPE, the `FeedSpec` of `packs/live-feed/fill.ts` field for field:
 * `[{ "id": "oxbow-gg", "url": "https://oxbow.gg/api/stats", "every": "1d", "measures": [...] }, ...]`. So a person's
 * feeds live in their own setup file and never in this repository (a person's oxbow.gg and pinwheel feeds become two fills
 * of it in their setup file, never files in the repo), and what one feed can say is what the add-on says.
 *
 * ONE BUILDER. Each fill is built with the add-on's own `fillFeed` over `live-feed.pack.json`, as the app's form and
 * the importer are to, and filed as one question with its document, `body_kind: pack`, the shape the form files
 * (`apps/web/src/lib/record/poll-form.ts`). Nothing installs here: the owner reads `CALLS OUT <host> · every 1d` on
 * Decide and says yes or no.
 *
 * THE WHOLE FILE IS CHECKED BEFORE ANYTHING IS FILED, so a mistake on the fourth feed never leaves three asked and one
 * not. A refusal is one sentence naming the line of the file the fill starts on, because a person mends a file by its
 * lines, and the add-on's own refusals (an id too long, a time of day on an hourly feed) are said in its words.
 *
 * A FEED ALREADY INSTALLED, AND NOTHING NEWER, is said so and counted, as the importer counts a poll filed before.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';

import { fillFeed, type FeedSpec } from '@braindog/pack-live-feed/fill.ts';
import TEMPLATE from '@braindog/pack-live-feed/live-feed.pack.json' with { type: 'json' };
import { fixOf, refused, type Result } from '@braindog/ports';

import { printable } from './clip.ts';
import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
import { refuse } from './json.ts';
import type { AgentIo } from './skills.ts';

const USAGE = 'braindog feed takes propose and one file, as in braindog feed propose feeds.json, and [--host <host>].';

/** One fill as the file holds it, the line it starts on, and the add-on it builds. */
export type Placed = { line: number; spec: FeedSpec; doc: Record<string, unknown> };

/** The file read whole, or the one sentence that says what is wrong with it and where. */
export type Read = { ok: true; feeds: Placed[] } | { ok: false; fix: string };

const SPEC_KEYS = ['id', 'url', 'every', 'at', 'tz', 'grant', 'project', 'organisation', 'measures'];
const MEASURE_KEYS = ['name', 'path', 'unit', 'type', 'at', 'money'];

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const and = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)!}`);

/**
 * The line each element of the top-level list starts on, read off the text itself because `JSON.parse` keeps no
 * places. Strings are stepped over whole, so a bracket or a comma inside one is never read as the list's.
 */
export function elementLines(text: string): number[] {
  const lines: number[] = [];
  let depth = 0;
  let line = 1;
  let inString = false;
  let escaped = false;
  let expecting = false;
  for (const c of text) {
    if (c === '\n') line++;
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (expecting && depth === 1 && !/\s/u.test(c) && c !== ']') {
      lines.push(line);
      expecting = false;
    }
    if (c === '"') inString = true;
    else if (c === '[' || c === '{') {
      depth++;
      if (depth === 1) expecting = true;
    } else if (c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 1) expecting = true;
  }
  return lines;
}

/** The line a parse failed on: V8 says it, or says the offset it stopped at. */
function parseLine(text: string, message: string): number {
  const said = /line (\d+)/u.exec(message);
  if (said) return Number(said[1]);
  const at = /position (\d+)/u.exec(message);
  return at ? text.slice(0, Number(at[1])).split('\n').length : 1;
}

/** What is wrong with one measure's shape, before the add-on reads it, or `null`. */
function measureShape(m: unknown, n: number): string | null {
  if (!isObject(m)) return `measure ${n} is not a number to read, which is a name and a path such as data.mrr.`;
  const odd = Object.keys(m).find((k) => !MEASURE_KEYS.includes(k));
  if (odd !== undefined) return `measure ${n} says ${odd}, which a measure does not take: it takes ${and(MEASURE_KEYS)}.`;
  if (typeof m.name !== 'string' || typeof m.path !== 'string') return `measure ${n} needs a name and a path to its number in the answer, each as text.`;
  if (m.unit !== undefined && typeof m.unit !== 'string') return `${m.name}'s unit is text, such as users or %.`;
  if (m.type !== undefined && m.type !== 'decimal' && m.type !== 'int') return `${m.name}'s type is decimal or int.`;
  if (m.at !== undefined && (!isObject(m.at) || typeof m.at.path !== 'string' || typeof m.at.as !== 'string'))
    return `${m.name}'s date names a path and whether it is a day or an instant, as in { "path": "day", "as": "day" }.`;
  if (m.money !== undefined && (!isObject(m.money) || typeof m.money.currency !== 'string' || (m.money.minor !== undefined && typeof m.money.minor !== 'boolean')))
    return `${m.name}'s money names its currency, as in { "currency": "USD" }, and says minor: true when the answer counts cents.`;
  return null;
}

/** What is wrong with one fill's shape, before the add-on reads it, or `null`. */
function specShape(s: unknown): string | null {
  if (!isObject(s)) return 'this is not a feed, which is an id, a url, an every and its measures.';
  const odd = Object.keys(s).find((k) => !SPEC_KEYS.includes(k));
  if (odd !== undefined) return `the feed says ${odd}, which a feed does not take: it takes ${and(SPEC_KEYS)}.`;
  for (const k of ['id', 'url', 'every'])
    if (typeof s[k] !== 'string' || s[k].trim() === '') return `the feed has no ${k}, and every feed names its id, its https:// url and how often it is asked, such as 1d.`;
  const text = ['at', 'tz', 'grant', 'project', 'organisation'].find((k) => s[k] !== undefined && typeof s[k] !== 'string');
  if (text !== undefined) return `${String(s.id)}'s ${text} is text.`;
  if (!Array.isArray(s.measures)) return `${String(s.id)} has no measures, the numbers it reads, each a name and a path.`;
  for (const [i, m] of s.measures.entries()) {
    const fault = measureShape(m, i + 1);
    if (fault !== null) return `${String(s.id)}'s ${fault}`;
  }
  return null;
}

/**
 * A setup file read whole: every fill checked for its shape, built by the add-on, and no id named twice. `file` is
 * only how the file is named in a refusal.
 */
export function readFeeds(text: string, file: string): Read {
  const at = (line: number, fix: string): Read => ({ ok: false, fix: `${file}, line ${line}: ${fix}` });
  let said: unknown;
  try {
    /* A FILE SAVED WITH A BYTE ORDER MARK, as some editors on Windows write one, is the same list: `JSON.parse` alone
       refused it on line 1. */
    said = JSON.parse(text.replace(/^﻿/u, ''));
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    return at(parseLine(text, message), 'this is not JSON, so check the commas and brackets near it.');
  }
  if (!Array.isArray(said)) return at(1, 'the file is a list of feeds, written between [ and ], each one feed.');
  if (said.length === 0) return at(1, 'the list holds no feed, so there is nothing to ask.');
  const lines = elementLines(text);
  const feeds: Placed[] = [];
  const seen = new Map<string, number>();
  for (const [i, s] of said.entries()) {
    const line = lines[i] ?? 1;
    const shape = specShape(s);
    if (shape !== null) return at(line, shape);
    const spec = s as FeedSpec;
    const before = seen.get(spec.id);
    if (before !== undefined) return at(line, `${spec.id} is a feed already on line ${before}, and one id is one plugin.`);
    seen.set(spec.id, line);
    let doc: Record<string, unknown>;
    try {
      doc = fillFeed(TEMPLATE as Record<string, unknown>, spec);
    } catch (e) {
      /* ONE SENTENCE, IN THE ADD-ON'S WORDS: a refusal of its own that says the fix after a full stop ("Mars/X is not a
         time zone. Name one such as ...") is joined at that stop, so the line is still one sentence. */
      const said = e instanceof Error ? e.message : `${spec.id} could not be filled.`;
      return at(line, said.replace(/\.\s+([A-Z])/gu, (_, c: string) => `; ${c.toLowerCase()}`));
    }
    feeds.push({ line, spec, doc });
  }
  return { ok: true, feeds };
}

/** The question one feed is asked as on Decide, in the words the importer uses for a poll. */
export function questionOf(spec: FeedSpec): string {
  return `Poll ${new URL(spec.url).host} every ${spec.every} for ${and(spec.measures.map((m) => m.name.trim()))}?`;
}

/** The most rows one governance read answers with: the record clamps it there (`packages/kernel/src/govern.ts`). */
const DECIDE_PAGE = 200;

/**
 * The add-ons a question still open on Decide offers, each as its document's text, a page at a time, so a file run
 * twice never asks one feed twice while the first question waits. Only the open ones, and only the same document: a
 * feed turned down, or changed in the file since, is asked again, because running the command is asking.
 */
async function waitingInstalls(client: ReturnType<typeof clientFor>): Promise<Result<Set<string>>> {
  const out = new Set<string>();
  let cursor: string | undefined;
  for (let pages = 0; pages < 100; pages++) {
    const got = await client.governance({ register: 'suggestion', limit: DECIDE_PAGE, ...(cursor === undefined ? {} : { cursor }) });
    if (!got.ok) return got;
    if (!Array.isArray(got.value)) return { ok: true, value: out };
    for (const s of got.value) if (isObject(s) && isObject(s.body) && typeof s.body.install === 'string') out.add(JSON.stringify(s.body.doc ?? null));
    const last: unknown = got.value.at(-1);
    if (got.value.length < DECIDE_PAGE || !isObject(last) || typeof last.id !== 'string') return { ok: true, value: out };
    cursor = last.id;
  }
  return { ok: true, value: out };
}

/** What a filing came to, for the summary and for `--json`. */
type Filed = { asked: string[]; before: string[]; refused: { feed: string; fix: string }[] };

/** `braindog feed propose <file> [--host <host>]`, and the exit code: 0 every feed asked or there, 1 refused, 3 unreachable. */
export async function feedCommand(args: string[], io: AgentIo): Promise<number> {
  let values: { host?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({ args, strict: true, allowPositionals: true, options: { host: { type: 'string' } } }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  const [verb, path, ...more] = positionals;
  if (verb !== 'propose' || path === undefined || more.length > 0) {
    io.say(USAGE);
    return 1;
  }
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    io.say(`${basename(path)} could not be read. Name the setup file of your feeds, as in braindog feed propose feeds.json.`);
    return 1;
  }
  const read = readFeeds(text, basename(path));
  if (!read.ok) {
    io.say(printable(read.fix));
    return 1;
  }
  let to: Target;
  try {
    to = target(values.host, io.env, hostsPath(io.env));
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
    return 1;
  }
  const headers = await io.headers(to.key);
  const client = clientFor(to, async () => headers, AbortSignal.timeout(budgetOf(io.env) * Math.max(1, read.feeds.length)));
  const waiting = await waitingInstalls(client);
  if (!waiting.ok) return refuse(io, waiting, refused(waiting) && waiting.refusal.code === 'UNREACHABLE' ? 'Your BrainDog did not answer, so no feed was asked.' : printable(fixOf(waiting)));
  const filed: Filed = { asked: [], before: [], refused: [] };
  for (const { spec, doc } of read.feeds) {
    const title = String(doc.title);
    if (waiting.value.has(JSON.stringify(doc))) {
      filed.before.push(title);
      io.out(printable(`Already waiting on Decide: ${title}.`));
      continue;
    }
    const done: Result<unknown> = await client.call('propose', { question: questionOf(spec), body_kind: 'pack', body: { install: String(doc.pack), doc } });
    if (done.ok) {
      filed.asked.push(title);
      io.out(printable(`Asked on Decide: ${title}, every ${spec.every}.`));
      continue;
    }
    if (refused(done) && done.refusal.code === 'UNREACHABLE') {
      const left = read.feeds.length - filed.asked.length - filed.before.length - filed.refused.length;
      return refuse(io, done, `Your BrainDog did not answer, so ${left === 1 ? 'one feed was' : `${left} feeds were`} not asked. Run it again: a feed already asked is said so.`);
    }
    /* ALREADY INSTALLED, AND NOTHING NEWER: the record says so, and that is a feed asked before. */
    if (refused(done) && done.refusal.code === 'TRANSITION_ILLEGAL') {
      filed.before.push(title);
      io.out(printable(`Already there: ${title}.`));
      continue;
    }
    filed.refused.push({ feed: title, fix: fixOf(done) });
    io.say(printable(`${title} was not asked: ${fixOf(done)}`));
  }
  io.answer?.({ value: filed });
  return filed.refused.length > 0 ? 1 : 0;
}
