/**
 * WHAT ACCEPTING A PROPOSAL WOULD PUT ON THE SCREEN, read from the body the record holds.
 *
 * A `change` carries a declaration, or several (`to.declarations`): a page with its place in the
 * sidebar and its blocks, a list with its fields, a rule for what comes in, a look, an automation with its
 * trigger and steps, a script with where it calls out and its source. A `pattern` carries
 * the rule an arrival suggested. Both were drawn as Accept and Reject under a title and nothing else,
 * so the one question Spark asks most, "shall I arrange this for you", was the one a person could not
 * see the answer to before saying yes (DIRECTION §11, DESIGN-SYSTEM D4).
 *
 * THE WORDS ARE THE PERSON'S, NOT THE SCHEMA'S. `page`, `register`, `ingest` and `theme` are what the
 * declaration calls itself; a person sees a page, a list, a rule and a look, and nothing here assumes
 * what kind of record it is.
 */
import { egressOf } from '@braindog/kernel';
import { ruleName } from '@braindog/seed/usecases/names';

import { copy } from '../../../lib/copy.ts';
import { pathOf, sayCondition, sayStep, sayTrigger, triggerOfBody, verbOf, words as canvas } from '../../../lib/flow/flow.ts';

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

function ingest(id: string, body: Row): Appears {
  const lines: Appears['lines'] = [];
  const from = text(body.url) ? hostOf(text(body.url)) : text(body.channel);
  if (from !== '') lines.push({ label: copy.proposalComesFrom, value: from });
  if (text(body.every) !== '') lines.push({ label: copy.proposalEvery, value: text(body.every) });
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
    out.push({ label: copy.proposalStep(here), value: verb === 'call' || verb === 'script' ? `${said}. ${copy.proposalNotBuilt}` : said });
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
  const mine = filed.find((e): e is Row => isRow(e) && e.channel === 'script' && e.ingest === body.script && typeof e.line === 'string');
  const egress = mine ? { line: text(mine.line), key_line: typeof mine.key_line === 'string' ? mine.key_line : null } : egressOf(body);
  const lines: Appears['lines'] = [{ label: copy.proposalCallsOut, value: egress ? egress.line.replace(/^CALLS OUT /u, '') : copy.proposalCallsNothing }];
  if (egress?.key_line) lines.push({ label: copy.proposalMaySend, value: egress.key_line });
  const source = text(body.source);
  return { kind: copy.proposalKind('script'), title: text(body.title) || named(body.script ?? id), lines, ...(source !== '' ? { source } : {}) };
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
  if (kind === 'ingest') return ingest(id, body);
  if (kind === 'theme') return theme(id, body);
  if (kind === 'rule') return rule(id, body);
  if (kind === 'script') return script(id, body, filed);
  if (kind === '') return null;
  return { kind: copy.proposalKind(kind), title: text(body.title) || named(id), lines: [] };
}

/**
 * A proposal's preview, or `null` for the kinds that have their own drawing: `options` is its
 * buttons, and `rowset` is `changes.ts`.
 */
export function proposedOf(kind: string, body: Row): Proposed | null {
  if (kind === 'pattern') {
    const rule = isRow(body.ingest) ? ingest('', body.ingest) : null;
    return rule ? { appears: [rule], samples: Array.isArray(body.samples) ? body.samples.length : null } : null;
  }
  if (kind !== 'change') return null;
  const to = body.to;
  const decls = isRow(to) && Array.isArray(to.declarations) ? to.declarations : [to];
  const filed = Array.isArray(body.egress) ? body.egress : [];
  const appears = decls.map((d) => appearsOf(d, filed)).filter((a): a is Appears => a !== null);
  return appears.length ? { appears, samples: null } : null;
}
