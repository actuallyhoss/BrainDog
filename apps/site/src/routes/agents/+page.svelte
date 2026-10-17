<!--
  Connect your agent: the door the launch is built around (LAUNCH 103, job 5; DIRECTION §47).

  The prototype's connect page, loop/site-2026-10-17/src/site.html `#agents`: the night head with the page's name, one
  line and the connect box; then what an agent gets and what it can't do; then the brief an agent starts with, played
  in a terminal on the made-up record; then the close.

  Every word is `copy/agents.ts`'s and every connect step is `lib/connect/apps.ts`'s. With scripting off the page is
  whole: each app's lines are in the HTML one under another, and the terminal shows every line at once. The skill an
  agent installs is still served at `/agents/braindog/SKILL.md`, by its own route beside this page.
-->
<script lang="ts">
  import ConnectBox from '$lib/connect/ConnectBox.svelte';
  import { agents } from '$lib/copy/agents.ts';
  import { site } from '$lib/copy.ts';
  import { TERM } from '$lib/demo/maya.ts';
  import Term from '$lib/desk/Term.svelte';
  import type { IconName } from '$lib/icons.ts';
  import Icon from '$lib/Icon.svelte';
  import Close from '$lib/site/Close.svelte';
  import PageHead from '$lib/site/PageHead.svelte';

  const a = agents.agents;

  /* One glyph a line, in the lists' order: the brief, a person, the undo; then a key, money, the clock of the trail. */
  const GETS: readonly IconName[] = ['today', 'person', 'undo'];
  const CANNOT: readonly IconName[] = ['lock', 'card', 'clock'];
</script>

<svelte:head>
  <title>{site.meta.agents.title}</title>
  <meta name="description" content={site.meta.agents.description} />
  <link rel="canonical" href="https://brain.dog/agents" />
  <meta property="og:url" content="https://brain.dog/agents" />
  <meta property="og:title" content={site.meta.agents.title} />
  <meta property="og:description" content={site.meta.agents.description} />
</svelte:head>

<PageHead title={a.title} lead={a.lead}>
  <div class="connect">
    <ConnectBox />
  </div>
</PageHead>

<section class="wrap">
  <div class="two-lists">
    <div>
      <h2>{a.gets.title}</h2>
      <ul class="plain">
        {#each a.gets.lines as item, i (item)}
          <li><span class="ico"><Icon name={GETS[i] ?? 'check'} size="s" /></span>{item}</li>
        {/each}
      </ul>
    </div>
    <div>
      <h2>{a.cannot.title}</h2>
      <ul class="plain">
        {#each a.cannot.lines as item, i (item)}
          <li><span class="ico"><Icon name={CANNOT[i] ?? 'x'} size="s" /></span>{item}</li>
        {/each}
      </ul>
    </div>
  </div>

  <div class="story">
    <article class="card paper">
      <div class="split">
        <div class="head">
          <h2>{a.brief.title}</h2>
          <p class="say">{a.brief.say}</p>
        </div>
        <Term lines={TERM} />
      </div>
    </article>
  </div>
</section>

<Close title={a.close.title} body={a.close.body} />

<style>
  .connect {
    max-inline-size: 820px;
    margin-block-start: 40px;
  }

  .two-lists {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 56px;
    padding-block-start: 112px;
  }

  .two-lists h2 {
    margin: 0 0 18px;
    font-size: var(--t-title);
    line-height: 1.1;
    letter-spacing: -0.035em;
  }

  .plain {
    display: grid;
    gap: 14px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .plain li {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 10px;
    font-size: var(--t-site-16-5);
    line-height: 1.5;
    color: var(--ink2);
  }

  .ico {
    display: inline-flex;
    margin-block-start: 3px;
    color: var(--muted);
  }

  .story {
    display: grid;
    gap: 20px;
    padding-block-start: 112px;
  }

  .split {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 56px;
    align-items: center;
  }

  .split h2 {
    margin: 0;
    font-size: clamp(2.3rem, 4.5vw, 3.9rem);
    line-height: 1;
    letter-spacing: -0.045em;
    max-inline-size: 12ch;
    text-wrap: balance;
  }

  @media (max-width: 1060px) {
    .split {
      grid-template-columns: minmax(0, 1fr);
      gap: 32px;
    }

    .two-lists {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 760px) {
    .two-lists {
      padding-block-start: 72px;
    }

    .story {
      padding-block-start: 80px;
      gap: 14px;
    }
  }
</style>
