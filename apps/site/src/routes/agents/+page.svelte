<!--
  Connect your AI tools (the redo of 2 November): the door the launch is built around, on the app's board. The page's
  name and one line, then the app's tiles: the connect box beside what an AI tool gets and what it can't do, then the
  brief an AI tool starts with, drawn as its terminal on the made-up record, then the row of plain links for
  developers (the MCP address is the connect box's, said once there), then the early access strip.

  Every word is `copy/agents.ts`'s and every connect step is `lib/connect/apps.ts`'s. With scripting off the page is
  whole: each app's lines are in the HTML one under another, and the terminal shows every line. The skill an agent
  installs is still served at `/agents/braindog/SKILL.md`, by its own route beside this page.
-->
<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import { crumbsOf } from '$lib/site/seo.ts';
  import ConnectBox from '$lib/connect/ConnectBox.svelte';
  import { agents } from '$lib/copy/agents.ts';
  import { site } from '$lib/copy.ts';
  import { TERM } from '$lib/demo/maya.ts';
  import Term from '$lib/desk/Term.svelte';
  import type { IconName } from '$lib/icons.ts';
  import Icon from '$lib/Icon.svelte';
  import EarlyStrip from '$lib/site/EarlyStrip.svelte';
  import PageHead from '$lib/site/PageHead.svelte';

  const a = agents.agents;

  /* One glyph a line, in the lists' order: the brief, a person, the undo; then a key, money, the clock of the trail. */
  const GETS: readonly IconName[] = ['today', 'person', 'undo'];
  const CANNOT: readonly IconName[] = ['lock', 'card', 'clock'];
</script>

<Seo title={site.meta.agents.title} description={site.meta.agents.description} path="/agents" ld={[crumbsOf([{ name: 'BrainDog', path: '/' }, { name: site.nav.agents, path: '/agents' }])]} />
<PageHead title={a.title} lead={a.lead} />

<section class="section" aria-label={a.title}>
  <div class="wrap">
    <div class="tiles">
      <section class="tile lead connect reveal" aria-labelledby="connect-title">
        <div class="box">
          <h2 class="tile-head">
            <span class="well"><Icon name="plug" /></span>
            <span class="tile-name" id="connect-title">{a.connect}</span>
          </h2>
          <ConnectBox />
        </div>
        <div class="steps">
          <h3 class="meta" id="steps-title">{a.steps.title}</h3>
          <ol aria-labelledby="steps-title">
            {#each a.steps.items as step, i (step)}
              <li><span class="n num" aria-hidden="true">{i + 1}</span><span>{step}</span></li>
            {/each}
          </ol>
        </div>
      </section>

      <section class="tile lead span-6 reveal" aria-labelledby="gets-title">
        <h2 class="tile-head">
          <span class="well"><Icon name="check" /></span>
          <span class="tile-name" id="gets-title">{a.gets.title}</span>
        </h2>
        <ul class="lines">
          {#each a.gets.lines as item, i (item)}
            <li><span class="well l"><Icon name={GETS[i] ?? 'check'} /></span><span>{item}</span></li>
          {/each}
        </ul>
      </section>

      <section class="tile lead span-6 reveal" aria-labelledby="cannot-title">
        <h2 class="tile-head">
          <span class="well"><Icon name="lock" /></span>
          <span class="tile-name" id="cannot-title">{a.cannot.title}</span>
        </h2>
        <ul class="lines">
          {#each a.cannot.lines as item, i (item)}
            <li><span class="well l"><Icon name={CANNOT[i] ?? 'x'} /></span><span>{item}</span></li>
          {/each}
        </ul>
      </section>

      <section class="tile lead brief reveal" aria-labelledby="brief-title">
        <div class="words">
          <h2 class="h2" id="brief-title">{a.brief.title}</h2>
          <p class="lede">{a.brief.say}</p>
        </div>
        <Term lines={TERM} />
      </section>

      <section class="tile lead dev reveal" aria-labelledby="dev-title">
        <h2 class="tile-head">
          <span class="well"><Icon name="code" /></span>
          <span class="tile-name" id="dev-title">{a.dev.title}</span>
        </h2>
        <ul>
          {#each a.dev.links as link (link.href)}
            <li><a class="onward" href={link.href}>{link.label}<Icon name="arrow-right" size="s" /></a></li>
          {/each}
        </ul>
      </section>
    </div>
  </div>
</section>

<EarlyStrip />

<style>
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* EACH LINE WITH ITS GLYPH, a hairline between them, as the app lists a tile's rows. */
  .lines li {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    padding-block: var(--sp-3);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 1.45;
  }

  .lines li:first-child {
    padding-block-start: 0;
  }

  .lines li + li {
    border-block-start: 1px solid var(--rule);
  }

  .lines li > span:last-child {
    padding-block-start: 5px;
    text-wrap: pretty;
  }

  .brief {
    gap: var(--sp-5);
  }

  .words {
    display: grid;
    align-content: start;
    gap: var(--sp-3);
  }

  .dev ul {
    display: flex;
    flex-wrap: wrap;
    gap: 4px var(--sp-6);
  }

  .dev .onward {
    font-size: var(--t-site-15);
  }

  ol {
    display: grid;
    gap: var(--sp-3);
    margin: var(--sp-3) 0 0;
    padding: 0;
    list-style: none;
  }

  /* THE THREE STEPS, numbered in a well each, the way the app numbers a sequence. */
  .steps li {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    color: var(--ink);
    font-size: var(--t-site-15);
    line-height: 1.5;
  }

  .n {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: var(--well);
    block-size: var(--well);
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink-2);
    font-size: var(--t-site-small);
    font-weight: 600;
  }

  .steps li > span:last-child {
    padding-block-start: 3px;
  }

  .connect {
    gap: var(--sp-6);
  }

  .box {
    display: grid;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  @media (width >= 900px) {
    /* THE CONNECT BOX AND ITS STEPS SIDE BY SIDE, the steps under a hairline of their own. */
    .connect {
      display: grid;
      grid-template-columns: minmax(0, 7fr) minmax(0, 4fr);
      gap: var(--sp-7);
      align-items: start;
    }

    .steps {
      padding-inline-start: var(--sp-6);
      border-inline-start: 1px solid var(--rule);
    }

    .brief {
      display: grid;
      grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
      gap: var(--sp-7);
      align-items: center;
    }
  }

  @media (width < 900px) {
    .steps {
      padding-block-start: var(--sp-4);
      border-block-start: 1px solid var(--rule);
    }
  }
</style>
