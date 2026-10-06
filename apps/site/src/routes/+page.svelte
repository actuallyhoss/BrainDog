<script lang="ts">
  /**
   * brain.dog's home page, in the look the owner chose on 30 September: "Window for everyone".
   *
   * THE PRODUCT AT FULL SIZE, ONE THING PER BAND. The hero is the promise and the drawn app, whose tabs show a record
   * for each kind of person (`lib/app/Window.svelte`). Every band under it is a heading and one sentence on the ground,
   * beside the product doing that one thing in a glass frame:
   *
   *   decide   an agent proposes, a person decides, and the row lands under the agent's name.
   *   slash    the assistant, as its palette.
   *   inbox    three messages arrive, the shape is learned once, and every one is filed.
   *   agents   the connect sheet, with the makers' own marks and the record's MCP address.
   *   yours    three plain facts about whose the record is.
   *   plans    Free, first and largest, then the plans for pros in one quieter tile (DIRECTION §35).
   *   close    one line and the button.
   *
   * NOTHING SAID TWICE. The price is said once, in the plans, and not beside the first button; the pages a record
   * draws are the hero's to show, so they have no band of their own. The owner's words on 30 September: take out the
   * redundant things that make a page read as generated.
   *
   * EVERY WORD IS IN `lib/copy/home.ts`, read here directly, except the page's title and description
   * (`copy/shell.ts`) and the palette's demo, which `/slash` draws too (`copy/pricing.ts`).
   */
  import AgentMark from '$lib/AgentMark.svelte';
  import Decide from '$lib/Decide.svelte';
  import Icon from '$lib/Icon.svelte';
  import InboxFlow from '$lib/InboxFlow.svelte';
  import SlashPalette from '$lib/SlashPalette.svelte';
  import Window from '$lib/app/Window.svelte';
  import { AGENT_MARKS, type MarkedAgent } from '$lib/agent-marks.ts';
  import { MCP_URL, SIGNUP, SOURCE, site } from '$lib/copy.ts';
  import { home } from '$lib/copy/home.ts';
  import type { IconName } from '$lib/icons.ts';
  import { PAID, plan } from '$lib/plans.ts';

  const h = home.home;
  const free = plan('free');
  const agents = Object.keys(AGENT_MARKS) as MarkedAgent[];

  /* THE ADDRESS COPIES FOR REAL, and says so for two seconds. Without a clipboard the address is still there to select. */
  let copied = $state(false);
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }
</script>

<svelte:head>
  <title>{site.meta.home.title}</title>
  <meta name="description" content={site.meta.home.description} />
  <link rel="canonical" href="https://brain.dog/" />
  <meta property="og:url" content="https://brain.dog/" />
  <meta property="og:title" content={site.meta.home.title} />
  <meta property="og:description" content={site.meta.home.description} />
</svelte:head>

<!-- ── The hero: the promise and the action, then the drawn app with a record for each kind of person. ── -->
<section class="band spaced hero" aria-labelledby="hero-title">
  <div class="in">
    <div class="hero-words">
      <h1 class="display" id="hero-title">{home.hero.title} {home.hero.titleAccent}</h1>
      <p class="lede">{home.hero.sub}</p>
      <div class="actions">
        <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{home.hero.primary}<Icon name="arrow" size="m" /></a>
        <a class="btn btn-glass btn-lg" href="/pricing">{home.hero.secondary}</a>
      </div>
    </div>

    <div class="showcase">
      <Window />
    </div>
  </div>
</section>

<!-- ── Decide: the scene first, the words beside it. No onward link: the Agents band below carries "How agents connect". ── -->
<section class="band spaced" aria-labelledby="decide-title">
  <div class="in feature flip">
    <div class="words">
      <h2 class="h2" id="decide-title">{h.decide.title}</h2>
      <p class="lede">{h.decide.lead}</p>
    </div>
    <div class="frame">
      <Decide scene={home.decide} />
    </div>
  </div>
</section>

<!-- ── Slash: the words, and the palette answering. ── -->
<section class="band spaced" aria-labelledby="slash-title">
  <div class="in feature">
    <div class="words">
      <h2 class="h2" id="slash-title">{h.slash.title}</h2>
      <p class="lede">{h.slash.lead}</p>
      <a class="onward" href="/slash">{h.slash.more}<Icon name="arrow" size="m" /></a>
    </div>
    <div class="frame">
      <SlashPalette demo={h.slash.demo} />
    </div>
  </div>
</section>

<!-- ── The inbox: the words, then the three steps. The lead names the doors, so no row of chips repeats them. ── -->
<section class="band spaced" aria-labelledby="inbox-title">
  <div class="in feature flip">
    <div class="words">
      <h2 class="h2" id="inbox-title">{h.inbox.title}</h2>
      <p class="lede">{h.inbox.lead}</p>
    </div>
    <div class="frame">
      <div class="tile"><InboxFlow flow={h.inbox} /></div>
    </div>
  </div>
</section>

<!-- ── Agents: the connect sheet, with each maker's own mark and the record's address. ── -->
<section class="band spaced" aria-labelledby="agents-title">
  <div class="in feature">
    <div class="words">
      <h2 class="h2" id="agents-title">{h.agents.title}</h2>
      <p class="lede">{h.agents.lead}</p>
      <a class="onward" href="/agents">{h.agents.more}<Icon name="arrow" size="m" /></a>
    </div>
    <div class="frame">
      <div class="tile sheet">
        <p class="h3">{h.agents.sheet}</p>
        <ul class="makers">
          {#each agents as a (a)}
            <li class="maker"><span class="maker-mark"><AgentMark agent={a} /></span>{AGENT_MARKS[a].maker}</li>
          {/each}
        </ul>
        <div class="address">
          <span class="meta" id="mcp-label">{h.agents.connect}</span>
          <div class="addr">
            <code aria-labelledby="mcp-label">{MCP_URL}</code>
            <button type="button" class="btn btn-sm copy" onclick={copyAddress} aria-label={h.agents.copy}>
              <Icon name={copied ? 'check' : 'copy'} size="m" />
            </button>
          </div>
        </div>
        <p class="meta keys"><Icon name="key" size="m" />{h.agents.keys}</p>
      </div>
    </div>
  </div>
</section>

<!-- ── Whose the record is: three facts. ── -->
<section class="band spaced" aria-labelledby="yours-title">
  <div class="in">
    <div class="yours-head">
      <h2 class="h2" id="yours-title">{h.yours.title}</h2>
      {#if SOURCE}<a class="onward" href={SOURCE} rel="external"><Icon name="code" size="m" />{h.yours.source}</a>{/if}
    </div>
    <ul class="facts">
      {#each h.yours.body as p, i (p)}
        <li><span class="well"><Icon name={(h.yours.glyphs[i] ?? 'check') as IconName} size="m" /></span><p>{p}</p></li>
      {/each}
    </ul>
  </div>
</section>

<!-- ── The plans: Free first and largest, then the plans for pros, quieter. ── -->
<section class="band spaced" aria-labelledby="plans-title">
  <div class="in">
    <div class="yours-head">
      <div class="plans-words">
        <h2 class="h2" id="plans-title">{h.plans.title}</h2>
        <p class="lede">{h.plans.lead}</p>
      </div>
      <a class="onward" href="/pricing">{h.plans.more}<Icon name="arrow" size="m" /></a>
    </div>
    <div class="frame plans">
      <div class="tile plan">
        <span class="plan-name">{free.name}</span>
        <span class="plan-price"><span class="price">{free.price}</span><span class="meta">{free.unit}</span></span>
        <span class="meta">{free.for}</span>
        <dl class="allow">
          <div><dt>{h.plans.meters.credits}</dt><dd class="num">{free.allowance.credits.toLocaleString('en-US')}</dd></div>
          <div><dt>{h.plans.meters.runs}</dt><dd class="num">{free.allowance.runs.toLocaleString('en-US')}</dd></div>
        </dl>
      </div>
      <div class="tile plan pros">
        <span class="plan-name">{h.plans.pros.head}</span>
        <span class="meta">{h.plans.pros.said}</span>
        <dl class="allow">
          {#each PAID as p (p.id)}
            <div><dt>{p.name}</dt><dd class="num">{h.plans.price(p.price, p.unit)}</dd></div>
          {/each}
        </dl>
      </div>
    </div>
  </div>
</section>

<!-- ── The close. ── -->
<section class="band spaced" aria-labelledby="close-title">
  <div class="in">
    <div class="frame close">
      <div class="close-words">
        <h2 class="h2" id="close-title">{home.closing.title}</h2>
        <p class="lede">{home.closing.body}</p>
      </div>
      <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{home.closing.primary}<Icon name="arrow" size="m" /></a>
    </div>
  </div>
</section>

<style>
  /* ── The hero ─────────────────────────────────────────────────────────── */

  .hero-words {
    display: grid;
    justify-items: start;
    gap: var(--sp-5);
    padding: var(--sp-7) var(--sp-2) var(--sp-7);
  }

  .hero .display {
    max-inline-size: 14ch;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
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

  /* ── The connect sheet ───────────────────────────────────────────────── */

  .sheet {
    gap: var(--sp-4);
  }

  .makers {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .maker {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
    padding: 14px;
    border-radius: var(--r-md);
    box-shadow: inset 0 0 0 1px var(--line);
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 500;
  }

  .maker-mark {
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
  }

  .maker-mark :global(.agent-mark) {
    inline-size: 26px;
    block-size: 26px;
  }

  .address {
    display: grid;
    gap: var(--sp-2);
  }

  .addr {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    padding-inline: 12px 4px;
    border-radius: var(--r-md);
    background: var(--s1);
  }

  .addr code {
    flex: 1;
    min-inline-size: 0;
    overflow-x: auto;
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-site-small);
    white-space: nowrap;
  }

  .copy {
    min-inline-size: var(--ctl-h);
    padding-inline: 0;
    background: var(--bg);
    box-shadow: inset 0 0 0 1px var(--line);
  }

  .keys {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
  }

  /* ── Yours, and the plans' heading row ───────────────────────────────── */

  .yours-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-3) var(--sp-5);
    margin-block-end: var(--sp-6);
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-6);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .facts li {
    display: flex;
    flex-direction: column;
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

  .plans-words {
    display: grid;
    gap: var(--sp-3);
  }

  /* FREE TAKES THE WIDER SHARE; the plans for pros sit beside it, in smaller type. */
  .plans {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    gap: var(--inset);
  }

  .pros .plan-name {
    font-size: var(--t-md);
  }

  .pros .allow {
    margin-block-start: auto;
  }

  .plan {
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

  .price {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-site-hero);
    line-height: 1;
    letter-spacing: -0.03em;
  }

  .allow {
    display: grid;
    margin: var(--sp-2) 0 0;
  }

  .allow div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-3);
    padding-block: 10px;
    border-block-start: 1px solid var(--line);
  }

  .allow dt {
    color: var(--ink2);
    font-size: var(--t-site-small);
  }

  .allow dd {
    margin: 0;
    color: var(--ink);
    font-weight: 600;
  }

  /* ── The close ─────────────────────────────────────────────────────────── */

  .close {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--sp-5) var(--sp-7);
    padding: clamp(28px, 3vw + 12px, 56px);
  }

  .close-words {
    display: grid;
    gap: var(--sp-3);
    max-inline-size: 60ch;
  }

  /* ── Narrower than a desk ─────────────────────────────────────────────── */

  @media (width < 900px) {
    .facts,
    .plans {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (width < 640px) {
    .hero-words {
      padding: var(--sp-5) var(--sp-1) var(--sp-5);
    }

    .makers {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .actions > :global(.btn) {
      flex: 1 1 auto;
    }
  }
</style>
