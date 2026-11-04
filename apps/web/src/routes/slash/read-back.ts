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
import type { SentMention } from '$lib/mention/mention.ts';
import { chatWords, figuresOf } from '$lib/palette/slash-chat.ts';
import { machineSaid } from '$lib/record/machine-name.ts';
import { nameOfFields, rowOfRef } from './with.ts';

const RUN_AGENT: Readonly<Record<string, string>> = { claude: 'Claude Code', codex: 'Codex', cursor: 'Cursor', gemini: 'Gemini', copilot: 'Copilot', windsurf: 'Windsurf' };
const runName = (f: Record<string, unknown>): string => {
  const who = RUN_AGENT[str(f.agent) ?? ''] ?? 'An agent';
  const host = str(f.host);
  return host ? `${who} on ${machineSaid(host)}` : who;
};

const REFS = /\{\{ref:([a-z][a-z0-9_]*#[1-9][0-9]*)\}\}/gu;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/** Each row's name, by its ref, read once each and at most `most` of them. */
export async function namesOf(base: string, refs: readonly string[], most = 24, known?: Map<string, string>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const want = [...new Set(refs)].filter((r) => {
    const name = known?.get(r);
    if (name !== undefined) out.set(r, name);
    return name === undefined;
  }).slice(0, most);
  if (want.length === 0) return out;
  const { createClient } = await import('@braindog/client');
  const client = createClient({ base });
  await Promise.all(
    want.map(async (ref) => {
      const row = rowOfRef(ref);
      if (!row) return;
      try {
        const got = await client.get(row.register, row.seq);
        const fields = got.ok && isObj(got.value) && isObj(got.value.fields) ? got.value.fields : null;
        /* A RUN'S LINK SAYS WHO IT IS, as it did when the answer was first drawn: its agent and its computer. */
        const name = row.register === 'session' && fields ? runName(fields) : nameOfFields(fields);
        if (name) {
          out.set(ref, name);
          known?.set(ref, name);
        }
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

const isSent = (m: unknown): m is SentMention => isObj(m) && typeof m.at === 'number' && typeof m.len === 'number' && typeof m.ref === 'string';

function actionOf(a: unknown): LiveAction | null {
  if (!isObj(a)) return null;
  const id = str(a.id);
  const title = str(a.title);
  if (!id || !title || (a.kind !== 'done' && a.kind !== 'ask')) return null;
  const batch = isObj(a.undo) ? str(a.undo.batch) : undefined;
  const detail = str(a.detail);
  const base = { id, kind: a.kind, title, ...(detail ? { detail } : {}), ...(batch ? { undo: { batch } } : {}), ...(str(a.href) ? { href: a.href as string } : {}), ...(isObj(a.sent) && str(a.sent.id) ? { sent: a.sent as LiveAction['sent'] } : {}), ...(str(a.group) ? { group: a.group as string } : {}) } as LiveAction;
  if (a.kind === 'done') return { ...base, state: 'done', receipt: detail ?? title };
  if (a.state === 'accepted') return { ...base, state: 'done', receipt: detail ?? title };
  if (a.state === 'declined') return { ...base, state: 'dismissed' };
  return { ...base, state: 'open' };
}

/**
 * One conversation read back, its rows named, or `null` when it could not be read. `known` is the names read already, so
 * reading a conversation again while its answer comes asks for none of them twice. A row an answer named when it landed
 * was kept with it, so reading a finished conversation back asks for no row at all.
 */
export async function readBack(base: string, id: string, known?: Map<string, string>): Promise<{ id: string; turns: LiveTurn[] } | null> {
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
  const namedAlready = (t: Record<string, unknown>) => figuresOf(t.figures) ?? {};
  const refs = raw.flatMap((t) => {
    if (t.role !== 'slash') return [];
    const had = namedAlready(t);
    return [...(t.text as string).matchAll(REFS)].map((m) => m[1]!).filter((r) => had[`ref:${r}`] === undefined);
  });
  const names = await namesOf(base, refs, 24, known);
  const turns = raw.map((t): LiveTurn => {
    const text = t.text as string;
    if (t.role === 'you') return { role: 'you', text, ...(Array.isArray(t.mentions) ? { mentions: t.mentions.filter(isSent) } : {}) };
    const actions = Array.isArray(t.actions) ? t.actions.flatMap((a) => actionOf(a) ?? []) : [];
    const steps = Array.isArray(t.steps) ? t.steps.filter((s): s is string => typeof s === 'string') : [];
    const go = Array.isArray(t.go) ? t.go.flatMap((g) => (isObj(g) && str(g.href) ? [{ href: g.href as string, label: str(g.label) ?? (g.href as string) }] : [])) : [];
    /* WHAT STOPPED IT, SAID AS IT WAS, and a turn gone quiet partway says that much plainly: part of an answer is not an answer. */
    const error = str(t.error) ?? (t.stopped === true ? chatWords.broke : null);
    return { role: 'slash', steps, text, figures: { ...figuresFor(text, names), ...namedAlready(t) }, actions, go, error, spent: false, streaming: t.answering === true, ...(str(t.route) ? { route: t.route as string } : {}) };
  });
  return { id: str(body.id) ?? id, turns };
}
