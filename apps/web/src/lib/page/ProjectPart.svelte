<!--
  A block of a project's own page (24 October; the page of 27 October): `parts` says which parts, each laid at
  its width by what it has (`project-parts.ts` `rowLaid`): stacked under 1100px, and from there in twelfths, a block of
  many parts laid a line at a time.

  THE PARTS, AS THE PROJECT TEMPLATE LAYS THEM: the hero beside its lane's tile (`side`: what it brings in while it
  earns, its dated path while it is built, what it costs to keep while parked), its numbers beside its work, then its
  dates, who is on it, what it runs on and renews, the agents with the box to tell them at the foot, what was decided,
  and what happened. Path and Money (`ProjectVisuals`) stay for a page declared before them.

  ONE READ FOR EVERY PART (`shape-hold.svelte.ts`), and what each says is worked out in `project-facts.ts`.

  THE HERO'S HEADLINE IS A FACT, never the next step: what is late, what it brought in, that its numbers stopped, or
  since when it is parked. Over it the name with its date line (lane, since when, its domain); under it one line more,
  the model's where the record kept one; then the next step once, as a checklist with its days; then the red button for
  the most urgent thing, and a quiet one beside it.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { actor } from '$lib/record/names.ts';
  import { midnightOf, type SessionRow } from '$lib/record/today-live.ts';
  import VisualStrip from '../visual/VisualStrip.svelte';
  import { pageButtons, take } from './page-buttons.svelte.ts';
  import { HERO_WORDS } from '$lib/record/project.ts';
  import { slotStyle } from '$lib/home/project-cards.ts';
  import ProjectVisuals from './ProjectVisuals.svelte';
  import PresencePanel from './panels/PresencePanel.svelte';
  import TellPanel from './panels/TellPanel.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import ProjectWaiting from './ProjectWaiting.svelte';
  import { knownRow } from './known-project.ts';
  import ProjectWell from '$lib/ui/ProjectWell.svelte';
  import AgentFace from '$lib/ui/AgentFace.svelte';
  import Face from '$lib/ui/Face.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import type { ShapeHold } from './shape-hold.svelte.ts';
  import { LEFT_COLUMN, RIGHT_COLUMN, rowLaid } from './project-parts.ts';
  import { happenedSaid } from './project-facts.ts';

  let { hold, parts }: { hold: ShapeHold; parts: readonly string[] } = $props();

  /* WHO WROTE THE LINE, on hover: the model, from this project's figures. */
  const WROTE = 'Written by BrainDog from this project’s figures';
  /* THE RUNS-ON LINES SHOWN BEFORE "AND N MORE". */
  const LINES_SHOWN = 6;
  /* THREE OF EACH COLUMN OF WORK, and how many more. */
  const SHOWN = 3;
  const hours = (t: number, day0: number) => Math.max(0, Math.min(1, (t - day0) / 86_400_000));
  type LineIcon = 'key' | 'skill' | 'plug' | 'observe' | 'service';
  const RUNS_ICON: Record<string, LineIcon> = { key: 'key', skill: 'skill' };
  const runsIcon = (kind: string | undefined): LineIcon => RUNS_ICON[Object.keys(RUNS_ICON).find((k) => (kind ?? '').toLowerCase().includes(k)) ?? ''] ?? 'plug';
  /* ONE LINE A NAME AND KIND: two keys of one name read as a row said twice. */
  const onceEach = <T extends { title: string; kind?: string | undefined }>(rows: readonly T[]): T[] => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      const k = `${(r.kind ?? '').toLowerCase()}|${r.title.trim().toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  /* AN OLD IMPORT SOURCE IS NEVER NAMED ON SCREEN: a run it made is an imported one. */
  /* AND NEVER ITS RUN'S ID (Q14 of 29 October): "Imported run S87" is "Imported from your old notes", an agent's own run
     is "<agent> run", and a path in a title is said as a file or a folder. */
  const unsourced = (t: string, agent: string): string => {
    const m = /^([A-Z][\w-]*(?: [A-Z][\w-]*)*) run(?: S[1-9][0-9]*)?$/u.exec(t);
    /* AN AGENT NAMED BY THE FOLDER IT RAN IN ("Claude in site") is named by the project it ran for. */
    const folder = /^(\S.*?) in ([a-z0-9][\w.-]*)$/u.exec(t);
    if (folder && hold.name) return `${folder[1]} on ${hold.name}`;
    if (!m) return happenedSaid(t);
    return m[1]!.toLowerCase() === agent.toLowerCase() ? `${m[1]} run` : 'Imported from your old notes';
  };
  const singular = (kind: string | undefined) => (kind ?? '').replace(/s$/u, '');
  /* THE BARS OF ITS MONTHS, in a 336 by 72 box, the last one in the project's colour. */
  const barsOf = (values: readonly number[]): { x: number; y: number; h: number; last: boolean }[] => {
    const hi = Math.max(1, ...values);
    const w = 336 / Math.max(1, values.length);
    return values.map((v, n) => {
      const h = Math.max(1.5, (Math.max(0, v) / hi) * 70);
      return { x: n * w, y: 72 - h, h, last: n === values.length - 1 };
    });
  };

  /* A LANE MOVED FROM HERE: what the record said where it refused, else nothing. */
  let moving = $state(false);
  let moveSaid = $state<string | null>(null);
  const moveTo = async (lane: string) => {
    moving = true;
    moveSaid = await hold.setLane(lane);
    moving = false;
  };

  const read = $derived(hold.read);
  const arrived = $derived(hold.arrived);
  /* THE ROW'S PARTS THAT ARE DRAWN, each at its width. THE AGENTS' PART WITH NOTHING TO SHOW, for a reader who may not
     tell, is drawn unseen so it hears when a run arrives, and takes no room; a row of nothing else takes none either. */
  const laid = $derived(rowLaid(parts, hold.have));
  const empty = $derived(laid.every((x) => !x.seen));
  /* TWO COLUMNS WHERE THE NUMBERS AND THE DATES ARE LAID TOGETHER (`columned`): the numbers over the dates on the left,
     the work over who is on it and what it runs on at the right, each column its tiles at the board's gap. Only where
     both columns show something; one alone is the row it always was. */
  const cols = $derived.by(() => {
    if (!parts.includes('numbers') || !parts.includes('dates')) return null;
    const side = (names: readonly string[]) => laid.map((x, n) => ({ ...x, n })).filter((x) => names.includes(x.part));
    const l = side(LEFT_COLUMN);
    const r = side(RIGHT_COLUMN);
    return l.some((x) => x.seen) && r.some((x) => x.seen) ? { l, r } : null;
  });
  /* THE SESSIONS SAID AS LINES, less the ones on it now, which the run rows under them draw with their controls. */
  const agentLines = $derived(hold.here > 0 ? hold.sessionLines.filter((s) => !s.open) : hold.sessionLines);
  /* WHAT IT RUNS ON, ONE LIST: its services with when each renews, the numbers feed (its setup behind it), then the keys,
     tools and skills its agents used, one line a name and kind. */
  type RunsLine = { name: string; sub: string; right: string; tone: 'bad' | 'warn' | 'good' | 'plain'; href: string | null; icon: LineIcon };
  const runsLines = $derived<RunsLine[]>([
    ...hold.runsOnLines.map((l): RunsLine => {
      const feed = l.name === 'Numbers feed';
      return { ...l, href: feed && hold.facts ? hold.facts.hrefs.feed : l.href, icon: feed ? 'observe' : 'service' };
    }),
    /* A SERVICE IS SAID ONCE, above, with when it renews; a cancelled one not at all. */
    ...onceEach(hold.runsOn.filter((x) => !/service/iu.test(x.kind ?? ''))).map((x): RunsLine => ({ name: x.title, sub: singular(x.kind), right: '', tone: 'plain', href: null, icon: runsIcon(x.kind) })),
  ]);

  /* THE PAGE'S BUTTONS, lent to the hero's top row from 900px. */
  const lent = pageButtons();
</script>

{#if cols}
  <div class="shape-row" data-cols>
    {#each [cols.l, cols.r] as side, k (k)}
      <div class="shape-col">
        {#each side as x (x.part)}
          <div class="shape-part" data-shape={x.part} data-empty={x.seen ? undefined : ''} style={slotStyle(hold.hue)} style:order={x.n}>{@render one(x.part)}</div>
        {/each}
      </div>
    {/each}
  </div>
{:else}
  <div class="shape-row" data-empty={empty ? '' : undefined}>
    {#each laid as x (x.part)}
      <div class="shape-part" data-shape={x.part} data-empty={x.seen ? undefined : ''} style={slotStyle(hold.hue)} style:--part={x.span}>{@render one(x.part)}</div>
    {/each}
  </div>
{/if}

<!-- ONE PART. -->
{#snippet one(part: string)}
  {#if part === 'hero'}
    {#if hold.drawsHero && read && hold.heroFacts}
      {@const facts = hold.heroFacts}
      {@const status = hold.status}
      {@const name = hold.name}
      <section class="hero" aria-label={name} style={slotStyle(hold.hue)} data-quiet={status.quiet || undefined} id="part-overview" data-part="Overview" data-part-icon="eye">
        <div class="h-top">
          <span class="h-well"><ProjectWell mark={hold.mark} {name} hue={hold.hue} size="l" /></span>
          <div class="h-name">
            <!-- THE PROJECT'S NAME IS THE PAGE'S HEADING, and the sentence under it a paragraph (Q60 of 29 October). -->
            <h1 class="h-title" dir="auto">{name}</h1>
            {#if hold.dateLine || status.health}
              <p class="h-status">
                <!-- THE LAST FACT, THE DOT AND THE HEALTH WRAP AS ONE, so a phone never ends a line on a stray " · " with
                     "At risk" alone under it (audit of 31 October, A28). -->
                {#if status.health && hold.dateLine}{@const parts = hold.dateLine.split(' · ')}{#if parts.length > 1}{parts.slice(0, -1).join(' · ')}{' · '}{/if}<span class="h-keep"
                    >{parts.at(-1)}{' · '}<span class="h-health" data-tone={status.health.tone}><span class="dot" aria-hidden="true"></span>{status.health.word}</span></span
                  >{:else}{hold.dateLine}{#if status.health}<span class="h-health" data-tone={status.health.tone}><span class="dot" aria-hidden="true"></span>{status.health.word}</span>{/if}{/if}
              </p>
            {/if}
          </div>
          <!-- THE PAGE'S SHARE AND "⋯", at the end of the name's row from 900px, where the head had a row of its own for
               them (`page-buttons.svelte.ts`). -->
          {#if lent?.buttons}<div class="h-page-acts" {@attach take(lent)}>{@render lent.buttons()}</div>{/if}
        </div>
        <p class="h-head" dir="auto">{facts.headline}</p>
        {#if hold.modelLine}
          <p class="h-say" title={WROTE} dir="auto">{hold.modelLine}</p>
        {:else if facts.lede}
          <p class="h-say" dir="auto">{facts.lede}</p>
        {/if}
        {#if hold.checklist.length > 0}
          <div class="h-steps">
            <p class="h-lbl">Next step</p>
            <ul class="ck-list">
              {#each hold.checklist as c, n (n)}
                <li class="ck">
                  <span class="ck-box" aria-hidden="true"></span>
                  {#if c.href}<a class="ck-text" href={at(c.href)} dir="auto">{c.text}</a>{:else}<span class="ck-text" dir="auto">{c.text}</span>{/if}
                  {#if c.chip}<span class="ck-chip num" data-late={c.late ? '' : undefined}>{c.chip}</span>{/if}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
        {#if facts.red || facts.soft || hold.seq > 0}
          <div class="h-acts">
            {#if facts.red}<Button weight="primary" href={facts.red.href}>{facts.red.said}</Button>{/if}
            {#if facts.soft}<Button href={facts.soft.href}>{facts.soft.said}</Button>{/if}
            <!-- SEND TO…: the project to Slash or an agent, fetched with the hero and not before. -->
            {#if hold.register !== '' && hold.seq > 0}
              {@const ref = `${hold.register}#${hold.seq}`}
              {#await import('../send/SendButton.svelte') then { default: SendButton }}<SendButton kind={hold.register} attach={[{ ref, label: name }]} project={ref} />{/await}
            {/if}
          </div>
        {/if}
      </section>
    {/if}
    {#if read && hold.register !== '' && hold.seq > 0}
      <!-- WHAT WAS SENT FROM THE PROJECT, and what came back, under its hero. -->
      {#await import('../send/SendStrip.svelte') then { default: SendStrip }}<SendStrip ref="{hold.register}#{hold.seq}" kind={hold.register} label={hold.name} />{/await}
      <!-- THE PROJECT'S VISUALS, its audits, plans and designs, under the hero: nothing when it holds none. -->
      <VisualStrip on="{hold.register}#{hold.seq}" tile />
    {/if}
    {#if !hold.shape && hold.holds}
      <!-- A PROJECT THIS TAB HAS DRAWN WAITS IN ITS OWN SHAPE, the picture the page's read drew, never a list's bars. -->
      {@const known = knownRow(apiBase(), hold.key)}
      <div class="held">{#if known}<ProjectWaiting project={known} />{:else}<Waiting rows={3} />{/if}</div>
    {/if}
  {:else if part === 'side' && read && hold.side}
    {@const side = hold.side}
    {#if side.kind === 'money'}
      <Tile icon="money" title="Money" class="t-side" id="part-side" data-part="Money" data-part-icon="money">
        {#snippet actions()}{#if side.stale}<span class="chip-age">{side.stale}</span>{/if}{/snippet}
        <div class="s-fig"><span class="s-big num">{side.figure}</span><span class="s-sub">{side.sub}</span></div>
        {#if side.bars.length >= 3}
          <svg class="s-bars" viewBox="0 0 336 72" preserveAspectRatio="none" aria-hidden="true">
            {#each barsOf(side.bars) as b, n (n)}<rect x={b.x + 2} y={b.y} width={Math.max(2, 336 / side.bars.length - 6)} height={b.h} rx="2" data-last={b.last ? '' : undefined} />{/each}
          </svg>
        {/if}
        {#if side.lines.length > 0}
          <dl class="kv">
            {#each side.lines as l, n (n)}<div class="kv-row"><dt dir="auto">{l.k}</dt><dd class="num">{l.v}</dd></div>{/each}
          </dl>
        {/if}
      </Tile>
    {:else if side.kind === 'path'}
      <Tile icon="clock" title="Path" meta={side.end ? `to ${side.end}` : undefined} href={hold.workHref ?? undefined} hrefLabel={hold.workHref ? 'All' : undefined} class="t-side" id="part-side" data-part="Path" data-part-icon="clock">
        {#if side.stops.length > 0}
          <ol class="stops">
            {#each side.stops as st, n (n)}
              <li class="stop" data-tone={st.tone}>
                <span class="st-dot" aria-hidden="true"></span>
                <span class="st-day num">{st.day}</span>
                <a class="st-words" href={at(st.href)}><span class="st-title" dir="auto">{st.title}</span>{#if st.sub}<span class="st-sub">{st.sub}</span>{/if}</a>
              </li>
            {/each}
          </ol>
        {/if}
        {#if side.aim}<p class="s-aim">{side.aim}</p>{/if}
        {#if side.empty}<p class="s-empty">{side.empty}</p>{/if}
      </Tile>
    {:else if side.kind === 'keep'}
      <Tile icon="archive" title="Keeping it" class="t-side" id="part-side" data-part="Keeping it" data-part-icon="archive">
        {#if side.year}<p class="s-year">{side.year}</p>{/if}
        {#if side.lines.length > 0}
          <dl class="kv">
            {#each side.lines as l, n (n)}<div class="kv-row"><dt><a href={at(l.href)} dir="auto">{l.k}</a></dt><dd class="num">{l.v}</dd></div>{/each}
          </dl>
        {/if}
        {#if hold.owner}
          <div class="s-acts">
            <Button size="sm" disabled={moving} onclick={() => void moveTo('building')}>Bring it back</Button>
            {#if hold.lane !== 'retired'}<Button size="sm" disabled={moving} onclick={() => void moveTo('retired')}>Close it</Button>{/if}
            {#if side.domain}<Button size="sm" weight="bare" href={side.domain.href}>Let the domain go</Button>{/if}
          </div>
          {#if moveSaid}<p class="s-said" role="status">{moveSaid}</p>{/if}
        {/if}
      </Tile>
    {:else if hold.hasMoney}
      <ProjectVisuals only="money" inByMonth={read.inByMonth} outByMonth={read.outByMonth} trend={hold.trend} format={hold.said} money={hold.money} moneyRows={hold.moneyRows} {arrived} />
    {/if}
  {:else if (part === 'path' || part === 'money') && read}
    <ProjectVisuals
      only={part}
      path={hold.path}
      pathHref={hold.workHref}
      stopHref={hold.stopHref}
      inByMonth={read.inByMonth}
      outByMonth={read.outByMonth}
      trend={hold.trend}
      earnedSaid={false}
      format={hold.said}
      money={hold.money}
      moneyRows={hold.moneyRows}
      {arrived}
    />
  {:else if part === 'numbers' && hold.numbers && (hold.numbers.cells.length > 0 || hold.numbers.plan)}
    {@const nums = hold.numbers}
    <Tile icon="chart-line" title="Numbers" count={nums.more > 0 ? `${nums.cells.length} of ${nums.cells.length + nums.more}` : nums.cells.length} meta={nums.cadence || undefined} class="t-numbers" id="part-numbers" data-part="Numbers" data-part-icon="chart-line">
      {#if nums.banner}
        <div class="n-ban" role="status">
          <Icon name="alert" size="s" />
          <span class="n-ban-words"><b>{nums.banner.said}</b> {nums.banner.why}</span>
          {#if hold.facts}<Button size="sm" href={hold.facts.hrefs.feed}>Fix the feed</Button>{/if}
        </div>
      {/if}
      <ul class="n-cells">
        {#each nums.cells as c (c.label)}
          <li class="n-cell" data-stale={c.stale ? '' : undefined}>
            <span class="n-label" dir="auto">{c.label}</span>
            <span class="n-fig num">{c.figure}</span>
            {#if c.trail}
              <svg class="n-trail" viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true"><path d={c.trail.area} class="n-area" /><path d={c.trail.line} class="n-line" vector-effect="non-scaling-stroke" /></svg>
            {/if}
            {#if c.sub}<span class="n-sub">{c.sub}</span>{/if}
            {#if c.stale}<span class="chip-age">{c.age} days old</span>{/if}
          </li>
        {/each}
      </ul>
      {#if nums.plan}<p class="n-plan num" dir="auto">{nums.plan}</p>{/if}
    </Tile>
  {:else if part === 'what-is-open' && hold.workLists}
    {@const w = hold.workLists}
    {@const workHref = hold.workHref}
    {@const title = hold.workDecl?.name ?? HERO_WORDS.open}
    <Tile icon="task" {title} href={workHref ?? undefined} hrefLabel={workHref ? 'All' : undefined} class="t-work" data-arrived={arrived.has('open-list') ? '' : undefined} id="part-work" data-part={title} data-part-icon="task" data-part-count={w.total}>
      {#snippet actions()}
        <span class="w-count num">{w.total} open{#if w.late > 0}, <span class="late">{w.late} late</span>{/if}</span>
      {/snippet}
      <div class="w-cols">
        {#if w.yours.length > 0}
          <section class="w-col yours" aria-label="With you">
            <h3 class="w-head">With you <span class="num">{w.yours.length}</span></h3>
            <ul class="w-list">
              {#each w.yours.slice(0, SHOWN) as r (r.seq)}
                <li class="w-row" data-arrived={arrived.has(`row:${r.seq}`) ? '' : undefined}>
                  <span class="w-tick" aria-hidden="true"></span>
                  <a class="w-words" href={at(hold.stopHref(r.seq) ?? '')}><span class="w-title" dir="auto">{r.title}</span><span class="w-sub" data-red={r.red ? '' : undefined}>{r.sub}</span></a>
                </li>
              {/each}
            </ul>
            {#if w.yours.length > SHOWN && workHref}<a class="w-more" href={at(workHref)}>{w.yours.length - SHOWN} more</a>{/if}
          </section>
        {/if}
        {#if w.agents.length > 0}
          <section class="w-col" aria-label="With agents">
            <h3 class="w-head">With agents <span class="num">{w.agents.length}</span></h3>
            <ul class="w-list">
              {#each w.agents.slice(0, SHOWN) as r (r.seq)}
                <li class="w-row" data-arrived={arrived.has(`row:${r.seq}`) ? '' : undefined}>
                  <AgentFace agent={r.agent} run="" live={r.live} size="xs" />
                  <a class="w-words" href={at(hold.stopHref(r.seq) ?? '')}><span class="w-title" dir="auto">{r.title}</span><span class="w-sub">{r.sub}</span></a>
                </li>
              {/each}
            </ul>
            {#if w.agents.length > SHOWN && workHref}<a class="w-more" href={at(workHref)}>{w.agents.length - SHOWN} more</a>{/if}
          </section>
        {/if}
      </div>
    </Tile>
  {:else if part === 'dates' && hold.dates.length > 0}
    <Tile icon="calendar" title="Dates" meta="next 4 months" class="t-dates" id="part-dates" data-part="Dates" data-part-icon="calendar">
      <ul class="li-list">
        {#each hold.dates as d, n (n)}
          <li class="li" data-tone={d.tone}>
            <span class="li-when num">{d.day}</span>
            {#if d.href}<a class="li-text" href={at(d.href)} dir="auto">{d.text}</a>{:else}<span class="li-text" dir="auto">{d.text}</span>{/if}
          </li>
        {/each}
      </ul>
    </Tile>
  {:else if part === 'who-is-on-it' && hold.people.length > 0}
    {@const people = hold.people}
    <Tile icon="user-check" title="Who is on it" count={people.length} class="t-people" id="part-people" data-part="Who is on it" data-part-icon="user-check" data-part-count={people.length}>
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
  {:else if part === 'runs-on' && runsLines.length > 0}
    <!-- WHAT IT RUNS ON AND WHEN EACH RENEWS, from its services, the soonest first; the numbers feed as one line that
         says whether it is quiet, its setup behind it; then the keys, tools and skills its agents used. -->
    <Tile icon="plug" title="Runs on" count={runsLines.length} class="t-runs" id="part-runs" data-part="Runs on" data-part-icon="plug" data-part-count={runsLines.length}>
      <ul class="r-list">
        {#each runsLines.slice(0, LINES_SHOWN) as l, n (n)}
          <li class="r-row" data-tone={l.tone}>
            <Icon name={l.icon} size="s" />
            <span class="r-words">
              {#if l.href}<a class="r-name" href={at(l.href)} dir="auto">{l.name}</a>{:else}<span class="r-name" dir="auto">{l.name}</span>{/if}
              {#if l.sub}<span class="r-kind">{l.sub}</span>{/if}
            </span>
            {#if l.right}<span class="r-right num">{l.right}</span>{/if}
          </li>
        {/each}
      </ul>
      {#if runsLines.length > LINES_SHOWN}<p class="r-more">and {runsLines.length - LINES_SHOWN} more</p>{/if}
    </Tile>
  {:else if part === 'agents-here' && read}
    {#snippet dayBar(now: number)}
      {@const day0 = midnightOf(now)}
      <div class="day" aria-hidden="true">
        <div class="track">
          {#each hold.sessions as s, n (s.seq ?? n)}
            <span class="d-seg" data-live={s.working ? '' : undefined} style:inset-inline-start="{hours(s.from, day0) * 100}%" style:inline-size="{Math.max(0.6, (hours(s.to, day0) - hours(s.from, day0)) * 100)}%"></span>
          {/each}
          <span class="nowline" style:inset-inline-start="{hours(now, day0) * 100}%"></span>
        </div>
        <div class="ticks num">{#each ['00', '06', '12', '18', '24'] as t (t)}<span>{t}</span>{/each}</div>
      </div>
    {/snippet}
    <!-- THE AGENTS ON IT: today's day bar where one was here today, each session with how it ended and what it left, who
         is on it now (`PresencePanel`, the Agents page's run rows scoped here), and the box to tell them at the foot,
         its Send in the one primary look it has on Agents. For a reader who may not tell and no session yet, the runs are read unseen. -->
    {#key read.key}
      {#if hold.band || hold.sessionLines.length > 0 || hold.sessions.length > 0}
        <Tile icon="session" title="Agents" count={hold.here > 0 ? `${hold.here} on it now` : hold.sessionLines.length > 0 ? `${hold.sessionLines.length} recent` : undefined} class="t-agents" id="part-agents" data-part="Agents" data-part-icon="session" data-part-live={hold.here > 0 ? '' : undefined}>
          {#if hold.sessions.length > 0}{@render dayBar(read.now)}{/if}
          {#if agentLines.length > 0}
            <ul class="a-list">
              {#each agentLines as s (s.seq)}
                <li class="a-row">
                  <AgentFace agent={s.agent} run={`S${s.seq}`} live={s.open ? 'working' : 'stopped'} size="xs" />
                  <span class="a-words" title={actor(s.agent).name}>
                    <span class="a-name" dir="auto">{unsourced(s.title, actor(s.agent).name)}<span class="a-when">, {s.when}</span></span>
                    <span class="a-sub" dir="auto">{s.ended}{#if s.said}{' · '}{s.said}{/if}</span>
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
          <PresencePanel owner={hold.owner} project={read.key} oncount={(n) => (hold.here = n)} />
          <div class="a-tell"><TellPanel owner={hold.owner} project={read.key} projectName={hold.name} first={3} /></div>
        </Tile>
      {:else}
        <div hidden><PresencePanel project={read.key} oncount={(n) => (hold.here = n)} /></div>
      {/if}
    {/key}
  {:else if part === 'decisions' && read && read.decided.length > 0}
    <Tile icon="decide" title="Decided" count={read.decided.length} class="t-decided" id="part-decided" data-part="Decided" data-part-icon="decide">
      <ul class="li-list">
        {#each read.decided as d, n (n)}
          <li class="li">
            <span class="li-text" dir="auto">{d.question}{#if d.answer}<span class="li-sub">{d.answer}</span>{/if}</span>
          </li>
        {/each}
      </ul>
    </Tile>
  {:else if part === 'happened' && hold.happened.length > 0}
    <Tile icon="history" title="What happened" class="t-happened" id="part-happened" data-part="What happened" data-part-icon="history">
      <ul class="li-list">
        {#each hold.happened as h, n (n)}
          <li class="li" data-tone={h.tone}>
            <span class="li-when num">{h.day}</span>
            <span class="li-text" dir="auto">{h.text}{#if h.by}<span class="li-sub">{h.by}</span>{/if}</span>
          </li>
        {/each}
      </ul>
    </Tile>
  {/if}
{/snippet}

<style>
  /* HELD TO THE FOOT OF THE WINDOW while the shape is read (VERIFY H4): the shape is taller than a screen at every width
     (1,017px at 1,512), so what the page draws under it starts below the fold and stays there when it lands. 160px held
     put the page's blocks on screen and then pushed them off it: Kiln's load shift of 0.085 at 1,512 and 0.161 at 390. */
  .held {
    min-block-size: max(160px, calc(100dvh - 120px));
  }

  /* ── the hero ── */
  /* THE PROJECT'S COLOUR AT A LOW TINT OVER THE TILE, never a gradient: 8% in both schemes, so the late chip's red holds.
     THE NAME SMALL OVER ITS DATE LINE, THEN THE FACT AT HEADLINE SIZE (the page of 27 October): the headline is what is
     true of it, the line under it says one more thing, the next step is a checklist, and one red button ends it. */
  .hero {
    --ph: var(--ink);
    --h-wash: 8%;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 12px;
    block-size: 100%;
    box-sizing: border-box;
    padding: 16px;
    border-radius: var(--r-tile, 16px);
    background: color-mix(in oklab, var(--ph) var(--h-wash), var(--tile));
  }

  /* A PARKED OR FINISHED PROJECT IS DRAWN QUIET: no wash of its colour, and its well greyed, so it reads as resting. */
  .hero[data-quiet] {
    --h-wash: 0%;
  }

  .hero[data-quiet] .h-well {
    filter: grayscale(1);
    opacity: 0.7;
  }

  .h-top {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 12px;
  }

  .h-top:has(> .h-page-acts) {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  /* SHARE AND "⋯" ON THE HERO: quiet, on the tile's own fill, as the head drew them on the board. */
  .h-page-acts {
    display: flex;
    align-items: center;
    align-self: start;
    gap: var(--sp-2);
  }

  .h-page-acts :global(:is(.btn[data-weight='quiet'], .share-trigger, .change-more)) {
    background: var(--tile);
  }

  .h-well {
    display: grid;
  }

  .h-name {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .h-title {
    margin: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: 22px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .h-status {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .h-keep {
    white-space: nowrap;
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

  /* THE FACT, at the page's size in the display face: 24/30 on a phone, 30/36 wide. */
  .h-head {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-figure);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 30px;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }

  .h-say {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  .late {
    color: var(--red);
    font-weight: 600;
  }

  .h-steps {
    display: grid;
    gap: 4px;
    margin-block-start: 4px;
  }

  .h-lbl {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .ck-list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ck {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-block-size: 36px;
  }

  .ck + .ck {
    border-block-start: 1px solid color-mix(in oklab, var(--rule) 70%, transparent);
  }

  .ck-box {
    box-sizing: border-box;
    inline-size: 16px;
    block-size: 16px;
    border: 1.5px solid var(--rule-strong);
    border-radius: 50%;
    background: var(--tile);
  }

  .ck-text {
    min-inline-size: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 20px;
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  a.ck-text:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .ck-chip,
  .chip-age {
    padding: 2px 8px;
    border-radius: 6px;
    background: var(--tile-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
    white-space: nowrap;
  }

  .ck-chip[data-late] {
    background: color-mix(in oklab, var(--red) 12%, var(--tile));
    color: var(--red);
    font-weight: 600;
  }

  /* PAST TWICE ITS CADENCE: amber, never red. */
  .chip-age {
    background: color-mix(in oklab, var(--warn) 14%, var(--tile));
    color: var(--warn);
    font-weight: 600;
  }

  .h-acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-inline-size: 0;
    margin-block-start: 4px;
  }

  /* A LONG TASK NAME IN THE BUTTON IS CUT, never wider than the hero. */
  .h-acts :global(.btn) {
    display: inline-block;
    max-inline-size: 100%;
    overflow: hidden;
    line-height: var(--ctl-h);
    text-overflow: ellipsis;
  }

  @media (width >= 640px) {
    .hero {
      padding: 24px;
    }

    .h-head {
      font-size: var(--fs-page);
      line-height: 36px;
    }
  }

  /* ── the tile beside the hero ── */
  .s-fig {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .s-big {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-figure);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }

  .s-sub,
  .s-aim,
  .s-empty,
  .s-said {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .s-aim,
  .s-empty,
  .s-said {
    margin: 8px 0 0;
  }

  .s-year {
    margin: 8px 0 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .s-bars {
    display: block;
    inline-size: 100%;
    block-size: 72px;
    margin-block-start: 12px;
  }

  .s-bars rect {
    fill: color-mix(in oklab, var(--ph) 40%, var(--tile));
  }

  .s-bars rect[data-last] {
    fill: var(--ph);
  }

  .kv {
    display: grid;
    margin: 12px 0 0;
  }

  .kv-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding-block: 7px;
    border-block-start: 1px solid var(--rule);
    font-size: var(--fs-body);
    line-height: 20px;
  }

  .kv-row dt {
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink-2);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kv-row dt a {
    color: inherit;
    text-decoration: none;
  }

  .kv-row dd {
    margin: 0;
    color: var(--ink);
    white-space: nowrap;
  }

  .s-acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-block-start: 12px;
  }

  /* THE DATED PATH, a line down the left, a dot a stop: done filled, late in red, the reader's in amber. */
  .stops {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .stop {
    position: relative;
    display: grid;
    grid-template-columns: 12px 52px minmax(0, 1fr);
    align-items: start;
    gap: 10px;
    padding-block: 6px;
  }

  .stop + .stop::before {
    content: '';
    position: absolute;
    inset-block: -6px 50%;
    inset-inline-start: 5px;
    inline-size: 2px;
    background: var(--rule);
  }

  .st-dot {
    position: relative;
    z-index: var(--z-raise);
    box-sizing: border-box;
    inline-size: 12px;
    block-size: 12px;
    margin-block-start: 4px;
    border: 2px solid var(--rule-strong);
    border-radius: 50%;
    background: var(--tile);
  }

  .stop[data-tone='done'] .st-dot {
    border-color: var(--ph);
    background: var(--ph);
  }

  .stop[data-tone='doing'] .st-dot {
    border-color: var(--ph);
  }

  .stop[data-tone='late'] .st-dot {
    border-color: var(--red);
  }

  .stop[data-tone='you'] .st-dot {
    border-color: var(--warn);
  }

  .st-day {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 20px;
  }

  .st-words {
    display: grid;
    min-inline-size: 0;
    color: inherit;
    text-decoration: none;
  }

  .st-title {
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .st-sub {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .stop[data-tone='late'] .st-sub {
    color: var(--red);
  }

  .stop[data-tone='you'] .st-sub {
    color: var(--warn);
  }

  /* ── numbers ── */
  .n-ban {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    margin-block-end: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: color-mix(in oklab, var(--warn) 10%, var(--tile));
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .n-ban :global(.icon) {
    flex: none;
    color: var(--warn);
  }

  .n-ban-words {
    flex: 1 1 220px;
    min-inline-size: 0;
  }

  .n-ban-words b {
    color: var(--ink);
    font-weight: 600;
  }

  .n-cells {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  @media (width >= 900px) {
    .n-cells {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
  }

  .n-cell {
    display: grid;
    align-content: start;
    justify-items: start;
    gap: 4px;
    min-inline-size: 0;
  }

  /* A LABEL WRAPS, never cut (Q33 of 29 October): three "Monthly revenue a year out: …" hid which was which. */
  .n-label {
    max-inline-size: 100%;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
    overflow-wrap: anywhere;
  }

  .n-fig {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-figure);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 28px;
  }

  .n-cell[data-stale] .n-fig {
    color: var(--ink-2);
  }

  .n-trail {
    inline-size: 100%;
    max-inline-size: 160px;
    block-size: 32px;
  }

  .n-line {
    fill: none;
    stroke: var(--ph);
    stroke-width: 1.75;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .n-area {
    fill: color-mix(in oklab, var(--ph) 12%, transparent);
  }

  .n-cell[data-stale] .n-line {
    stroke: var(--ink-3);
  }

  .n-cell[data-stale] .n-area {
    fill: color-mix(in oklab, var(--ink-3) 10%, transparent);
  }

  .n-sub {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  /* WHAT IT PLANS FOR, under what it measured and apart from it. */
  .n-plan {
    margin: 12px 0 0;
    padding-block-start: 10px;
    border-block-start: 1px solid var(--rule);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  /* ── dates, what was decided and what happened: a day and a line ── */
  .li-list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: baseline;
    gap: 12px;
    padding-block: 8px;
  }

  .li + .li {
    border-block-start: 1px solid var(--rule);
  }

  .li:not(:has(.li-when)) {
    grid-template-columns: minmax(0, 1fr);
  }

  .li-when {
    min-inline-size: 76px;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 20px;
    white-space: nowrap;
  }

  .li[data-tone='late'] .li-when,
  .li[data-tone='late'] .li-text {
    color: var(--red);
  }

  .li[data-tone='warn'] .li-text {
    color: var(--warn);
  }

  .li-text {
    display: grid;
    min-inline-size: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 20px;
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  a.li-text:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* A LINE THAT OPENS ITS ROW IS 44 TALL UNDER A THUMB, and the row's own padding takes the growth back; it was 20. */
  @media (pointer: coarse) {
    a.li-text {
      min-block-size: var(--tap);
      align-content: center;
      margin-block: -8px;
    }
  }

  .li-sub {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  /* ── the row and its parts ──
     A ROW OF THE SHAPE, its parts stacked under 1100px and from there in twelfths, each at its width (`--part`), the two
     sharing the row as the shape laid them. The slot draws no fill round it (`BlockSlot.svelte`). EACH PART'S OWN TILES
     STACK IN IT at the board's gap: the hero over the project's visuals, or Agents here today over the band's unseen
     runs. A part with nothing to show takes no room. */
  .shape-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--inset);
    align-items: start;
  }

  .shape-part {
    display: flex;
    flex-direction: column;
    gap: var(--inset);
    min-inline-size: 0;
  }

  .shape-part[data-empty] {
    display: none;
  }

  /* AT A DESK THE PARTS OF A ROW END LEVEL: the last tile of each grows to the row's height, so a short tile beside a
     tall one leaves no hole on the board above the next row. */
  @media (width >= 1100px) {
    .shape-row {
      grid-template-columns: repeat(12, minmax(0, 1fr));
      align-items: stretch;
    }

    .shape-part > :global(:last-child) {
      flex-grow: 1;
    }

    /* DATES IS AS TALL AS ITS DATES (Q32 of 29 October): two lines stood in a tile stretched to Runs on's height. AND
       NUMBERS AS TALL AS ITS FIGURES (31 October, AG22): three figures stood over a tall empty band, stretched to Tasks. */
    .shape-part:is([data-shape='dates'], [data-shape='numbers']) {
      align-self: start;
    }

    .shape-part:is([data-shape='dates'], [data-shape='numbers']) > :global(:last-child) {
      flex-grow: 0;
    }

    .shape-part {
      grid-column: span var(--part, 12);
    }
  }

  /* THE TWO COLUMNS (`cols`): under 1100px their tiles stack in the order the page declares (`order`), as any row's do;
     from there the numbers' column takes two thirds and the work's one, each its tiles one under the other, and the last
     of each grows so the two columns end level and no hole stands under the shorter (bento, 1 Nov). */
  .shape-col {
    display: contents;
  }

  @media (width >= 1100px) {
    .shape-row[data-cols] {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      align-items: stretch;
    }

    .shape-row[data-cols] > .shape-col {
      display: flex;
      flex-direction: column;
      gap: var(--inset);
      min-inline-size: 0;
    }

    .shape-row[data-cols] .shape-part {
      align-self: stretch;
      grid-column: auto;
    }

    .shape-row[data-cols] .shape-col > .shape-part:not([data-empty]):last-child,
    .shape-row[data-cols] .shape-col > .shape-part:not([data-empty]):has(~ .shape-part[data-empty]):not(:has(~ .shape-part:not([data-empty]))) {
      flex-grow: 1;
    }

    .shape-row[data-cols] .shape-col > .shape-part:not([data-empty]):last-child > :global(:last-child),
    .shape-row[data-cols] .shape-col > .shape-part:not([data-empty]):has(~ .shape-part[data-empty]):not(:has(~ .shape-part:not([data-empty]))) > :global(:last-child) {
      flex-grow: 1;
    }

    /* AGENTS IS AS TALL AS ITS RUNS (skills pass 2 Nov), as Dates and Numbers are: grown to end level with the work's
       column it stood over a 330px empty band at 1512 on Kiln, two runs and then nothing down to the box to tell them.
       A column ending short of its neighbour is the board's background; a hole inside a tile reads as something
       missing. */
    .shape-row[data-cols] .shape-col > .shape-part[data-shape='agents-here']:not([data-empty]),
    .shape-row[data-cols] .shape-col > .shape-part[data-shape='agents-here']:not([data-empty]):has(~ .shape-part[data-empty]):not(:has(~ .shape-part:not([data-empty]))) {
      flex-grow: 0;
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

  /* ── runs on and renewals ── */
  .r-row {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    min-block-size: 44px;
    border-block-end: 1px solid var(--rule);
    color: var(--ink-3);
  }

  .r-words {
    display: grid;
    min-inline-size: 0;
  }

  .r-name {
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 20px;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  a.r-name:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* THE NAME IS 44 TALL UNDER A THUMB, one line centred in it, and the margin takes the growth back so the row keeps
     its height; it was 20. */
  @media (pointer: coarse) {
    a.r-name {
      line-height: var(--tap);
      margin-block: calc((20px - var(--tap)) / 2);
    }
  }

  .r-kind {
    overflow: hidden;
    font-size: var(--fs-meta);
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .r-right {
    font-size: var(--fs-meta);
    white-space: nowrap;
  }

  .r-row[data-tone='warn'] .r-right {
    color: var(--warn);
    font-weight: 600;
  }

  /* A RENEWAL GONE BY, "lapsed 30 Aug", in the red that late is drawn in everywhere else (AG17). */
  .r-row[data-tone='bad'] .r-right {
    color: var(--red);
    font-weight: 600;
  }

  .r-row[data-tone='good'] .r-right {
    color: var(--good);
  }

  .r-more {
    margin: var(--sp-2) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* ── the agents ── */
  /* THE BOX TO TELL THEM, AT THE FOOT AND IN INK: Send is the screen's red everywhere else, and here the hero's button
     is the one red thing on the page. */
  .a-tell {
    margin-block-start: 8px;
  }

  /* WHERE THE TILE GROWS TO END LEVEL WITH THE WORK'S COLUMN (`cols`, L32), the box goes to its foot, so the room is
     between the runs and the box to tell them, as a thread's is, and not a hole under the box. */
  :global(.t-agents > .a-tell) {
    margin-block-start: auto;
  }

  /* SEND KEEPS ITS ONE PRIMARY LOOK, as on Agents (Q32 of 29 October): it was drawn in ink here and red there. */

  .a-when {
    color: var(--ink-3);
    font-weight: 400;
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
