/**
 * The parts of an add-on that wait on what the record holds: `when: { holds: [people] }`.
 *
 * A PART IS THERE ONLY WHILE THE RECORD HOLDS EVERY LIST OR ROLE IT NAMES. The plan lays the add-on over what the record
 * holds and what the add-on itself brings (`holdsOf`), keeps each part whose names are all held with the key taken off,
 * takes the rest out, and says them as `waiting`: where each one sits, and what it still waits for. So the document a
 * record installs never says `when: { holds }`, and `pages.ts`, which reads a block's `when:` as a figure's test, never
 * meets it. The kernel checks the shape (`holdsFault` in `packages/kernel/src/declare.ts`) and refuses one that reaches
 * the install unplanned.
 *
 * THE PLACES A PART MAY WAIT ARE THE KERNEL'S `holdingParts`, written again here because the kernel's package door does
 * not hand it out: the declaration itself (not a rule, whose `when:` is what it fires on), a list's fields, its pairing
 * clause and its roles, a page's blocks with their columns and legs, and a figure's legs. `test/when.test.ts` holds the
 * two lists to each other.
 *
 * A NAME IS A LIST'S ID OR A ROLE A LIST PLAYS. `meets` is held while some list declares it, or while the record has the
 * list `people`, which plays it by its name until its pack declares the key (`roles.ts`, `LEGACY`); `rates` and `org`
 * the same, by `fx` and `organisations`.
 *
 * THE ADD-ON'S OWN LISTS ARE SETTLED FIRST. A list that waits and is let in by what the record holds counts for every
 * other part, whatever order the document says them in. Two lists waiting on each other both wait, and the settling
 * stops at the first pass that lets nothing more in, so it cannot loop.
 */

import { jcs, type DeclKind, type Json } from '@braindog/kernel';

import type { Installed, Pack } from './index.ts';

/** One part that waits: where it sits (`register.clients.fields[2]`, or a declaration's id) and the names not yet held. */
export type Waiting = { at: string; holds: string[] };

type Body = Record<string, unknown>;
const isBody = (v: unknown): v is Body => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The roles a list may play, and the list that plays each by its name alone. */
const ROLES: Readonly<Record<string, string>> = { rates: 'fx', meets: 'people', org: 'organisations' };

/** The names in a `when: { holds }`, or `null` for any other `when:` (a figure's test on a block). */
export function holdsIn(when: unknown): string[] | null {
  if (!isBody(when) || !Object.hasOwn(when, 'holds')) return null;
  return Array.isArray(when.holds) ? when.holds.filter((n): n is string => typeof n === 'string') : [];
}

/** The ids of a list's fields, in the order it says them. */
const fieldIds = (body: unknown): string[] =>
  isBody(body) && Array.isArray(body.fields) ? body.fields.flatMap((f) => (isBody(f) && typeof f.id === 'string' ? [f.id] : [])) : [];

/** What one list makes held: its id, and each role it declares or plays by its name. */
function namesOf(list: string, body: Body): string[] {
  const out = [list];
  for (const [role, legacy] of Object.entries(ROLES)) if ((isBody(body[role]) && holdsIn(body[role].when) === null) || list === legacy) out.push(role);
  return out;
}

/**
 * What the record holds once this add-on is in: every list it holds now, every list the add-on brings that waits on
 * nothing, and the roles those lists play.
 */
export function holdsOf(installed: Pick<Installed, 'declarations'>, given: Pick<Pack, 'declarations'>): Set<string> {
  const held = new Set<string>();
  for (const d of installed.declarations) {
    if (d.kind !== 'register') continue;
    let body: unknown;
    try {
      body = JSON.parse(d.body);
    } catch {
      body = {};
    }
    for (const n of namesOf(d.id.slice('register.'.length), isBody(body) ? body : {})) held.add(n);
  }
  for (const d of given.declarations)
    if (d.kind === 'register' && holdsIn(d.body.when) === null) for (const n of namesOf(d.id.slice('register.'.length), d.body)) held.add(n);
  return held;
}

/** Whether a part waits: the names it still waits for, or none when it is in. */
type Decide = (at: string, names: readonly string[]) => readonly string[];

/**
 * One declaration's body with every waiting part taken out and the key off every part kept. `at` names the declaration.
 * A part taken out takes what is inside it: a block that waits says nothing about its columns.
 */
function sifted(kind: DeclKind, body: Body, at: string, decide: Decide, out: Waiting[]): Body {
  const keep = (part: Body, where: string): boolean => {
    const names = holdsIn(part.when);
    if (names === null) return true;
    const missing = decide(where, names);
    if (missing.length > 0) {
      out.push({ at: where, holds: [...missing] });
      return false;
    }
    delete part.when;
    return true;
  };
  const sift = (of: Body, key: string, base: string, inner?: (part: Body, where: string) => void): void => {
    const items = of[key];
    if (!Array.isArray(items)) return;
    of[key] = items.filter((item, i) => {
      if (!isBody(item)) return true;
      const where = `${base}.${key}[${i}]`;
      if (!keep(item, where)) return false;
      inner?.(item, where);
      return true;
    });
  };
  if (kind === 'register') {
    const had = fieldIds(body);
    sift(body, 'fields', at);
    const lost = new Set(had.filter((f) => !fieldIds(body).includes(f)));
    if (lost.size > 0) {
      /* A ROLE'S PART OVER A FIELD THAT WAITS GOES WITH THE FIELD, since the kernel refuses a role naming a field the list
         does not have (people-pack-file-90). */
      for (const key of Object.keys(ROLES)) {
        const part = body[key];
        if (isBody(part)) body[key] = Object.fromEntries(Object.entries(part).filter(([k, v]) => k === 'when' || !lost.has(String(v))));
      }
      /* AND SO DOES THE PART OF `hand` THAT NAMES IT, which the kernel refuses too: Work's hand.person waits with the
         field it names (work-pack-file-90). `mobile` keeps it, as the seed's own modules do, since the short view of a
         field that is not there draws nothing and the kernel does not refuse it. */
      if (isBody(body.hand)) body.hand = Object.fromEntries(Object.entries(body.hand).filter(([k, v]) => k === 'taken' || !lost.has(String(v))));
      /* AND A COLUMN OF `table` OVER IT, which the kernel refuses as it refuses a role's part: the column waits with its
         field, a field of a column's `or` over it goes and the column stays, and a table left with no column goes, so the list
         opens on the columns the app works out. */
      if (Array.isArray(body.table)) {
        const columns = body.table.flatMap((c): unknown[] => {
          if (typeof c === 'string') return lost.has(c) ? [] : [c];
          if (!isBody(c)) return [c];
          if (lost.has(String(c.field))) return [];
          const ors = Array.isArray(c.or) ? c.or : c.or === undefined ? [] : [c.or];
          const kept = ors.filter((o) => !lost.has(String(o)));
          if (kept.length === ors.length) return [c];
          const { or: _gone, ...rest } = c;
          return [kept.length === 0 ? rest : { ...rest, or: Array.isArray(c.or) ? kept : kept[0] }];
        });
        if (columns.length === 0) delete body.table;
        else body.table = columns;
      }
    }
    for (const key of ['pairs', ...Object.keys(ROLES)]) {
      const part = body[key];
      if (isBody(part) && !keep(part, `${at}.${key}`)) delete body[key];
    }
  }
  if (kind === 'page') {
    /* A READER FILTER MAY WAIT, as a block may (work-pack-file-90). */
    sift(body, 'filters', at);
    const all = Array.isArray(body.blocks) ? [...body.blocks] : [];
    sift(body, 'blocks', at, (block, where) => {
      sift(block, 'columns', where);
      sift(block, 'legs', where);
    });
    /* A LIST ONLY WAITING BLOCKS READ LEAVES THE PAGE'S REQUIRES WITH THEM, since the kernel refuses a page requiring a
       list the record does not hold (people-pack-file-90). */
    if (Array.isArray(body.requires)) {
      const reads = (bs: unknown[], r: unknown) => bs.some((b) => isBody(b) && b.source === r);
      body.requires = body.requires.filter((r) => !reads(all, r) || reads(body.blocks as unknown[], r));
    }
  }
  if (kind === 'metric') sift(body, 'legs', at);
  return body;
}

/** The add-on with each declaration sifted by `decide`, and what waits. */
function settled(pack: Pack, decide: Decide): { pack: Pack; waiting: Waiting[] } {
  const waiting: Waiting[] = [];
  const gone = new Set<string>();
  const declarations = pack.declarations.flatMap((d) => {
    const names = d.kind === 'rule' ? null : holdsIn(d.body.when);
    if (names !== null) {
      const missing = decide(d.id, names);
      if (missing.length > 0) {
        waiting.push({ at: d.id, holds: [...missing] });
        if (d.kind === 'register') gone.add(d.id.slice('register.'.length));
        return [];
      }
    }
    /* NOTHING TO SIFT IS THE COMMON CASE, said without a copy: no `holds` anywhere in the body. */
    if (names === null && !JSON.stringify(d.body).includes('"holds"')) return [d];
    const before = waiting.length;
    const body = sifted(d.kind, structuredClone(d.body) as Body, d.id, decide, waiting);
    if (names !== null) delete body.when;
    if (names === null && waiting.length === before && jcs(body as Json) === d.canonical) return [d];
    return [{ ...d, body: body as Record<string, Json>, canonical: jcs(body as Json) }];
  });
  /* A LIST THAT WAITS TAKES ITS EXAMPLE ROWS WITH IT, which would otherwise be written into a list that is not there, and
     a field that waits takes its value out of each example, which would otherwise be refused as a field the list lacks. */
  const cut = new Map<string, Set<string>>();
  for (const d of declarations) {
    const was = pack.declarations.find((p) => p.id === d.id);
    if (d.kind !== 'register' || was === undefined || was === d) continue;
    const kept = new Set(fieldIds(d.body));
    const lost = fieldIds(was.body).filter((f) => !kept.has(f));
    if (lost.length > 0) cut.set(d.id.slice('register.'.length), new Set(lost));
  }
  const seeds = pack.seeds.flatMap((s) => {
    if (gone.has(s.register)) return [];
    const lost = cut.get(s.register);
    if (!lost || !Object.keys(s.fields).some((k) => lost.has(k))) return [s];
    return [{ ...s, fields: Object.fromEntries(Object.entries(s.fields).filter(([k]) => !lost.has(k))) }];
  });
  return { pack: waiting.length === 0 && declarations.every((d, i) => d === pack.declarations[i]) ? pack : { ...pack, declarations, seeds }, waiting };
}

/**
 * The add-on as this record gets it: the parts whose names `holds` has, with the key taken off, and the parts that wait.
 *
 * THE LISTS ARE SETTLED FIRST. A list of the add-on's own that waits on something held is held in its turn, so a field
 * waiting on it is let in whatever order the document says them in, until a pass lets nothing more in.
 */
export function resolveWhen(pack: Pack, holds: ReadonlySet<string>): { pack: Pack; waiting: Waiting[] } {
  const held = new Set(holds);
  for (let moved = true; moved; ) {
    moved = false;
    for (const d of pack.declarations) {
      const names = d.kind === 'register' ? holdsIn(d.body.when) : null;
      const list = d.id.slice('register.'.length);
      if (names === null || held.has(list) || !names.every((n) => held.has(n))) continue;
      for (const n of namesOf(list, d.body)) held.add(n);
      moved = true;
    }
  }
  return settled(pack, (_, names) => names.filter((n) => !held.has(n)));
}

/**
 * The add-on as a plan said it, from that plan's `waiting`: the parts it named taken out and the key off the rest. What
 * `install` stages, so the record gets exactly what was approved, without the record read again.
 */
export function settleWhen(pack: Pack, waiting: readonly Waiting[]): Pack {
  const named = new Map(waiting.map((w) => [w.at, w.holds]));
  return settled(pack, (at) => named.get(at) ?? []).pack;
}
