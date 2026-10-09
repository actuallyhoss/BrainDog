/**
 * An update that takes away a door or pattern the record is using says so, and installs what takes it over (REC-A16).
 *
 * THE PLAN CALLED IT A RETIRE AND SAID NOTHING OF TEXTS. money-core 3.0.0 drops the card wordings and their text twins
 * to `card-alerts`, and with no `hands` since 2.4.0 a record updating retires them, so the owner's Shortcut posted to a
 * door nothing read and the texts stopped filing until he found the other add-on himself. Here the arranger finds what
 * the record is using (`liveIngests`), hands it to `declare`'s plan as `live`, and for each live retire looks in the
 * host's catalogue for a current add-on that declares the same id (`takersFor`). Found, it joins the same arrangement as
 * a step of its own, so the one yes installs it; not found, the question says texts will stop (`apps/web` `arranged.ts`).
 *
 * WHAT IS FILED ON A RETIRE is `live: true` and `taken_by: { pack, name }`, the add-on by its id and by the name the
 * catalogue gives it, beside the `to` and `to_name` a handover already carries (`retireMarks`).
 */

import { installFault, normalise, plan, plannedState, unresolvedFault, type Installed, type Pack } from '@braindog/declare';
import type { PatternReport } from '@braindog/kernel';
import type { ArrangeDeps } from './arrange.ts';

type Body = Record<string, unknown>;

/** How far back an arrival makes a door or pattern one the record is using. */
export const LIVE_DAYS = 30;

/** The add-on that takes over a live retire, by its id and by the name a person reads. */
export type TakenBy = { pack: string; name: string };

/**
 * What an arrangement's updates take away that the record is using: `live` for the plan, `adds` the add-ons that join
 * the arrangement to take it over, `docs` the documents of those fetched from the host's whole catalogue, and `by` each
 * live retire's add-on by declaration id.
 */
export type Takers = { live: ReadonlySet<string>; adds: string[]; docs: Map<string, Body>; by: Map<string, TakenBy> };

const NONE: Takers = { live: new Set(), adds: [], docs: new Map(), by: new Map() };

/**
 * Every door and pattern this record is using, by declaration id (`ingest.<name>`).
 *
 * THREE WAYS IN. One that took an arrival in the last `LIVE_DAYS`, filed, skipped or waiting, read off the kernel's own
 * report of what each pattern did (`patternReport`), and the door each of those reads. A webhook door with an address,
 * which `Installed.addressed` names. And every pattern reading a door that is live: texts still arrive there, and with
 * the pattern gone nothing files them.
 *
 * A CALLER THAT CANNOT SAY WHICH DOORS HOLD AN ADDRESS has `used` read instead, which also names every door that ever
 * claimed an arrival, however long ago: more doors marked live, and never one fewer.
 */
export function liveIngests(report: PatternReport, installed: Pick<Installed, 'declarations' | 'used' | 'addressed'>): Set<string> {
  const live = new Set<string>();
  for (const door of report.doors) {
    const used = door.patterns.filter((p) => p.filed + p.waiting + p.skipped.reduce((n, s) => n + s.n, 0) > 0);
    for (const p of used) live.add(`ingest.${p.ingest}`);
    if (door.unread > 0 || used.length > 0) live.add(`ingest.${door.door}`);
  }
  const used = new Set(installed.addressed ?? installed.used ?? []);
  const doors = new Map<string, string | null>();
  for (const d of installed.declarations) {
    if (d.kind !== 'ingest') continue;
    let body: { channel?: unknown; verify?: { kind?: unknown }; door?: unknown };
    try {
      body = JSON.parse(d.body) as typeof body;
    } catch {
      continue;
    }
    if (body.channel === 'webhook' && body.verify?.kind === 'path' && used.has(d.id)) live.add(d.id);
    doors.set(d.id, typeof body.door === 'string' ? `ingest.${body.door}` : null);
  }
  for (const [id, door] of doors) if (door !== null && live.has(door)) live.add(id);
  /* ONLY WHAT THE RECORD DECLARES: the report names a channel, `email` or `webhook`, for an arrival that named no door. */
  return new Set([...live].filter((id) => doors.has(id)));
}

/** What the filed step carries for one retire: `live` and the add-on that takes it over, or nothing. */
export function retireMarks(retire: { id: string; live?: true }, takers: Pick<Takers, 'by'>): { live?: true; taken_by?: TakenBy } {
  if (retire.live !== true) return {};
  const by = takers.by.get(retire.id);
  return by === undefined ? { live: true } : { live: true, taken_by: by };
}

/** One add-on on offer, read once: its id, the name the catalogue gives it, its pack, and its document when fetched. */
type Offer = { id: string; name: string; pack: Pack; doc: Body; fetched: boolean };

const read = async (doc: unknown): Promise<Pack | null> => {
  if (doc === null || doc === undefined) return null;
  const pack = await normalise(doc);
  return pack.ok ? pack.value : null;
};

/**
 * What the updates in `asked` take away that the record is using, and the add-on that takes each over.
 *
 * EACH UPDATE IS PLANNED HERE AGAINST THE RECORD AS IT IS, with `live`, so what is marked is exactly what `declare` marks;
 * the arrangement plans it again in order. Nothing is written. An arrangement with no update, or a record using no
 * door, reads no catalogue at all.
 *
 * THE ADD-ON IS ONE THE HOST OFFERS NOW, at the version it offers: the short list first, then the whole catalogue. One
 * already in the arrangement is named and not added twice. One the record holds and the arrangement does not update is
 * passed over, since its own update is another question. WHEN TWO DECLARE THE ID, the publisher's own wins, the one whose
 * author wrote the update, so a stranger's never takes over a door the publisher has an add-on for; with none of the
 * publisher's own, one by another author the host offers does, and the question names it. And one that would
 * not install after the update (a conflict, a requirement nothing in the arrangement meets, any fault `install` would
 * give) is passed over too, so a found add-on never turns a question that would have been filed into a refusal.
 */
export async function takersFor(d: Pick<ArrangeDeps, 'kernel' | 'catalogue' | 'shelf' | 'installed'>, asked: readonly string[], docs: ReadonlyMap<string, Body>): Promise<Takers> {
  const installed = d.installed();
  const held = (id: string): boolean => installed.packs.some((p) => p.id === id);
  const updating = asked.filter(held);
  if (updating.length === 0) return NONE;
  const live = liveIngests(d.kernel.patternReport(LIVE_DAYS), installed);
  if (live.size === 0) return { ...NONE, live };
  const holds = installed.declarations.filter((r) => r.kind === 'register').map((r) => r.id.slice('register.'.length));

  let offered: Offer[] | null = null;
  const offers = async (): Promise<Offer[]> => {
    if (offered !== null) return offered;
    const out: Offer[] = [];
    for (const e of d.catalogue) {
      if (e.kind !== 'pack') continue;
      const doc = e.doc({ holds, usecase: null });
      const pack = await read(doc);
      if (doc !== null && pack !== null) out.push({ id: e.id, name: e.title, pack, doc, fetched: false });
    }
    for (const e of d.shelf ? await d.shelf.listed() : []) {
      if (e.kind !== 'pack' || out.some((o) => o.id === e.id)) continue;
      const got = await d.shelf!.fetch(e.id).catch(() => null);
      const pack = got?.ok ? await read(got.value.doc) : null;
      if (got?.ok && pack !== null) out.push({ id: e.id, name: got.value.title, pack, doc: got.value.doc, fetched: true });
    }
    return (offered = out);
  };

  const out: Takers = { live, adds: [], docs: new Map(), by: new Map() };
  for (const id of updating) {
    const pack = await read(docs.get(id) ?? d.catalogue.find((e) => e.id === id)?.doc({ holds, usecase: null }));
    if (pack === null) continue;
    const diff = await plan(pack, installed, { live });
    const going = diff.retires.filter((r) => r.live === true && !out.by.has(r.id));
    if (going.length === 0) continue;
    const after = plannedState(installed, pack, diff);
    const author = pack.manifest.author;
    /* THE PUBLISHER'S OWN FIRST, then one already in the arrangement, then the catalogue's order. */
    const ranked = [...(await offers())]
      .filter((o) => o.id !== id && (!held(o.id) || asked.includes(o.id)))
      .map((o, i) => ({ o, rank: (o.pack.manifest.author === author ? 0 : 2) + (asked.includes(o.id) || out.adds.includes(o.id) ? 0 : 1), i }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map((x) => x.o);
    for (const r of going) {
      for (const o of ranked) {
        if (!o.pack.declarations.some((x) => x.id === r.id)) continue;
        const coming = asked.includes(o.id) || out.adds.includes(o.id);
        if (!coming && !(await fits(o.pack, after, [...asked, ...out.adds]))) continue;
        if (!coming) {
          out.adds.push(o.id);
          if (o.fetched) out.docs.set(o.id, o.doc);
        }
        out.by.set(r.id, { pack: o.id, name: o.name });
        break;
      }
    }
  }
  return out;
}

/** Whether an add-on installs on the record as the update leaves it, with `coming` the packs the arrangement brings. */
async function fits(taker: Pack, after: Installed, coming: readonly string[]): Promise<boolean> {
  const diff = await plan(taker, after);
  if (diff.conflicts.length > 0 || unresolvedFault(diff) !== null) return false;
  if (!diff.requires.packs.every((p) => p.ok || coming.includes(p.id))) return false;
  /* A REQUIREMENT ANOTHER STEP MEETS is met only once that step is planned, so `install`'s fault is asked when none is left. */
  return diff.requires.packs.some((p) => !p.ok) || installFault(taker, diff) === null;
}
