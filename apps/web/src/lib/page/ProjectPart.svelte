<!--
  A row of a project's own shape, a block of the page about its row (C28, C29, 24 October): `parts` says which parts,
  one or two side by side, each laid at its width in the row by what it has (`project-parts.ts` `partLaid`): stacked
  under 1100px, and from there in twelfths, the second beside the first.

  THE PARTS, AS THE PROJECT TEMPLATE LAYS THEM: the hero, then Path and Money (`ProjectVisuals`), Work and Who is on it,
  Runs on and Agents here today, then who is working on it now with the box to tell agents on it (agents and MCP plan
  §7.2). They were one hand-drawn shape above the declared blocks (`ProjectShape.svelte`, gone); each row is declared
  now (`{ kind: project, parts }`), so the page pulled as text says it is there, and it is moved or hidden as any block
  is.
  The page leaves out a declared block that says what a part says (`withoutRepeats`) and lays the parts out by what each
  has (`project-parts.ts`).

  ONE READ FOR EVERY PART (`shape-hold.svelte.ts`): the page makes the hold, and each part draws from it.

  THE HERO HOLDS THE NAME (proj F7): the 56px well and the `h1` at 34 side by side, where it stands under the name ("Earning
  · ● At risk · since Mar 2024"), one line of news with the late phrase in the red (`heroOf`), the next step once as its last
  line, and three figures on the right: what it earned in a year, how far along it is as a ring in the project's colour,
  and who works on it now. WHERE THE PROJECT KEEPS KEY NUMBERS, THE FIRST FIGURE IS THE ONE ITS CARD LEADS WITH (the KPI
  plan of 21 October, 2.5): its name, the figure, how it moved, and its own line, as the card says it (`cardKpiOf`). Its
  colour is the project's slot (`slotStyle`), the same `--ph` its card is drawn in. The project's visuals, its audits,
  plans and designs, are drawn under it, and nothing where it holds none. While the read is out the hero holds the screen.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { actor } from '$lib/record/names.ts';
  import { midnightOf, type SessionRow } from '$lib/record/today-live.ts';
  import VisualStrip from '../visual/VisualStrip.svelte';
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
  import { Ring } from '$lib/viz/index.ts';
  import type { ShapeHold } from './shape-hold.svelte.ts';
  import { partLaid } from './project-parts.ts';

  let { hold, parts }: { hold: ShapeHold; parts: readonly string[] } = $props();

  /* WHO WROTE THE LINE, on hover: the model, from this project's figures (C4). */
  const WROTE = 'Written by BrainDog from this project’s figures';
  /* THREE OF EACH COLUMN OF WORK, and how many more. */
  const SHOWN = 3;
  /* FOUR OF WHAT IT RUNS ON, AND HOW MANY MORE, SINCE the audit of 22 October (U-B10, U-B12): eight keys in two columns,
     each with "Key" under it and nothing saying eight more were left out, on a page that should end under 1,500px. */
  const RUNS_ON_SHOWN = 4;

  const hours = (t: number, day0: number) => Math.max(0, Math.min(1, (t - day0) / 86_400_000));
  const clock = (t: number) => {
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const RUNS_ICON: Record<string, 'key' | 'skill' | 'plug'> = { key: 'key', skill: 'skill' };
  const runsIcon = (kind: string | undefined) => RUNS_ICON[Object.keys(RUNS_ICON).find((k) => (kind ?? '').toLowerCase().includes(k)) ?? ''] ?? 'plug';
  const singular = (kind: string | undefined) => (kind ?? '').replace(/s$/u, '');
  const hereWords = {
    working: 'Working here now',
    tell: (name: string) => (name ? `Tell agents on ${name}` : 'Tell an agent'),
  } as const;

  const read = $derived(hold.read);
  const arrived = $derived(hold.arrived);
  /* THE ROW'S PARTS THAT ARE DRAWN, each at its width. THE AGENTS' PART WITH NOTHING TO SHOW, for a reader who may not
     tell, is drawn unseen so it hears when a run arrives, and takes no room; a row of nothing else takes none either. */
  const laid = $derived(parts.map((part) => ({ part, ...partLaid(part, hold.have) })).filter((x) => x.on));
  const empty = $derived(laid.every((x) => !x.seen));
</script>

<div class="shape-row" data-empty={empty ? '' : undefined}>
  {#each laid as x (x.part)}
    <div class="shape-part" data-shape={x.part} data-empty={x.seen ? undefined : ''} style={slotStyle(hold.hue)} style:--part={x.span}>{@render one(x.part)}</div>
  {/each}
</div>

<!-- ONE PART, as the shape drew it. -->
{#snippet one(part: string)}
  {#if part === 'hero'}
    {#if hold.drawsHero && hold.hero && read}
      {@const hero = hold.hero}
      {@const status = hold.status}
      {@const name = hold.name}
      <section class="hero" aria-label={name} style={slotStyle(hold.hue)} data-quiet={status.quiet || undefined} id="part-overview" data-part="Overview" data-part-icon="eye">
        <span class="h-well"><ProjectWell mark={hold.mark} {name} hue={hold.hue} size="xl" /></span>
        <div class="h-name">
          <h1 class="h-title" dir="auto">{name}</h1>
          {#if status.lane || status.health || status.since}
            <p class="h-status">
              {status.lane}{#if status.health}{#if status.lane}{' · '}{/if}<span class="h-health" data-tone={status.health.tone}><span class="dot" aria-hidden="true"></span>{status.health.word}</span>{/if}{#if status.since}{#if status.health}{' · '}{:else if status.lane}{' '}{/if}since {status.since}{/if}
            </p>
          {/if}
        </div>
        {#if hold.modelLine}
          <p class="h-say" title={WROTE} dir="auto">{hold.modelLine}</p>
        {:else if hero.sentences.length > 0}
          <p class="h-say">
            {#each hero.sentences as s, n (n)}{#if n > 0}{' '}{/if}{#each s as piece, k (k)}{#if piece.figure}<b class="fig num">{piece.text}</b>{:else if piece.late}<span class="late">{piece.text}</span>{:else}{piece.text}{/if}{/each}{/each}
          </p>
        {/if}
        {#if hold.nextLine}
          {@const nextLine = hold.nextLine}
          {#if nextLine.href}
            <a class="h-next" href={at(nextLine.href)}><Icon name="arrow" size="s" /><span dir="auto">{nextLine.text}</span></a>
          {:else}
            <p class="h-next"><Icon name="arrow" size="s" /><span dir="auto">{nextLine.text}</span></p>
          {/if}
        {/if}
        {#if hold.figs.length > 0}
          {@const figs = hold.figs}
          {@const doneCount = hold.doneCount}
          {@const trace = hold.trace}
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
                  <span class="v num">{hold.said(f.minor, f.currency)}</span>
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
    {#if read && hold.register !== '' && hold.seq > 0}
      <!-- THE PROJECT'S VISUALS, its audits, plans and designs, under the hero and over the path: nothing when it holds none. -->
      <VisualStrip on="{hold.register}#{hold.seq}" tile />
    {/if}
    {#if !hold.shape && hold.holds}
      <!-- A PROJECT THIS TAB HAS DRAWN WAITS IN ITS OWN SHAPE, the picture the page's read drew, never a list's bars. -->
      {@const known = knownRow(apiBase(), hold.key)}
      <div class="held">{#if known}<ProjectWaiting project={known} />{:else}<Waiting rows={3} />{/if}</div>
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
      earnedSaid={hold.figs.some((f) => f.key === 'money')}
      format={hold.said}
      money={hold.money}
      moneyRows={hold.moneyRows}
      {arrived}
    />
  {:else if part === 'work' && hold.workLists}
    {@const w = hold.workLists}
    {@const workHref = hold.workHref}
    {@const title = hold.workDecl?.name ?? HERO_WORDS.open}
    <Tile icon="task" {title} href={workHref ?? undefined} hrefLabel={workHref ? 'All' : undefined} class="t-work" data-arrived={arrived.has('open-list') ? '' : undefined} id="part-work" data-part={title} data-part-icon="task" data-part-count={w.total}>
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
                  <a class="w-words" href={at(hold.stopHref(r.seq) ?? '')}><span class="w-title" dir="auto">{r.title}</span><span class="w-sub">{r.sub}</span></a>
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
                  <a class="w-words" href={at(hold.stopHref(r.seq) ?? '')}><span class="w-title" dir="auto">{r.title}</span><span class="w-sub" data-red={r.red ? '' : undefined}>{r.sub}</span></a>
                </li>
              {/each}
            </ul>
            {#if w.yours.length > SHOWN && workHref}<a class="w-more" href={at(workHref)}>{w.yours.length - SHOWN} more</a>{/if}
          </section>
        {/if}
      </div>
    </Tile>
  {:else if part === 'people' && hold.people.length > 0}
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
  {:else if part === 'runs-on' && hold.runsOn.length > 0}
    {@const runsOn = hold.runsOn}
    <Tile icon="plug" title="Runs on" count={runsOn.length} class="t-runs" id="part-runs" data-part="Runs on" data-part-icon="plug" data-part-count={runsOn.length}>
      <ul class="r-list" data-wide={hold.todayAlone ? undefined : ''}>
        {#each runsOn.slice(0, RUNS_ON_SHOWN) as x (x.key)}
          <li class="r-row"><Icon name={runsIcon(x.kind)} size="s" /><span class="r-name" dir="auto">{x.title}</span>{#if x.kind}<span class="r-kind">{singular(x.kind)}</span>{/if}</li>
        {/each}
      </ul>
      {#if runsOn.length > RUNS_ON_SHOWN}<p class="r-more">and {runsOn.length - RUNS_ON_SHOWN} more</p>{/if}
    </Tile>
  {:else if part === 'agents' && read}
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
    {#if hold.todayAlone}
      <Tile icon="session" title="Agents here today" class="t-today" id="part-agents" data-part="Agents" data-part-icon="session">
        {@render dayBar(read.now)}
        {@render todayList(hold.sessions)}
      </Tile>
    {/if}
    <!-- WHO IS ON IT NOW AND THE BOX TO TELL THEM (plan §7.2): the Agents page's run rows and composer, scoped to this
         project, so a stop or a tell from here says what it says there. With nobody on it the composer stands alone, and
         the next run to start here gets what he types; for a reader who may not tell, nobody on it draws nothing.
         THE DAY BAR ON TOP when a run was here today, and with nobody on it now, who was: the one tile for the agents. -->
    {#key read.key}
      {#if hold.band}
        <Tile icon="session" title={hold.here > 0 ? hereWords.working : hereWords.tell(hold.name)} count={hold.here > 0 ? hold.here : undefined} class="t-here" data-working-here id="part-agents" data-part="Agents" data-part-icon="session" data-part-live={hold.here > 0 ? '' : undefined}>
          {#if hold.sessions.length > 0}
            {@render dayBar(read.now)}
            {#if hold.here === 0}{@render todayList(hold.sessions)}{/if}
          {/if}
          <PresencePanel owner={hold.owner} project={read.key} oncount={(n) => (hold.here = n)} />
          <TellPanel owner={hold.owner} project={read.key} projectName={hold.name} first={3} />
        </Tile>
      {:else}
        <!-- NOBODY ON IT YET, for a reader who may not tell: the runs are read unseen, and the tile comes once one is. -->
        <div hidden><PresencePanel project={read.key} oncount={(n) => (hold.here = n)} /></div>
      {/if}
    {/key}
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
  /* THE PROJECT'S COLOUR AT A LOW TINT OVER THE TILE, never a gradient.
     8% IN BOTH SCHEMES. Dark took 12%, and the late count's `--red` over it read 4.2 to 4.4 to 1 for every slot, the
     amber and the lime lowest; at 8% the lightest slot keeps it over 4.5, and the tint still reads as the project's. */
  /* THE NAME FIRST, THEN ONE LINE OF NEWS, SINCE the audit of 22 October (U6, U-B7). The bento boards' lead tile of the
     same day put the name small and the sentence under it at 40px, and on a record whose sentence was what the project
     is, every page opened on a tagline at headline size. Now the 56 well and the name at 34/40 in the display face (28/34
     on a phone) with where it stands under it, and the news at 17 under them: what is late, and who worked on it last. */
  .hero {
    --ph: var(--ink);
    --h-wash: 8%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 12px;
    row-gap: 12px;
    align-items: center;
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

  .h-well {
    display: grid;
  }

  .h-name {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .h-title {
    min-inline-size: 0;
    margin: 0;
    overflow: hidden;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-page);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 34px;
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

  /* THE ONE LINE OF NEWS, at the size of a line read, not a headline: the name is what the page opens on. */
  .h-say {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-head);
    line-height: 24px;
    overflow-wrap: anywhere;
  }

  .fig {
    color: var(--ink);
    font-weight: 600;
  }

  .late {
    color: var(--red);
    font-weight: 600;
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
      column-gap: 12px;
      padding: 24px;
    }

    .h-title {
      font-size: var(--fs-hero);
      line-height: 40px;
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
      grid-template-columns: auto minmax(0, 1fr) auto;
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

  @media (width >= 1100px) {
    .shape-row {
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }

    .shape-part {
      grid-column: span var(--part, 12);
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

  .r-more {
    margin: var(--sp-2) 0 0;
    color: var(--ink-3);
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
