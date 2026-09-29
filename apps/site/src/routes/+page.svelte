<script lang="ts">
  /**
   * brain.dog's home page.
   *
   * THE PRODUCT DOING ONE THING PER BAND, DRAWN WORKING (`loop/DIRECTION.md` §33), in the look of 29 September (§34,
   * `loop/design/SYSTEM.md` §10): every band is Bento tiles on the ground, a tile of words beside the tiles that draw
   * the product, and every chart with its one written line.
   *
   *   hero     the promise, one action and the price, and the drawn app (`lib/app/Window.svelte`) under them.
   *   slash    the assistant, as its palette, answering from the record the hero just showed.
   *   agents   bring your own agents; one proposes, a person decides, and the row lands under the agent's name.
   *   inbox    three messages arrive, the shape is learned once, and every one is filed.
   *   pages    a page of blocks drawn by the product's own renderer as tiles, and the packs that add more.
   *   yours    why the record stays the reader's, and the plans, side by side.
   *   close    one line and the button.
   *
   * THE SITE DESCRIBES THE FINISHED PRODUCT (§33) and is deployed with it, so nothing here says what is not open yet.
   *
   * EVERY WORD IS IN `lib/copy/home.ts`, read here directly, except the page's title and description
   * (`copy/shell.ts`) and the palette's demo, which `/slash` draws too (`copy/pricing.ts`).
   */
  import Decide from '$lib/Decide.svelte';
  import Icon from '$lib/Icon.svelte';
  import InboxFlow from '$lib/InboxFlow.svelte';
  import SlashPalette from '$lib/SlashPalette.svelte';
  import Page from '$lib/app/Page.svelte';
  import Window from '$lib/app/Window.svelte';
  import { MCP_URL, SIGNUP, SOURCE, site } from '$lib/copy.ts';
  import { home } from '$lib/copy/home.ts';
  import { DRAWN_ON } from '$lib/examples/index.ts';
  import type { IconName } from '$lib/icons.ts';
  import { exists } from '$lib/nav.ts';
  import { PACKS } from '$lib/links.ts';
  import { PLANS } from '$lib/plans.ts';

  const h = home.home;

  /* THE PLANS' METERS SHARE ONE SCALE PER METER, so the bars say how the two plans compare: the larger plan's
     allowance is the full track. */
  const most = {
    credits: Math.max(...PLANS.map((p) => p.allowance.credits)),
    runs: Math.max(...PLANS.map((p) => p.allowance.runs)),
  };
  const share = (n: number, of: number) => `${Math.max(2, (n / of) * 100)}%`;
</script>

<svelte:head>
  <title>{site.meta.home.title}</title>
  <meta name="description" content={site.meta.home.description} />
  <link rel="canonical" href="https://brain.dog/" />
  <meta property="og:url" content="https://brain.dog/" />
  <meta property="og:title" content={site.meta.home.title} />
  <meta property="og:description" content={site.meta.home.description} />
</svelte:head>

<!-- ── The hero: the promise, one action and the price on the ground, and the drawn app under them. ── -->
<section class="band hero" aria-labelledby="hero-title">
  <div class="in">
    <div class="hero-row">
      <h1 class="display" id="hero-title">{home.hero.title} {home.hero.titleAccent}</h1>
      <div class="hero-do">
        <p class="lede">{home.hero.sub}</p>
        <div class="actions">
          <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{home.hero.primary}<Icon name="arrow" size="m" /></a>
          <a class="btn btn-glass btn-lg" href="/pricing">{home.hero.secondary}</a>
        </div>
        <p class="note">{home.hero.note}</p>
      </div>
    </div>

    <div class="showcase">
      <Window />
    </div>
  </div>
</section>

<!-- ── Slash: the words beside the palette answering. ── -->
<section class="band" aria-labelledby="slash-title">
  <div class="in tiles">
    <div class="tile lead span-5 reveal">
      <p class="tile-head"><span class="well"><Icon name="slash" size="m" /></span></p>
      <h2 class="h2" id="slash-title">{h.slash.title}</h2>
      <p class="lede">{h.slash.lead}</p>
      <a class="onward end" href="/slash">{h.slash.more}<Icon name="arrow" size="m" /></a>
    </div>
    <div class="span-7 reveal">
      <SlashPalette demo={site.slash.demo} />
    </div>
  </div>
</section>

<!-- ── Agents: how to connect, and the decision drawn as the app's two tiles. ── -->
<section class="band" aria-labelledby="agents-title">
  <div class="in tiles">
    <div class="tile lead span-4 reveal">
      <p class="tile-head"><span class="well"><Icon name="agent" size="m" /></span></p>
      <h2 class="h2" id="agents-title">{h.agents.title}</h2>
      <p class="lede">{h.agents.lead}</p>
      <div class="connect">
        <span class="meta">{h.agents.connect}</span>
        <code class="addr"><Icon name="plug" size="m" />{MCP_URL}</code>
      </div>
      <a class="onward end" href="/agents">{h.agents.more}<Icon name="arrow" size="m" /></a>
    </div>
    <div class="span-8 reveal">
      <Decide scene={home.decide} />
    </div>
  </div>
</section>

<!-- ── Things arrive on their own: the doors, then the three steps in one tile. ── -->
<section class="band" aria-labelledby="inbox-title">
  <div class="in tiles">
    <div class="tile lead span-4 reveal">
      <p class="tile-head"><span class="well"><Icon name="inbox" size="m" /></span></p>
      <h2 class="h2" id="inbox-title">{h.inbox.title}</h2>
      <p class="lede">{h.inbox.lead}</p>
    </div>
    <div class="tile span-8 reveal">
      <InboxFlow flow={h.inbox} />
    </div>
  </div>
</section>

<!-- ── Pages made of blocks, drawn by the renderer as the app's tiles, and the packs that add them. ── -->
<section class="band" aria-labelledby="pages-title">
  <div class="in tiles">
    <div class="tile lead span-4 reveal">
      <p class="tile-head"><span class="well"><Icon name="projects" size="m" /></span></p>
      <h2 class="h2" id="pages-title">{h.pages.title}</h2>
      <p class="lede">{h.pages.lead}</p>
      <p class="packs">{h.pages.packsLine}</p>
      {#if exists(PACKS)}<a class="onward end" href={PACKS}>{site.nav.packs}<Icon name="arrow" size="m" /></a>{/if}
    </div>
    <div class="span-8 blocks reveal">
      <Page src={h.pages.page.src} layout={h.pages.page.layout} reads={h.pages.page.reads} tiles now={DRAWN_ON} />
    </div>
  </div>
</section>

<!-- ── Why it stays yours, and the plans, side by side. ── -->
<section class="band" aria-labelledby="yours-title plans-title">
  <div class="in tiles">
    <div class="tile lead span-6 reveal">
      <h2 class="h2" id="yours-title">{h.yours.title}</h2>
      <ul class="facts">
        {#each h.yours.body as p, i (p)}
          <li><span class="well"><Icon name={(h.yours.glyphs[i] ?? 'check') as IconName} size="m" /></span><p>{p}</p></li>
        {/each}
      </ul>
      {#if SOURCE}<a class="onward end" href={SOURCE} rel="external"><Icon name="code" size="m" />{h.yours.source}</a>{/if}
    </div>

    <div class="tile lead span-6 reveal">
      <h2 class="h2" id="plans-title">{h.plans.title}</h2>
      <p class="lede">{h.plans.lead}</p>

      <ul class="plans">
        {#each PLANS as p (p.id)}
          <li class="plan">
            <span class="plan-name">{p.name}</span>
            <span class="plan-price"><span class="figure">{p.price}</span><span class="meta">{p.unit}</span></span>
            <span class="meter">
              <span class="meter-words"><b class="num">{p.allowance.credits}</b> {h.plans.meters.credits}</span>
              <span class="track" aria-hidden="true"><span class="bar" data-most={p.allowance.credits === most.credits ? '' : undefined} style="--share: {share(p.allowance.credits, most.credits)}"></span></span>
            </span>
            <span class="meter">
              <span class="meter-words"><b class="num">{p.allowance.runs.toLocaleString('en-US')}</b> {h.plans.meters.runs}</span>
              <span class="track" aria-hidden="true"><span class="bar" data-most={p.allowance.runs === most.runs ? '' : undefined} style="--share: {share(p.allowance.runs, most.runs)}"></span></span>
            </span>
            <span class="meta">{p.for}</span>
          </li>
        {/each}
      </ul>

      <div class="team">
        <span class="faces" role="img" aria-label={h.plans.faces.join(', ')}>
          {#each h.plans.faces as f (f)}<span class="face" data-initial={f.slice(0, 1)}></span>{/each}
        </span>
        <p class="reading"><b>{h.plans.side[1]?.head}.</b> {h.plans.side[1]?.said}</p>
      </div>
      <div class="plans-foot">
        <p class="meta"><b>{h.plans.side[0]?.head}</b> {h.plans.side[0]?.said}</p>
        <a class="onward" href="/pricing">{h.plans.more}<Icon name="arrow" size="m" /></a>
      </div>
    </div>
  </div>
</section>

<!-- ── The close. ── -->
<section class="band" aria-labelledby="close-title">
  <div class="in tiles">
    <div class="tile lead close reveal">
      <div class="close-words">
        <h2 class="h2" id="close-title">{home.closing.title}</h2>
        <p class="lede">{home.closing.body}</p>
      </div>
      <div class="actions">
        <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{home.closing.primary}<Icon name="arrow" size="m" /></a>
        <a class="btn btn-lg" href="/pricing">{home.closing.secondary}</a>
      </div>
    </div>
  </div>
</section>

<style>
  /* ── The hero ─────────────────────────────────────────────────────────── */

  /* THE WORDS ON THE GROUND, the heading on the left and what it means on the right, then the product under them. */
  .hero-row {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    align-items: end;
    gap: var(--sp-5) var(--sp-8);
    padding: var(--sp-7) var(--sp-2) var(--sp-7);
  }

  .hero .display {
    max-inline-size: 13ch;
  }

  .hero-do {
    display: grid;
    gap: var(--sp-5);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .note {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-site-small);
  }

  .showcase {
    position: relative;
  }

  @media (prefers-reduced-motion: no-preference) {
    .showcase {
      animation: stage-in 640ms var(--ease-out) 120ms both;
    }
  }

  @keyframes stage-in {
    from {
      opacity: 0;
      transform: translateY(var(--sp-5));
    }

    to {
      opacity: 1;
      transform: none;
    }
  }

  /* ── The tiles of words ────────────────────────────────────────────────── */

  /* A LINK AT THE FOOT OF A TILE OF WORDS sits at its foot, however tall the drawing beside it makes the tile. */
  .end {
    margin-block-start: auto;
  }

  .connect {
    display: grid;
    gap: var(--sp-2);
  }

  .addr {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    padding-inline: 12px;
    overflow-x: auto;
    border-radius: var(--r-md);
    background: var(--s1);
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-base);
    white-space: nowrap;
  }

  .packs {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-small);
    line-height: 20px;
  }

  /* The renderer's page, its blocks as tiles, in the band's own grid. */
  .blocks {
    min-inline-size: 0;
  }

  /* ── Yours ─────────────────────────────────────────────────────────────── */

  .facts {
    display: grid;
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .facts li {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
  }

  .facts p {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-body);
    line-height: var(--lh-site-body);
    text-wrap: pretty;
  }

  /* ── Plans ─────────────────────────────────────────────────────────────── */

  .plans {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .plan {
    display: grid;
    align-content: start;
    gap: var(--sp-3);
  }

  .plan-name {
    color: var(--ink);
    font-size: var(--t-group);
    font-weight: 600;
  }

  .plan-price {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .meter {
    display: grid;
    gap: 6px;
  }

  .meter-words {
    color: var(--dim);
    font-size: var(--t-site-small);
  }

  .meter-words b {
    color: var(--ink);
    font-weight: 600;
  }

  /* A METER: the track in the second fill and the bar at radius 3, the larger plan's in ink and the other grey. */
  .track {
    display: block;
    block-size: 8px;
    border-radius: 3px;
    background: var(--s1);
  }

  .bar {
    display: block;
    inline-size: var(--share);
    block-size: 100%;
    border-radius: 3px;
    background: var(--dim);
  }

  .bar[data-most] {
    background: var(--ink);
  }

  .team {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
  }

  .faces {
    display: flex;
    flex: none;
  }

  /* THE FACES ARE CIRCLES, one overlapping the next, each the initial of a colleague the Team example names. */
  .face {
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--r-pill);
    background: var(--ink2);
    box-shadow: 0 0 0 2px var(--bg);
    color: var(--on-ink);
    font-size: var(--t-app-xs);
    font-weight: 600;
  }

  .face::before {
    content: attr(data-initial);
  }

  .face + .face {
    margin-inline-start: -6px;
  }

  .team .reading b {
    font-weight: 600;
  }

  .plans-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2) var(--sp-4);
    margin-block-start: auto;
  }

  .plans-foot .meta {
    margin: 0;
  }

  .plans-foot b {
    color: var(--ink);
    font-weight: 600;
  }

  /* ── The close ─────────────────────────────────────────────────────────── */

  .close {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--sp-5) var(--sp-7);
  }

  .close-words {
    display: grid;
    gap: var(--sp-3);
    max-inline-size: 60ch;
  }

  /* ── Narrower than a desk ─────────────────────────────────────────────── */

  @media (width < 1000px) {
    .hero-row {
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
      padding-block: var(--sp-6) var(--sp-6);
    }
  }

  @media (width < 640px) {
    .hero-row {
      padding: var(--sp-5) var(--sp-1) var(--sp-5);
    }

    .plans {
      grid-template-columns: minmax(0, 1fr);
    }

    .actions > :global(.btn) {
      flex: 1 1 auto;
    }
  }
</style>
