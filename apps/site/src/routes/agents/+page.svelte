<!--
  Connect your AI tools: the door the launch is built around, rewritten in the redesign so anyone reads it: the night head with the page's name, one line and the connect box; then
  what an AI tool gets and what it can't do, each line with its icon in a well; then the brief an AI tool starts with,
  played in a terminal on the made-up record; then a row of plain links for developers (the MCP address is the connect
  box's, said once there: plan F18); then the early access strip.

  Every word is `copy/agents.ts`'s and every connect step is `lib/connect/apps.ts`'s. With scripting off the page is
  whole: each app's lines are in the HTML one under another, and the terminal shows every line at once. The skill an agent installs is still served at `/agents/braindog/SKILL.md`,
  by its own route beside this page.
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
  const GETS: readonly IconName[] = ['today', 'person', 'code', 'undo'];
  /* A key; money; people, which the switch never covers; the clock of the trail. */
  const CANNOT: readonly IconName[] = ['lock', 'card', 'users', 'clock'];

</script>

<Seo title={site.meta.agents.title} description={site.meta.agents.description} path="/agents" ld={[crumbsOf([{ name: 'BrainDog', path: '/' }, { name: site.nav.agents, path: '/agents' }])]} />
<PageHead title={a.title} lead={a.lead}>
  <div class="connect">
    <ConnectBox />
  </div>
</PageHead>

<section class="wrap lists">
  <div>
    <h2>{a.gets.title}</h2>
    <ul class="plain">
      {#each a.gets.lines as item, i (item)}
        <li><span class="ico"><Icon name={GETS[i] ?? 'check'} /></span><span>{item}</span></li>
      {/each}
    </ul>
  </div>
  <div>
    <h2>{a.cannot.title}</h2>
    <ul class="plain">
      {#each a.cannot.lines as item, i (item)}
        <li><span class="ico"><Icon name={CANNOT[i] ?? 'x'} /></span><span>{item}</span></li>
      {/each}
    </ul>
  </div>
</section>

<section class="wrap brief">
  <div class="ftile split">
    <div>
      <h2 class="band-h2">{a.brief.title}</h2>
      <p class="band-say">{a.brief.say}</p>
    </div>
    <Term lines={TERM} />
  </div>
</section>

<section class="wrap dev" aria-labelledby="dev-title">
  <h2 id="dev-title">{a.dev.title}</h2>
  <ul class="onwards">
    {#each a.dev.links as link (link.href)}
      <li><a class="onward" href={link.href}>{link.label}<Icon name="arrow-right" size="s" /></a></li>
    {/each}
  </ul>
</section>

<EarlyStrip />

<style>
  .connect {
    max-inline-size: 820px;
    margin-block-start: 40px;
  }

  /* THE PAGE'S SECTIONS ON THE SITE'S STEPS (polish, 2 November): the first one the first step under the night head,
     the rest a band step apart, each title at the feature step. They were 96 apart on a desk and 64 on a phone. */
  .lists {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 48px 56px;
    padding-block-start: var(--first-pad);
  }

  .lists h2,
  .dev h2 {
    margin: 0 0 24px;
    font-size: var(--t-feature);
    line-height: 1.1;
    letter-spacing: -0.021em;
  }

  .plain {
    display: grid;
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* EACH LINE BESIDE ITS ICON, the icon level with the first line when the words run to two. */
  .plain li {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    gap: 14px;
    align-items: start;
    color: var(--ink2);
    font-size: var(--t-say);
    line-height: 1.5;
  }

  .plain li > span:last-child {
    padding-block-start: calc((32px - 1.5em) / 2);
    text-wrap: pretty;
  }

  /* AN 18PX ICON IN A 32PX WELL, as the app's tile heads draw theirs. */
  .ico {
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    border-radius: var(--r-ctl);
    background: var(--paper);
    color: var(--ink2);
  }

  .ico :global(.icon) {
    inline-size: 18px;
    block-size: 18px;
  }

  .brief {
    padding-block-start: var(--band-pad);
  }

  .split {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 48px;
    align-items: center;
    background: var(--paper);
  }

  .dev {
    padding-block: var(--band-pad);
  }

  .dev h2 {
    margin-block-end: 16px;
  }

  @media (max-width: 1060px) {
    .split {
      grid-template-columns: minmax(0, 1fr);
      gap: 32px;
    }

    .lists {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 760px) {
    .dev .onwards {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
