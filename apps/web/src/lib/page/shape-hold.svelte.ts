/**
 * ONE PROJECT'S SHAPE, READ ONCE FOR EVERY PART OF IT ON ITS PAGE (C28, C29, 24 October). The hero, Path and Money,
 * Work, Who is on it, Runs on and the agents on it are blocks the page declares (`{ kind: project, part }`), each drawn
 * in its own slot (`ProjectPart.svelte`); what they draw is one read of the row the page is about, held here, so seven
 * blocks ask the record once and not seven times. `PageView.svelte` makes one for the page and hands it down.
 *
 * WHAT `ProjectShape.svelte` WORKED OUT, MOVED WHOLE: the hero's name, where it stands, its line, its next step and its
 * three figures; the Work tile's two columns; the path; who is on it; what it runs on; and who was here today. Nothing
 * here is drawn: each part reads what it needs.
 *
 * ONE CLOCK (SF3): open work and what is late are counted on the record's day (`recordNow`), as Work counts it. One read
 * of the work list that points here holds the hero's counts, the Work tile and the Path.
 *
 * LIVE (proj F9): read again when the record moves (`moved`), the old read kept on screen until the new one answers,
 * and each figure whose value changed washes in the neutral `--arrived` for a moment (`arrived`), as every other row does.
 *
 * READ FOR THE ROW IT IS GIVEN (`shape-read.ts`), outside the page's own read: the page asks for it the moment it knows
 * the row, and the hold takes that read when it follows the row (`takeShape`). A row that is not a project's reads
 * nothing and has no parts.
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
import { readShape, takeShape, type ShapeRead, type WorkRow } from './shape-read.ts';
import { lanesOf } from '$lib/shell/side.ts';
import { blocksOf, heroOf, isProject, shapeOf, type Block } from '$lib/record/project.ts';
import { HEALTH, daySaid, figureOf, hueOf } from '$lib/home/project-cards.ts';
import { cardKpiOf } from '$lib/home/card-kpi.ts';
import { pathOf, trendOf } from '$lib/record/visuals.ts';
import { valueSaid } from '$lib/voice.ts';
import { money as moneyOf, monthShort } from 'braindog-render';
import { moneyShown, partsLaid, type PartsHave } from './project-parts.ts';

/** A ring of done work only from five tasks, and never at nought (the audit of 22 October, U-B7). */
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

  #seen: number | null = null;
  #clearing: ReturnType<typeof setTimeout> | undefined;

  get key(): string {
    return `${this.register}#${this.seq}`;
  }

  /** Follow the row the page is about: a new row is read from nothing, the same row is left as it is. */
  follow(register: string, seq: number): void {
    if (register === this.register && seq === this.seq) return;
    this.register = register;
    this.seq = seq;
    this.read = null;
    this.here = 0;
    this.#seen = null;
    const key = this.key;
    if (register === '' || seq <= 0) {
      this.settled = key;
      return;
    }
    void this.#load(register, seq, key).finally(() => {
      if (this.key === key) this.settled = key;
    });
  }

  /** The record moved: read again, keeping what is on screen until the new read answers (proj F9). */
  moved(version: number | null): void {
    if (this.#seen === null || version === null || version === this.#seen || this.read === null) {
      this.#seen = version;
      return;
    }
    this.#seen = version;
    void this.#load(this.register, this.seq, this.key);
  }

  stop(): void {
    clearTimeout(this.#clearing);
  }

  /* THE FIRST READ IS THE ONE THE PAGE ASKED AHEAD (`shape-read.ts`), where it did; every later one is the hold's own. */
  async #load(r: string, n: number, key: string): Promise<void> {
    try {
      const base = apiBase();
      const next = await (takeShape(base, r, n) ?? readShape(base, r, n));
      if (next === null || key !== this.key) return;
      if (this.read && this.read.key === key) this.#mark(this.read, next);
      this.read = next;
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

  /* THE LIST'S DECLARATION, ASKED EACH TIME AND NEVER KEPT: it is learnt while the first read is out (`readShape`), and
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
      return { seq: x.seq, title: titleOf(x.fields), agent: a, live: (on ? 'working' : 'stopped') as 'working' | 'stopped', sub: `${actor(a).name}, ${on ? 'working now' : 'queued'}`, red: false };
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
   * ONE TILE FOR THE AGENTS ON IT (the UI review of 21 October): the band, Working here now or Tell agents, is drawn for
   * the owner and for anyone while a run is on it, and then it carries the day bar and who was here today itself.
   * "Agents here today" stands on its own only where the band is not drawn, so the two runs are never listed twice.
   */
  band = $derived(this.owner || this.here > 0);
  todayAlone = $derived(this.sessions.length > 0 && !this.band);

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
    runsOn: this.runsOn.length > 0,
    today: this.read !== null && this.todayAlone,
    band: this.read !== null && this.band,
    known: this.read !== null,
  });

  /** The page's blocks with each part of the shape drawn where it has something, at its width (`partsLaid`). */
  laid<B extends Parameters<typeof partsLaid>[0][number]>(blocks: readonly B[]): B[] {
    return partsLaid(blocks, this.have);
  }
}
