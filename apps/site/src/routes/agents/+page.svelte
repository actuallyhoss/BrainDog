<!--
  For agents and services.

  REBUILT ON 29 SEPTEMBER IN THE SITE'S NEW LOOK (the design system):
  every band is Bento tiles on the ground, and the tiles carry the product at work rather than prose about it.

    lead       the answer, the one action, and agents at work leaving what they found for the next one's briefing.
    connect    the address, then the terminal, beside the lead: the way in is on the first screen.
    value      what an agent gives and what it gets back, as two lists with icon wells; a key and the skill beside.
    tools      the sixteen tools split into reads and writes, drawn as the record between two lanes, and the addresses.
    outside    the three ways in from outside, charted by how much each can do, then one tile each with its limits.
    cannot     what only a person can do.

  IT COUNTS THINGS, AND THAT IS THE POINT OF IT. The rule that a figure must not be counted at a stranger is a rule about
  a stranger. A reader who opens a page called For agents has asked. Every figure here is read off a declaration, and
  the file it came from is in the comment beside its copy (`lib/copy/agents.ts`).

  THE CHARTS ARE DRAWN FROM THE COPY'S OWN LISTS: the split is the lengths of `reads` and `writes`, which
  `test/content.test.ts` holds to `packages/mcp`, and the reach chart is the order the ways are listed in.
-->
<script lang="ts">
  import AgentMark from '$lib/AgentMark.svelte';
  import { markedOf } from '$lib/agent-marks.ts';
  import Icon from '$lib/Icon.svelte';
  import Mark from '$lib/Mark.svelte';
  import type { IconName } from '$lib/icons.ts';
  import { SIGNUP, SKILL, SOURCE, site } from '$lib/copy.ts';
  import Code from './Code.svelte';

  const a = site.agents;
  const v = a.value;
  const m = a.mcp;

  /* One glyph per line of the two lists, in their order: people, keys, servers, handoff, learned, the work; then the
     briefing, the project's context, skills, keys on a grant and the agent's own page. */
  const GIVES: readonly IconName[] = ['person', 'key', 'server', 'file', 'book', 'work'];
  const GETS: readonly IconName[] = ['message', 'projects', 'zap', 'lock', 'agent'];
  const BRIEF: readonly IconName[] = ['work', 'decide', 'people', 'key', 'book'];
  const WAYS: readonly IconName[] = ['inbox', 'upload', 'key'];
  const CANNOT: readonly IconName[] = ['decide', 'people', 'lock'];

  /* THE SPLIT, one cell a tool: the reads in grey and the writes in ink, the one series that carries a name. */
  const total = m.reads.length + m.writes.length;
  const CELL = 20;
  const GAP = 4;
  const splitWidth = total * CELL + (total - 1) * GAP;
</script>

<svelte:head>
  <title>{site.meta.agents.title}</title>
  <meta name="description" content={site.meta.agents.description} />
  <link rel="canonical" href="https://brain.dog/agents" />
  <meta property="og:url" content="https://brain.dog/agents" />
  <meta property="og:title" content={site.meta.agents.title} />
  <meta property="og:description" content={site.meta.agents.description} />
</svelte:head>

<!-- ── The answer and the way in ──────────────────────────────────────────────── -->
<section class="band" aria-labelledby="agents-h1">
  <div class="in">
    <div class="tiles">
      <div class="tile lead span-7">
        <h1 class="h2" id="agents-h1">{a.title}</h1>
        <p class="lede">{a.lead}</p>
        <p class="actions">
          <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{site.nav.start}<Icon name="arrow" size="m" /></a>
        </p>

        <!-- THE SCENE: agents at work leave what they found, and the next one starts with a briefing. One labelled
             picture, because it repeats the lists' words further down. -->
        <figure class="scene" role="img" aria-label={v.drawn.label}>
          <ul class="crew">
            {#each v.drawn.crew as one (one.name)}
              {@const m = markedOf(one.name)}
              <li class="worker">
                <span class="face" data-marked={m ? '' : undefined}>{#if m}<AgentMark agent={m} />{:else}{one.face}{/if}</span>
                <span class="worker-text">
                  <span class="who">{one.name}</span>
                  <span class="did">{one.did}</span>
                </span>
              </li>
            {/each}
          </ul>
          <svg class="into" viewBox="0 0 48 120" preserveAspectRatio="none" aria-hidden="true">
            <path class="into-line" d="M2 20 C 26 20, 22 60, 46 60 M2 60 H 46 M2 100 C 26 100, 22 60, 46 60" />
          </svg>
          <div class="brief">
            <p class="brief-head"><span class="brief-title">{v.drawn.briefing.title}</span> <span class="brief-for">{v.drawn.briefing.for}</span></p>
            <dl class="brief-rows">
              {#each v.drawn.briefing.rows as row, i (row.what)}
                <div class="brief-row">
                  <dt><Icon name={BRIEF[i] ?? 'check'} size="s" />{row.what}</dt>
                  <dd>{row.said}</dd>
                </div>
              {/each}
            </dl>
          </div>
        </figure>
        <p class="reading">{v.drawn.label}</p>
      </div>

      <!-- THE ORDER THE APP TEACHES: the address, which signs in through the app; then the terminal. -->
      <section class="tile lead span-5" aria-labelledby="connect-title">
        <header class="tile-head">
          <span class="well"><Icon name="plug" /></span>
          <h2 class="tile-title" id="connect-title">{a.connect.title}</h2>
        </header>
        {#each a.connect.ways as w, i (w.head)}
          <div class="way" class:rule={i > 0}>
            <h3 class="h3">{w.head}</h3>
            <p class="said">{w.said}</p>
            {#each w.lines as line (line.code)}
              <Code label={line.label} code={line.code} />
            {/each}
          </div>
        {/each}
      </section>
    </div>
  </div>
</section>

<!-- ── What an agent gives, and what it gets back ─────────────────────────────── -->
<section class="band" aria-labelledby="value-title">
  <div class="in">
    <div class="tiles">
      <div class="tile lead span-7">
        <h2 class="h2" id="value-title">{v.title}</h2>
        <p class="lede">{v.lead}</p>
        <div class="trade">
          <div>
            <h3 class="list-head">{v.givesTitle}</h3>
            <ul class="plain">
              {#each v.gives as one, i (one.what)}
                <li><span class="well"><Icon name={GIVES[i] ?? 'check'} /></span><span><strong>{one.what}</strong>, {one.said}</span></li>
              {/each}
            </ul>
          </div>
          <div>
            <h3 class="list-head">{v.getsTitle}</h3>
            <ul class="plain">
              {#each v.gets as one, i (one.what)}
                <li><span class="well"><Icon name={GETS[i] ?? 'check'} /></span><span><strong>{one.what}</strong>, {one.said}</span></li>
              {/each}
            </ul>
          </div>
        </div>
      </div>

      <div class="stack span-5">
        <section class="tile lead" aria-labelledby="key-title">
          <header class="tile-head">
            <span class="well"><Icon name="key" /></span>
            <h2 class="tile-title" id="key-title">{a.connect.key.title}</h2>
          </header>
          <p class="said">{a.connect.key.said}</p>
          {#each a.connect.key.clients as client (client.name)}
            <Code label={client.name} code={client.code} />
          {/each}
        </section>

        <section class="tile lead" aria-labelledby="skill-title">
          <header class="tile-head">
            <span class="well"><Icon name="book" /></span>
            <h2 class="tile-title" id="skill-title">{a.connect.skill.title}</h2>
          </header>
          <p class="said">{a.connect.skill.said}</p>
          <p class="meta">{a.connect.skill.where}</p>
          <p><a class="btn" href={SKILL}>{a.connect.skill.open}<Icon name="arrow" size="m" /></a></p>
        </section>
      </div>
    </div>
  </div>
</section>

<!-- ── The tools ───────────────────────────────────────────────────────────────
     THE DRAWING IS ONE `<figure>` AND THE LISTS INSIDE IT ARE STILL LISTS: the writes arriving on one side of the
     record, the reads leaving on the other, and the addresses a client fills in under it. -->
<section class="band" aria-labelledby="mcp-title">
  <div class="in">
    <div class="tiles">
      <div class="tile lead span-12">
        <div class="tools-head">
          <div class="tools-say">
            <h2 class="h2" id="mcp-title">{m.title}</h2>
            <p class="lede">{m.lead}</p>
          </div>

          <div class="split">
            <svg class="split-bar" viewBox="0 0 {splitWidth} {CELL}" role="img" aria-label="{m.readsTitle} {m.reads.length}, {m.writesTitle} {m.writes.length}">
              {#each { length: total } as _, i (i)}
                <rect class={i < m.reads.length ? 'cell-read' : 'cell-write'} x={i * (CELL + GAP)} y="0" width={CELL} height={CELL} rx="3" />
              {/each}
            </svg>
            <p class="split-labels">
              <span style="flex-grow: {m.reads.length}"><b class="num">{m.reads.length}</b> {m.readsTitle}</span>
              <span style="flex-grow: {m.writes.length}"><b class="num">{m.writes.length}</b> {m.writesTitle}</span>
            </p>
            <p class="reading">{m.reading}</p>
          </div>
        </div>

        <figure class="reach" aria-labelledby="mcp-title">
          <div class="lane">
            <h3 class="lane-head"><span class="dot write" aria-hidden="true"></span>{m.writesTitle}</h3>
            <ul class="tools">
              {#each m.writes as name (name)}<li><code class="tool">{name}</code></li>{/each}
            </ul>
          </div>

          <span class="flow" aria-hidden="true"><Icon name="arrow-right" size="l" /></span>

          <!-- THE RECORD IS THE MARK AND NO WORD: the lanes' headings already say what goes in and what comes out. -->
          <div class="core" aria-hidden="true"><Mark height={40} /></div>

          <span class="flow" aria-hidden="true"><Icon name="arrow-right" size="l" /></span>

          <div class="lane">
            <h3 class="lane-head"><span class="dot read" aria-hidden="true"></span>{m.readsTitle}</h3>
            <ul class="tools">
              {#each m.reads as name (name)}<li><code class="tool">{name}</code></li>{/each}
            </ul>
          </div>
        </figure>

        <div class="addresses">
          <h3 class="tile-head"><span class="well"><Icon name="link" /></span><span class="tile-title">{m.resourcesTitle}</span></h3>
          <dl class="addr">
            {#each m.resources as one (one.uri)}
              <div class="addr-cell">
                <dt><code>{one.uri}</code></dt>
                <dd>{one.said}</dd>
              </div>
            {/each}
          </dl>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── From outside ────────────────────────────────────────────────────────────
     THE THREE WAYS IN, charted by how much each can do, then one tile each: what it is, its one curl line and its
     limits, each limit leading and the sentence under it the reason. -->
<section class="band" aria-labelledby="outside-title">
  <div class="in">
    <div class="tiles">
      <div class="tile lead span-12 outside-head">
        <div>
          <h2 class="h2" id="outside-title">{a.outside.title}</h2>
          <p class="lede">{a.outside.lead}</p>
        </div>
        <div class="reach-chart">
          <!-- The picture is the wrapper, because a list cannot take the `img` role and keep its items. -->
          <div role="img" aria-label={a.outside.order}>
            <ol class="ladder">
              {#each a.outside.ways as way, i (way.head)}
                <li class="rung">
                  <span class="rung-name">{way.head}</span>
                  <span class="segs">
                    {#each a.outside.reach as step, s (step)}
                      <span class="seg" class:on={s <= i} title={step}></span>
                    {/each}
                  </span>
                  <span class="rung-step">{a.outside.reach[i]}</span>
                </li>
              {/each}
            </ol>
          </div>
          <p class="reading">{a.outside.order}</p>
        </div>
      </div>

      {#each a.outside.ways as way, i (way.head)}
        <!-- AN `article`, NOT A `section`: each tile's code block is a region named by the same words, so a
             labelled section here was a second landmark with that name. -->
        <article class="tile span-4 way-tile" aria-labelledby="way-{i}">
          <header class="tile-head">
            <span class="well"><Icon name={WAYS[i] ?? 'plug'} /></span>
            <h3 class="tile-title" id="way-{i}">{way.head}</h3>
          </header>
          <p class="said">{way.said}</p>
          <Code label={way.head} code={way.code} />
          <dl class="limits">
            {#each way.limits as limit (limit.what)}
              <div class="limit">
                <dt><Icon name="check" size="m" />{limit.what}</dt>
                <dd>{limit.said}</dd>
              </div>
            {/each}
          </dl>
        </article>
      {/each}
    </div>
  </div>
</section>

<!-- ── What only a person can do ───────────────────────────────────────────── -->
<section class="band" aria-labelledby="cannot-title">
  <div class="in">
    <div class="tiles">
      <div class="tile lead span-12 cannot">
        <div class="cannot-say">
          <h2 class="h2" id="cannot-title">{a.cannot.title}</h2>
          <p class="lede">{a.cannot.lead}</p>
          <p class="actions">
            <a class="btn btn-lg" href={SIGNUP} rel="external">{site.nav.start}<Icon name="arrow" size="m" /></a>
            {#if SOURCE}<a class="onward" href={SOURCE} rel="external"><Icon name="code" size="m" />{site.nav.source}</a>{/if}
          </p>
        </div>
        <dl class="rows">
          {#each a.cannot.rows as one, i (one.what)}
            <div class="row">
              <dt><span class="well l"><Icon name={CANNOT[i] ?? 'lock'} /></span>{one.what}</dt>
              <dd>{one.said}</dd>
            </div>
          {/each}
        </dl>
      </div>
    </div>
  </div>
</section>

<style>
  p {
    margin: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3) var(--sp-4);
  }

  .said {
    color: var(--ink2);
    font-size: var(--t-site-body);
    line-height: var(--lh-site-body);
    text-wrap: pretty;
  }

  /* ── The scene ───────────────────────────────────────────────────────── */

  .scene {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 48px minmax(0, 1.15fr);
    align-items: center;
    margin: var(--sp-2) 0 0;
    padding: var(--sp-4);
    background: var(--s1);
    border-radius: var(--r-md);
  }

  .crew {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .worker {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--bg);
    border-radius: var(--r-md);
  }

  /* An agent's face is a circle (the design system): its maker's mark on a plain disc, or its initials in the second ink. */
  .face {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    background: var(--ink2);
    border-radius: var(--r-pill);
    color: var(--on-ink);
    font-size: var(--t-xs);
    font-weight: 600;
  }

  .face[data-marked] {
    background: var(--bg);
    box-shadow: inset 0 0 0 1px var(--line);
    color: var(--ink);
  }

  .worker-text {
    display: grid;
    min-inline-size: 0;
  }

  .who {
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 600;
  }

  .did {
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
  }

  .into {
    display: block;
    inline-size: 48px;
    block-size: 120px;
  }

  .into-line {
    fill: none;
    stroke: var(--edge);
    stroke-width: 1.5;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }

  .brief {
    display: grid;
    gap: var(--sp-2);
    padding: 12px 14px;
    background: var(--bg);
    border-radius: var(--r-md);
  }

  .brief-head {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .brief-title {
    color: var(--ink);
    font-weight: 600;
  }

  .brief-rows {
    display: grid;
    gap: 6px;
    margin: 0;
  }

  .brief-row {
    display: grid;
    grid-template-columns: 7.5em minmax(0, 1fr);
    gap: var(--sp-2);
    align-items: baseline;
  }

  .brief-row dt {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .brief-row dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-sm);
  }

  /* ── Connect ─────────────────────────────────────────────────────────── */

  .way {
    display: grid;
    gap: var(--sp-3);
  }

  .way.rule {
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
  }

  /* ── Value ───────────────────────────────────────────────────────────── */

  .trade {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-5);
  }

  .list-head {
    margin: 0 0 var(--sp-3);
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 600;
  }

  .plain {
    display: grid;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .plain li {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-site-small);
    line-height: 20px;
  }

  .plain strong {
    color: var(--ink);
    font-weight: 600;
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--inset);
  }

  /* ── The tools ───────────────────────────────────────────────────────── */

  .tools-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--sp-6);
    align-items: end;
  }

  .tools-say {
    display: grid;
    gap: var(--sp-4);
  }

  .split {
    display: grid;
    gap: var(--sp-2);
  }

  .split-bar {
    display: block;
    inline-size: 100%;
    block-size: auto;
  }

  .cell-read {
    fill: var(--edge);
  }

  .cell-write {
    fill: var(--ink);
  }

  .split-labels {
    display: flex;
    gap: 4px;
    color: var(--ink2);
    font-size: var(--t-site-small);
  }

  .split-labels span {
    flex-basis: 0;
  }

  .split-labels b {
    color: var(--ink);
    font-weight: 600;
  }

  .reach {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto auto minmax(0, 1fr);
    align-items: center;
    gap: var(--sp-4);
    margin: 0;
    padding: var(--sp-5);
    background: var(--s1);
    border-radius: var(--r-md);
  }

  .lane-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-3);
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 600;
  }

  .dot {
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--r-pill);
  }

  .dot.write {
    background: var(--ink);
  }

  .dot.read {
    background: var(--edge);
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tool {
    display: inline-flex;
    align-items: center;
    min-block-size: 28px;
    padding-inline: 10px;
    background: var(--bg);
    border-radius: var(--r-sm);
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  .flow {
    color: var(--dim);
  }

  .core {
    display: grid;
    place-items: center;
    inline-size: 88px;
    block-size: 88px;
    background: var(--bg);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
  }

  .addresses {
    display: grid;
    gap: var(--sp-3);
  }

  .addresses .tile-head {
    font: inherit;
  }

  /* SEVEN ADDRESSES IN FOUR COLUMNS: the last one takes two, so no cell is left empty at the end. */
  .addr {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--sp-2);
    margin: 0;
  }

  .addr-cell {
    display: grid;
    align-content: start;
    gap: 6px;
    padding: 12px 14px;
    background: var(--s1);
    border-radius: var(--r-md);
  }

  .addr-cell:last-child {
    grid-column: span 2;
  }

  .addr-cell dt code {
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
  }

  .addr-cell dd {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-small);
    line-height: 20px;
  }

  /* ── From outside ────────────────────────────────────────────────────── */

  .outside-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: end;
    gap: var(--sp-6);
  }

  .outside-head > div:first-child {
    display: grid;
    gap: var(--sp-4);
  }

  .reach-chart {
    display: grid;
    gap: var(--sp-3);
  }

  .ladder {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rung {
    display: grid;
    grid-template-columns: 7em minmax(0, 1fr) 9em;
    align-items: center;
    gap: var(--sp-3);
    font-size: var(--t-sm);
  }

  .rung-name {
    color: var(--ink);
    font-weight: 600;
  }

  .rung-step {
    color: var(--dim);
  }

  .segs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
  }

  .seg {
    block-size: 10px;
    background: var(--s1);
    border-radius: 3px;
  }

  .seg.on {
    background: var(--ink2);
  }

  .rung:last-child .seg.on {
    background: var(--ink);
  }

  .way-tile {
    gap: var(--sp-4);
  }

  .limits {
    display: grid;
    gap: var(--sp-3);
    margin: 0;
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
  }

  .limit dt {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 600;
  }

  .limit dd {
    margin: 2px 0 0;
    padding-inline-start: calc(var(--icon-m) + var(--sp-2));
    color: var(--ink2);
    font-size: var(--t-site-small);
    line-height: 20px;
  }

  /* ── What only a person can do ───────────────────────────────────────── */

  .cannot {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: var(--sp-6);
    align-items: start;
  }

  .cannot-say {
    display: grid;
    gap: var(--sp-4);
  }

  .rows {
    display: grid;
    margin: 0;
  }

  /* THE WELL IS IN THE TERM, because a `dl`'s groups hold only terms and descriptions, and it is lifted out to
     the row's start beside both lines, where a grid column of its own used to put it. One track now; the skin's
     `.row` still gives the gap, the inline padding and the phone step. */
  .row {
    --lead: calc(var(--well-l) + var(--sp-3));
    grid-template-columns: minmax(0, 1fr);
    padding-block: var(--sp-4);
    padding-inline-start: calc(var(--sp-3) + var(--lead));
    border-block-end: 1px solid var(--line);
  }

  .row:last-child {
    border-block-end: 0;
  }

  .row .well {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: calc(-1 * var(--lead));
  }

  /* The term's first line ends level with the well's lower edge, where the grid's baseline alignment set it. */
  .row dt {
    position: relative;
    padding-block-start: calc(var(--well-l) - 1lh);
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 600;
  }

  .row dd {
    margin: 2px 0 0;
    color: var(--ink2);
    font-size: var(--t-site-small);
    line-height: 20px;
  }

  /* ── Narrower than a desk ─────────────────────────────────────────────── */

  @media (width < 1100px) {
    .addr {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .addr-cell:last-child {
      grid-column: auto;
    }
  }

  @media (width < 900px) {
    .tools-head,
    .outside-head,
    .cannot {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-5);
    }

    /* THE RECORD BETWEEN ITS LANES, STACKED: the writes, the record, the reads, and the arrows turn down. */
    .reach {
      grid-template-columns: minmax(0, 1fr);
      justify-items: start;
    }

    .flow {
      transform: rotate(90deg);
    }
  }

  @media (width < 640px) {
    .trade,
    .addr {
      grid-template-columns: minmax(0, 1fr);
    }

    /* The briefing goes under the crew, and the joining lines with it. */
    .scene {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-3);
    }

    .into {
      display: none;
    }

    .rung {
      grid-template-columns: 6em minmax(0, 1fr);
    }

    .rung-step {
      display: none;
    }
  }
</style>
