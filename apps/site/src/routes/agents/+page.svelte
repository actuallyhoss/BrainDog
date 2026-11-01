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
  const GETS: readonly IconName[] = ['today', 'person', 'undo'];
  const CANNOT: readonly IconName[] = ['lock', 'card', 'clock'];

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
        <li><span class="ico"><Icon name={GETS[i] ?? 'check'} /></span>{item}</li>
      {/each}
    </ul>
  </div>
  <div>
    <h2>{a.cannot.title}</h2>
    <ul class="plain">
      {#each a.cannot.lines as item, i (item)}
        <li><span class="ico"><Icon name={CANNOT[i] ?? 'x'} /></span>{item}</li>
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
  <ul>
    {#each a.dev.links as link (link.href)}
      <li><a href={link.href}>{link.label}<Icon name="arrow-right" size="s" /></a></li>
    {/each}
  </ul>
</section>

<EarlyStrip />

<style>
  .connect {
    max-inline-size: 820px;
    margin-block-start: 40px;
  }

  .lists {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 56px;
    padding-block-start: 96px;
  }

  .lists h2,
  .dev h2 {
    margin: 0 0 20px;
    font-size: var(--t-site-28);
    line-height: 1.1;
    letter-spacing: -0.035em;
  }

  .plain {
    display: grid;
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .plain li {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    color: var(--ink2);
    font-size: var(--t-site-17);
    line-height: 1.5;
  }

  /* AN 18PX ICON IN A 32PX WELL, as the app's tile heads draw theirs. */
  .ico {
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink2);
  }

  .ico :global(.icon) {
    inline-size: 18px;
    block-size: 18px;
  }

  .brief {
    padding-block-start: 96px;
  }

  .split {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 48px;
    align-items: center;
    background: var(--paper);
  }

  .dev {
    padding-block: 96px;
  }

  .dev ul {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 32px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--t-site-16);
  }


  .dev a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-block-size: 32px;
    color: var(--ink);
    font-weight: 600;
    text-decoration: none;
  }

  .dev a:hover {
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  @media (pointer: coarse) {
    .dev a {
      min-block-size: var(--tap);
    }
  }

  @media (max-width: 1060px) {
    .split {
      grid-template-columns: minmax(0, 1fr);
      gap: 32px;
    }

    .lists {
      grid-template-columns: minmax(0, 1fr);
      gap: 48px;
    }
  }

  @media (max-width: 760px) {
    .lists,
    .brief {
      padding-block-start: 64px;
    }

    .dev {
      padding-block: 64px;
    }

    .dev ul {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
