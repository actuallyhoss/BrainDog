/**
 * WHAT ACCEPTING A PROPOSAL WOULD PUT ON THE SCREEN, read from the body the record holds.
 *
 * A `change` carries a declaration, or several (`to.declarations`): a page with its place in the
 * sidebar and its blocks, a list with its fields, a rule for what comes in, a look, an automation with its
 * trigger and steps, a script with where it calls out and its source, a summary with where it posts. A `pattern`
 * carries the rule an arrival suggested. Both were drawn as Accept and Reject under a title and nothing else,
 * so the one question Slash asks most, "shall I arrange this for you", was the one a person could not
 * see the answer to before saying yes (DIRECTION §11, DESIGN-SYSTEM D4).
 *
 * THE WORDS ARE THE PERSON'S, NOT THE SCHEMA'S. `page`, `register`, `ingest` and `theme` are what the
 * declaration calls itself; a person sees a page, a list, a rule and a look, and nothing here assumes
 * what kind of record it is.
 */
import { createClient } from '@braindog/client';
import { egressOf } from '@braindog/kernel';
import { ruleName } from '@braindog/seed/usecases/names';

import { copy } from '../../../lib/copy.ts';
import { pathOf, sayCondition, sayStep, sayTrigger, triggerOfBody, verbOf, words as canvas } from '../../../lib/flow/flow.ts';
import { blockOf, type Fetch, type LiveBlock } from '../../../lib/record/page-live.ts';
import { learn, refMapOf, targetsOf, type RecordRow, type RefMap } from '../../../lib/record/remote.ts';

type Row = Record<string, unknown>;

/** One thing that would appear: what it is, its name, and a line per fact worth reading first. */
export type Appears = {
  kind: string;
  title: string;
  lines: { label: string; value: string }[];
  /** A look's accent, so the preview can show the colour and not only its code. */
  accent?: string;
  /** A script's source, whole, to be read before it is accepted: code keeps its lines, so it is not one of `lines`. */
  source?: string;
  /** A page's body, as proposed, for the record to draw (`drawnOf`): the lines name its blocks, the drawing fills them. */
  page?: Row;
};

export type Proposed = { appears: Appears[]; samples: number | null };

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const named = (v: unknown): string => copy.valueWord(text(v).replace(/^[a-z]+\./u, '').replace(/[_-]+/gu, ' '));
const list = (xs: readonly string[]): string => xs.filter((x) => x !== '').join(', ');

function page(id: string, body: Row): Appears {
  const nav = isRow(body.nav) ? body.nav : null;
  const blocks = Array.isArray(body.blocks) ? body.blocks.filter(isRow) : [];
  const lines: Appears['lines'] = [
    {
      label: copy.proposalInSidebar,
      value: nav && text(nav.section) !== '' ? copy.proposalUnder(text(nav.section)) : copy.proposalNotInSidebar,
    },
  ];
  const shows = list(blocks.map((b) => text(b.heading) || text(b.title) || copy.valueWord(text(b.kind))));
  if (shows !== '') lines.push({ label: copy.proposalShows, value: shows });
  const needs = list((Array.isArray(body.requires) ? body.requires : []).map(named));
  if (needs !== '') lines.push({ label: copy.proposalReads, value: needs });
  return { kind: copy.proposalKind('page'), title: text(body.title) || named(id), lines };
}

function register(id: string, body: Row): Appears {
  const fields = Array.isArray(body.fields) ? body.fields.filter(isRow) : [];
  const lines = fields.length ? [{ label: copy.proposalFields, value: list(fields.map((f) => text(f.label) || named(f.id))) }] : [];
  return { kind: copy.proposalKind('register'), title: text(body.title) || text(body.name) || named(body.id ?? id), lines };
}

/**
 * The egress line the record filed for this declaration, or the kernel's reading of its body when it filed none.
 *
 * FILED FIRST, for the reason `script` gives: the record works the line out with the vault and the installed copy in
 * hand, and this screen has neither. The body's own reading is for a declaration whose line was not filed because it
 * calls out as the installed one already does.
 */
function filedLine(filed: readonly unknown[], channel: string, name: unknown, body: Row): { line: string; key_line: string | null } | null {
  const mine = filed.find((e): e is Row => isRow(e) && e.channel === channel && e.ingest === name && typeof e.line === 'string');
  if (mine) return { line: text(mine.line), key_line: typeof mine.key_line === 'string' ? mine.key_line : null };
  const read = egressOf(body);
  return read ? { line: read.line, key_line: read.key_line } : null;
}

/** An egress line as the preview says it: its shouted lead dropped, since the label says it. */
const callsOut = (line: string): string => line.replace(/^CALLS OUT /u, '');

/**
 * A rule for what comes in: where from, how often, what it calls out with, and the list it files into.
 *
 * WHAT IT CALLS OUT WITH IS ITS FILED LINE, which names the key. Audit fifty-one found a pattern polling `api.goldapi.io`
 * every hour on the owner's `goldapi` drawn as a host and an interval, with no key anywhere on the screen.
 */
function ingest(id: string, body: Row, filed: readonly unknown[] = []): Appears {
  const lines: Appears['lines'] = [];
  const from = text(body.url) ? hostOf(text(body.url)) : text(body.channel);
  if (from !== '') lines.push({ label: copy.proposalComesFrom, value: from });
  if (text(body.every) !== '') lines.push({ label: copy.proposalEvery, value: text(body.every) });
  const egress = filedLine(filed, text(body.channel), body.ingest, body);
  if (egress) lines.push({ label: copy.proposalCallsOut, value: callsOut(egress.line) });
  if (egress?.key_line) lines.push({ label: copy.proposalMaySend, value: egress.key_line });
  const writes = isRow(body.writes) ? named(body.writes.register) : '';
  if (writes !== '') lines.push({ label: copy.proposalFilesInto, value: writes });
  return { kind: copy.proposalKind('ingest'), title: named(body.ingest ?? id), lines };
}

function theme(id: string, body: Row): Appears {
  const seed = isRow(body.seed) ? body.seed : {};
  const accent = text(seed.accent);
  const lines: Appears['lines'] = [];
  if (accent !== '') lines.push({ label: copy.proposalAccent, value: accent });
  if (text(body.scheme) !== '') lines.push({ label: copy.proposalScheme, value: copy.valueWord(text(body.scheme)) });
  return { kind: copy.proposalKind('theme'), title: named(id), lines, ...(accent !== '' ? { accent } : {}) };
}

/**
 * Each step as a line, a branch's arms after it, labelled by where they sit.
 *
 * THE LABEL CARRIES THE NESTING, because the line cannot: `Proposed.svelte` draws a label and a value in two columns and
 * keys each line by its label, so "Step 2, if so 1" is both what makes a branch readable and what keeps two identical
 * steps from being one key. The depth needs no guard of its own: a `change` is linted when it is filed, and the lint
 * refuses a branch past three.
 */
function stepLines(list: unknown, at: readonly string[], arm: string, out: Appears['lines']): void {
  if (!Array.isArray(list)) return;
  list.forEach((step: unknown, i) => {
    const here = [...at, arm === '' ? String(i + 1) : copy.proposalArmStep(arm, i + 1)];
    const said = isRow(step) ? sayStep(step) : sayStep({});
    const verb = isRow(step) ? verbOf(step) : null;
    /* A `script` GOES ON WITHOUT WAITING, SO IT CARRIES THE DRY RUN'S SENTENCE; A `call` CARRIES NONE. Since AUT-2 a call
       parks the run until its answer comes back, and the run goes on (`flow.ts`), so the "not in this build: a run stops
       here" line it ended with was false; the step's own sentence says what it calls.
       NO `as:` IS HANDED ON. The sentence said what `as:` keeps when a step named one, because `sayStep` before it said
       "keeping the answer as"; it says "keeping the id of its queued run as" now, and handed the name, the line said
       the same fact twice. An empty name is the sentence without that clause. */
    const tail = verb === 'script' ? copy.proposalScriptGoesOn : '';
    out.push({ label: copy.proposalStep(here), value: tail === '' ? said : `${said}. ${tail}` });
    if (verb === 'if' && isRow(step)) {
      stepLines(step.then, here, canvas.then, out);
      stepLines(step.else, here, canvas.otherwise, out);
    }
  });
}

/**
 * An automation, as the canvas says it: what starts it, the condition it asks, which path it runs on, and every step.
 *
 * `flow.ts`'s SENTENCES, IMPORTED AND NOT COPIED, so the rule the owner accepts here reads exactly as it does when he
 * opens it on the canvas afterwards. The record's dry run (`automations.ts` `said`) words the same trigger in its own
 * sentence, which an agent reads; the owner reads the canvas's.
 */
function rule(id: string, body: Row): Appears {
  const lines: Appears['lines'] = [{ label: canvas.trigger, value: sayTrigger(triggerOfBody(body)) }];
  const when = body.when === undefined ? '' : sayCondition(body.when);
  if (when !== '') lines.push({ label: canvas.condition, value: when });
  lines.push({ label: copy.proposalHowItRuns, value: pathOf(body) === 'inline' ? canvas.inline : canvas.asRun });
  stepLines(body.steps ?? body.then, [], '', lines);
  return { kind: copy.proposalKind('rule'), title: text(body.name) || ruleName(id) || named(id), lines };
}

/**
 * A script, as the owner approves it: where it calls out, and what it reads and may send there, then its source.
 *
 * THE RECORD'S EGRESS LINE, the kernel's `egressOf` over the declaration, which is the line the record files on the
 * proposal and the owner arms on accept, and the one a pack's plan prints. Only its shouted lead is dropped, since the
 * label says it. The second line is the one a script that reads and fetches must carry: it is the whole of how such a
 * script could send a list's rows away, and the owner's only chance to see that it can.
 *
 * THE LINE THE PROPOSAL CARRIES WHEN IT CARRIES ONE (`filed`, the body's `egress`), because the record works it out with
 * the vault in hand and says which host each key goes to; this screen cannot reach the vault, and worked out here the
 * same script said "to the host its vault entry opens". The body's own line is for a script whose egress the record did
 * not file, one that calls out as the installed copy already does.
 */
function script(id: string, body: Row, filed: readonly unknown[]): Appears {
  const egress = filedLine(filed, 'script', body.script, body);
  const lines: Appears['lines'] = [{ label: copy.proposalCallsOut, value: egress ? callsOut(egress.line) : copy.proposalCallsNothing }];
  if (egress?.key_line) lines.push({ label: copy.proposalMaySend, value: egress.key_line });
  const source = text(body.source);
  return { kind: copy.proposalKind('script'), title: text(body.title) || named(body.script ?? id), lines, ...(source !== '' ? { source } : {}) };
}

/**
 * A summary, as the owner approves it: where it posts, when, and what it carries, or that it stays with him.
 *
 * IT WAS A TITLE. Every kind this file did not know was drawn as `{ kind, title, lines: [] }`, so accepting a weekly
 * digest that posts a table of Notes to `https://collector.example.com/in` read "Summary" and a name (audit fifty-one,
 * section 2). A digest has one channel that leaves the record, its webhook, and the line says it as `script` says its
 * fetches; one that sends only in-app or by email says it calls nothing out.
 */
function digest(id: string, body: Row, filed: readonly unknown[]): Appears {
  const egress = filedLine(filed, 'digest', body.digest, body);
  return {
    kind: copy.proposalKind('digest'),
    title: text(body.name) || named(body.digest ?? id),
    lines: [{ label: copy.proposalCallsOut, value: egress ? callsOut(egress.line) : copy.proposalCallsNothing }],
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url.replace(/\{[^}]*\}/gu, 'x')).host;
  } catch {
    return url;
  }
}

/** One declaration, as what a person would see appear. `filed` is the egress the record filed on the proposal, if any. */
export function appearsOf(decl: unknown, filed: readonly unknown[] = []): Appears | null {
  if (!isRow(decl)) return null;
  const id = text(decl.id);
  const kind = text(decl.kind);
  const body = isRow(decl.body) ? decl.body : {};
  if (kind === 'page') return page(id, body);
  if (kind === 'register') return register(id, body);
  if (kind === 'ingest') return ingest(id, body, filed);
  if (kind === 'theme') return theme(id, body);
  if (kind === 'rule') return rule(id, body);
  if (kind === 'script') return script(id, body, filed);
  if (kind === 'digest') return digest(id, body, filed);
  if (kind === '') return null;
  return { kind: copy.proposalKind(kind), title: text(body.title) || named(id), lines: [] };
}

/**
 * A proposal's preview, or `null` for the kinds that have their own drawing: `options` is its
 * buttons, and `rowset` is `changes.ts`.
 */
export function proposedOf(kind: string, body: Row): Proposed | null {
  /* A PATTERN'S INGEST IS A BARE BODY OR A DECLARATION. Slash files the body (`slash/src/jobs.ts`) and an agent files the
     declaration; drawn as a body, the declaration was read for `ingest`, `channel` and `writes` on its wrapper, and came
     out as a heading with no title and no lines. A declaration of another kind, queued before the kernel held a pattern
     to an ingest, is drawn as what it is, since that is what accepting it would have installed. */
  if (kind === 'pattern') {
    const filed = Array.isArray(body.egress) ? body.egress : [];
    const held = body.ingest;
    const rule = !isRow(held) ? null : 'id' in held || 'kind' in held ? appearsOf(held, filed) : ingest('', held, filed);
    return rule ? { appears: [rule], samples: Array.isArray(body.samples) ? body.samples.length : null } : null;
  }
  if (kind !== 'change') return null;
  const to = body.to;
  const decls = isRow(to) && Array.isArray(to.declarations) ? to.declarations : [to];
  const filed = Array.isArray(body.egress) ? body.egress : [];
  /* A PAGE CARRIES ITS BODY HERE AND NOT IN `appearsOf`, which `arranged.ts` also draws an arrangement's pages with: a
     proposed `change` is the one screen that asks the record to draw the page (`drawnOf`), so it is the one that holds it. */
  const appears = decls.flatMap((d) => {
    const a = appearsOf(d, filed);
    if (!a) return [];
    return [isRow(d) && d.kind === 'page' && isRow(d.body) ? { ...a, page: d.body } : a];
  });
  return appears.length ? { appears, samples: null } : null;
}

/**
 * WHAT THE DRAWING OF A PROPOSED PAGE IS CALLED ON THE SCREEN. Here and not in `copy.ts`, which nobody owns this wave
 * (`loop/research-m4-wave-two.md`, the wave's rules): new words go in a `words` object in the module that says them.
 */
export const words = {
  /** Over the drawing, so it is not read as a page that is already there. */
  drawnHead: 'As it would look now',
  /** The group's name for a screen reader, which hears the drawing apart from the lines above it. */
  drawn: (title: string) => `${title}, as it would look now`,
} as const;

/**
 * A proposed page as the record draws it: `live` with its blocks, `refused` with the record's sentence for a body it
 * would not install, or `none` from a host older than the method, which leaves the lines above as the whole preview.
 */
export type Drawn = { from: 'live'; now: number; blocks: LiveBlock[] } | { from: 'refused'; fix: string } | { from: 'none' };

/** A refusal that says the host has no such method, or no record here, rather than anything about this page. */
const UNSERVED = new Set(['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD', 'UNREACHABLE', 'UNAUTHORIZED']);

/**
 * WHAT ACCEPTING THE PAGE WOULD DRAW, drawn by the record before anybody accepts it (M4 wave two brief 5).
 *
 * THE LINES NAMED THE BLOCKS AND NOTHING FILLED THEM. "Shows: Open, Notes" was the whole preview of a page, so what an
 * agent's page would hold was found out by accepting it. `previewPage` draws the body as `page` draws an installed one,
 * each block held to the reader, and writes nothing; this turns its answer into the blocks `PageView` already draws.
 *
 * THE SAME CONVERSION AS A LIVE PAGE'S, `blockOf`, and the same two reads before it, for `pageReader`'s reasons: a list
 * this build does not ship is learnt through `schema` before its block is drawn, or every block over it says it cannot be
 * drawn, and a list a ref points at is walked once, so a ref draws as the row's title and not its id. A block the record
 * held back carries its refusal and is drawn as that, never filled from the sample.
 */
export async function drawnOf(body: Row, base: string, io?: Fetch): Promise<Drawn> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.call<{ read_at?: unknown; blocks?: unknown }>('previewPage', { body });
  if (!out.ok) {
    if (!('refusal' in out)) return { from: 'none' };
    return UNSERVED.has(out.refusal.code) ? { from: 'none' } : { from: 'refused', fix: out.refusal.fix };
  }
  type Answered = Parameters<typeof blockOf>[0];
  const blocks = (Array.isArray(out.value.blocks) ? out.value.blocks : []) as Answered[];
  const said = typeof out.value.read_at === 'string' ? Date.parse(out.value.read_at) : Number.NaN;
  const now = Number.isFinite(said) ? said : Date.now();
  const lists = [...new Set(blocks.flatMap((b) => (!b.refusals?.length && b.source?.startsWith('register.') ? [b.source.slice('register.'.length)] : [])))];
  const asked = new Map<string, Promise<void>>();
  for (const list of lists) await learn(client.schema, list, asked);
  const refs = new Map<string, RefMap>();
  for (const target of new Set(lists.flatMap(targetsOf))) {
    await learn(client.schema, target, asked);
    const rows: RecordRow[] = [];
    let cursor: string | null = null;
    do {
      const page = await client.list({ register: target, limit: 500, ...(cursor === null ? {} : { cursor }) });
      if (!page.ok) break;
      rows.push(...(page.value.rows as RecordRow[]));
      cursor = page.value.cursor;
    } while (cursor !== null);
    refs.set(target, refMapOf(target, rows));
  }
  return { from: 'live', now, blocks: blocks.map((b) => blockOf(b, refs, now)) };
}
