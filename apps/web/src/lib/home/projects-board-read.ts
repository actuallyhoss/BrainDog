/**
 * WHAT THE PROJECTS BOARD READS (`projects-board.ts` works it out, `ProjectsBoard.svelte` draws it): beside the projects
 * the page's own block answered, the open work and the work written to this month, the runs of the last month, the key
 * number each project leads with, the questions about projects, what renews in two months and the money that repeats
 * on a project. One read a list for every project at once, never one a project.
 *
 * EVERY LIST IS FOUND BY WHAT IT DECLARES, never by its name: the work is the list that hands rows out and points at the
 * projects with a state; the runs are the list of runs heard from; a service is a row with a `renews` day pointing at a
 * project; repeating money is a row with an amount and an `every` pointing at one. A read that fails reads nothing, and
 * the board says what it can without it.
 *
 * A ROUTE-ONLY MODULE: it reads the record, so its rules are in `projects-board.ts`, where node tests them.
 */

import { createClient } from '@braindog/client';
import { money as moneyOf } from 'braindog-render';

import { readBoot, recordNow } from '../record/boot-live.ts';
import { homeCurrency } from '../record/api.ts';
import { REGISTERS } from '../record/held.ts';
import { handFor } from '../record/hand.ts';
import { symbolText } from '../record/money.ts';
import { learn } from '../record/remote.ts';
import { calledOf } from '../voice.ts';
import { rowHref } from '../record/row-href.ts';
import { pictureOf } from '../picture/picture.ts';
import { registerHref } from '../record/where.ts';
import { viaOf } from '../../routes/r/[register]/[seq]/figures.ts';
import { localDay } from '../../routes/r/[register]/[seq]/said.ts';
import { cardKpiOf, isForecast, type KpiAnswered } from './card-kpi.ts';
import { readLeads } from './card-kpis.ts';
import { runsListFor } from './card-life.ts';
import { boardOf, type Board, type BoardInput, type BoardKpi, type BoardProject, type BoardReading } from './projects-board.ts';
import { cadenceOf } from '../page/feed-age.ts';
import { lanesOf, inPlayOf } from '../shell/side.ts';

/** What this tab has asked, so a list's declaration is asked for once. */
const asked = new Map<string, Promise<void>>();

type Row = { seq?: unknown; id?: unknown; fields?: Record<string, unknown>; updated_at?: unknown; created_at?: unknown; created?: unknown };
type Where = { toJSON: () => string };
const where = (s: string): Where => ({ toJSON: () => s });
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const READ = 500;

/** Where a row of a list opens: its page where its list made one, else its screen. */
const opens = (register: string, seq: number): string => rowHref(`${register}#${seq}`) ?? `/r/${register}/${seq}`;

/** The first list that points at `projects` and declares every field in `ids`, other than the ones in `not`. */
function listWith(projects: string, ids: readonly string[], not: readonly string[] = []): { list: string; field: string } | null {
  for (const id of Object.keys(REGISTERS)) {
    if (id === projects || not.includes(id)) continue;
    const d = REGISTERS[id]!;
    const ref = d.fields.find((f) => f.type === 'ref' && (f as { to?: string }).to === projects);
    if (ref && ids.every((x) => d.fields.some((f) => f.id === x))) return { list: id, field: ref.id };
  }
  return null;
}

/** An amount as a point holds it (`USD 8,750.00`), in minor units. */
export function amountOf(said: string | null | undefined): { minor: number; currency: string } | null {
  const m = /^([A-Z]{3})\s+(-?[\d,]+(?:\.\d+)?)$/u.exec(text(said));
  if (!m) return null;
  const n = Number(m[2]!.replace(/,/gu, ''));
  return Number.isFinite(n) ? { minor: Math.round(n * 100), currency: m[1]! } : null;
}

/** A money value as a field holds it (`{ amount, currency }`), in minor units. */
const fieldMoney = (v: unknown): { minor: number; currency: string } | null => {
  const m = v as { amount?: unknown; currency?: unknown } | null;
  return m && typeof m.amount === 'number' && typeof m.currency === 'string' && m.currency !== '' ? { minor: m.amount, currency: m.currency } : null;
};

const EVERY_DAYS: Readonly<Record<string, number>> = { '1h': 1, '1d': 1, '1w': 7, '1m': 31 };
/** The most of a project's newest readings read for how old its numbers are: enough for each measure's cadence. */
const READINGS_READ = 300;

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A key number as the board draws it. */
function kpiOf(a: KpiAnswered, format: (minor: number, currency: string) => string, now: number): BoardKpi | null {
  if (isForecast(a.name)) return null;
  const card = cardKpiOf(a, { home: homeCurrency(), now });
  const pts = a.points.map((p) => (typeof p.value === 'number' ? p.value : (amountOf(p.amount)?.minor ?? Number.NaN))).filter((n) => Number.isFinite(n));
  const latest = (a as { latest?: { at?: string; value?: number; amount?: string } | null }).latest ?? a.points.at(-1) ?? null;
  const target = (a as { target?: unknown }).target;
  const by = text((a as { target_by?: unknown }).target_by);
  const aimMoney = typeof target === 'string' ? amountOf(target) : null;
  const aim =
    target === undefined || target === null
      ? null
      : {
          said: `${aimMoney ? format(aimMoney.minor, aimMoney.currency) : String(target)}${a.every === '1m' ? ' a month' : ''}`,
          by: /^\d{4}-\d{2}/u.test(by) ? `${MONTH[Number(by.slice(5, 7)) - 1]} ${by.slice(0, 4)}` : null,
        };
  return {
    project: text(a.thing) || text(a.project),
    name: a.name,
    figure: card?.figure ?? '',
    money: latest ? amountOf(latest.amount) : null,
    every: a.every ?? null,
    /* ITS SHAPE, which says a money `level` kept a month is a standing rate, secured (9 Nov, `monthKindOf`). */
    kind: a.kind ?? null,
    latestAt: latest?.at ? String(latest.at) : null,
    points: pts.slice(-24),
    move: card?.move?.said ?? null,
    stale: card?.stale ?? null,
    aim,
    readings: a.points.length,
    /* AS ITS PAGE READS IT (`project-facts.ts`): its declared cadence, else the usual gap between its points. */
    cadence: (a.every ? EVERY_DAYS[a.every] : undefined) ?? cadenceOf(a.points.flatMap((p) => (typeof p.at === 'string' ? [p.at] : []))),
  };
}

/**
 * Every list the board reads that this tab has not learnt yet, by the record's own index: one batched read of their
 * declarations, so a cold open of Projects finds its work, runs, services and repeating money.
 */
async function learnAll(base: string, client: ReturnType<typeof createClient>): Promise<void> {
  const booted = await readBoot(base).catch(() => null);
  const ids = booted?.from === 'live' ? booted.boot.registers.map((r) => r.id).filter((id) => REGISTERS[id] === undefined) : [];
  await Promise.all(ids.map((id) => learn(client.schema, id, asked).catch(() => undefined)));
}

/** The projects as the board reads them, from the rows the page's block answered. */
export function projectsFrom(list: string, entries: readonly Row[]): BoardProject[] {
  const d = REGISTERS[list];
  if (!d) return [];
  const title = d.title ?? 'name';
  const state = d.state ?? 'lane';
  const identity = d.identity;
  const out: BoardProject[] = [];
  for (const e of entries) {
    const f = e.fields ?? {};
    const name = text(f[title]);
    if (typeof e.seq !== 'number' || name === '') continue;
    const hue = f[identity?.accent ?? 'hue'];
    const h = typeof hue === 'number' ? hue : typeof hue === 'string' && hue.trim() !== '' ? Number(hue) : Number.NaN;
    const repos = ['repos', 'folders', 'repo', 'folder'].flatMap((k) => (Array.isArray(f[k]) ? (f[k] as unknown[]).map(text) : typeof f[k] === 'string' ? [text(f[k])] : [])).filter(Boolean);
    out.push({
      seq: e.seq,
      id: typeof e.id === 'string' ? e.id : null,
      spoken: `${list}#${e.seq}`,
      name,
      mark: identity?.mark ? text(f[identity.mark]) : '',
      hue: Number.isFinite(h) ? h : null,
      picture: identity?.picture ? pictureOf(f[identity.picture]) : null,
      lane: text(f[state]),
      next: text(f.next),
      health: text(f.health),
      href: opens(list, e.seq),
      year: fieldMoney(f.revenue),
      repos,
      /* WHEN IT WAS WRITTEN, or last changed where the answer says no more, so a project a minute old is not quiet (AH17). */
      made: typeof e.created === 'string' ? e.created : typeof e.created_at === 'string' ? e.created_at : typeof e.updated_at === 'string' ? e.updated_at : null,
    });
  }
  return out;
}

/** The board for the projects list `list` and the rows its block answered. */
export async function readBoard(base: string, list: string, entries: readonly Row[]): Promise<Board | null> {
  const client = createClient({ base });
  await learnAll(base, client);
  const projects = projectsFrom(list, entries);
  if (projects.length === 0) return null;
  const now = recordNow();
  const today = localDay(now);
  const home = homeCurrency();
  const format = (minor: number, currency: string): string => symbolText(moneyOf(minor, currency), home, true);
  const rows = async (register: string, w: string, opts: { order?: unknown; fields?: string[] } = {}): Promise<Row[]> => {
    const got = await client.list({ register, where: where(w) as never, limit: READ, ...(opts.order ? { order: opts.order as never } : {}) }).catch(() => null);
    return got?.ok ? (got.value.rows as Row[]) : [];
  };

  /* ── its work ── */
  const work = Object.keys(REGISTERS).find((id) => handFor(REGISTERS[id]) !== null && viaOf(REGISTERS[id], list) !== null);
  const via = work ? viaOf(REGISTERS[work], list) : null;
  const titleOf = (f: Record<string, unknown>) => text(f[REGISTERS[work ?? '']?.title ?? 'what']);
  const openWhere = via ? `${via.field} is set${via.done.length > 0 ? `, ${via.state.id} is not ${via.done.join(' or ')}` : ''}` : '';
  /* ── its runs, its services and the money that repeats on it ── */
  const runs = runsListFor(list);
  const services = listWith(list, ['renews', 'provider']);
  const recurring = listWith(list, ['every', 'next_due', 'direction']);
  /* ITS NUMBERS FEED, THE LIST ITS OWN PAGE READS (`project-shape.ts` `SHAPE_LINKED.readings`), by what it declares and
     never one that hands work out: each project in play's newest readings, so the board says how old its numbers are
     as its page does. A read a project, each small, since one read of every project's newest would leave out the quiet
     ones, whose readings are the oldest. */
  const feedList = listWith(list, ['at', 'value', 'name'], Object.keys(REGISTERS).filter((id) => handFor(REGISTERS[id]) !== null));
  const stateField = REGISTERS[list]?.fields.find((f) => f.id === (REGISTERS[list]?.state ?? 'lane')) as { values?: string[]; labels?: Record<string, string> } | undefined;
  const lanes = lanesOf(REGISTERS[list], stateField?.values ?? ['parked', 'retired']);
  const feedOf = async (p: BoardProject): Promise<BoardReading[]> => {
    if (!feedList) return [];
    const got = await client
      .list({ register: feedList.list, where: where(`${feedList.field} is ${p.spoken}`) as never, limit: READINGS_READ, order: [{ field: 'at', dir: 'desc' }], fields: ['name', 'at'] })
      .catch(() => null);
    if (!got?.ok) return [];
    return (got.value.rows as Row[]).flatMap((r) => {
      const at = text(r.fields?.at);
      return at === '' ? [] : [{ project: p.spoken, name: text(r.fields?.name), at }];
    });
  };

  const [openRows, movedRows, runRows, leads, asksRaw, renewRows, recRows, feeds] = await Promise.all([
    work && via ? rows(work, openWhere) : Promise.resolve([]),
    work && via ? rows(work, `${via.field} is set, updated_at after -31d`) : Promise.resolve([]),
    runs ? rows(runs.list, 'last_seen after -31d', { order: [{ field: 'last_seen', dir: 'desc' }] }) : Promise.resolve([]),
    readLeads(base).catch(() => [] as KpiAnswered[]),
    client
      .call<{ blocks?: { queue?: unknown }[] }>('previewPage', { body: { page: 'project-asks', title: 'Asks', blocks: [{ kind: 'queue', source: 'governance.open', where: `list is ${list}`, limit: 50 }] } })
      .then((out) => (out.ok && Array.isArray(out.value.blocks?.[0]?.queue) ? (out.value.blocks[0].queue as { about?: unknown; question?: unknown }[]) : []))
      .catch(() => []),
    services ? rows(services.list, 'renews after yesterday, renews before +61d') : Promise.resolve([]),
    recurring ? rows(recurring.list, `${recurring.field} is set`) : Promise.resolve([]),
    Promise.all(projects.filter((p) => inPlayOf(p.lane, lanes)).map(feedOf)),
  ]);

  const input: BoardInput = {
    projects,
    tasks: via && work
      ? openRows.flatMap((r) => {
          const f = r.fields ?? {};
          const by = via.deadline ? text(f[via.deadline]) : '';
          return typeof r.seq === 'number' ? [{ seq: r.seq, project: text(f[via.field]), title: titleOf(f), by: /^\d{4}-\d{2}-\d{2}/u.test(by) ? by.slice(0, 10) : null, href: opens(work, r.seq) }] : [];
        })
      : [],
    moves: via ? movedRows.flatMap((r) => (typeof r.updated_at === 'string' ? [{ project: text(r.fields?.[via.field]), at: r.updated_at }] : [])) : [],
    runs: runs
      ? runRows.flatMap((r) => {
          const f = r.fields ?? {};
          const at = text(f.last_seen) || text(r.updated_at);
          return typeof r.seq === 'number' && at !== ''
            ? [
                {
                  seq: r.seq,
                  agent: text(f.agent) || 'other',
                  project: text(f[runs.field]),
                  repo: text(f.repo),
                  remote: text(f.remote),
                  cwd: text(f.cwd),
                  at,
                  state: text(f.state),
                  closedAs: text(f.closed_as),
                  handed: text(f.next) !== '' || (Array.isArray(f.notes) && f.notes.length > 0),
                },
              ]
            : [];
        })
      : [],
    kpis: leads.flatMap((a) => {
      const k = kpiOf(a, format, now);
      return k ? [k] : [];
    }),
    asks: asksRaw.flatMap((q) => (typeof q.about === 'string' && typeof q.question === 'string' ? [{ project: q.about, question: q.question, href: '/decide' }] : [])),
    renewals: services
      ? renewRows.flatMap((r) => {
          const f = r.fields ?? {};
          const day = text(f.renews);
          const state = text(f.state);
          if (typeof r.seq !== 'number' || !/^\d{4}-\d{2}-\d{2}/u.test(day) || /cancel|ended|gone|lapsed/u.test(state)) return [];
          return [{ project: text(f[services.field]) || null, name: text(f[REGISTERS[services.list]?.title ?? 'name']), day: day.slice(0, 10), href: opens(services.list, r.seq) }];
        })
      : [],
    recurring: recurring
      ? recRows.flatMap((r) => {
          const f = r.fields ?? {};
          const m = fieldMoney(f.amount);
          const dir = text(f.direction);
          if (!m || (dir !== '' && !/^in/u.test(dir))) return [];
          return [{ project: text(f[recurring.field]), minor: m.minor, currency: m.currency, every: text(f.every), state: text(f.state) || 'live', nextDue: text(f.next_due) || null }];
        })
      : [],
    readings: feeds.flat(),
    lanes,
    ...(stateField?.labels ? { laneLabels: stateField.labels } : {}),
    now,
    today,
    format,
    home,
    hrefs: {
      late: work && via?.deadline ? registerHref(work, `${via.deadline} before today${via.done.length > 0 ? `, ${via.state.id} is not ${via.done.join(' or ')}` : ''}`) : null,
      asks: '/decide',
      feed: '/automations?new=door&preset=numbers',
      numbers: '/p/all-numbers',
    },
    called: calledOf(work ? REGISTERS[work] : undefined),
  };
  return boardOf(input);
}
