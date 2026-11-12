/**
 * A page body drawn by the record and taken as the screen draws it (`drawnOf`): Today's body, a proposed page, a kept
 * page by its slug.
 *
 * APART FROM `routes/decide/[id]/proposed.ts`, WHICH SAYS WHAT A PROPOSAL WOULD DO, so Today's read does not wait on the
 * code that reads a proposal: rules, flows, scripts and the kernel's own egress words. On a cold phone that code was most
 * of the 100 ms between the lists landing and Today being asked (finish W3). `proposed.ts` hands these on as before.
 */
import { createClient } from '@braindog/client';

import { readBoot } from './boot-live.ts';
import { figuresFor } from './figures-said.ts';
import { blockOf, type Fetch, type LiveBlock } from './page-live.ts';
import { learn, refMapOf, targetsOf, type RefMap, type SchemaCall } from './remote.ts';
import { rowsOf, walkRows } from '../data/ref-rows.ts';
import type { PageSaid } from '../home/today-read.ts';

type Row = Record<string, unknown>;
type Answered = Parameters<typeof blockOf>[0];
type Client = ReturnType<typeof createClient>;

/**
 * A page body as the record draws it: `live` with its blocks, `refused` with the record's sentence for a body it would
 * not draw, or `none` from a host older than the method, where a proposal's lines are the whole preview.
 */
export type Drawn = { from: 'live'; now: number; blocks: LiveBlock[] } | { from: 'refused'; fix: string } | { from: 'none' };

/** A refusal that says the host has no such method, or no record here, rather than anything about this page. */
export const UNSERVED = new Set(['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD', 'UNREACHABLE', 'UNAUTHORIZED']);

/**
 * Answered blocks as the page draws them, several runs of them at once.
 *
 * THE SAME CONVERSION AS A LIVE PAGE'S, `blockOf`, and the same two reads before it, for `pageReader`'s reasons: a list
 * this build does not ship is learnt through `schema` before its block is drawn, or every block over it says it cannot be
 * drawn, and a list a ref points at is walked once, so a ref draws as the row's title and not its id. A block the record
 * held back carries its refusal and is drawn as that, never filled from the sample. Every run is read together, so a
 * list both sides of a change read is asked for once.
 */
export async function liveOf(
  client: Client,
  runs: readonly Answered[][],
  now: number,
  declared: ReadonlyMap<string, Row> = new Map(),
  at: { base: string; io?: Fetch } | null = null,
): Promise<LiveBlock[][]> {
  const schema: SchemaCall = (register) =>
    client.schema(register).then((out) => (out.ok || !declared.has(register) ? out : { ok: true, value: { ...declared.get(register), id: register } }));
  const lists = [...new Set(runs.flat().flatMap((b) => (!b.refusals?.length && b.source?.startsWith('register.') ? [b.source.slice('register.'.length)] : [])))];
  /* WHAT EACH FIGURE IS, AS THE RECORD SAID, beside the lists (`figures-known.ts`): this build's own tables are asked
     only of a record that said nothing of them, and then together with the lists rather than before them. */
  const figuring = figuresFor(runs.flat());
  const asked = new Map<string, Promise<void>>();
  /* THE LISTS ARE LEARNT TOGETHER, AND THEIR TARGETS WALKED TOGETHER. One after another, Today's body waited ten round
     trips before it drew (1.7 s at 140 ms each); each target's rows are the tab's walk (`ref-rows.ts`) where this reads
     through the browser's own fetch, so a page drawn again asks nothing that has not moved. */
  await Promise.all([...lists.map((list) => learn(schema, list, asked)), figuring]);
  const refs = new Map<string, RefMap>();
  const io = at?.io;
  const targets = [...new Set(lists.flatMap(targetsOf))];
  const walked = await Promise.all(
    targets.map(async (target) => {
      await learn(schema, target, asked);
      const rows = at !== null && io === undefined ? await rowsOf(client, at.base, target) : await walkRows(client, target);
      return [target, rows ?? []] as const;
    }),
  );
  for (const [target, rows] of walked) refs.set(target, refMapOf(target, rows));
  /* WHO IS READING, for a feed that names the reader as You, as a live page reads it (`pageReader`): the shell's own
     `boot`, kept, so it costs no call. A boot that cannot be read leaves the feed with no reader, never undrawn. */
  const booted = at !== null && runs.some((run) => run.some((b) => b.source === 'activity')) ? await readBoot(at.base, at.io).catch(() => null) : null;
  const me = booted?.from === 'live' ? (booted.boot.me?.person ?? null) : null;
  const names = new Map(Object.entries(booted?.from === 'live' ? (booted.boot.names ?? {}) : {}));
  return runs.map((run) => run.map((b) => blockOf(b, refs, now, me, names)));
}

/**
 * The lists a page body's blocks read, from the body itself: what `liveOf` reads off the record's answer, known before
 * it. A block the record then holds from the reader is walked for nothing, and the walk is held to the reader by `list`.
 */
export function bodyLists(body: Row): string[] {
  const blocks = Array.isArray(body.blocks) ? (body.blocks as { source?: unknown }[]) : [];
  return [...new Set(blocks.flatMap((b) => (typeof b?.source === 'string' && b.source.startsWith('register.') ? [b.source.slice('register.'.length)] : [])))];
}

/** Walk the lists `body`'s refs name, beside the page's own read, so its answer finds them out already. */
function walkAhead(client: Client, base: string, body: Row): void {
  const asked = new Map<string, Promise<void>>();
  const schema: SchemaCall = (register) => client.schema(register);
  const lists = bodyLists(body);
  void Promise.all(lists.map((list) => learn(schema, list, asked)))
    .then(() => {
      for (const target of new Set(lists.flatMap(targetsOf))) void learn(schema, target, asked).then(() => rowsOf(client, base, target));
    })
    .catch(() => undefined);
}

/**
 * THE LISTS A BODY THAT IS ASKED FOR AS A WHOLE (`ask`: Today) LINKS TO, kept per record on this device (12 Nov). Its body names
 * no lists until the record answers, so the walks of what its blocks link to went out after the answer, a round trip it
 * drew behind. The last answer's are walked beside the next ask, and the tab's walk (`ref-rows.ts`) is shared, so the
 * answer then finds them out already. Only list ids, never a row; a list the answer no longer links to is walked for nothing.
 */
const WALKED_KEY = 'bd_walked_targets';

function rememberedTargets(base: string): string[] {
  try {
    const v = (JSON.parse(globalThis.localStorage?.getItem(WALKED_KEY) ?? '{}') as Record<string, unknown>)[base];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^[a-z][a-z0-9_]*$/u.test(x)).slice(0, 12) : [];
  } catch {
    return [];
  }
}

function rememberTargets(base: string, targets: readonly string[]): void {
  try {
    const store = globalThis.localStorage;
    if (!store) return;
    const all = (JSON.parse(store.getItem(WALKED_KEY) ?? '{}') ?? {}) as Record<string, unknown>;
    if (JSON.stringify(all[base]) === JSON.stringify(targets)) return;
    store.setItem(WALKED_KEY, JSON.stringify({ ...all, [base]: targets }));
  } catch {
    /* Nothing kept is nothing walked ahead. */
  }
}

/** Walk what the last answer linked to, beside the ask. */
function walkRemembered(client: Client, base: string): void {
  const asked = new Map<string, Promise<void>>();
  const schema: SchemaCall = (register) => client.schema(register);
  for (const target of rememberedTargets(base)) void learn(schema, target, asked).then(() => rowsOf(client, base, target)).catch(() => undefined);
}

/**
 * WHAT ACCEPTING THE PAGE WOULD DRAW, drawn by the record before anybody accepts it.
 *
 * THE LINES NAMED THE BLOCKS AND NOTHING FILLED THEM. "Shows: Open, Notes" was the whole preview of a page, so what an
 * agent's page would hold was found out by accepting it. `previewPage` draws the body as `page` draws an installed one,
 * each block held to the reader, and writes nothing; this turns its answer into the blocks `PageView` already draws.
 *
 * SINCE `previewChange` THIS IS THE FALLBACK: a host older than that method may still have this one, and a page over
 * lists that are installed is drawn by it as it was before.
 */
export async function drawnOf(
  body: Row,
  base: string,
  io?: Fetch,
  /* HOW THE BODY IS ASKED, where it is not `previewPage` alone: Today asks `today`, which answers its tiles beside it. */
  ask?: (client: ReturnType<typeof createClient>) => Promise<PageSaid>,
): Promise<Drawn> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  /* THE LISTS THE PAGE'S REFS NAME ARE WALKED BESIDE IT, not after it (`walkAhead`): the body says which lists its
     blocks read, so their targets are known before the record answers, and the walk the answer then needs is the tab's
     walk already out (`ref-rows.ts`). Only through the browser's own fetch, where the walk is the tab's. */
  if (io === undefined) walkAhead(client, base, body);
  if (io === undefined && ask) walkRemembered(client, base);
  const out = ask ? await ask(client) : await client.call<{ read_at?: unknown; blocks?: unknown }>('previewPage', { body });
  if (!out.ok) {
    if (!('refusal' in out)) return { from: 'none' };
    return UNSERVED.has(out.refusal.code) ? { from: 'none' } : { from: 'refused', fix: out.refusal.fix };
  }
  const blocks = (Array.isArray(out.value.blocks) ? out.value.blocks : []) as Answered[];
  const said = typeof out.value.read_at === 'string' ? Date.parse(out.value.read_at) : Number.NaN;
  const now = Number.isFinite(said) ? said : Date.now();
  const [live = []] = await liveOf(client, [blocks], now, new Map(), { base, ...(io ? { io } : {}) });
  /* AFTER THE LISTS ARE LEARNT, which is what says what they link to. */
  if (io === undefined && ask) rememberTargets(base, [...new Set(bodyLists({ blocks }).flatMap(targetsOf))]);
  return { from: 'live', now, blocks: live };
}
