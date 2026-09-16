/**
 * WHAT ACCEPTING A PROPOSAL WOULD PUT ON THE SCREEN, read from the body the record holds.
 *
 * A `change` carries a declaration, or several (`to.declarations`): a page with its place in the
 * sidebar and its blocks, a list with its fields, a rule for what comes in, a look. A `pattern` carries
 * the rule an arrival suggested. Both were drawn as Accept and Reject under a title and nothing else,
 * so the one question Spark asks most, "shall I arrange this for you", was the one a person could not
 * see the answer to before saying yes (DIRECTION §11, DESIGN-SYSTEM D4).
 *
 * THE WORDS ARE THE PERSON'S, NOT THE SCHEMA'S. `page`, `register`, `ingest` and `theme` are what the
 * declaration calls itself; a person sees a page, a list, a rule and a look, and nothing here assumes
 * what kind of record it is.
 */
import { copy } from '../../../lib/copy.ts';

type Row = Record<string, unknown>;

/** One thing that would appear: what it is, its name, and a line per fact worth reading first. */
export type Appears = {
  kind: string;
  title: string;
  lines: { label: string; value: string }[];
  /** A look's accent, so the preview can show the colour and not only its code. */
  accent?: string;
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

function hostOf(url: string): string {
  try {
    return new URL(url.replace(/\{[^}]*\}/gu, 'x')).host;
  } catch {
    return url;
  }
}

/** One declaration, as what a person would see appear. */
export function appearsOf(decl: unknown): Appears | null {
  if (!isRow(decl)) return null;
  const id = text(decl.id);
  const kind = text(decl.kind);
  const body = isRow(decl.body) ? decl.body : {};
  if (kind === 'page') return page(id, body);
  if (kind === 'register') return register(id, body);
  if (kind === 'ingest') return ingest(id, body);
  if (kind === 'theme') return theme(id, body);
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
  const appears = decls.map(appearsOf).filter((a): a is Appears => a !== null);
  return appears.length ? { appears, samples: null } : null;
}
