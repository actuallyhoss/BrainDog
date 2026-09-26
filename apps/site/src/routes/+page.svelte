<script lang="ts">
  /**
   * brain.dog's home page.
   *
   * REBUILT UNDER THE HERO ON 26 SEPTEMBER. The owner kept the hero and the drawn app across its edge
   * and called everything below them "pure AI slop" (`loop/DIRECTION.md` §33): eyebrows with rules,
   * three hedged columns, a paragraph about mechanism. What stands there now is the product doing one
   * thing per band, drawn working, under a plain heading and a few sentences:
   *
   *   hero     the promise, one action, and the drawn app lying across the bottom edge.
   *   slash    the assistant, as its palette, answering from the record the hero just showed.
   *   agents   an agent proposes, a person decides, and the row lands under the agent's name.
   *   inbox    three messages arrive, the shape is learned once, and every one is filed.
   *   pages    a page of blocks over the same lists, and the packs that add more.
   *   yours    why the record stays the reader's, as prose on the turned-over ground.
   *   plans    the two prices, and what to do when a plan is not enough.
   *   close    one line and the button.
   *
   * THE SITE DESCRIBES THE FINISHED PRODUCT (§33) and is deployed with it, so nothing here says what
   * is not open yet.
   */
  import Arrange from '$lib/Arrange.svelte';
  import Decide from '$lib/Decide.svelte';
  import Icon from '$lib/Icon.svelte';
  import InboxFlow from '$lib/InboxFlow.svelte';
  import PageBlocks from '$lib/PageBlocks.svelte';
  import SlashPalette from '$lib/SlashPalette.svelte';
  import { MCP_URL, SIGNUP, SOURCE, site } from '$lib/copy.ts';
  import { PLANS } from '$lib/plans.ts';

  const h = site.home;
</script>

<svelte:head>
  <title>{site.meta.home.title}</title>
  <meta name="description" content={site.meta.home.description} />
  <link rel="canonical" href="https://brain.dog/" />
  <meta property="og:url" content="https://brain.dog/" />
  <meta property="og:title" content={site.meta.home.title} />
  <meta property="og:description" content={site.meta.home.description} />
</svelte:head>

<!-- ── The hero, unchanged in what it says: the promise, one action, and the drawn app. ── -->
<section class="band hero" data-ground="page" aria-labelledby="hero-title">
  <div class="in">
    <h1 class="display" id="hero-title">{site.hero.title} <span class="hl">{site.hero.titleAccent}</span></h1>

    <div class="hero-row">
      <p class="sub">{site.hero.sub}</p>
      <div class="hero-do">
        <div class="actions">
          <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{site.hero.primary}<Icon name="arrow" size="s" /></a>
          <a class="quiet" href="/pricing">{site.hero.secondary}</a>
        </div>
        <p class="note">{site.hero.note}</p>
      </div>
    </div>
  </div>

  <div class="in showcase">
    <Arrange cases={site.arrange.cases} head={site.arrange.head} label={site.arrange.label} app={site.arrange.app} />
  </div>
</section>

<!-- ── Slash. The band the window lands in, so its top padding is the overlap plus its own air. ── -->
<section class="band sec slash-band" data-ground="page" aria-labelledby="slash-title">
  <div class="in">
    <p class="hint">{site.arrange.hint}</p>

    <div class="split">
      <div class="sec-head reveal">
        <h2 class="h2" id="slash-title">{h.slash.title}</h2>
        <p class="lede">{h.slash.lead}</p>
        <a class="onward" href="/slash">{h.slash.more}<Icon name="arrow" size="s" /></a>
      </div>
      <div class="reveal">
        <SlashPalette demo={site.slash.demo} />
      </div>
    </div>
  </div>
</section>

<!-- ── Agents: the heading and how to connect, then the decision scene across the page. ── -->
<section class="band sec" data-ground="page" aria-labelledby="agents-title">
  <div class="in">
    <div class="split-head reveal">
      <h2 class="h2" id="agents-title">{h.agents.title}</h2>
      <div class="side">
        <p class="lede">{h.agents.lead}</p>
        <p class="connect"><span class="connect-label">{h.agents.connect}</span><code class="addr">{MCP_URL}</code><a class="onward" href="/agents">{h.agents.more}<Icon name="arrow" size="s" /></a></p>
      </div>
    </div>

    <div class="scene frame reveal">
      <Decide scene={site.decide} />
    </div>
  </div>
</section>

<!-- ── Things arrive on their own: the doors, then the three steps. ── -->
<section class="band sec" data-ground="sunk" aria-labelledby="inbox-title">
  <div class="in">
    <div class="split-head reveal">
      <h2 class="h2" id="inbox-title">{h.inbox.title}</h2>
      <p class="lede">{h.inbox.lead}</p>
    </div>

    <div class="flow-wrap reveal">
      <InboxFlow flow={h.inbox} />
    </div>
  </div>
</section>

<!-- ── Pages made of blocks, and the packs that add them. ── -->
<section class="band sec" data-ground="page" aria-labelledby="pages-title">
  <div class="in">
    <div class="split-head reveal">
      <h2 class="h2" id="pages-title">{h.pages.title}</h2>
      <p class="lede">{h.pages.lead}</p>
    </div>

    <div class="blocks-wrap reveal">
      <PageBlocks blocks={h.pages} />
    </div>

    <p class="packs reveal">{h.pages.packsLine}</p>
  </div>
</section>

<!-- ── Why it stays yours, on the one turned-over ground of the page. ── -->
<section class="band sec" data-ground="flip" aria-labelledby="yours-title">
  <div class="in yours">
    <h2 class="h2 reveal" id="yours-title">{h.yours.title}</h2>
    <div class="yours-body reveal">
      {#each h.yours.body as p (p)}<p>{p}</p>{/each}
      {#if SOURCE}<a class="onward" href={SOURCE} rel="external">{h.yours.source}<Icon name="arrow" size="s" /></a>{/if}
    </div>
  </div>
</section>

<!-- ── The plans, in brief. ── -->
<section class="band sec" data-ground="page" aria-labelledby="plans-title">
  <div class="in">
    <div class="split-head reveal">
      <h2 class="h2" id="plans-title">{h.plans.title}</h2>
      <p class="lede">{h.plans.lead}</p>
    </div>

    <ul class="mini-plans reveal">
      {#each PLANS as p (p.id)}
        <li class="mini" data-featured={p.id === 'cloud' ? '' : undefined}>
          <span class="mini-name">{p.name}</span>
          <span class="mini-price"><span class="num">{p.price}</span><span class="mini-unit">{p.unit}</span></span>
          <span class="mini-for">{p.for}</span>
          <span class="mini-inc">
            <span><b class="num">{p.allowance.credits}</b> Slash credits a month</span>
            <span><b class="num">{p.allowance.runs.toLocaleString('en-US')}</b> automation runs a month</span>
          </span>
        </li>
      {/each}
      <li class="mini-side">
        {#each h.plans.side as x (x.head)}<p><b>{x.head}</b> {x.said}</p>{/each}
        <a class="onward" href="/pricing">{h.plans.more}<Icon name="arrow" size="s" /></a>
      </li>
    </ul>
  </div>
</section>

<!-- ── The close. ── -->
<section class="band sec close" data-ground="page" aria-labelledby="close-title">
  <div class="in reveal">
    <h2 class="h2" id="close-title">{site.closing.title}</h2>
    <div class="close-row">
      <p class="close-body">{site.closing.body}</p>
      <div class="actions">
        <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{site.closing.primary}<Icon name="arrow" size="s" /></a>
        <a class="quiet" href="/pricing">{site.closing.secondary}</a>
      </div>
    </div>
  </div>
</section>

<style>
  /* ── Type ──────────────────────────────────────────────────────────────── */

  .display {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: clamp(2.375rem, 4.7vw, 4.25rem);
    font-weight: 600;
    line-height: var(--lh-3xl);
    letter-spacing: var(--tr-tight);
    text-wrap: balance;
  }

  .sub {
    max-inline-size: 46ch;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: var(--lh-body);
    text-wrap: pretty;
  }

  .note {
    margin-block: var(--sp-4) 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-4);
  }

  .quiet {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    color: var(--ink2);
    font-size: var(--t-base);
  }

  /* ── The hero, and the window across its edge ─────────────────────────────
     The hero's ground is `--sunk`; the window runs `--overlap` past its bottom edge into the Slash
     band, whose words start under it. `flow-root` keeps the window's negative margin inside. */
  .hero,
  .slash-band {
    --overlap: clamp(120px, 14vw, 216px);
  }

  .hero {
    display: flow-root;
    padding-block: var(--sp-7) 0;
    background: var(--sunk);
  }

  .hero-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--sp-7) var(--sp-8);
    align-items: end;
    margin-block-start: var(--sp-7);
  }

  .showcase {
    position: relative;
    z-index: var(--z-raise);
    margin-block: var(--sp-8) calc(-1 * var(--overlap));
  }

  .showcase::before {
    content: '';
    position: absolute;
    z-index: -1;
    inset-inline: 0;
    inset-block-start: calc(-1 * var(--sp-8));
    block-size: calc(2 * var(--sp-8));
    background: radial-gradient(50% 100% at 50% 100%, color-mix(in srgb, var(--accent) 24%, transparent), transparent 72%);
    pointer-events: none;
  }

  .band + .band {
    border-block-start: 1px solid var(--line);
  }

  /* ── Slash ──────────────────────────────────────────────────────────── */

  .slash-band {
    padding-block-start: calc(var(--overlap) + var(--sp-5));
  }

  .hint {
    margin: 0 0 clamp(var(--sp-8), 8vw, 112px);
    color: var(--dim);
    font-size: var(--t-sm);
    text-align: center;
  }

  .split {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: var(--sp-8);
    align-items: center;
  }


  /* ── Agents ─────────────────────────────────────────────────────────── */

  .side {
    display: grid;
    gap: var(--sp-4);
  }

  .scene {
    margin-block-start: var(--sp-7);
    padding: clamp(var(--sp-4), 3vw, var(--sp-7));
    background: var(--bg);
  }

  .connect {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    margin: 0;
  }

  .connect-label {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .addr {
    padding: 6px 12px;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  /* ── Inbox and plans: the heading on the left, the sentence on the right ── */

  .split-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--sp-5) var(--sp-8);
    align-items: end;
  }

  .flow-wrap {
    margin-block-start: var(--sp-8);
  }

  /* ── Pages ──────────────────────────────────────────────────────────── */

  .blocks-wrap {
    margin-block-start: var(--sp-7);
  }

  .packs {
    margin: var(--sp-5) 0 0;
    color: var(--dim);
    font-size: var(--t-sm);
    text-align: center;
  }

  /* ── Yours ──────────────────────────────────────────────────────────── */

  .yours {
    display: grid;
    grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
    gap: var(--sp-8);
    align-items: start;
  }

  .yours-body {
    display: grid;
    gap: var(--sp-4);
    justify-items: start;
    max-inline-size: 60ch;
  }

  .yours-body p {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: var(--lh-body);
    text-wrap: pretty;
  }

  /* ── Plans ──────────────────────────────────────────────────────────── */

  .mini-plans {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-4);
    margin: var(--sp-7) 0 0;
    padding: 0;
    list-style: none;
  }

  .mini {
    display: grid;
    align-content: start;
    gap: var(--sp-3);
    padding: var(--sp-6);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 16px;
  }

  .mini[data-featured] {
    background: var(--accent-ground, var(--s1));
    border-color: var(--accent-edge);
  }

  .mini-side {
    display: grid;
    align-content: center;
    gap: var(--sp-4);
    padding: var(--sp-2) var(--sp-4);
  }

  .mini-side p {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.55;
  }

  .mini-side b {
    display: block;
    color: var(--ink);
    font-weight: 600;
  }

  .mini-name {
    color: var(--ink);
    font-weight: 600;
  }

  .mini-price {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .mini-price .num {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 40px;
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  .mini-unit {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .mini-inc {
    display: grid;
    gap: 6px;
    margin-block-start: var(--sp-2);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .mini-inc b {
    color: var(--ink);
    font-weight: 600;
  }

  .mini-for {
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.55;
  }

  /* ── The close ─────────────────────────────────────────────────────────── */

  .close-row {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: var(--sp-6);
    margin-block-start: var(--sp-5);
  }

  .close-body {
    max-inline-size: 44ch;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: var(--lh-body);
    text-wrap: pretty;
  }

  @media (prefers-reduced-motion: no-preference) {
    .showcase {
      animation: stage-in 640ms var(--ease-out) 120ms both;
    }
  }

  @keyframes stage-in {
    from {
      opacity: 0;
      transform: translateY(var(--sp-6));
    }

    to {
      opacity: 1;
      transform: none;
    }
  }

  /* ── Narrower than a desk ─────────────────────────────────────────────── */

  @media (width < 1000px) {
    .hero-row,
    .split,
    .split-head,
    .yours {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-6);
    }

    .mini-plans {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (width < 640px) {
    .showcase {
      margin-block-start: var(--sp-7);
      padding-inline: var(--sp-4);
    }

    .mini {
      padding: var(--sp-5);
    }

    .addr {
      max-inline-size: 100%;
      overflow-x: auto;
    }
  }
</style>
