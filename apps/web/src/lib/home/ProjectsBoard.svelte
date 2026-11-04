<!--
  THE PROJECTS PAGE (`projects-board.ts` works it out, `projects-board-read.ts` reads it): drawn in the slot of the page's
  block over every project (`key: board`, the Projects template). Sam, 4 Nov: "projects page looks poor".

  THE PROJECTS COME FIRST. In play, Parked and Finished as one switch (Add a project, Share and "⋯" are in the head, as on
  People; `PageView.svelte` draws them). Then three sections by what a person does about them (`sectionsOf`): Needs you and Moving as
  cards, each its mark, name and lane, its next step whole, what it is waiting on, the number it leads with and its line,
  and the last work on it; Quiet as one tile of rows, since a project nobody touched has less to say. Beside them on a desk,
  under them on a phone, what is late, what falls due this week, the numbers gone quiet, what renews and what earns.

  NO HEADLINE ON THE PAGE. The big sentence and the figures under it stood over the projects, which started below the fold
  on a busy record, and it said in prose what the tiles say. A screen reader still has it as its first line.

  PIN TO SIDEBAR IS A WORD ON EVERY PROJECT, never a hover: this page is the way into the sidebar (3 Nov), and pinned reads
  in the sidebar's own lit colour.

  While the reads are out the page holds its place, so what stands under it does not jump (`BlockSlot.svelte`).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import { arrive, depart, springy } from '$lib/motion/index.ts';
  import { apiBase, at } from '$lib/at.ts';
  import { live } from '$lib/data/live.svelte.ts';
  import { workingNow } from './waits.svelte.ts';
  import AgentFace from '$lib/ui/AgentFace.svelte';
  import ItemMenu from '$lib/ui/ItemMenu.svelte';
  import { ownMenu } from '$lib/ui/context-menu.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { navPrefs } from '$lib/nav-prefs.svelte.ts';
  import { isPinnedAt, pinWords, togglePin } from '$lib/shell/pin-project.ts';
  import ProjectWell from '$lib/ui/ProjectWell.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import { HEALTH, slotStyle } from './project-cards.ts';
  import { sectionsOf, trailOf, type Board, type BoardRow, type BoardSection, type Parked } from './projects-board.ts';
  import { readBoard } from './projects-board-read.ts';

  let { list, entries }: { list: string; entries: readonly { seq?: unknown; id?: unknown; fields?: Record<string, unknown> }[] } = $props();

  const words = {
    inPlay: 'In play',
    views: 'Which projects',
    needs: 'Needs you',
    moving: 'Moving',
    quiet: 'Quiet',
    quietNote: 'Nothing in 7 days',
    pin: 'Pin',
    pinned: 'Pinned',
    noNext: 'No next step',
    due: (day: string) => `Due ${day}`,
    late: 'Late',
    side: 'What is coming up',
    week: 'This week',
    numbers: 'Quiet numbers',
    renewals: 'Renewals',
    more: (n: number) => `and ${n} more`,
  } as const;

  let board = $state.raw<Board | null>(null);
  let failed = $state(false);
  const said = $derived(`${list}:${entries.map((e) => String(e.seq)).join(',')}`);
  $effect(() => {
    const key = said;
    void live.version;
    untrack(() => {
      void readBoard(apiBase(), list, entries)
        .then((got) => {
          if (key !== said) return;
          board = got;
          failed = got === null;
        })
        .catch(() => (failed = true));
    });
  });

  const W = 88;
  const H = 28;
  const trail = (r: BoardRow) => (r.number.kind === 'kpi' ? trailOf(r.number.points, W, H) : null);
  const share = (minor: number, total: number) => `${Math.max(2, Math.round((minor / Math.max(1, total)) * 100))}%`;
  const sectionName = (s: BoardSection): string => (s.id === 'needs' ? words.needs : s.id === 'moving' ? words.moving : words.quiet);

  const sections = $derived(board ? sectionsOf(board.groups) : []);
  const inPlay = $derived(sections.reduce((n, s) => n + s.rows.length, 0));

  /* WHICH PROJECTS: in play, and the parked and finished a press away. A record with none in play opens on what it has. */
  type View = 'play' | 'parked' | 'finished';
  let picked = $state<View | null>(null);
  const views = $derived.by((): { id: View; label: string; n: number }[] => {
    const b = board;
    if (!b) return [];
    return [
      { id: 'play' as const, label: words.inPlay, n: inPlay },
      { id: 'parked' as const, label: b.said.parked, n: b.parked.length },
      { id: 'finished' as const, label: b.said.finished, n: b.closed.length },
    ].filter((v) => v.n > 0);
  });
  const view = $derived(picked !== null && views.some((v) => v.id === picked) ? picked : (views[0]?.id ?? 'play'));

  /* THE WAY INTO THE SIDEBAR, SAID WHILE NOTHING IS PINNED, beside the switch. */
  const showHint = $derived(navPrefs.pins.length === 0 && views.length > 0);

  /* WHO IS AT WORK ON IT NOW, by the project's name, as the sidebar's dot says it. */
  const busy = $derived(new Set(workingNow().map((w) => w.project).filter((p): p is string => typeof p === 'string')));

  /* A PROJECT'S VERBS AT THE POINTER: a right-click or a held thumb on it, or `⇧F10` (`ownMenu`). */
  let menuRow = $state<BoardRow | null>(null);
  let point = $state<{ x: number; y: number; height: number } | null>(null);
</script>

{#snippet pinButton(href: string, name: string, key?: string)}
  {@const on = isPinnedAt(href, key)}
  <button type="button" class="pin tap" aria-pressed={on} aria-label={on ? pinWords.unpinName(name) : pinWords.pinName(name)} title={on ? pinWords.unpin : pinWords.pin} onclick={() => void togglePin(href, name, key)}>
    <Icon name="pin" size="s" /><span>{on ? words.pinned : words.pin}</span>
  </button>
{/snippet}

{#snippet chipOf(r: BoardRow)}
  {#if r.chip}
    <p class="state" data-tone={r.chip.tone}>
      {#if r.chip.tone === 'plain'}<Icon name="calendar" size="s" />{:else}<span class="dot" aria-hidden="true"></span>{/if}<span>{r.due ? words.due(r.chip.text) : r.chip.text}</span>
    </p>
  {/if}
{/snippet}

{#snippet card(r: BoardRow)}
  {@const s = trail(r)}
    <div class="c-head">
      <ProjectWell mark={r.mark} name={r.name} hue={r.hue} />
      <div class="c-id">
        <a class="c-name own-dir" href={at(r.href)}>{r.name}</a>
        {#if r.laneWord || HEALTH[r.health]}
          <span class="small c-meta">{r.laneWord}{#if r.laneWord && HEALTH[r.health]}{' · '}{/if}{#if HEALTH[r.health]}<span class="c-health" data-tone={HEALTH[r.health]!.tone}><span class="dot" aria-hidden="true"></span>{HEALTH[r.health]!.word}</span>{/if}</span>
        {/if}
      </div>
      {@render pinButton(r.href, r.name, r.key)}
    </div>
    <div class="c-next">
      <p class="c-step own-dir" data-none={r.next === '' ? '' : undefined}>{r.next || words.noNext}</p>
      {@render chipOf(r)}
    </div>
    {#if r.number.kind === 'kpi'}
      <div class="c-num">
        <div class="n-words"><span class="n-fig num" data-stale={r.number.stale ? '' : undefined}>{r.number.figure}</span><span class="small own-dir">{r.number.sub}</span></div>
        {#if s}<svg class="trail" data-stale={r.number.stale ? '' : undefined} viewBox="0 0 {W} {H}" width={W} height={H} aria-hidden="true"><path d={s.area} class="sp-area" /><path d={s.line} class="sp-line" /><circle cx={s.end[0]} cy={s.end[1]} r="2.2" class="sp-end" /></svg>{/if}
      </div>
    {:else if r.number.kind === 'aim'}
      <div class="c-num"><div class="n-words"><span class="muted">{r.number.said}</span><span class="small">{r.number.sub}</span></div></div>
    {/if}
    <div class="c-foot">
      {#if r.work.agent}<AgentFace agent={r.work.agent} run="" live={busy.has(r.name) ? 'working' : 'stopped'} size="xs" />{/if}
      <span class="small own-dir">{r.work.said}{#if r.work.sub}{' · '}{r.work.sub}{/if}</span>
    </div>
{/snippet}

{#snippet quietRow(r: BoardRow)}
    <ProjectWell mark={r.mark} name={r.name} hue={r.hue} />
    <div class="l-words">
      <a class="c-name own-dir" href={at(r.href)}>{r.name}</a>
      <p class="small own-dir l-next">{r.next || words.noNext}</p>
    </div>
    {#if r.chip}<div class="l-state">{@render chipOf(r)}</div>{/if}
    {#if r.number.kind === 'kpi'}<span class="l-num num">{r.number.figure}</span>{/if}
    {@render pinButton(r.href, r.name, r.key)}
{/snippet}

{#snippet shelfRow(p: Parked)}
    <ProjectWell mark={p.mark} name={p.name} hue={p.hue} />
    <div class="l-words">
      <a class="c-name own-dir" href={at(p.href)}>{p.name}</a>
      {#if p.due}<p class="small l-next" data-warn="">{p.due}</p>{/if}
    </div>
    {@render pinButton(p.href, p.name)}
{/snippet}

{#if board}
  {@const b = board}
  <!-- THE BAR IS THE TOTAL'S: a month too old to be added (`left`) is said in the list and has no part of the bar. -->
  {@const earnTotal = b.earning.lines.filter((l) => !l.left).reduce((s, l) => s + l.minor, 0)}
  {@const hasSide = b.week.late.count + b.week.due.count + b.week.quiet.count + b.week.renewals.count > 0 || Boolean(b.earning.total)}
  <div class="projects-board">
    <h2 class="sr-only own-dir">{b.headline}</h2>

    {#if views.length > 1 || showHint}
      <div class="b-bar">
        {#if views.length > 1}
          <Segmented role="group" aria-label={words.views} full>
            {#each views as v (v.id)}
              <button type="button" class="segment" data-on={view === v.id ? '' : undefined} aria-pressed={view === v.id} onclick={() => (picked = v.id)}>{v.label} <span class="num seg-n">{v.n}</span></button>
            {/each}
          </Segmented>
        {/if}
        {#if showHint}<p class="b-pinhint small"><Icon name="pin" size="s" />{pinWords.hint}</p>{/if}
      </div>
    {/if}

    <div class="b-body" data-side={hasSide && view === 'play' ? '' : undefined}>
      <div class="b-main">
        {#if view === 'play'}
          {#each sections as sec (sec.id)}
            <section class="b-sec" aria-labelledby="sec-{sec.id}">
              <h3 class="b-sec-head" id="sec-{sec.id}" data-tone={sec.id}>{sectionName(sec)} <span class="num">{sec.rows.length}</span>{#if sec.id === 'quiet'}<span class="small b-sec-note">{words.quietNote}</span>{/if}</h3>
              {#if sec.id === 'quiet'}
                <ul class="lines">
                  {#each sec.rows as r (r.key)}
                    <li class="line" style={slotStyle(r.hue)} {@attach ownMenu((p) => ((menuRow = r), (point = p)))} in:arrive out:depart animate:flip={springy()}>{@render quietRow(r)}</li>
                  {/each}
                </ul>
              {:else}
                <ul class="cards">
                  {#each sec.rows as r (r.key)}
                    <li class="card" style={slotStyle(r.hue)} {@attach ownMenu((p) => ((menuRow = r), (point = p)))} in:arrive out:depart animate:flip={springy()}>{@render card(r)}</li>
                  {/each}
                </ul>
              {/if}
            </section>
          {/each}
        {:else}
          <!-- WITH NOTHING ELSE TO SWITCH TO THE SWITCH IS NOT DRAWN, so the list says what it is itself. -->
          {#if views.length === 1}<h3 class="b-sec-head">{views[0]!.label} <span class="num">{views[0]!.n}</span></h3>{/if}
          <ul class="lines">
            {#each view === 'parked' ? b.parked : b.closed as p (p.href)}
              <li class="line" style={slotStyle(p.hue)} in:arrive out:depart animate:flip={springy()}>{@render shelfRow(p)}</li>
            {/each}
          </ul>
        {/if}
      </div>

      {#if view === 'play' && hasSide}
        <aside class="b-side" aria-label={words.side}>
          {#if b.week.late.count > 0}{@render tile(words.late, 'clock', 'late', b.week.late, b.acts.late?.href ?? null)}{/if}
          {#if b.week.due.count > 0}{@render tile(words.week, 'calendar', 'plain', b.week.due, null)}{/if}
          {#if b.week.quiet.count > 0}{@render tile(words.numbers, 'activity', 'warn', b.week.quiet, b.acts.feed?.href ?? null)}{/if}
          {#if b.week.renewals.count > 0}{@render tile(words.renewals, 'globe', 'plain', b.week.renewals, null)}{/if}
          {#if b.earning.total}
            <section class="tile" aria-label={`${b.said.earning}, a month`}>
              <header class="t-head"><IconWell name="coins" size="m" /><h3 class="t-title">{b.said.earning}, a month</h3></header>
              <p class="e-total num">{b.earning.total}</p>
              {#if b.earning.year}<p class="small">{b.earning.year}</p>{/if}
              <div class="e-stack" aria-hidden="true">
                {#each b.earning.lines.filter((l) => !l.left) as l (l.name)}<i style={slotStyle(l.hue)} style:inline-size={share(l.minor, earnTotal)}></i>{/each}
              </div>
              <ul class="kv">
                {#each b.earning.lines as l (l.name)}
                  <li>
                    <a class="kv-k" href={at(l.href)}><span class="sw" style={slotStyle(l.hue)}></span><span class="kv-name own-dir">{l.name}</span></a>
                    <span class="kv-v num">{l.said}</span>
                    {#if l.status}<span class="small kv-status" data-warn={l.warn ? '' : undefined}>{l.status}</span>{/if}
                  </li>
                {/each}
              </ul>
              {#if b.earning.also}<p class="small">{b.earning.also}</p>{/if}
            </section>
          {/if}
        </aside>
      {/if}
    </div>
  </div>
{:else if !failed}
  <!-- `data-board-reading`: what stands under the board on the page waits unseen until it lands (`BlockSlot.svelte`). -->
  <div class="b-reading" data-board-reading><Waiting rows={4} /></div>
{/if}

<ItemMenu label={menuRow?.name ?? ''} bind:at={point} href={menuRow?.href} send={menuRow?.key ?? null}>
  {#if menuRow}
    {@const m = menuRow}
    {@const on = isPinnedAt(m.href, m.key)}
    <button role="menuitem" type="button" onclick={() => void togglePin(m.href, m.name, m.key)}><Icon name="pin" size="s" /><span class="mi-name">{on ? pinWords.unpin : pinWords.pin}</span></button>
  {/if}
</ItemMenu>

{#snippet tile(title: string, icon: 'clock' | 'calendar' | 'activity' | 'globe', tone: 'late' | 'warn' | 'plain', t: Board['week']['late'], moreHref: string | null)}
  <section class="tile" aria-label={title} data-tone={tone}>
    <header class="t-head"><IconWell name={icon} size="m" /><h3 class="t-title">{title} <span class="t-n num">{t.count}</span></h3></header>
    <ul class="wk-lines">
      {#each t.lines as l, n (n)}
        <li>{#if l.day}<b class="num">{l.day}</b>{/if}<a class="own-dir" href={at(l.href)}><span class="strong">{l.project}</span> · {l.text}</a></li>
      {/each}
    </ul>
    {#if t.more > 0}{#if moreHref}<a class="small wk-more" href={at(moreHref)}>{words.more(t.more)}</a>{:else}<p class="small wk-more">{words.more(t.more)}</p>{/if}{/if}
  </section>
{/snippet}

<style>
  .b-reading {
    display: contents;
  }

  .projects-board {
    display: grid;
    gap: var(--tile-gap);
    min-inline-size: 0;
  }

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* ── the line of controls ── */
  .b-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    min-inline-size: 0;
  }

  .seg-n {
    margin-inline-start: 2px;
    color: var(--ink-3);
    font-weight: var(--fw-regular);
  }

  /* ── the page's two columns: the projects, and beside them on a desk what falls due ── */
  .b-body,
  .b-main,
  .b-side {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--tile-gap);
    align-content: start;
    min-inline-size: 0;
  }

  .b-main {
    gap: var(--sp-5);
  }

  @container (width >= 940px) {
    .b-body[data-side] {
      grid-template-columns: minmax(0, 1fr) 320px;
      align-items: start;
    }
  }

  .b-pinhint {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .b-sec {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .b-sec-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-row);
    font-weight: var(--fw-semi);
    line-height: var(--lead-row);
  }

  .b-sec-head .num {
    color: var(--ink-3);
    font-weight: var(--fw-regular);
  }

  .b-sec-head[data-tone='needs'] .num {
    color: var(--red);
    font-weight: var(--fw-medium);
  }

  .b-sec-note {
    font-weight: var(--fw-regular);
  }

  /* ── a project as a card: the whole card opens it, the pin keeps its own press ── */
  .cards,
  .lines,
  .kv,
  .wk-lines {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: var(--tile-gap);
  }

  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
    box-sizing: border-box;
    padding: var(--tile-pad);
    border-radius: var(--r-tile);
    background: var(--tile);
    box-shadow: var(--shadow-card);
    color: var(--ink);
    transition:
      background-color var(--d-state) var(--ease-standard),
      box-shadow var(--d-state) var(--ease-standard);
  }

  @media (hover: hover) and (pointer: fine) {
    .card:hover {
      background: color-mix(in oklab, var(--ph) var(--wash-hover), var(--tile));
      box-shadow: var(--shadow-card-hover);
    }
  }

  .card:has(.c-name:focus-visible) {
    outline: 2px solid var(--focus, var(--ink));
    outline-offset: 2px;
  }

  .c-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .c-id {
    display: grid;
    flex: 1;
    min-inline-size: 0;
  }

  .c-name {
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-row);
    font-weight: var(--fw-semi);
    line-height: var(--lead-row);
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
    outline: none;
  }

  /* THE NAME IS THE LINK, AND IT REACHES THE WHOLE CARD OR ROW. The pin stands over it. */
  .c-name::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }

  /* HOW IT IS GOING, ONLY WHEN IT IS NOT ON TRACK: a dot and the word (as `ProjectCard` says it). */
  .c-health {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--warn);
    font-weight: var(--fw-medium);
  }

  .c-health[data-tone='off'] {
    color: var(--red);
  }

  .c-next {
    display: grid;
    gap: var(--sp-1);
  }

  .c-step {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 20px;
    text-wrap: pretty;
  }

  .c-step[data-none] {
    color: var(--ink-3);
  }

  /* WHAT IT IS WAITING ON: a dot and the words, never a pill (as `ProjectCard`'s "3 late"). */
  .state {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .state :global(.icon) {
    flex: none;
    color: var(--ink-3);
  }

  .state[data-tone='late'] {
    color: var(--red);
    font-weight: var(--fw-medium);
  }

  .state[data-tone='warn'] {
    color: var(--warn);
  }

  .dot {
    flex: none;
    inline-size: 7px;
    block-size: 7px;
    border-radius: var(--r-round);
    background: currentColor;
  }

  .c-num {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .n-words {
    display: grid;
    min-inline-size: 0;
  }

  .n-fig {
    color: var(--ink);
    font-size: var(--fs-figure);
    font-weight: var(--fw-semi);
    letter-spacing: -0.01em;
    line-height: var(--lead-figure);
  }

  .n-fig[data-stale] {
    color: var(--ink-3);
  }

  .trail {
    flex: none;
  }

  .sp-line {
    fill: none;
    stroke: var(--ph);
    stroke-width: 1.5;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .sp-area {
    fill: color-mix(in oklab, var(--ph) 12%, transparent);
  }

  .sp-end {
    fill: var(--ph-fill, var(--ph));
  }

  .trail[data-stale] .sp-line {
    stroke: var(--ink-3);
  }

  .trail[data-stale] .sp-end {
    fill: var(--ink-3);
  }

  .trail[data-stale] .sp-area {
    fill: color-mix(in oklab, var(--ink-3) 10%, transparent);
  }

  /* THE FOOT HOLDS ITS OWN AIR, 12 over its rule and 12 under (`ProjectCard`'s `pc-foot`), pinned to the card's end. */
  .c-foot {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin-block-start: auto;
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--sep);
  }

  /* ── the pin ── */
  .pin {
    position: relative;
    z-index: 1;
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: 28px;
    padding: 0 var(--sp-2);
    border: 0;
    border-radius: var(--r-ctl);
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  .pin[aria-pressed='true'] {
    background: var(--chosen);
    color: var(--ink);
  }

  .pin[aria-pressed='true'] :global(svg) {
    fill: currentColor;
  }

  @media (hover: hover) and (pointer: fine) {
    .pin:not([aria-pressed='true']):hover {
      background: var(--row-wash);
      color: var(--ink);
    }
  }

  /* ── a project as a row: Quiet, Parked and Finished, one tile, a wash under the pointer and no rules ── */
  .lines {
    display: grid;
    gap: var(--sp-0);
    padding: var(--sp-2);
    border-radius: var(--r-tile);
    background: var(--tile);
    box-shadow: var(--shadow-card);
  }

  .line {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-ctl);
  }

  @media (hover: hover) and (pointer: fine) {
    .line:hover {
      background: var(--row-wash);
    }
  }

  .line:has(.c-name:focus-visible) {
    outline: 2px solid var(--focus, var(--ink));
    outline-offset: -2px;
  }

  .l-words {
    display: grid;
    flex: 1;
    min-inline-size: 0;
  }

  .l-next {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .l-state {
    flex: none;
  }

  .l-num {
    flex: none;
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
  }

  @media (width < 640px) {
    .l-state {
      display: none;
    }
  }

  /* ── the tiles beside them ── */
  .tile {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding: var(--tile-pad);
    border-radius: var(--r-tile);
    background: var(--tile);
    box-shadow: var(--shadow-card);
    color: var(--ink);
  }

  .t-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--well, 28px);
  }

  .t-title {
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: 22px;
  }

  .t-n {
    margin-inline-start: 2px;
    color: var(--ink-3);
    font-weight: var(--fw-regular);
  }

  .tile[data-tone='late'] .t-n {
    color: var(--red);
    font-weight: var(--fw-medium);
  }

  .tile[data-tone='warn'] .t-n {
    color: var(--warn);
    font-weight: var(--fw-medium);
  }

  .small {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .small[data-warn] {
    color: var(--warn);
  }

  .muted {
    color: var(--ink-3);
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  .wk-lines {
    display: grid;
    gap: var(--sp-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .wk-lines li {
    display: flex;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .wk-lines b {
    flex: none;
    inline-size: 50px;
    color: var(--ink-3);
    font-weight: var(--fw-medium);
  }

  .wk-lines a {
    display: -webkit-box;
    overflow: hidden;
    min-inline-size: 0;
    color: var(--ink-2);
    text-decoration: none;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .wk-lines a:hover {
    color: var(--ink);
    text-decoration: underline;
  }

  a.wk-more {
    text-decoration: none;
  }

  a.wk-more:hover {
    color: var(--ink);
    text-decoration: underline;
  }

  .strong {
    color: var(--ink);
    font-weight: var(--fw-semi);
  }

  /* ── earning ── */
  .e-total {
    margin: 0;
    font-size: var(--fs-page);
    font-weight: var(--fw-semi);
    letter-spacing: -0.02em;
    line-height: var(--lead-page);
  }

  .e-total + .small {
    margin-block-start: calc(-1 * var(--sp-2));
  }

  .e-stack {
    display: flex;
    gap: 2px;
    block-size: 8px;
    overflow: hidden;
    border-radius: 4px;
  }

  .e-stack i,
  .sw {
    background: var(--ph-fill, var(--ph));
  }

  .e-stack i {
    display: block;
  }

  .kv {
    display: grid;
    gap: var(--sp-3);
  }

  .kv li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0 var(--sp-2);
    align-items: baseline;
  }

  .kv-k {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
    color: inherit;
    text-decoration: none;
  }

  .kv-k:hover .kv-name {
    text-decoration: underline;
  }

  .kv-status {
    grid-column: 1 / -1;
    padding-inline-start: calc(8px + var(--sp-2));
  }

  .sw {
    display: inline-block;
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    border-radius: 2px;
  }

  .kv-v {
    font-weight: var(--fw-semi);
    white-space: nowrap;
  }

  /* UNDER A THUMB EACH LINE IS A 44 ROW (mobile pass, 2 Nov): the whole row is the target, day and all. */
  @media (pointer: coarse) {
    .wk-lines {
      gap: 0;
    }

    .wk-lines li {
      position: relative;
      align-items: center;
      min-block-size: var(--tap);
    }

    .wk-lines a::before {
      content: '';
      position: absolute;
      inset: 0;
    }

    .kv-k {
      min-block-size: var(--tap);
      align-items: center;
    }
  }
</style>
