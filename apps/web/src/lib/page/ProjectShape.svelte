<!--
  A project's one shape (`project.ts`) at the top of a declared page scoped to the project's row (proj section 4).

  ORDER: the hero, then row 2 (Path and Money, `ProjectVisuals`), row 3 (Work and People), row 4 (Runs on and Agents here
  today), then who is working on it now with the box to tell agents on it (agents and MCP plan §7.2). The declared blocks the page keeps follow (the questions, then More about, folded), `PageView` leaving out what
  this says already.

  THE HERO HOLDS THE NAME (proj F7): the 56px well and the `h1` at 34 side by side, where it stands under the name ("Earning
  · ● At risk · since Mar 2024"), what it is in a line with the late phrase in the red, the next step once as its last
  line, and three figures on the right: what it earned in a year, how far along it is as a ring in the project's colour,
  and who works on it now. WHERE THE PROJECT KEEPS KEY NUMBERS, THE FIRST FIGURE IS THE ONE ITS CARD LEADS WITH (the KPI
  plan of 21 October, 2.5): its name, the figure, how it moved, and its own line, as the card says it (`cardKpiOf`). Its colour is the project's slot (`slotStyle`), the same `--ph` its card is drawn in.

  ONE CLOCK (SF3): open work and what is late are counted on the record's day (`recordNow`), as Work counts it. One read
  of the work list that points here holds the hero's counts, the Work tile and the Path.

  LIVE (proj F9): read again when the record moves (`live.version`), the old read kept on screen until the new one answers,
  and each figure whose value changed washes in the neutral `--arrived` for a moment (`data-arrived`), as every other row does.

  READ FOR THE ROW IT IS GIVEN (`shape-read.ts`), outside the page's own read: the page asks for it the moment it knows the
  row and the shape takes that read when it mounts. It draws nothing for a row that is not a project's, so a page about
  any other row is unchanged. While the first read is out, a little height is held.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { apiBase, at } from '$lib/at.ts';
  import { live } from '$lib/data/live.svelte.ts';
  import { workingNow } from '$lib/home/waits.svelte.ts';
  import { decl as fieldDecl, homeCurrency, labelOf } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { openWhere } from '../../routes/r/[register]/[seq]/figures.ts';
  import { localDay } from '../../routes/r/[register]/[seq]/said.ts';
  import { symbolText } from '$lib/record/money.ts';
  import { rowScreen } from '$lib/record/row-href.ts';
  import { registerHref } from '$lib/record/where.ts';
  import { actor } from '$lib/record/names.ts';
  import { midnightOf, type SessionRow } from '$lib/record/today-live.ts';
  import { readShape, takeShape, type ShapeRead, type WorkRow } from './shape-read.ts';
  import { HERO_WORDS, blocksOf, heroOf, isProject, shapeOf, type Block } from '$lib/record/project.ts';
  import { HEALTH, cardKpiOf, daySaid, figureOf, hueOf, slotStyle } from '$lib/home/project-cards.ts';
  import { pathOf, trendOf } from '$lib/record/visuals.ts';
  import { valueSaid } from '$lib/voice.ts';
  import { money, monthShort } from 'braindog-render';
  import ProjectVisuals from './ProjectVisuals.svelte';
  import PresencePanel from './panels/PresencePanel.svelte';
  import TellPanel from './panels/TellPanel.svelte';
  import { page } from '$app/state';
  import type { Shell } from '$lib/record/boot-live.ts';
  import Waiting from '$lib/ui/Waiting.svelte';
  import ProjectWell from '$lib/ui/ProjectWell.svelte';
  import AgentFace from '$lib/ui/AgentFace.svelte';
  import Face from '$lib/ui/Face.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { Ring } from '$lib/viz/index.ts';

  let {
    register,
    seq,
    onshape,
  }: {
    register: string;
    seq: number;
    /** What the shape draws, the row it drew it for, and whether its reads are back: until they are, nothing it may say is known. */
    onshape: (blocks: readonly Block[], row: Readonly<Record<string, unknown>> | null, known: boolean) => void;
  } = $props();

  type Read = ShapeRead;
  let read = $state.raw<Read | null>(null);
  /* THE KEY WHOSE READ HAS ENDED, however it ended: the hold lasts only while its own read is out, never past it. */
  let settled = $state('');

  $effect(() => {
    const r = register;
    const n = seq;
    const key = `${r}#${n}`;
    untrack(() => {
      read = null;
      void load(r, n, key).finally(() => {
        settled = key;
      });
    });
  });

  /* READ AGAIN WHEN THE RECORD MOVES, keeping what is on screen until the new read answers (proj F9). */
  let seen: number | null = null;
  $effect(() => {
    const v = live.version;
    untrack(() => {
      if (seen === null || v === null || v === seen || read === null) {
        seen = v;
        return;
      }
      seen = v;
      void load(register, seq, `${register}#${seq}`);
    });
  });

  /* THE FIRST READ IS THE ONE THE PAGE ASKED AHEAD (`shape-read.ts`), where it did; every later one is the shape's own. */
  async function load(r: string, n: number, key: string) {
    try {
      const base = apiBase();
      const next = await (takeShape(base, r, n) ?? readShape(base, r, n));
      if (next === null || key !== `${register}#${seq}`) return;
      if (read && read.key === key) mark(read, next);
      read = next;
    } catch {
      /* Nothing to draw: the page goes on without the shape, and the hold is let go by the caller. */
    }
  }

  /* ── what landed ── */
  let arrived = $state.raw<ReadonlySet<string>>(new Set());
  let clearing: ReturnType<typeof setTimeout> | undefined;
  /** The figures a new read changed, each washed for 1.5s (proj F9). */
  function mark(was: Read, now: Read) {
    const out = new Set<string>();
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (!same(was.money, now.money)) out.add('money:lead').add('money:owed').add('hero:money');
    if (!same(was.open, now.open)) out.add('hero:along').add('open-list');
    if (!same(was.fields, now.fields)) out.add('hero:along').add('hero:money');
    if (!same(was.kpi, now.kpi)) out.add('hero:kpi');
    const before = new Map(was.rows.map((x) => [x.seq, x.fields[was.via?.state.id ?? 'state']]));
    for (const x of now.rows) if (before.has(x.seq) && before.get(x.seq) !== x.fields[now.via?.state.id ?? 'state']) out.add(`stop:s${x.seq}`).add(`row:${x.seq}`);
    if (out.size === 0) return;
    arrived = out;
    clearTimeout(clearing);
    clearing = setTimeout(() => (arrived = new Set()), 1500);
  }
  $effect(() => () => clearTimeout(clearing));

  const shape = $derived(
    read && isProject(REGISTERS[register])
      ? shapeOf({ fields: read.fields, title: REGISTERS[register]!.title, incoming: read.incoming, history: read.history, money: read.money, working: workingNow() })
      : null,
  );
  const said = (minor: number, currency: string): string => symbolText(money(minor, currency), homeCurrency(), true);

  /* ── the hero ── */
  const decl = $derived(REGISTERS[register]);
  const hue = $derived(read && decl ? hueOf(decl as Parameters<typeof hueOf>[0], read.fields) : null);
  const lead = $derived.by(() => {
    if (!read || !decl) return null;
    const fig = figureOf(decl, read.fields);
    const f = fig ? fieldDecl(register, fig.field) : undefined;
    return fig ? { minor: fig.minor, currency: fig.currency, label: f ? labelOf(f) : '' } : null;
  });
  const progress = $derived.by(() => {
    const v = read?.fields.progress;
    const aim = read?.fields.aim;
    return typeof v === 'number' && Number.isFinite(v) ? { value: v, aim: typeof aim === 'string' && aim !== '' ? daySaid(aim) : null } : null;
  });
  const hero = $derived(shape && read ? heroOf({ facts: shape.facts, figure: lead, open: read.open, noun: read.noun, format: said, progress }) : null);
  /* THE KEY NUMBER IT LEADS WITH, planned as its card plans it, and in the money figure's place: one number leads. */
  const kpiLead = $derived(read?.kpi ? cardKpiOf(read.kpi, { home: homeCurrency(), now: read.now }) : null);
  type Shown = NonNullable<typeof hero>['figures'][number] | { key: 'kpi'; kpi: NonNullable<typeof kpiLead> };
  const figs = $derived<Shown[]>(hero ? (kpiLead ? [{ key: 'kpi', kpi: kpiLead }, ...hero.figures.filter((f) => f.key !== 'money')] : hero.figures) : []);
  /* HOW MUCH OF ITS WORK IS DONE, for the ring where nobody typed how far along it is: done of done and open. */
  const doneCount = $derived(read?.via ? read.rows.filter((x) => x.fields[read!.via!.state.id] === read!.via!.done[0]).length : 0);
  /* WHERE IT STANDS: its lane, how it is going with its dot, and since when, in the list's own words. */
  const status = $derived.by(() => {
    if (!read || !decl) return { lane: '', health: null as { word: string; tone: string } | null, since: '' };
    const fd = decl.state ? decl.fields.find((x) => x.id === decl.state) : undefined;
    const v = decl.state ? read.fields[decl.state] : undefined;
    const lane = fd && typeof v === 'string' && v !== '' ? valueSaid(fd as Parameters<typeof valueSaid>[0], v) : '';
    const h = typeof read.fields.health === 'string' ? (HEALTH[read.fields.health] ?? null) : null;
    const s = read.fields.since;
    const since = typeof s === 'string' && /^\d{4}-\d{2}/u.test(s) ? `${monthShort(+s.slice(5, 7) - 1)} ${s.slice(0, 4)}` : '';
    return { lane, health: h, since };
  });
  const name = $derived(read && decl ? String(read.fields[decl.title] ?? '').trim() : '');
  const mark_ = $derived(read && decl?.identity ? String(read.fields[decl.identity.mark] ?? '') : '');
  /* THE NEXT STEP, ONCE, AS THE HERO'S LAST LINE, a link to the task it names where one does. */
  const nextLine = $derived.by(() => {
    if (!shape?.facts.next || !read) return null;
    const text = shape.facts.next;
    const titled = read.via && read.work ? read.rows.find((x) => String(x.fields[REGISTERS[read!.work!]?.title ?? 'what'] ?? '').trim() === text) : undefined;
    const href = titled && read.work ? rowScreen(read.work, titled.seq) : (shape.nextHref ?? null);
    return { text, href };
  });
  /* THE SPARKLINE UNDER WHAT IT EARNED, with three points or more. */
  const trace = $derived.by(() => {
    const m = read?.inByMonth;
    if (!m || m.months.length < 3 || m.months.filter((x) => x.value > 0).length < 2) return null;
    const vs = m.months.map((x) => x.value);
    const hi = Math.max(...vs, 1);
    const pts = vs.map((v, i) => [(i / (vs.length - 1)) * 84, 26 - (v / hi) * 24] as const);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    return { line, area: `${line} L84 28 L0 28 Z`, end: pts.at(-1)! };
  });
  const drawsHero = $derived(!!shape && !!read);

  /* ── the work tile ── */
  const workDecl = $derived(read?.work ? REGISTERS[read.work] : undefined);
  const titleOf = (f: Readonly<Record<string, unknown>>): string => String(f[workDecl?.title ?? 'what'] ?? '').trim();
  const lateOf = (f: Readonly<Record<string, unknown>>, today: string): number => {
    const d = read?.via?.deadline ? f[read.via.deadline] : undefined;
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}/u.test(d) || d.slice(0, 10) >= today) return 0;
    return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  };
  const waitsStates = ['review', 'blocked'];
  const workLists = $derived.by(() => {
    if (!read?.via) return null;
    const via = read.via;
    const today = localDay(read.now);
    const open = read.rows.filter((x) => !via.done.includes(String(x.fields[via.state.id] ?? '')));
    if (open.length === 0) return null;
    const dayOf = (x: WorkRow) => (via.deadline && typeof x.fields[via.deadline] === 'string' ? String(x.fields[via.deadline]).slice(0, 10) : '9999');
    const order = (a: WorkRow, b: WorkRow) => lateOf(b.fields, today) - lateOf(a.fields, today) || dayOf(a).localeCompare(dayOf(b)) || a.seq - b.seq;
    const agentOf = (x: WorkRow) => (via.agent ? String(x.fields[via.agent] ?? '').trim() : '');
    const agents = open.filter((x) => agentOf(x) !== '').sort(order);
    const yours = open.filter((x) => agentOf(x) === '').sort(order);
    const working = new Set((shape?.facts.agents.now ?? []).map((w) => w.agent));
    const stateSaid = (v: string) => valueSaid(via.state as Parameters<typeof valueSaid>[0], v);
    const agentRow = (x: WorkRow) => {
      const a = agentOf(x);
      const on = working.has(a) || [...working].some((w) => actor(w).name === actor(a).name);
      return { seq: x.seq, title: titleOf(x.fields), agent: a, live: (on ? 'working' : 'stopped') as 'working' | 'stopped', sub: `${actor(a).name}, ${on ? 'working now' : 'queued'}`, red: false };
    };
    const yourRow = (x: WorkRow) => {
      const st = String(x.fields[via.state.id] ?? '');
      const late = lateOf(x.fields, today);
      const d = dayOf(x);
      const note = String(x.fields.note ?? '').trim();
      const sub = waitsStates.includes(st)
        ? `${stateSaid(st)}${note ? `: ${note}` : ''}`
        : late > 0
          ? `${late} ${late === 1 ? 'day' : 'days'} late`
          : d !== '9999'
            ? `Due ${daySaid(d)}`
            : stateSaid(st);
      return { seq: x.seq, title: titleOf(x.fields), sub, red: late > 0 || waitsStates.includes(st) };
    };
    return { agents: agents.map(agentRow), yours: yours.map(yourRow), total: open.length, late: read.open?.late ?? 0 };
  });
  const workHref = $derived(read?.work && read.via && name ? registerHref(read.work, `${read.via.field} is ${name}`) : null);
  const SHOWN = 3;

  /* ── the path ── */
  const path = $derived.by(() => {
    if (!read?.via || !workDecl) return null;
    const via = read.via;
    const doneOn = workDecl.fields.find((x) => x.type === 'day' && /done|finish/u.test(x.id))?.id ?? null;
    return pathOf(read.rows, { title: workDecl.title ?? 'what', state: via.state.id, done: via.done, deadline: via.deadline, agent: via.agent, waits: waitsStates, doneOn }, localDay(read.now));
  });
  const stopHref = (s: number | null): string | null => (s !== null && read?.work ? rowScreen(read.work, s) : null);
  const trend = $derived(read && decl ? trendOf({ fields: read.fields, decl: decl as Parameters<typeof trendOf>[0]['decl'] }) : null);

  /* ── agents here today ── */
  const hours = (t: number, day0: number) => Math.max(0, Math.min(1, (t - day0) / 86_400_000));
  const clock = (t: number) => {
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const RUNS_ICON: Record<string, 'key' | 'skill' | 'plug'> = { key: 'key', skill: 'skill' };
  const runsIcon = (kind: string | undefined) => RUNS_ICON[Object.keys(RUNS_ICON).find((k) => (kind ?? '').toLowerCase().includes(k)) ?? ''] ?? 'plug';
  const singular = (kind: string | undefined) => (kind ?? '').replace(/s$/u, '');

  /* ── working here now ── */
  /* HIS ALONE TO TELL: the composer is the owner's; anyone who reads the runs sees who is on it. */
  const owner = $derived((page.data as unknown as Partial<Shell> | undefined)?.me?.owner === true);
  /* HOW MANY RUNS ARE ON IT NOW, as the run rows say (`PresencePanel`), for the heading. */
  let here = $state(0);
  const hereWords = {
    working: 'Working here now',
    tell: (name: string) => (name ? `Tell agents on ${name}` : 'Tell an agent'),
  } as const;

  const people = $derived(shape?.facts.people ?? []);
  const runsOn = $derived(shape?.facts.runsOn ?? []);
  const sessions = $derived(read?.sessions ?? []);
  /* ONE TILE FOR THE AGENTS ON IT (the UI review of 21 October): the band below, Working here now or Tell agents, is drawn
     for the owner and for anyone while a run is on it, and then it carries the day bar and who was here today itself.
     "Agents here today" stands on its own only where the band is not drawn, so the two runs are never listed twice. */
  const band = $derived(owner || here > 0);
  const todayAlone = $derived(sessions.length > 0 && !band);

  /* WHAT THE SHAPE DRAWS, said to the page so a declared block that repeats one is left out (`repeatOf`). */
  $effect(() => onshape(shape ? blocksOf(shape.facts) : [], shape && read ? read.fields : null, read !== null || settled === `${register}#${seq}`));
  /* A PROJECTS LIST KNOWN BEFORE ITS ROW ANSWERS holds a little height, so the declared blocks wait where they will be. */
  const holds = $derived(read === null && settled !== `${register}#${seq}` && isProject(REGISTERS[register]));
</script>

{#if drawsHero && hero && read}
  <section class="hero" aria-label={name} style={slotStyle(hue)}>
    <span class="h-well"><ProjectWell mark={mark_} {name} {hue} size="xl" /></span>
    <div class="h-name">
      <h1 class="h-title" dir="auto">{name}</h1>
      {#if status.lane || status.health || status.since}
        <p class="h-status">
          {status.lane}{#if status.health}{#if status.lane}{' · '}{/if}<span class="h-health" data-tone={status.health.tone}><span class="dot" aria-hidden="true"></span>{status.health.word}</span>{/if}{#if status.since}{#if status.lane || status.health}{' · '}{/if}since {status.since}{/if}
        </p>
      {/if}
    </div>
    {#if hero.sentences.length > 0}
      <p class="h-say">
        {#each hero.sentences as s, n (n)}{#if n > 0}{' '}{/if}{#each s as part, k (k)}{#if part.figure}<b class="fig num">{part.text}</b>{:else if part.late}<span class="late">{part.text}</span>{:else}{part.text}{/if}{/each}{/each}
      </p>
    {/if}
    {#if nextLine}
      {#if nextLine.href}
        <a class="h-next" href={at(nextLine.href)}><Icon name="arrow" size="s" /><span dir="auto">{nextLine.text}</span></a>
      {:else}
        <p class="h-next"><Icon name="arrow" size="s" /><span dir="auto">{nextLine.text}</span></p>
      {/if}
    {/if}
    {#if figs.length > 0}
      <ul class="h-figs" style:--figs={figs.length}>
        {#each figs as f (f.key)}
          <li class="h-fig" data-arrived={arrived.has(`hero:${f.key === 'open' ? 'along' : f.key}`) ? '' : undefined}>
            {#if f.key === 'kpi'}
              <span class="k k-kpi" dir="auto">{f.kpi.name}</span>
              <span class="v num" aria-label={f.kpi.sentence}>{f.kpi.figure}</span>
              {#if f.kpi.line}
                <svg class="trace" data-stale={f.kpi.stale ? '' : undefined} viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"
                  >{#if f.kpi.line.area}<path d={f.kpi.line.area} class="trace-area" />{/if}<path d={f.kpi.line.line} class="trace-line" vector-effect="non-scaling-stroke" />{#if f.kpi.line.end}<path d={f.kpi.line.end} class="trace-dot" vector-effect="non-scaling-stroke" />{/if}</svg
                >
              {/if}
              {#if f.kpi.stale || f.kpi.move}<span class="sub move" data-tone={f.kpi.stale ? 'stale' : (f.kpi.move?.tone ?? undefined)}>{f.kpi.stale ?? f.kpi.move?.said}</span>{/if}
            {:else if f.key === 'money'}
              <span class="k"><span class="long">{f.label}</span><span class="short">{HERO_WORDS.short.money}</span></span>
              <span class="v num">{said(f.minor, f.currency)}</span>
              {#if trace}
                <svg class="trace" viewBox="0 0 84 28" aria-hidden="true"
                  ><path d={trace.area} class="trace-area" /><path d={trace.line} class="trace-line" /><circle cx={trace.end[0]} cy={trace.end[1]} r="2.4" class="trace-end" /></svg
                >
              {/if}
            {:else if f.key === 'along'}
              <span class="k"><span class="long">{f.label}</span><span class="short">{HERO_WORDS.short.along}</span></span>
              <span class="v-ring">
                <Ring value={f.value} max={100} size={40} tone="var(--ph)" subject={HERO_WORDS.along} />
                <span class="v num">{f.value}%</span>
              </span>
              {#if f.aim}<span class="sub">{HERO_WORDS.aim(f.aim)}</span>{/if}
            {:else if f.key === 'open'}
              <span class="k"><span class="long">{HERO_WORDS.along}</span><span class="short">{HERO_WORDS.short.along}</span></span>
              <span class="v-ring">
                <Ring value={doneCount} max={doneCount + f.total} size={40} tone="var(--ph)" subject={HERO_WORDS.along} />
                <span class="v num">{Math.round((doneCount / Math.max(1, doneCount + f.total)) * 100)}%</span>
              </span>
              <span class="sub">{doneCount} of {doneCount + f.total} done</span>
            {:else}
              <span class="k"><span class="long">{f.label}</span><span class="short">{HERO_WORDS.short.working}</span></span>
              <span class="v-ring faces">
                {#each f.now.slice(0, 3) as w (w.key)}<AgentFace agent={w.agent} run={w.run} live={w.live} size="xs" />{/each}
                {#if f.now.length > 0}<span class="v num">{f.now.length}</span>{:else}<span class="v-none">{HERO_WORDS.nobody}</span>{/if}
              </span>
              {#if f.now[0]?.doing || f.note}<span class="sub clamp" dir="auto">{f.now[0]?.doing ?? f.note}</span>{/if}
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}
{#if read}
  <div class="shape-rows" style={slotStyle(hue)}>
    <ProjectVisuals
      {path}
      pathHref={workHref}
      {stopHref}
      inByMonth={read.inByMonth}
      outByMonth={read.outByMonth}
      {trend}
      earnedSaid={figs.some((f) => f.key === 'money')}
      format={said}
      money={shape?.facts.money ?? []}
      moneyRows={shape?.data.money ?? []}
      {arrived}
    />
    {#if workLists || people.length > 0}
      <div class="shape-row" data-alone={workLists && people.length > 0 ? undefined : ''}>
        {#if workLists}
          {@const w = workLists}
          <Tile icon="task" title={workDecl?.name ?? HERO_WORDS.open} href={workHref ?? undefined} hrefLabel={workHref ? 'All' : undefined} class="t-work" data-arrived={arrived.has('open-list') ? '' : undefined}>
            {#snippet actions()}
              <span class="w-count num">{w.total} open{#if w.late > 0}, <span class="late">{w.late} late</span>{/if}</span>
            {/snippet}
            <div class="w-cols">
              {#if w.agents.length > 0}
                <section class="w-col" aria-label="With agents">
                  <h3 class="w-head">With agents <span class="num">{w.agents.length}</span></h3>
                  <ul class="w-list">
                    {#each w.agents.slice(0, SHOWN) as r (r.seq)}
                      <li class="w-row" data-arrived={arrived.has(`row:${r.seq}`) ? '' : undefined}>
                        <AgentFace agent={r.agent} run="" live={r.live} size="xs" />
                        <a class="w-words" href={at(stopHref(r.seq) ?? '')}><span class="w-title" dir="auto">{r.title}</span><span class="w-sub">{r.sub}</span></a>
                      </li>
                    {/each}
                  </ul>
                  {#if w.agents.length > SHOWN && workHref}<a class="w-more" href={at(workHref)}>{w.agents.length - SHOWN} more</a>{/if}
                </section>
              {/if}
              {#if w.yours.length > 0}
                <section class="w-col yours" aria-label="With you">
                  <h3 class="w-head">With you <span class="num">{w.yours.length}</span></h3>
                  <ul class="w-list">
                    {#each w.yours.slice(0, SHOWN) as r (r.seq)}
                      <li class="w-row" data-arrived={arrived.has(`row:${r.seq}`) ? '' : undefined}>
                        <span class="w-tick" aria-hidden="true"></span>
                        <a class="w-words" href={at(stopHref(r.seq) ?? '')}><span class="w-title" dir="auto">{r.title}</span><span class="w-sub" data-red={r.red ? '' : undefined}>{r.sub}</span></a>
                      </li>
                    {/each}
                  </ul>
                  {#if w.yours.length > SHOWN && workHref}<a class="w-more" href={at(workHref)}>{w.yours.length - SHOWN} more</a>{/if}
                </section>
              {/if}
            </div>
          </Tile>
        {/if}
        {#if people.length > 0}
          <Tile icon="user-check" title="Who is on it" count={people.length} class="t-people">
            <ul class="p-list">
              {#each people.slice(0, 4) as p (p.key)}
                <li class="p-row">
                  <Face name={p.title} size="m" />
                  {#if p.href}<a class="p-words" href={at(p.href)}><span class="p-name" dir="auto">{p.title}</span>{#if p.detail}<span class="p-sub" dir="auto">{p.detail}</span>{/if}</a>
                  {:else}<span class="p-words"><span class="p-name" dir="auto">{p.title}</span>{#if p.detail}<span class="p-sub" dir="auto">{p.detail}</span>{/if}</span>{/if}
                </li>
              {/each}
            </ul>
          </Tile>
        {/if}
      </div>
    {/if}
    {#snippet dayBar(now: number)}
      {@const day0 = midnightOf(now)}
      <div class="day" aria-hidden="true">
        <div class="track">
          {#each sessions as s, n (s.seq ?? n)}
            <span class="d-seg" data-live={s.working ? '' : undefined} style:inset-inline-start="{hours(s.from, day0) * 100}%" style:inline-size="{Math.max(0.6, (hours(s.to, day0) - hours(s.from, day0)) * 100)}%"></span>
          {/each}
          <span class="nowline" style:inset-inline-start="{hours(now, day0) * 100}%"></span>
        </div>
        <div class="ticks num">{#each ['00', '06', '12', '18', '24'] as t (t)}<span>{t}</span>{/each}</div>
      </div>
    {/snippet}
    {#snippet todayList(list: readonly SessionRow[])}
      <ul class="a-list">
        {#each list.slice(0, 4) as s, n (s.seq ?? n)}
          <li class="a-row">
            <AgentFace agent={s.agent} run={s.seq === null ? '' : `S${s.seq}`} live={s.working ? 'working' : 'stopped'} size="xs" />
            <!-- WHAT IT DOES, NOT WHO: the face says which agent, and the Work tile names it once (proj F1). NO MACHINE NAME
                 (VERIFY H14): "on kiln-mbp" is a host's id, not a place a person knows. -->
            <span class="a-words" title={actor(s.agent).name}><span class="a-name" dir="auto">{s.doing || actor(s.agent).name}</span><span class="a-sub">{s.working ? `Since ${clock(s.from)}` : `${clock(s.from)} to ${clock(s.to)}`}</span></span>
          </li>
        {/each}
      </ul>
    {/snippet}
    {#if runsOn.length > 0 || todayAlone}
      <div class="shape-row half" data-alone={runsOn.length > 0 && todayAlone ? undefined : ''}>
        {#if runsOn.length > 0}
          <Tile icon="plug" title="Runs on" count={runsOn.length} class="t-runs">
            <ul class="r-list" data-wide={todayAlone ? undefined : ''}>
              {#each runsOn.slice(0, todayAlone ? 4 : 8) as x (x.key)}
                <li class="r-row"><Icon name={runsIcon(x.kind)} size="s" /><span class="r-name" dir="auto">{x.title}</span>{#if x.kind}<span class="r-kind">{singular(x.kind)}</span>{/if}</li>
              {/each}
            </ul>
          </Tile>
        {/if}
        {#if todayAlone}
          <Tile icon="session" title="Agents here today" class="t-today">
            {@render dayBar(read.now)}
            {@render todayList(sessions)}
          </Tile>
        {/if}
      </div>
    {/if}
    <!-- WHO IS ON IT NOW AND THE BOX TO TELL THEM (plan §7.2): the Agents page's run rows and composer, scoped to this
         project, so a stop or a tell from here says what it says there. With nobody on it the composer stands alone, and
         the next run to start here gets what he types; for a reader who may not tell, nobody on it draws nothing.
         THE DAY BAR ON TOP when a run was here today, and with nobody on it now, who was: the one tile for the agents. -->
    {#key read.key}
      {#if band}
        <Tile icon="session" title={here > 0 ? hereWords.working : hereWords.tell(name)} count={here > 0 ? here : undefined} class="t-here" data-working-here>
          {#if sessions.length > 0}
            {@render dayBar(read.now)}
            {#if here === 0}{@render todayList(sessions)}{/if}
          {/if}
          <PresencePanel {owner} project={read.key} oncount={(n) => (here = n)} />
          <TellPanel {owner} project={read.key} projectName={name} first={3} />
        </Tile>
      {:else}
        <!-- NOBODY ON IT YET, for a reader who may not tell: the runs are read unseen, and the tile comes once one is. -->
        <div hidden><PresencePanel project={read.key} oncount={(n) => (here = n)} /></div>
      {/if}
    {/key}
  </div>
{/if}
{#if !shape && holds}
  <div class="held"><Waiting rows={3} /></div>
{/if}

<style>
  /* HELD TO THE FOOT OF THE WINDOW while the shape is read (VERIFY H4): the shape is taller than a screen at every width
     (1,017px at 1,512), so what the page draws under it starts below the fold and stays there when it lands. 160px held
     put the page's blocks on screen and then pushed them off it: Kiln's load shift of 0.085 at 1,512 and 0.161 at 390. */
  .held {
    min-block-size: max(160px, calc(100dvh - 120px));
  }

  /* ── the hero ── */
  /* THE PROJECT'S COLOUR AT A LOW TINT OVER THE TILE, never a gradient.
     8% IN BOTH SCHEMES. Dark took 12%, and the late count's `--red` over it read 4.2 to 4.4 to 1 for every slot, the
     amber and the lime lowest; at 8% the lightest slot keeps it over 4.5, and the tint still reads as the project's. */
  .hero {
    --ph: var(--ink);
    --h-wash: 8%;
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    column-gap: 12px;
    row-gap: 12px;
    align-items: center;
    margin-block-end: var(--inset);
    padding: 16px;
    border-radius: var(--r-tile, 16px);
    background: color-mix(in oklab, var(--ph) var(--h-wash), var(--tile));
  }

  .h-well {
    display: grid;
  }

  .h-well :global(.well) {
    inline-size: 48px;
    block-size: 48px;
    border-radius: 14px;
  }

  .h-name {
    display: grid;
    gap: 6px;
    min-inline-size: 0;
  }

  .h-title {
    margin: 0;
    overflow: hidden;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: calc(var(--fs-page) - 2px);
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .h-status {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .h-health {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .h-health .dot {
    inline-size: 8px;
    block-size: 8px;
    border-radius: 50%;
    background: var(--warn);
  }

  .h-health[data-tone='off'] {
    color: var(--warn);
    font-weight: 600;
  }

  .h-health[data-tone='off'] .dot {
    background: var(--warn);
  }

  .h-say {
    grid-column: 1 / -1;
    max-inline-size: 68ch;
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .fig {
    color: var(--ink);
    font-weight: 500;
  }

  .late {
    color: var(--red);
  }

  .h-next {
    grid-column: 1 / -1;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 22px;
    text-decoration: none;
  }

  .h-next :global(.icon) {
    flex: none;
    margin-block-start: 3px;
    color: var(--ph);
  }

  a.h-next:hover span {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .h-figs {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(var(--figs, 3), minmax(0, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .h-fig {
    display: grid;
    align-content: start;
    gap: 6px;
    min-inline-size: 0;
    padding: 12px;
    border-radius: 12px;
    background: var(--tile);
  }

  .k {
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A KEY NUMBER'S NAME IS THE PERSON'S OWN AND HAS NO SHORT FORM, so on a phone it wraps to two lines where it was cut
     to "Revenue a ...". Every label in the row then holds two lines, so the figures under them still share a baseline. */
  .k-kpi {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .h-figs:has(.k-kpi) .k {
    min-block-size: 36px;
  }

  .k .long {
    display: none;
  }

  .v {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: calc(var(--fs-figure) - 2px);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }

  .v-ring {
    display: flex;
    align-items: center;
    gap: 8px;
    min-inline-size: 0;
  }

  .v-ring :global(.viz-ring) {
    flex: none;
    inline-size: 28px;
  }

  .faces {
    gap: 0;
  }

  /* NOBODY ON IT NOW is said in words, never a nought standing for a person. */
  .v-none {
    color: var(--ink-2);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 26px;
  }

  .faces :global(.agent-face + .agent-face) {
    margin-inline-start: -6px;
  }

  .faces .v {
    margin-inline-start: 8px;
  }

  .sub {
    display: none;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .clamp {
    display: none;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  .trace {
    display: none;
    inline-size: 84px;
    block-size: 28px;
  }

  .trace-line {
    fill: none;
    stroke: var(--ph);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .trace-area {
    fill: color-mix(in oklab, var(--ph) 12%, transparent);
  }

  .trace-end {
    fill: var(--ph);
  }

  /* A KEY NUMBER'S LINE, drawn in the renderer's box at the hero's size: its dot is a round stroke, so it stays round. */
  .trace-dot {
    fill: none;
    stroke: var(--ph);
    stroke-width: 5;
    stroke-linecap: round;
  }

  .trace[data-stale] .trace-line,
  .trace[data-stale] .trace-dot {
    stroke: var(--ink-3);
  }

  .trace[data-stale] .trace-area {
    fill: color-mix(in oklab, var(--ink-3) 10%, transparent);
  }

  /* HOW IT MOVED, with its words: the good way in the good colour, the other and stale in the warn, never red. */
  .move {
    text-wrap: balance;
  }

  .move[data-tone='good'] {
    color: var(--good);
  }

  .move[data-tone='warn'],
  .move[data-tone='stale'] {
    color: var(--warn);
  }

  @media (width >= 640px) {
    .hero {
      grid-template-columns: 56px minmax(0, 1fr);
      column-gap: 20px;
      padding: 24px;
    }

    .h-well :global(.well) {
      inline-size: 56px;
      block-size: 56px;
      border-radius: 16px;
    }

    .h-title {
      font-size: var(--fs-hero);
    }

    .h-say {
      font-size: var(--fs-head);
    }

    .h-figs {
      gap: 12px;
    }

    .h-fig {
      min-block-size: 112px;
      padding: 14px 16px;
    }

    /* WIDE, A NAME HAS ITS LINE: no second one is held under the labels. */
    .h-figs:has(.k-kpi) .k {
      min-block-size: 0;
    }

    .k .long {
      display: inline;
    }

    .k .short {
      display: none;
    }

    .v {
      font-size: calc(var(--fs-figure) + 2px);
    }

    .v-ring :global(.viz-ring) {
      inline-size: 40px;
    }

    .sub {
      display: block;
    }

    .clamp {
      display: -webkit-box;
    }

    .trace {
      display: block;
    }
  }

  /* FROM 1100px THE FIGURES STAND ON THE RIGHT, three tiles 168 wide over the hero's three rows. */
  @media (width >= 1100px) {
    .hero {
      grid-template-columns: 56px minmax(0, 1fr) auto;
      align-items: start;
    }

    .h-name {
      align-self: center;
    }

    .h-say,
    .h-next {
      grid-column: 1 / 3;
    }

    .h-figs {
      grid-column: 3;
      grid-row: 1 / span 3;
      grid-template-columns: repeat(var(--figs, 3), 168px);
      align-self: start;
    }
  }

  /* ── the rows under it ── */
  .shape-rows {
    display: grid;
    gap: var(--inset);
  }

  .shape-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--inset);
    align-items: start;
  }

  @media (width >= 1100px) {
    .shape-row {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    }

    .shape-row.half {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .shape-row[data-alone] {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* ── work ── */
  .w-count {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .w-cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px 24px;
  }

  /* WITH YOU FIRST ON A PHONE: what waits on the reader is read before what agents hold. */
  .yours {
    order: -1;
  }

  @media (width >= 640px) {
    .w-cols {
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }

    .yours {
      order: 0;
    }
  }

  .w-col {
    display: grid;
    align-content: start;
    min-inline-size: 0;
  }

  .w-head {
    margin: 0 0 4px;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: 18px;
  }

  .w-list,
  .p-list,
  .r-list,
  .a-list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .w-row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    min-block-size: 52px;
    border-radius: 8px;
  }

  .w-row + .w-row {
    border-block-start: 1px solid var(--rule);
  }

  .w-tick {
    box-sizing: border-box;
    inline-size: 20px;
    block-size: 20px;
    margin-inline-start: 2px;
    border: 2px solid var(--rule-strong);
    border-radius: 50%;
  }

  .w-words,
  .p-words,
  .a-words {
    display: grid;
    min-inline-size: 0;
    color: inherit;
    text-decoration: none;
  }

  .w-title,
  .p-name,
  .a-name {
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A ROW'S LINK IS THE ROW'S HEIGHT, its words in the middle (layout gate, 21 October): at its words' own height it was
     a 38px target in a 52px row. */
  a.w-words,
  a.p-words {
    align-self: stretch;
    align-content: center;
  }

  a.w-words:hover .w-title,
  a.p-words:hover .p-name {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .w-sub,
  .p-sub,
  .a-sub {
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .w-sub[data-red] {
    color: var(--red);
  }

  .w-more {
    align-self: start;
    justify-self: start;
    margin-block-start: 4px;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
    text-decoration: none;
  }

  .w-more:hover {
    color: var(--ink);
  }

  /* "3 MORE" IS 44 BY 44 UNDER A THUMB, grown by a `::before` as `.tap` grows one (`a11y.css`); it was 42x20. */
  @media (pointer: coarse) {
    .w-more {
      position: relative;
    }

    .w-more::before {
      content: '';
      position: absolute;
      inset: min(0px, calc((100% - var(--tap)) / 2));
    }
  }

  /* ── people ── */
  .p-row {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    min-block-size: 52px;
  }

  .p-name {
    font-weight: 600;
  }

  /* ── runs on ── */
  .r-list[data-wide] {
    column-gap: 24px;
  }

  @media (width >= 900px) {
    .r-list[data-wide] {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .r-row {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    min-block-size: 44px;
    border-block-end: 1px solid var(--rule);
    color: var(--ink-3);
  }

  .r-name {
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-body);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .r-kind {
    font-size: var(--fs-meta);
  }

  /* ── agents here today ── */
  .day {
    display: grid;
    gap: 6px;
  }

  .track {
    position: relative;
    block-size: 10px;
    border-radius: 5px;
    background: var(--tile-2);
  }

  .d-seg {
    position: absolute;
    inset-block: 0;
    border-radius: 5px;
    background: color-mix(in oklab, var(--ph, var(--ink)) 55%, var(--tile));
  }

  .d-seg[data-live] {
    background: var(--ph, var(--ink));
  }

  .nowline {
    position: absolute;
    inset-block: -4px;
    inline-size: 2px;
    margin-inline-start: -1px;
    border-radius: 1px;
    background: var(--ph, var(--ink));
  }

  .ticks {
    display: flex;
    justify-content: space-between;
    color: var(--ink-3);
    font-size: var(--fs-cap);
  }

  .a-row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    min-block-size: 52px;
  }

  /* ── what landed (proj F9) ── */
  [data-arrived],
  :global(.tile[data-arrived]) {
    animation: landed 1.5s var(--ease-out, ease-out);
  }

  @keyframes landed {
    from {
      background-color: var(--arrived);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    [data-arrived],
    :global(.tile[data-arrived]) {
      animation: landed 1.5s step-end;
    }
  }
</style>
