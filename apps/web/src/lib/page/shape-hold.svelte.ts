/**
 * ONE PROJECT'S SHAPE, READ ONCE FOR EVERY PART OF IT ON ITS PAGE (24 October). The hero, Path and Money,
 * Work, Who is on it, Runs on and the agents on it are blocks the page declares (`{ kind: project, part }`), each drawn
 * in its own slot (`ProjectPart.svelte`); what they draw is one read of the row the page is about, held here, so seven
 * blocks ask the record once and not seven times. `PageView.svelte` makes one for the page and hands it down.
 *
 * WHAT `ProjectShape.svelte` WORKED OUT, MOVED WHOLE: the hero's name, where it stands, its line, its next step and its
 * three figures; the Work tile's two columns; the path; who is on it; what it runs on; and who was here today. Nothing
 * here is drawn: each part reads what it needs.
 *
 * ONE CLOCK: open work and what is late are counted on the record's day (`recordNow`), as Work counts it. One read
 * of the work list that points here holds the hero's counts, the Work tile and the Path.
 *
 * LIVE (proj F9): the page is read again when the record moves, and its new answer is taken here, the old one kept on
 * screen until it lands, and each figure whose value changed washes in the neutral `--arrived` for a moment (`arrived`),
 * as every other row does.
 *
 * TAKEN FROM THE PAGE'S OWN ANSWER (scope 2026-10-24 A20, `shape-answer.ts`): the record answers what the parts draw
 * beside the page's blocks, so the hold asks the record nothing. A page that carries no shape, a row that is not a
 * project's, has no parts.
 */

import { apiBase } from '$lib/at.ts';
import { workingNow } from '$lib/home/waits.svelte.ts';
import { decl as fieldDecl, homeCurrency, labelOf } from '$lib/record/api.ts';
import { REGISTERS } from '$lib/record/held.ts';
import { localDay } from '../../routes/r/[register]/[seq]/said.ts';
import { symbolText } from '$lib/record/money.ts';
import { rowScreen } from '$lib/record/row-href.ts';
import { registerHref } from '$lib/record/where.ts';
import { actor } from '$lib/record/names.ts';
import { shapeFrom, type ShapeRead, type WorkRow } from './shape-answer.ts';
import { settle } from '$lib/ui/same.ts';
import { lanesOf } from '$lib/shell/side.ts';
import { blocksOf, heroOf, isProject, shapeOf, type Block } from '$lib/record/project.ts';
import { HEALTH, daySaid, figureOf, hueOf } from '$lib/home/project-cards.ts';
import { cardKpiOf, type KpiAnswered } from '$lib/home/card-kpi.ts';
import { kpiView } from 'braindog-render';
import { pathOf, trendOf } from '$lib/record/visuals.ts';
import { calledOf, valueSaid } from '$lib/voice.ts';
import { money as moneyOf, monthShort } from 'braindog-render';
import { moneyShown, partsLaid, type PartsHave } from './project-parts.ts';
import { rowHref } from '$lib/record/row-href.ts';
import { updateRow } from '../record/page-write.ts';
import { checklistOf, datesOf, happenedOf, heroFactsOf, numbersOf, runSaid, runsOnOf, sessionsOf, sideOf, type FactKpi, type FactTask, type FactsIn, type KpiAt } from './project-facts.ts';

/**
 * A FLOW'S FIGURE AND ITS PERIOD AS TODAY SAYS THEM (`kpiView`, on the record's clock): its last whole period, and when
 * that was. Anything else says its newest reading, as the page already does, so nothing is handed for it.
 */
function shownOf(a: unknown, now: number | undefined): FactKpi['shown'] {
  try {
    const v = kpiView(a as KpiAnswered, { home: homeCurrency(), ...(now !== undefined ? { now } : {}) });
    if (v.kind !== 'flow' || !v.figure) return undefined;
    const card = cardKpiOf(a as KpiAnswered, { home: homeCurrency(), ...(now !== undefined ? { now } : {}) });
    return { figure: card?.figure ?? v.figure.text, when: v.when };
  } catch {
    return undefined;
  }
}

/** Where a project sends its numbers is set up. */
const FEED_SETUP = '/automations?new=door&preset=numbers';

/** A ring of done work only from five tasks, and never at nought. */
const RING_FROM = 5;
/** The states a task waits on a person in. */
const WAITS = ['review', 'blocked'];

export class ShapeHold {
  register = $state('');
  seq = $state(0);
  read = $state.raw<ShapeRead | null>(null);
  /** The key whose read has ended, however it ended: the hold lasts only while its own read is out, never past it. */
  settled = $state('');
  /** The figures a new read changed, each washed for 1.5s (proj F9). */
  arrived = $state.raw<ReadonlySet<string>>(new Set());
  /** How many runs are on it now, as the run rows say (`PresencePanel`), for the agents' heading. */
  here = $state(0);
  /** Whether the reader owns the record: the box to tell agents is his alone. */
  owner = $state(false);
  /** The line the model wrote for this project, kept while its tiles still say it, said in place of the rules' line. */
  modelLine = $state<string | null>(null);

  /** The page's answer last taken, so the same answer drawn again is not turned over again. */
  #said: unknown = undefined;
  #loading: Promise<void> = Promise.resolve();
  #clearing: ReturnType<typeof setTimeout> | undefined;

  get key(): string {
    return `${this.register}#${this.seq}`;
  }

  /**
   * Follow the row the page is about, with what the page's answer said of its shape (`shape`, `null` for none): a new
   * row is drawn from nothing, and a new answer for the same row is taken over the one on screen when it is turned (proj F9).
   */
  follow(register: string, seq: number, said: unknown = null): void {
    if (register !== this.register || seq !== this.seq) {
      this.register = register;
      this.seq = seq;
      this.read = null;
      this.here = 0;
      this.#said = undefined;
    }
    if (said === this.#said) return;
    this.#said = said;
    const key = this.key;
    if (register === '' || seq <= 0 || said === null) {
      this.settled = key;
      return;
    }
    this.#loading = this.#load(said, key).finally(() => {
      if (this.key === key && this.#said === said) this.settled = key;
    });
  }

  /**
   * The shape of `key` once the answer being turned is, or `null`: what a panel under the page takes in place of a read
   * of its own (scope 2026-10-24 A21), the row it is about among it.
   */
  async taken(key: string): Promise<ShapeRead | null> {
    await this.#loading;
    return this.read?.key === key ? this.read : null;
  }

  stop(): void {
    clearTimeout(this.#clearing);
  }

  async #load(said: unknown, key: string): Promise<void> {
    try {
      const next = await shapeFrom(apiBase(), said);
      if (next === null || key !== this.key || said !== this.#said || next.key !== key) return;
      if (this.read && this.read.key === key) this.#mark(this.read, next);
      /* THE SAME SHAPE READ AGAIN KEEPS THE ONE DRAWN (`settle`), so a poll that changed nothing redraws no part. */
      this.read = settle(this.read, next);
    } catch {
      /* Nothing to draw: the page goes on without the shape, and the hold is let go by `follow`. */
    }
  }

  #mark(was: ShapeRead, now: ShapeRead): void {
    const out = new Set<string>();
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (!same(was.money, now.money)) out.add('money:lead').add('money:owed').add('hero:money');
    if (!same(was.open, now.open)) out.add('hero:along').add('open-list');
    if (!same(was.fields, now.fields)) out.add('hero:along').add('hero:money');
    if (!same(was.kpi, now.kpi)) out.add('hero:kpi');
    const before = new Map(was.rows.map((x) => [x.seq, x.fields[was.via?.state.id ?? 'state']]));
    for (const x of now.rows) if (before.has(x.seq) && before.get(x.seq) !== x.fields[now.via?.state.id ?? 'state']) out.add(`stop:s${x.seq}`).add(`row:${x.seq}`);
    if (out.size === 0) return;
    this.arrived = out;
    clearTimeout(this.#clearing);
    this.#clearing = setTimeout(() => (this.arrived = new Set()), 1500);
  }

  /** A figure in the record's home currency, its symbol where it has one. */
  said = (minor: number, currency: string): string => symbolText(moneyOf(minor, currency), homeCurrency(), true);

  /* THE LIST'S DECLARATION, ASKED EACH TIME AND NEVER KEPT: it is learnt while the answer is turned (`shapeFrom`), and
     a value kept from before that would say the row is no project's for good. */
  get decl() {
    return REGISTERS[this.register];
  }
  shape = $derived(
    this.read && isProject(this.decl)
      ? shapeOf({ fields: this.read.fields, title: this.decl!.title, incoming: this.read.incoming, history: this.read.history, money: this.read.money, working: workingNow() })
      : null,
  );

  /* ── the hero ── */
  hue = $derived(this.read && this.decl ? hueOf(this.decl as Parameters<typeof hueOf>[0], this.read.fields) : null);
  lead = $derived.by(() => {
    if (!this.read || !this.decl) return null;
    const fig = figureOf(this.decl, this.read.fields);
    const f = fig ? fieldDecl(this.register, fig.field) : undefined;
    return fig ? { minor: fig.minor, currency: fig.currency, label: f ? labelOf(f) : '' } : null;
  });
  progress = $derived.by(() => {
    const v = this.read?.fields.progress;
    const aim = this.read?.fields.aim;
    return typeof v === 'number' && Number.isFinite(v) ? { value: v, aim: typeof aim === 'string' && aim !== '' ? daySaid(aim) : null } : null;
  });
  hero = $derived(
    this.shape && this.read ? heroOf({ facts: this.shape.facts, figure: this.lead, open: this.read.open, noun: this.read.noun, format: this.said, progress: this.progress, last: this.read.last }) : null,
  );
  /** The key number it leads with, planned as its card plans it, and in the money figure's place: one number leads. */
  kpiLead = $derived(this.read?.kpi ? cardKpiOf(this.read.kpi, { home: homeCurrency(), now: this.read.now }) : null);
  /** How much of its work is done, for the ring where nobody typed how far along it is: done of done and open. */
  doneCount = $derived(this.read?.via ? this.read.rows.filter((x) => x.fields[this.read!.via!.state.id] === this.read!.via!.done[0]).length : 0);
  figs = $derived.by(() => {
    const hero = this.hero;
    if (!hero) return [];
    const says = (f: { key: string; total?: number }): boolean => f.key !== 'open' || (this.doneCount > 0 && this.doneCount + (f.total ?? 0) >= RING_FROM);
    type Shown = (typeof hero)['figures'][number] | { key: 'kpi'; kpi: NonNullable<ShapeHold['kpiLead']> };
    const all: Shown[] = this.kpiLead ? [{ key: 'kpi' as const, kpi: this.kpiLead }, ...hero.figures.filter((f) => f.key !== 'money')] : hero.figures;
    return all.filter(says);
  });
  /**
   * WHERE IT STANDS: its lane, how it is going with its dot, and since when, in the list's own words. A PARKED OR
   * FINISHED PROJECT SAYS SO QUIETLY, AND SINCE WHEN IT MOVED THERE ("Parked since Sep 2026"), read off its history
   * (`stateSince`), where the day it started is the `since` it keeps; its hero is drawn quieter.
   */
  status = $derived.by(() => {
    const read = this.read;
    const decl = this.decl;
    if (!read || !decl) return { lane: '', health: null as { word: string; tone: string } | null, since: '', quiet: false };
    const fd = decl.state ? decl.fields.find((x) => x.id === decl.state) : undefined;
    const v = decl.state ? read.fields[decl.state] : undefined;
    const lane = fd && typeof v === 'string' && v !== '' ? valueSaid(fd as Parameters<typeof valueSaid>[0], v) : '';
    const values = (fd as { values?: readonly string[] } | undefined)?.values ?? [];
    const lanes = lanesOf(decl as { done?: readonly string[] }, values);
    const quiet = typeof v === 'string' && (lanes.parked.has(v) || lanes.finished.has(v));
    const h = quiet ? null : typeof read.fields.health === 'string' ? (HEALTH[read.fields.health] ?? null) : null;
    const s = quiet && read.stateSince ? read.stateSince : read.fields.since;
    const since = typeof s === 'string' && /^\d{4}-\d{2}/u.test(s) ? `${monthShort(+s.slice(5, 7) - 1)} ${s.slice(0, 4)}` : '';
    return { lane, health: h, since, quiet };
  });
  name = $derived(this.read && this.decl ? String(this.read.fields[this.decl.title] ?? '').trim() : '');
  mark = $derived(this.read && this.decl?.identity ? String(this.read.fields[this.decl.identity.mark] ?? '') : '');
  /** The next step, once, as the hero's last line, a link to the task it names where one does. */
  nextLine = $derived.by(() => {
    const read = this.read;
    if (!this.shape?.facts.next || !read) return null;
    const text = this.shape.facts.next;
    const titled = read.via && read.work ? read.rows.find((x) => String(x.fields[REGISTERS[read.work!]?.title ?? 'what'] ?? '').trim() === text) : undefined;
    const href = titled && read.work ? rowScreen(read.work, titled.seq) : (this.shape.nextHref ?? null);
    return { text, href };
  });
  /** The sparkline under what it earned, with three points or more. */
  trace = $derived.by(() => {
    const m = this.read?.inByMonth;
    if (!m || m.months.length < 3 || m.months.filter((x) => x.value > 0).length < 2) return null;
    const vs = m.months.map((x) => x.value);
    const hi = Math.max(...vs, 1);
    const pts = vs.map((v, i) => [(i / (vs.length - 1)) * 84, 26 - (v / hi) * 24] as const);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    return { line, area: `${line} L84 28 L0 28 Z`, end: pts.at(-1)! };
  });
  drawsHero = $derived(!!this.shape && !!this.read);
  /** A projects list known before its row answers holds the screen, so the blocks under it wait where they will be. */
  holds = $derived(this.read === null && this.settled !== this.key && isProject(this.decl));

  /* ── the work tile ── */
  workDecl = $derived(this.read?.work ? REGISTERS[this.read.work] : undefined);
  workLists = $derived.by(() => {
    const read = this.read;
    if (!read?.via) return null;
    const via = read.via;
    const today = localDay(read.now);
    const titleOf = (f: Readonly<Record<string, unknown>>): string => String(f[this.workDecl?.title ?? 'what'] ?? '').trim();
    const lateOf = (f: Readonly<Record<string, unknown>>): number => {
      const d = via.deadline ? f[via.deadline] : undefined;
      if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}/u.test(d) || d.slice(0, 10) >= today) return 0;
      return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
    };
    const open = read.rows.filter((x) => !via.done.includes(String(x.fields[via.state.id] ?? '')));
    if (open.length === 0) return null;
    const dayOf = (x: WorkRow) => (via.deadline && typeof x.fields[via.deadline] === 'string' ? String(x.fields[via.deadline]).slice(0, 10) : '9999');
    const order = (a: WorkRow, b: WorkRow) => lateOf(b.fields) - lateOf(a.fields) || dayOf(a).localeCompare(dayOf(b)) || a.seq - b.seq;
    const agentOf = (x: WorkRow) => (via.agent ? String(x.fields[via.agent] ?? '').trim() : '');
    const agents = open.filter((x) => agentOf(x) !== '').sort(order);
    const yours = open.filter((x) => agentOf(x) === '').sort(order);
    const working = new Set((this.shape?.facts.agents.now ?? []).map((w) => w.agent));
    const stateSaid = (v: string) => valueSaid(via.state as Parameters<typeof valueSaid>[0], v);
    const agentRow = (x: WorkRow) => {
      const a = agentOf(x);
      const on = working.has(a) || [...working].some((w) => actor(w).name === actor(a).name);
      /* ONE WORD FOR THE RUN, FROM WHEN IT WAS LAST HEARD (31 October, AG14), and what waits on you said as that: the
         lead said its run "went quiet 2 h ago", the Path "waits on you", and this "Claude, queued", for one task. */
      const st = String(x.fields[via.state.id] ?? '');
      const theirs = read.runs.find((r) => actor(r.agent).name === actor(a).name);
      const sub = on
        ? `${actor(a).name}, working now`
        : WAITS.includes(st)
          ? `Waits on you${theirs ? ` · ${runSaid(theirs, read.now)}` : ''}`
          : theirs
            ? runSaid(theirs, read.now)
            : `${actor(a).name} has it`;
      return { seq: x.seq, title: titleOf(x.fields), agent: a, live: (on ? 'working' : 'stopped') as 'working' | 'stopped', sub, red: false };
    };
    const yourRow = (x: WorkRow) => {
      const st = String(x.fields[via.state.id] ?? '');
      const late = lateOf(x.fields);
      const d = dayOf(x);
      const note = String(x.fields.note ?? '').trim();
      const sub = WAITS.includes(st)
        ? `${stateSaid(st)}${note ? `: ${note}` : ''}`
        : late > 0
          ? `${late} ${late === 1 ? 'day' : 'days'} late`
          : d !== '9999'
            ? `Due ${daySaid(d)}`
            : stateSaid(st);
      return { seq: x.seq, title: titleOf(x.fields), sub, red: late > 0 || WAITS.includes(st) };
    };
    return { agents: agents.map(agentRow), yours: yours.map(yourRow), total: open.length, late: read.open?.late ?? 0 };
  });
  workHref = $derived(this.read?.work && this.read.via && this.name ? registerHref(this.read.work, `${this.read.via.field} is ${this.name}`) : null);
  /** Where a task of its work opens: its row. */
  stopHref = (s: number | null): string | null => (s !== null && this.read?.work ? rowScreen(this.read.work, s) : null);

  /* ── the path and the money ── */
  path = $derived.by(() => {
    const read = this.read;
    const workDecl = this.workDecl;
    if (!read?.via || !workDecl) return null;
    const via = read.via;
    const doneOn = workDecl.fields.find((x) => x.type === 'day' && /done|finish/u.test(x.id))?.id ?? null;
    return pathOf(read.rows, { title: workDecl.title ?? 'what', state: via.state.id, done: via.done, deadline: via.deadline, agent: via.agent, waits: WAITS, doneOn }, localDay(read.now));
  });
  trend = $derived(this.read && this.decl ? trendOf({ fields: this.read.fields, decl: this.decl as Parameters<typeof trendOf>[0]['decl'] }) : null);
  money = $derived(this.shape?.facts.money ?? []);
  moneyRows = $derived(this.shape?.data.money ?? []);
  hasMoney = $derived(!!this.read && moneyShown(this.money, this.trend, this.read.inByMonth, this.read.outByMonth));

  /* ── who is on it, what it runs on, and the agents here today ── */
  people = $derived(this.shape?.facts.people ?? []);
  runsOn = $derived(this.shape?.facts.runsOn ?? []);
  sessions = $derived(this.read?.sessions ?? []);
  /**
   * ONE TILE FOR THE AGENTS ON IT: the band, Working here now or Tell agents, is drawn for
   * the owner and for anyone while a run is on it, and then it carries the day bar and who was here today itself.
   * "Agents here today" stands on its own only where the band is not drawn, so the two runs are never listed twice.
   */
  band = $derived(this.owner || this.here > 0);
  todayAlone = $derived(this.sessions.length > 0 && !this.band);

  /* ── the page of 27 October: what each part says (`project-facts.ts`) ── */
  /** What its page is worked out from, once the read is back. */
  facts = $derived.by((): FactsIn | null => {
    const read = this.read;
    const decl = this.decl;
    if (!read || !decl) return null;
    const via = read.via;
    const work = read.work;
    const title = this.workDecl?.title ?? 'what';
    const doneOnField = this.workDecl?.fields.find((x) => x.type === 'day' && /done|finish/u.test(x.id))?.id ?? null;
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const day = (v: unknown) => (/^\d{4}-\d{2}-\d{2}/u.test(text(v)) ? text(v).slice(0, 10) : null);
    const tasks: FactTask[] = via
      ? read.rows.map((x) => {
          const st = text(x.fields[via.state.id]);
          return {
            seq: x.seq,
            title: text(x.fields[title]),
            state: st,
            by: via.deadline ? day(x.fields[via.deadline]) : null,
            doneOn: doneOnField ? day(x.fields[doneOnField]) : null,
            agent: via.agent ? text(x.fields[via.agent]) : '',
            done: via.done.includes(st),
            waits: WAITS.includes(st),
            href: work ? (rowHref(`${work}#${x.seq}`) ?? `/r/${work}/${x.seq}`) : '',
            updated: x.updated ?? null,
            created: x.created ?? null,
          };
        })
      : [];
    const kpis: FactKpi[] = read.kpis.map((k) => {
      const a = k as typeof k & { latest?: KpiAt | null; change?: number | null; target?: number | string | null; target_by?: string | null };
      return {
        name: a.name,
        measure: a.name,
        unit: a.unit ?? '',
        every: a.every ?? null,
        headline: a.headline === true,
        points: a.points,
        latest: a.latest ?? a.points.at(-1) ?? null,
        change: typeof a.change === 'number' ? a.change : null,
        target: a.target ?? null,
        targetBy: a.target_by ?? null,
        shown: shownOf(a, read.now),
      };
    });
    const lane = decl.state ? text(read.fields[decl.state]) : '';
    const money = (m: { value: number; currency: string } | null) => (m && m.value > 0 ? { minor: m.value, currency: m.currency } : null);
    return {
      name: this.name,
      lane,
      ...(this.status.lane === '' ? {} : { laneWord: this.status.lane }),
      next: this.shape?.facts.next ?? '',
      about: text(read.fields.about),
      since: this.status.since || null,
      domains: Array.isArray(read.fields.domains) ? (read.fields.domains as unknown[]).map(text).filter(Boolean) : [],
      tasks,
      runs: read.runs,
      services: read.services,
      readings: read.readings,
      recurring: read.recurring,
      kpis,
      decided: read.decided,
      history: read.history,
      money: { out: money(read.money.out), owed: money(read.money.owed) },
      now: read.now,
      today: localDay(read.now),
      format: this.said,
      hrefs: { feed: FEED_SETUP, work: this.workHref },
      called: calledOf(this.workDecl),
    };
  });
  numbers = $derived(this.facts ? numbersOf(this.facts) : null);
  heroFacts = $derived(this.facts && this.numbers ? heroFactsOf(this.facts, this.numbers) : null);
  checklist = $derived(this.facts ? checklistOf(this.facts.next, this.facts.tasks, this.facts.now, this.facts.today) : []);
  side = $derived(this.facts && this.numbers ? sideOf(this.facts, this.numbers) : null);
  dates = $derived(this.facts ? datesOf(this.facts) : []);
  runsOnLines = $derived(this.facts && this.numbers ? runsOnOf(this.facts, this.numbers) : []);
  sessionLines = $derived(this.facts ? sessionsOf(this.facts) : []);
  happened = $derived(this.facts && this.numbers ? happenedOf(this.facts, this.numbers) : []);
  /** The lane as stored: earning, building, parked or retired. */
  lane = $derived(this.facts?.lane ?? '');
  /** The hero's date line: its lane, since when, and its domain ("Earning · since Mar 2024 · example.com"). */
  dateLine = $derived(
    [this.status.lane, this.status.since ? `since ${this.status.since}` : '', this.facts?.domains[0] ?? ''].filter((x) => x !== '').join(' · '),
  );

  /** Moves the project to another lane (Bring it back, Close it): `null` when written, else what to say. */
  async setLane(lane: string): Promise<string | null> {
    const read = this.read;
    const field = this.decl?.state;
    if (!read || !field || read.row.version === null) return 'This project cannot be moved from here. Open its row to change its lane.';
    const out = await updateRow(apiBase(), { register: this.register, seq: this.seq, version: read.row.version }, { [field]: lane }, this.name);
    return out.from === 'written' ? null : out.fix;
  }

  /** What the shape draws, so a declared block that repeats one is left out (`withoutRepeats`). */
  blocks = $derived<readonly Block[]>(this.shape ? blocksOf(this.shape.facts) : []);
  /** Whether its reads are back: until they are, nothing it may say is known. */
  known = $derived(this.read !== null || this.settled === this.key);

  /** What each part of the page has to draw (`project-parts.ts` `partsLaid`). */
  have = $derived<PartsHave>({
    hero: this.drawsHero || this.holds,
    path: this.read !== null && this.path !== null,
    money: this.hasMoney,
    work: this.workLists !== null,
    people: this.people.length > 0,
    runsOn: this.runsOn.length > 0 || this.runsOnLines.length > 0,
    today: this.read !== null && (this.todayAlone || this.sessionLines.length > 0),
    band: this.read !== null && this.band,
    known: this.read !== null,
    side: this.side !== null && (this.side.kind !== 'none' || this.hasMoney),
    numbers: (this.numbers?.cells.length ?? 0) > 0 || !!this.numbers?.plan,
    dates: this.dates.length > 0,
    decisions: (this.read?.decided.length ?? 0) > 0,
    happened: this.happened.length > 0,
  });

  /** The page's blocks with each part of the shape drawn where it has something, at its width (`partsLaid`). */
  laid<B extends Parameters<typeof partsLaid>[0][number]>(blocks: readonly B[]): B[] {
    return partsLaid(blocks, this.have);
  }
}
