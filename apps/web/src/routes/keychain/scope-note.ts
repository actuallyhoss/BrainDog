/**
 * The one line in the Keys tile that says how many keys look like they belong to a project, with the one button that
 * puts the move on Decide (AGT-D04, on the screen he reads). Today every key on his record reads "Everywhere" and
 * nothing on this screen offers a way out; this is that way out, and it is only a question: nothing moves until he
 * answers it on Decide.
 *
 * THROUGH THE RECORD'S OWN TWO METHODS AND NOTHING ELSE. `scopeProposals` reads, for each list with a scope the reader
 * may read, how many entries have none and which project each looks like it belongs to; `proposeScopes` files the
 * question, signed by the person who pressed, and an open one for the same list is answered again rather than filed
 * twice. This file only reads their answers into a line, a button and an address.
 *
 * IT NEVER FAILS THE SCREEN. A host built before the methods answers `ROUTE_UNKNOWN`, a reader the record refuses gets
 * a refusal, a call that throws is none, and a count of nought is an answer: each is `null`, and `null` draws nothing.
 *
 * PURE BUT FOR THE `call` IT IS HANDED, so `node --test` drives it without a record, and the screen loads it with a
 * dynamic import after it has drawn, so neither the Keychain's first paint nor what every screen loads grows by it.
 */

import { KEYS_REGISTER } from '../../lib/record/keychain.ts';

/** How the screen asks the record: a client's `call`, or anything shaped like it. */
export type Call = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/** One entry the record would move: its own name, the project it looks like it belongs to, and why. */
export type ScopeRow = { title: string; project: string; reasons: string[] };

/** One list's answer: its id (a handle, never drawn), its own name, how many, the record's line, and the first rows. */
export type ScopeProposal = { list: string; name: string; count: number; line: string; rows: ScopeRow[]; truncated: boolean };

/** What the Keys tile draws: one line and one button. */
export type ScopeNote = { line: string; button: string };

/** What a press answered: Decide's address for the question, or the record's sentence about why not. */
export type Moved = { ok: true; href: string } | { ok: false; line: string };

/** The list the Keychain draws, as `+page.svelte` reads it (`KEYS_REGISTER`). A handle for the call, never a word on the screen. */
export const KEYS_LIST = KEYS_REGISTER;

export const words = {
  button: 'Review the move',
  /* Only where the record sent no line of its own, or one this screen will not draw. */
  line: (n: number, name: string) =>
    n === 1 ? `1 of your ${name} looks like it belongs to a project.` : `${n} of your ${name} look like they belong to a project.`,
  /* A list the record did not name. */
  unnamed: 'entries',
  /* A press the record never answered. */
  failed: 'Could not put the move in Needs you. Try again.',
  /* A press the record answered with no question: there was nothing left to move. */
  nothing: 'Nothing is left to move.',
} as const;

/** A raw id as the record mints one. Never drawn. */
const ULID = /\b[0-9A-HJKMNP-TV-Z]{26}\b/iu;

/** A record's text as one plain line: trimmed, its em dashes turned into commas, and nothing that carries an id. */
function plain(v: unknown): string {
  if (typeof v !== 'string') return '';
  const line = v.replace(/\s*—\s*/gu, ', ').replace(/\s+/gu, ' ').trim();
  return ULID.test(line) ? '' : line;
}

/** A list's name as it sits mid-sentence: "Keys" becomes "keys", and "API keys" stays as it is. */
const midSentence = (name: string): string => (/^[A-Z][^A-Z]/u.test(name) ? name[0]!.toLowerCase() + name.slice(1) : name);

function rowOf(raw: unknown): ScopeRow | null {
  const r = raw as { title?: unknown; project?: unknown; reasons?: unknown } | null;
  if (typeof r !== 'object' || r === null) return null;
  const title = plain(r.title);
  const project = plain(r.project);
  if (title === '' || project === '') return null;
  const reasons = Array.isArray(r.reasons) ? r.reasons.map(plain).filter((s) => s !== '') : [];
  return { title, project, reasons };
}

function proposalOfOne(raw: unknown): ScopeProposal | null {
  const p = raw as { list?: unknown; name?: unknown; count?: unknown; line?: unknown; rows?: unknown; truncated?: unknown } | null;
  if (typeof p !== 'object' || p === null || typeof p.list !== 'string') return null;
  if (typeof p.count !== 'number' || !Number.isInteger(p.count) || p.count < 0) return null;
  const rows = Array.isArray(p.rows) ? p.rows.map(rowOf).filter((r): r is ScopeRow => r !== null) : [];
  return { list: p.list, name: plain(p.name), count: p.count, line: plain(p.line), rows, truncated: p.truncated === true };
}

/**
 * The answer for one list out of `scopeProposals`, which answers a list of them (or, from a host that wraps it, an
 * object holding that list). `null` for a refusal, another shape, or no entry for that list.
 */
export function proposalOf(answer: unknown, list: string): ScopeProposal | null {
  const a = answer as { ok?: unknown; value?: unknown } | null | undefined;
  if (a?.ok !== true) return null;
  const v = a.value as { lists?: unknown; proposals?: unknown } | unknown[] | null;
  const all = Array.isArray(v) ? v : Array.isArray(v?.lists) ? v.lists : Array.isArray(v?.proposals) ? v.proposals : [v];
  for (const raw of all) {
    const p = proposalOfOne(raw);
    if (p?.list === list) return p;
  }
  return null;
}

/** Ask the record which keys look like they belong to a project. `null` on a refusal, an unknown method, a throw or nought. */
export async function readScopeNote(call: Call, list: string = KEYS_LIST): Promise<ScopeProposal | null> {
  try {
    const found = proposalOf(await call('scopeProposals', { register: list }), list);
    return found && found.count > 0 ? found : null;
  } catch {
    return null;
  }
}

/** The line and the button: the record's own line where it sent one, else the count and the list's own name. None at nought. */
export function noteOf(found: ScopeProposal | null): ScopeNote | null {
  if (!found || found.count <= 0) return null;
  const line = found.line !== '' ? found.line : words.line(found.count, midSentence(found.name || words.unnamed));
  return { line, button: words.button };
}

/** The question's id out of one `asked` entry: a string, or an object carrying `id`. */
function questionOf(raw: unknown): string | null {
  const q = (raw as { question?: unknown } | null)?.question;
  const id = typeof q === 'string' ? q : typeof q === 'object' && q !== null && typeof (q as { id?: unknown }).id === 'string' ? (q as { id: string }).id : '';
  return id.trim() === '' ? null : id.trim();
}

/**
 * Put the move on Decide: `proposeScopes` for that list, and the address of the question it filed (or the open one it
 * answered again). A refusal is the record's own sentence, passed through; a call that throws is this screen's.
 */
export async function askMove(call: Call, list: string = KEYS_LIST): Promise<Moved> {
  let out: unknown;
  try {
    out = await call('proposeScopes', { register: list });
  } catch {
    return { ok: false, line: words.failed };
  }
  const a = out as { ok?: unknown; value?: unknown; refusal?: { fix?: unknown } } | null | undefined;
  if (a?.ok !== true) {
    const fix = typeof a?.refusal?.fix === 'string' ? a.refusal.fix.trim() : '';
    return { ok: false, line: fix === '' ? words.failed : fix };
  }
  const asked = (a.value as { asked?: unknown } | null)?.asked;
  const entries = Array.isArray(asked) ? asked : [];
  const mine = entries.find((e) => (e as { list?: unknown } | null)?.list === list);
  const id = questionOf(mine ?? (entries.length === 1 ? entries[0] : null));
  if (id !== null) return { ok: true, href: `/decide/${encodeURIComponent(id)}` };
  return entries.length === 0 ? { ok: false, line: words.nothing } : { ok: true, href: '/decide' };
}
