/**
 * A conversation read back from the record for the Slash page, whole: each answer's rows named and each action in the
 * state it was left in.
 *
 * WHY NOT THE PALETTE'S READ. The thread door (`/api/slash/thread/<id>`) answers each turn's words with their braces and
 * no `figures`, so a row Slash named was drawn as "something in Tasks"; and it answers whether a held action was accepted
 * or declined (`state`), which the palette's reader drops, so an action already done offered Do it again. Here the rows
 * are read by their ids, once each, and the state is kept.
 *
 * NEVER THROWS: a thread that cannot be read is `null`, and a row that cannot be read keeps its brace's own words.
 */

import type { LiveAction, LiveTurn } from '$lib/palette/thread.svelte.ts';
import { nameOfFields, rowOfRef } from './with.ts';

const REFS = /\{\{ref:([a-z][a-z0-9_]*#[1-9][0-9]*)\}\}/gu;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/** Each row's name, by its ref, read once each and at most `most` of them. */
export async function namesOf(base: string, refs: readonly string[], most = 24): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const want = [...new Set(refs)].slice(0, most);
  if (want.length === 0) return out;
  const { createClient } = await import('@braindog/client');
  const client = createClient({ base });
  await Promise.all(
    want.map(async (ref) => {
      const row = rowOfRef(ref);
      if (!row) return;
      try {
        const got = await client.get(row.register, row.seq);
        const name = got.ok && isObj(got.value) ? nameOfFields(isObj(got.value.fields) ? got.value.fields : null) : null;
        if (name) out.set(ref, name);
      } catch {
        /* A row that cannot be read keeps its brace's words. */
      }
    }),
  );
  return out;
}

/** The figures `Cited` reads a row by, for the refs whose names were read. */
export function figuresFor(text: string, names: ReadonlyMap<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of text.matchAll(REFS)) {
    const ref = m[1]!;
    const name = names.get(ref);
    const row = rowOfRef(ref);
    if (name && row) out[`ref:${ref}`] = { kind: 'row', register: row.register, seq: row.seq, title: name };
  }
  return out;
}

function actionOf(a: unknown): LiveAction | null {
  if (!isObj(a)) return null;
  const id = str(a.id);
  const title = str(a.title);
  if (!id || !title || (a.kind !== 'done' && a.kind !== 'ask')) return null;
  const batch = isObj(a.undo) ? str(a.undo.batch) : undefined;
  const detail = str(a.detail);
  const base = { id, kind: a.kind, title, ...(detail ? { detail } : {}), ...(batch ? { undo: { batch } } : {}), ...(str(a.href) ? { href: a.href as string } : {}) } as const;
  if (a.kind === 'done') return { ...base, state: 'done', receipt: detail ?? title };
  if (a.state === 'accepted') return { ...base, state: 'done', receipt: detail ?? title };
  if (a.state === 'declined') return { ...base, state: 'dismissed' };
  return { ...base, state: 'open' };
}

/** One conversation read back, its rows named, or `null` when it could not be read. */
export async function readBack(base: string, id: string): Promise<{ id: string; turns: LiveTurn[] } | null> {
  let body: unknown;
  try {
    const res = await fetch(`${base}/api/slash/thread/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    body = await res.json();
  } catch {
    return null;
  }
  if (!isObj(body) || !Array.isArray(body.turns)) return null;
  const raw = body.turns.filter((t): t is Record<string, unknown> => isObj(t) && (t.role === 'you' || t.role === 'slash') && typeof t.text === 'string');
  const refs = raw.flatMap((t) => (t.role === 'slash' ? [...(t.text as string).matchAll(REFS)].map((m) => m[1]!) : []));
  const names = await namesOf(base, refs);
  const turns = raw.map((t): LiveTurn => {
    const text = t.text as string;
    if (t.role === 'you') return { role: 'you', text };
    const actions = Array.isArray(t.actions) ? t.actions.flatMap((a) => actionOf(a) ?? []) : [];
    return { role: 'slash', steps: [], text, figures: figuresFor(text, names), actions, go: [], error: null, spent: false, streaming: false };
  });
  return { id: str(body.id) ?? id, turns };
}
