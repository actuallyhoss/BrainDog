<!--
  THE PROJECTS PAGE AS ONE BOARD (`projects-board.ts` works it out, `projects-board-read.ts` reads it): drawn in the slot
  of the page's block over every project (`key: board`, the Projects template).

  FROM THE TOP: the lead tile, the date line, a headline that is a fact naming the projects, what it counted, and the red
  button to the late work; beside it what the earning projects bring in a month, each with its own warning. Then this
  week's four tiles: late, due in seven days, numbers gone quiet, renewals. Then ONE LIST in three groups, earning, then
  building that is moving or due, then building and quiet, each row the project, its next step whole, one chip, the
  number it leads with and its line, and the last real work on it. Then the parked as a strip of chips that say only
  what is due, and the finished as a count.

  ON A PHONE the same sentence leads, the four tiles go two by two, each its figure and first line, and a row is its name and chip, its next step in two
  lines, and one small line of its number and its last work.

  While the reads are out the board draws the projects from the block's own rows, so the page never opens blank.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { pageButtons, take } from '$lib/page/page-buttons.svelte.ts';
  import { flip } from 'svelte/animate';
  import { arrive, depart, springy } from '$lib/motion/index.ts';
  import { apiBase, at } from '$lib/at.ts';
  import { live } from '$lib/data/live.svelte.ts';
  import AgentFace from '$lib/ui/AgentFace.svelte';
  import Button from '$lib/ui/Button.svelte';
  import ItemMenu from '$lib/ui/ItemMenu.svelte';
  import { ownMenu } from '$lib/ui/context-menu.ts';
  import IconWell from '$lib/ui/IconWell.svelte';
  import ProjectWell from '$lib/ui/ProjectWell.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import { slotStyle } from './project-cards.ts';
  import { trailOf, type Board, type BoardRow } from './projects-board.ts';
  import { readBoard } from './projects-board-read.ts';

  let { list, entries }: { list: string; entries: readonly { seq?: unknown; id?: unknown; fields?: Record<string, unknown> }[] } = $props();

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

  const W = 80;
  const H = 24;
  const trail = (r: BoardRow) => (r.number.kind === 'kpi' ? trailOf(r.number.points, W, H) : null);
  const share = (minor: number, total: number) => `${Math.max(2, Math.round((minor / Math.max(1, total)) * 100))}%`;

  /* A PROJECT'S VERBS AT THE POINTER: a right-click or a held thumb on its row, or `⇧F10` (`ownMenu`). */
  let menuRow = $state<BoardRow | null>(null);
  let point = $state<{ x: number; y: number; height: number } | null>(null);

  /* THE PAGE'S BUTTONS, lent to the lead tile's first row from 900px. */
  const lent = pageButtons();
</script>

{#if board}
  {@const b = board}
  <!-- THE BAR IS THE TOTAL'S: a month too old to be added (`left`) is said in the list and has no part of the bar. -->
  {@const earnTotal = b.earning.lines.filter((l) => !l.left).reduce((s, l) => s + l.minor, 0)}
  {@const weekInLead = b.week.due.count + b.week.renewals.count > 0 && Boolean(b.earning.total || b.earning.count > 0)}
  <div class="projects-board">
    <div class="b-top" data-solo={b.earning.total || b.earning.count > 0 ? undefined : ''}>
      <section class="b-lead" aria-label="Where the projects are">
        <!-- THE DAY, AND THE PAGE'S SHARE AND "⋯" AT ITS END from 900px, where the head held them on a row of their own
             (`page-buttons.svelte.ts`). -->
        <div class="b-date-row">
          <p class="b-date">{b.date}</p>
          {#if lent?.buttons}<div class="b-page-acts" {@attach take(lent)}>{@render lent.buttons()}</div>{/if}
        </div>
        <h2 class="b-head" dir="auto">{b.headline}</h2>
        {#if b.lede}<p class="b-lede" dir="auto">{b.lede}</p>{/if}
        {#if b.acts.late || b.acts.feed || b.acts.asks}
          <div class="b-acts">
            {#if b.acts.late}<Button weight="primary" href={b.acts.late.href}>{b.acts.late.said}</Button>{/if}
            {#if b.acts.feed}<Button href={b.acts.feed.href}>{b.acts.feed.said}</Button>{/if}
            {#if b.acts.asks}<a class="b-ask" href={at(b.acts.asks.href)} dir="auto">{b.acts.asks.said}</a>{/if}
          </div>
        {/if}
        <!-- THIS WEEK IN THE LEAD (the lists review, L30): beside the earning tile the lead stood 150px taller than its
             sentence, and the week's due work and renewals were tiles of their own under it. Where the earning tile stands
             beside it, the lead holds those two lists side by side, and the strip under it keeps late and quiet numbers. -->
        {#if weekInLead}
          <div class="b-lead-week">
            {#each [{ title: 'This week', t: b.week.due }, { title: 'Renewals', t: b.week.renewals }].filter((x) => x.t.count > 0) as x (x.title)}
              <div class="b-lead-list">
                <p class="b-lead-week-head"><span class="strong">{x.title}</span> <span class="num">{x.t.count}</span> {x.t.said}</p>
                <ul class="wk-lines">
                  {#each x.t.lines as l, n (n)}
                    <li>{#if l.day}<b class="num">{l.day}</b>{/if}<a href={at(l.href)} dir="auto"><span class="strong">{l.project}</span> · {l.text}</a></li>
                  {/each}
                </ul>
                {#if x.t.more > 0}<p class="small wk-more">and {x.t.more} more</p>{/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>
      <!-- NO EARNING TILE WHILE NOTHING EARNS AND NO PROJECT IS MARKED EARNING (AH17): "No project is earning yet" beside
           a shop's one new project was a founder's tile with nothing in it. -->
      {#if b.earning.total || b.earning.count > 0}
      <section class="b-earn" aria-label={`${b.said.earning}, a month`}>
        <header class="t-head"><IconWell name="coins" size="m" /><h2 class="t-title">{b.said.earning}, a month</h2>{#if b.earning.count > 0}<span class="t-meta">{b.earning.count} {b.earning.count === 1 ? 'project' : 'projects'}</span>{/if}</header>
        {#if b.earning.total}
          <p class="e-total num">{b.earning.total}</p>
          {#if b.earning.year}<p class="small">{b.earning.year}</p>{/if}
          <div class="e-stack" aria-hidden="true">
            {#each b.earning.lines.filter((l) => !l.left) as l (l.name)}<i style={slotStyle(l.hue)} style:inline-size={share(l.minor, earnTotal)}></i>{/each}
          </div>
          <ul class="kv">
            {#each b.earning.lines as l (l.name)}
              <li>
                <a class="kv-k" href={at(l.href)}><span class="sw" style={slotStyle(l.hue)}></span><span class="kv-name" dir="auto">{l.name}</span>{#if l.status}<span class="small" data-warn={l.warn ? '' : undefined}>· {l.status}</span>{/if}</a>
                <span class="kv-v num">{l.said}</span>
              </li>
            {/each}
          </ul>
          {#if b.earning.also}<p class="small">{b.earning.also}</p>{/if}
        {:else}
          <p class="e-empty">{b.earning.empty}</p>
        {/if}
      </section>
      {/if}
    </div>

    <!-- A WEEK TILE WITH NOTHING IN IT IS LEFT OUT, and the row with them when all four are (AH17): a shop with one project
         read Late 0, This week 0, Quiet numbers 0 and Renewals 0, a wall of noughts. -->
    {#if b.week.late.count + b.week.quiet.count + (weekInLead ? 0 : b.week.due.count + b.week.renewals.count) > 0}
      <div class="b-week" role="list" aria-label="This week" style:--wk-n={[b.week.late, weekInLead ? null : b.week.due, b.week.quiet, weekInLead ? null : b.week.renewals].filter((t) => t !== null && t.count > 0).length}>
        {#if b.week.late.count > 0}{@render week('Late', 'clock', 'late', b.week.late)}{/if}
        {#if b.week.due.count > 0 && !weekInLead}{@render week('This week', 'calendar', 'plain', b.week.due)}{/if}
        {#if b.week.quiet.count > 0}{@render week('Quiet numbers', 'activity', 'warn', b.week.quiet)}{/if}
        {#if b.week.renewals.count > 0 && !weekInLead}{@render week('Renewals', 'globe', 'plain', b.week.renewals)}{/if}
      </div>
    {/if}

    {#if b.groups.length > 0}
      <section class="b-list" aria-label="Projects in play">
        <div class="r-head" aria-hidden="true"><span>Project</span><span>Next step</span><span>Needs</span><span>Number</span><span>Last work</span></div>
        {#each b.groups as g (g.id)}
          <h3 class="g-head">{g.name} <span>{g.said}</span></h3>
          <ul class="rows">
            {#each g.rows as r (r.key)}
              {@const s = trail(r)}
              <li class="row" data-quiet={g.id === 'quiet' ? '' : undefined} {@attach ownMenu((p) => ((menuRow = r), (point = p)))} in:arrive out:depart animate:flip={springy()}>
                <a class="r-name" href={at(r.href)}><ProjectWell mark={r.mark} name={r.name} hue={r.hue} /><span class="r-title" dir="auto">{r.name}</span></a>
                <p class="r-next" dir="auto" data-none={r.next === '' ? '' : undefined}>{r.next || 'No next step'}</p>
                <div class="r-chip">{#if r.chip}<span class="chip" data-tone={r.chip.tone}>{#if r.chip.tone === 'late'}<span class="dot"></span>{/if}{r.chip.text}</span>{/if}</div>
                <div class="r-num" style={slotStyle(r.hue)}>
                  {#if r.number.kind === 'kpi'}
                    <div class="n-words"><span class="n-fig num" data-stale={r.number.stale ? '' : undefined}>{r.number.figure}</span><span class="small" dir="auto">{r.number.sub}</span></div>
                    {#if s}<svg class="trail" data-stale={r.number.stale ? '' : undefined} viewBox="0 0 {W} {H}" width={W} height={H} aria-hidden="true"><path d={s.area} class="sp-area" /><path d={s.line} class="sp-line" /><circle cx={s.end[0]} cy={s.end[1]} r="2.2" class="sp-end" /></svg>{/if}
                  {:else if r.number.kind === 'aim'}
                    <div class="n-words"><span class="muted">{r.number.said}</span><span class="small">{r.number.sub}</span></div>
                  {:else}
                    <span class="muted" title={r.number.said} aria-label={r.number.said}>–</span>
                  {/if}
                </div>
                <div class="r-work">
                  {#if r.work.none}<span class="muted" title={r.work.said} aria-label={r.work.said}>–</span>{:else}
                    {#if r.work.agent}<AgentFace agent={r.work.agent} run="" live="stopped" size="xs" />{:else}<span class="face-none" aria-hidden="true">–</span>{/if}
                    <span class="w-words"><span>{r.work.said}</span>{#if r.work.sub}<span class="small">{r.work.sub}</span>{/if}</span>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
        {/each}
      </section>
    {/if}

    {#if b.parked.length > 0 || b.finished.count > 0}
      <section class="b-parked" aria-label={`${b.said.parked} and ${b.said.finished.toLowerCase()}`}>
        <header class="t-head">
          <IconWell name="archive" size="m" /><h2 class="t-title">{b.said.parked} <span class="t-count num">{b.parked.length}</span></h2>
          {#if b.finished.count > 0}<span class="t-meta" title={b.finished.names.join(', ')}>{b.said.finished} {b.finished.count} · {b.finished.names.slice(0, 3).join(', ')}{b.finished.count > 3 ? ` and ${b.finished.count - 3} more` : ''}</span>{/if}
        </header>
        {#if b.parked.length > 0}
          <ul class="chips">
            {#each b.parked as p (p.href)}
              <li in:arrive out:depart animate:flip={springy()}><a class="pchip" href={at(p.href)}><ProjectWell mark={p.mark} name={p.name} hue={p.hue} /><span dir="auto">{p.name}</span>{#if p.due}<span class="small" data-warn="">{p.due}</span>{/if}</a></li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  </div>
{:else if !failed}
  <Waiting rows={4} />
{/if}

<ItemMenu label={menuRow?.name ?? ''} bind:at={point} href={menuRow?.href} send={menuRow?.key ?? null} />

{#snippet week(title: string, icon: 'clock' | 'calendar' | 'activity' | 'globe', tone: 'late' | 'warn' | 'plain', t: Board['week']['late'])}
  <!-- A DIV IN THE LIST'S ROLE, never a section, which axe refuses a listitem role on (Q60 of 29 October). -->
  <div class="wk" role="listitem" aria-label={title} data-tone={t.count > 0 ? tone : undefined}>
    <header class="t-head"><IconWell name={icon} size="m" /><h3 class="t-title">{title}</h3></header>
    <p class="wk-fig num">{t.count}<span>{t.said}</span></p>
    {#if t.lines.length > 0}
      <ul class="wk-lines">
        {#each t.lines as l, n (n)}
          <li>{#if l.day}<b class="num">{l.day}</b>{/if}<a href={at(l.href)} dir="auto"><span class="strong">{l.project}</span> · {l.text}</a></li>
        {/each}
      </ul>
      {#if t.more > 0}<p class="small wk-more">and {t.more} more</p>{/if}
    {/if}
  </div>
{/snippet}

<style>
  .projects-board {
    display: grid;
    gap: var(--inset, 12px);
    min-inline-size: 0;
  }

  .b-date-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .b-page-acts {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-2);
    margin-block: calc(-1 * var(--sp-1));
  }

  .b-page-acts :global(:is(.btn[data-weight='quiet'], .share-trigger)) {
    background: var(--tile-2);
  }

  .b-lead,
  .b-earn,
  .wk,
  .b-list,
  .b-parked {
    min-inline-size: 0;
    padding: var(--tile-pad, 20px);
    border-radius: var(--r-tile, 16px);
    background: var(--tile);
    color: var(--ink);
  }

  .b-top {
    display: grid;
    gap: var(--inset, 12px);
    grid-template-columns: minmax(0, 1fr);
  }

  @media (width >= 1000px) {
    .b-top {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    }

    .b-top[data-solo] {
      grid-template-columns: minmax(0, 1fr);
    }

    .b-lead,
    .b-earn {
      padding: var(--sp-5, 24px);
    }
  }

  .b-date {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .b-head {
    margin: 10px 0 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-page);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 30px;
    text-wrap: pretty;
  }

  @media (width >= 640px) {
    .b-head {
      font-size: var(--fs-hero);
      line-height: 40px;
    }
  }

  .b-lede {
    max-inline-size: 64ch;
    margin: 12px 0 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .b-acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-block-start: 18px;
  }

  .b-lead-week {
    display: grid;
    gap: 16px 24px;
    margin-block-start: 20px;
    padding-block-start: 14px;
    border-block-start: 1px solid var(--rule);
  }

  @media (width >= 640px) {
    .b-lead-week {
      grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    }
  }

  .b-lead-list {
    display: grid;
    align-content: start;
    gap: 8px;
    min-inline-size: 0;
  }

  .b-lead-week-head {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .b-lead-week .wk-lines a {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .b-ask {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    text-decoration: none;
  }

  .b-ask:hover {
    color: var(--ink);
    text-decoration: underline;
  }

  /* ── a tile's head, as `Tile` draws it ── */
  .t-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2, 8px) var(--sp-3, 12px);
    min-block-size: var(--well, 28px);
  }

  /* A WEEK TILE'S NAME STAYS BY ITS WELL AND WRAPS THERE: two to a row on a phone, "Quiet numbers" dropped under it. */
  .wk .t-head {
    flex-wrap: nowrap;
  }

  .t-title {
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi, 600);
    line-height: 22px;
  }

  .t-count {
    margin-inline-start: 4px;
    color: var(--ink-3);
    font-weight: 500;
  }

  .t-meta {
    margin-inline-start: auto;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .small {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
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

  /* ── earning ── */
  .e-total {
    margin: 12px 0 0;
    font-family: var(--font-display);
    font-size: var(--fs-hero);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 44px;
  }

  .e-stack {
    display: flex;
    gap: 2px;
    block-size: 10px;
    margin-block: 12px;
    overflow: hidden;
    border-radius: 5px;
  }

  .e-stack i,
  .sw {
    background: var(--ph);
  }

  .e-stack i {
    display: block;
  }

  .e-empty {
    margin: 12px 0 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .kv {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .kv li {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding-block: 9px;
    border-block-start: 1px solid var(--rule);
  }

  .kv li:first-child {
    border-block-start: 0;
  }

  .kv-k {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 6px;
    min-inline-size: 0;
    color: inherit;
    text-decoration: none;
  }

  .kv-k:hover .kv-name {
    text-decoration: underline;
  }

  .sw {
    display: inline-block;
    inline-size: 8px;
    block-size: 8px;
    border-radius: 2px;
  }

  .kv-v {
    font-weight: 600;
    white-space: nowrap;
  }

  /* ── this week ── */
  .b-week {
    display: grid;
    gap: var(--inset, 12px);
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (width >= 1000px) {
    .b-week {
      grid-template-columns: repeat(var(--wk-n, 4), minmax(0, 1fr));
    }
  }

  .wk {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .wk-fig {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 8px;
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--fs-page);
    font-weight: 600;
    line-height: 32px;
  }

  .wk-fig span {
    color: var(--ink-3);
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: 18px;
  }

  .wk[data-tone='late'] .wk-fig {
    color: var(--red);
  }

  .wk-lines {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .wk-lines li {
    display: flex;
    gap: 8px;
    min-inline-size: 0;
  }

  .wk-lines b {
    flex: none;
    inline-size: 50px;
    color: var(--ink-3);
    font-weight: 500;
  }

  .wk-lines a {
    min-inline-size: 0;
    color: var(--ink-2);
    text-decoration: none;
  }

  .wk-lines a:hover {
    color: var(--ink);
    text-decoration: underline;
  }

  .strong {
    color: var(--ink);
    font-weight: 600;
  }

  /* ON A PHONE A TILE IS ITS FIGURE AND ITS FIRST LINE, the day over the words in two lines at most; the figure says how
     many, so "and N more" is left to the desk. */
  @media (width < 640px) {
    .wk .wk-lines li:nth-child(n + 2),
    .wk .wk-more {
      display: none;
    }

    .wk .wk-lines li {
      flex-direction: column;
      gap: 0;
    }

    .wk .wk-lines b {
      inline-size: auto;
    }

    .wk .wk-lines a {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }
  }

  /* ── the list ── */
  .r-head,
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 4px 16px;
  }

  .r-head {
    display: none;
    padding-block-end: 8px;
    color: var(--ink-3);
    font-size: var(--fs-cap, 12px);
    line-height: 16px;
  }

  @media (width >= 1000px) {
    .r-head,
    .row {
      /* NEXT STEP LESS, THE NUMBER AND THE LAST WORK MORE (the lists review, L31): "Up 19% since 25 Oct" broke over three
         lines in 190px and "Tasks changed 5 min ago" over two, beside a next step with room to spare. */
      grid-template-columns: 170px minmax(0, 1.2fr) 112px minmax(0, 1fr) minmax(0, 0.8fr);
      align-items: start;
    }

    .r-head {
      display: grid;
    }
  }

  .g-head {
    display: flex;
    gap: 8px;
    align-items: baseline;
    margin: 18px 0 4px;
    font-size: var(--fs-meta);
    font-weight: 600;
    line-height: 18px;
  }

  .g-head:first-of-type {
    margin-block-start: 4px;
  }

  .g-head span {
    color: var(--ink-3);
    font-weight: 500;
  }

  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    padding-block: 12px;
    border-block-start: 1px solid var(--rule);
  }

  .row[data-quiet] {
    padding-block: 9px;
  }

  .r-name {
    display: flex;
    align-items: center;
    gap: 10px;
    min-inline-size: 0;
    color: var(--ink);
    font-weight: 600;
    text-decoration: none;
  }

  .r-name:hover .r-title {
    text-decoration: underline;
  }

  .r-title {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .r-next {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  .r-next[data-none] {
    color: var(--ink-3);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    block-size: 22px;
    padding: 0 8px;
    border-radius: 7px;
    background: var(--tile-2, var(--hover));
    color: var(--ink-2);
    font-size: var(--fs-cap, 12px);
    font-weight: 500;
    white-space: nowrap;
  }

  .chip[data-tone='late'] {
    background: var(--red-tint);
    color: var(--red);
  }

  .chip[data-tone='warn'] {
    background: var(--warn-tint, var(--cat-yellow-tint));
    color: var(--warn);
  }

  .dot {
    inline-size: 7px;
    block-size: 7px;
    border-radius: 50%;
    background: currentColor;
  }

  .r-num {
    display: flex;
    align-items: center;
    gap: 10px;
    min-inline-size: 0;
  }

  .n-words {
    display: grid;
    min-inline-size: 0;
  }

  .n-fig {
    font-family: var(--font-display);
    font-size: var(--fs-figure);
    font-weight: 600;
    line-height: 26px;
  }

  .n-fig[data-stale] {
    color: var(--ink-2);
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
    fill: var(--ph);
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

  .r-work {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-inline-size: 0;
    font-size: var(--fs-body);
    line-height: 20px;
  }

  .face-none {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: 20px;
    block-size: 20px;
    border-radius: 50%;
    background: var(--tile-2, var(--hover));
    color: var(--ink-3);
    font-size: var(--fs-cap);
  }

  .w-words {
    display: grid;
    min-inline-size: 0;
  }

  /* ON A PHONE: name and chip on one line, the next step in two, and one small line for the number and the work. */
  @media (width < 1000px) {
    .row {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: 'name chip' 'next next' 'num work';
      align-items: center;
    }

    .r-name {
      grid-area: name;
    }

    .r-chip {
      grid-area: chip;
    }

    .r-next {
      grid-area: next;
      display: -webkit-box;
      overflow: hidden;
      padding-inline-start: 34px;
      font-size: var(--fs-meta);
      line-height: 18px;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }

    .r-num {
      grid-area: num;
      padding-inline-start: 34px;
    }

    .r-work {
      grid-area: work;
      justify-self: end;
      font-size: var(--fs-meta);
      line-height: 18px;
    }

    .n-fig {
      font-size: var(--fs-body);
      line-height: 20px;
    }

    .r-num .small,
    .r-work .small,
    .r-num .muted,
    .face-none,
    .r-work :global(.agent-face) {
      display: none;
    }

    .r-num .n-words .small {
      display: none;
    }
  }

  /* ── parked and finished ── */
  .b-parked {
    display: grid;
    gap: 14px;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pchip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-block-size: 36px;
    padding: 0 12px 0 4px;
    border-radius: 10px;
    background: var(--tile-2, var(--hover));
    color: var(--ink);
    font-size: var(--fs-meta);
    text-decoration: none;
  }

  .pchip:hover {
    background: var(--hover);
  }

  .pchip :global(.icon-well) {
    transform: scale(0.85);
  }
</style>
