/**
 * `/search`, read from the record, with the sample when there is no record here.
 *
 * A ROUTE-ONLY MODULE, for the reason `lib/data/record.ts` gives: the client carries the route table
 * as a value, so only the search route imports this and the entry chunk stays where it was.
 *
 * LIVE OR THE SAMPLE IS THE ANSWER'S TO SAY. `UNREACHABLE` and `UNAUTHORIZED` mean there is no record
 * (a static host's fallback page, a non-JSON 404, a Worker with nothing behind it), and the screen
 * draws the sample's search. That is kept for the tab, so a static host is not asked again on every
 * query. Any other refusal is a record that answered no, and its sentence is what is drawn.
 *
 * EVERY LIST, EVERY DECISION, AND EVERY PAGE, which is what the screen's own sentence promises. The
 * record's `search` is its full-text index over rows and nothing else, so a live answer covered list
 * rows only while the sample also found questions and pages. The pages the caller may open and the
 * questions waiting on them are both in `boot`, and the decisions are one `governance` read; all
 * three are asked once for the tab, the first time a query finds the record there, and matched here
 * with the same tokens the sample uses.
 */

import { createClient, type ClientOptions } from '@braindog/client';

import { copy } from '../copy.ts';
import { iconFor, REGISTERS, search as sampleSearch, type SearchHit, type SearchResult } from './api.ts';
import { noRecord } from './device.ts';
import { everyGovernance } from './governance.ts';
import { terms, tokensOf } from './find.ts';
import { learn } from './remote.ts';

export type Fetch = NonNullable<ClientOptions['fetch']>;

export type Found = { from: 'live' | 'sample'; value: SearchResult } | { from: 'refused'; fix: string };

/** One hit as the record's `search` sends it, and only the keys read here. */
type Hit = { register: string; seq: number; title: string };

/** What the record holds besides rows that a search reaches: its pages and its questions. */
export type Others = {
  pages: readonly { slug: string; title: string; section: string; icon: string | null }[];
  questions: readonly { id: string; title: string; decided: boolean }[];
};

export const NO_OTHERS: Others = { pages: [], questions: [] };

/* THE RECORD'S CEILING. `fts.search` clamps any limit to a hundred, so a live count stops there. */
const LIMIT = 100;

const NOTHING: SearchResult = { hits: [], total: 0, groups: [] };

/** Every word typed starts some word of the text, or the whole id was typed: the sample's rule for a question or a page. */
function said(q: string, text: string, id?: string): boolean {
  const want = terms(q);
  if (!want) return false;
  const have = tokensOf(text);
  return want.every((w) => have.some((t) => t.startsWith(w))) || (id !== undefined && id.toLowerCase() === q.trim().toLowerCase());
}

/**
 * The record's hits as the page's groups: the questions first, one group per register in the order its
 * best hit arrived, then the pages. The sample's `search` orders its groups the same way.
 *
 * The record says the register, the number and the title, and nothing else. So a live row has no
 * state beside it and no reason it matched.
 */
export function groupsOf(q: string, hits: readonly Hit[], others: Others = NO_OTHERS): SearchResult {
  const byRegister = new Map<string, SearchHit[]>();
  for (const h of hits) {
    const decl = REGISTERS[h.register];
    const group = byRegister.get(h.register) ?? [];
    group.push({
      title: h.title,
      detail: '',
      href: `/r/${h.register}/${h.seq}`,
      kind: decl?.name ?? h.register,
      icon: iconFor(decl?.icon, 'rows'),
      spoken: `#${h.seq}`,
    });
    byRegister.set(h.register, group);
  }

  const questions: SearchHit[] = others.questions
    .filter((x) => said(q, x.title, x.id))
    .map((x) => ({
      title: x.title,
      detail: x.decided ? copy.searchDecided : copy.searchOpenQuestion,
      href: `/decide/${x.id}`,
      kind: copy.decide,
      icon: 'decide',
      spoken: x.id,
    }));
  const pages: SearchHit[] = others.pages
    .filter((p) => said(q, p.title))
    .map((p) => ({ title: p.title, detail: p.section, href: `/p/${p.slug}`, kind: copy.pages, icon: iconFor(p.icon ?? undefined, 'grid') }));

  const groups: { kind: string; total: number; hits: SearchHit[]; href: string | null }[] = [];
  if (questions.length) groups.push({ kind: copy.decide, total: questions.length, hits: questions, href: null });
  for (const [register, g] of byRegister)
    groups.push({ kind: g[0]?.kind ?? register, total: g.length, hits: g, href: `/r/${register}?q=${encodeURIComponent(q.trim())}` });
  if (pages.length) groups.push({ kind: copy.pages, total: pages.length, hits: pages, href: null });

  const flat = groups.flatMap((g) => g.hits);
  return { hits: flat, total: flat.length, groups };
}

type Wire = { ok: boolean; value?: unknown };
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * `boot` and the decisions, as what a search reaches besides rows.
 *
 * A PAGE WITH NO PLACE IN THE RAIL IS LEFT OUT, as the sample leaves out an unplaced one. A read that
 * failed is nothing found rather than a refusal of the whole search: the rows already answered.
 */
export function othersOf(booted: Wire, decisions: Wire, open?: Wire): Others {
  const boot = booted.ok && isObject(booted.value) ? booted.value : {};
  const pages = (Array.isArray(boot.pages) ? boot.pages : []).filter(isObject).flatMap((p) =>
    isObject(p.nav) && text(p.slug) && text(p.title)
      ? [{ slug: text(p.slug), title: text(p.title), section: text(p.nav.section), icon: text(p.icon) || null }]
      : [],
  );
  /* EVERY OPEN QUESTION when they were read, and `boot`'s first twenty when they were not. */
  const asked = open?.ok && Array.isArray(open.value) ? open.value : boot.waiting;
  const waiting = (Array.isArray(asked) ? asked : [])
    .filter(isObject)
    .flatMap((w) => (text(w.id) ? [{ id: text(w.id), title: text(w.question).trim() || text(w.id), decided: false }] : []));
  const decided = (decisions.ok && Array.isArray(decisions.value) ? decisions.value : [])
    .filter(isObject)
    .flatMap((d) => (text(d.id) ? [{ id: text(d.id), title: text(d.question).trim() || text(d.id), decided: true }] : []));
  return { pages, questions: [...waiting, ...decided] };
}

export type Searcher = { find(q: string): Promise<Found> };

/** A search for one tab. `base` is the page's own origin; the app never holds a token. */
export function searcher(base: string, io?: Fetch): Searcher {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  let absent = false;
  let others: Promise<Others> | null = null;
  const asked = new Map<string, Promise<void>>();
  return {
    async find(q) {
      /* NOTHING TO ASK, SO NOTHING IS SENT. The same folding the record's index uses decides it. */
      if (!terms(q)) return { from: absent ? 'sample' : 'live', value: NOTHING };
      if (absent) return { from: 'sample', value: sampleSearch(q, Number.MAX_SAFE_INTEGER) };
      const out = await client.search(q, LIMIT);
      if (out.ok) {
        /* EVERY OPEN QUESTION AND EVERY DECISION, a page at a time: `boot` sends twenty questions, and one page of
           decisions stopped at the newest two hundred. */
        others ??= Promise.all([client.boot(), everyGovernance(client, { status: 'open' }), everyGovernance(client, { register: 'decision' })]).then(
          ([b, o, d]) => othersOf(b as Wire, d as Wire, o as Wire),
          () => NO_OTHERS,
        );
        /* A LIST THIS BUILD DOES NOT SHIP IS NAMED BY THE RECORD, so a course is grouped under Courses and not its id. */
        await Promise.all([...new Set(out.value.map((h) => h.register))].map((r) => learn(client.schema, r, asked)));
        return { from: 'live', value: groupsOf(q, out.value, await others) };
      }
      if ('refusal' in out && noRecord(out.refusal.code)) {
        absent = true;
        return { from: 'sample', value: sampleSearch(q, Number.MAX_SAFE_INTEGER) };
      }
      return { from: 'refused', fix: 'refusal' in out ? out.refusal.fix : 'The record changed while it was being read.' };
    },
  };
}
