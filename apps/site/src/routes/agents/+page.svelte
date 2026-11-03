<!--
  Connect your agents: the door the launch is built around, rewritten in the redesign so anyone reads it: the night
  head with the page's name, one line and the connect box; then the briefing a session starts with, played in a
  terminal on the made-up record (first since the 3 November story: the picture explains it faster than the list);
  then what every session starts with and how an agent earns your trust, each line with its icon in a well; then the
  agents working now with Pause and Stop beside them; then a row of plain links for developers (the MCP address is the
  connect box's, said once there: plan F18); then the early access strip.

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
  import { TERM, TODAY } from '$lib/demo/maya.ts';
  import AgentMark from '$lib/AgentMark.svelte';
  import TermWindow from '$lib/site/TermWindow.svelte';
  import { DESK } from '$lib/desk/words.ts';
  import type { IconName } from '$lib/icons.ts';
  import Icon from '$lib/Icon.svelte';
  import EarlyStrip from '$lib/site/EarlyStrip.svelte';
  import PageHead from '$lib/site/PageHead.svelte';

  const a = agents.agents;

  /* One glyph a line, in the lists' order: where things stand, who else is working, the lessons, the keys by name;
     then the question, the undo that drops it back, the floor that never climbs, the name on every change. */
  const GETS: readonly IconName[] = ['today', 'users', 'book', 'key'];
  const CANNOT: readonly IconName[] = ['decide', 'undo', 'lock', 'history'];

  /* THE DRAWN AGENTS PAGE: Pause and Stop answer on the drawing, as the home page's questions do, so a button that
     looks pressable does something. Nothing leaves the page. */
  let said = $state<Record<string, 'paused' | 'stopped' | undefined>>({});
  const pause = (id: string): void => {
    said[id] = said[id] === 'paused' ? undefined : 'paused';
  };
  const stop = (id: string): void => {
    said[id] = 'stopped';
  };

</script>

<Seo title={site.meta.agents.title} description={site.meta.agents.description} path="/agents" ld={[crumbsOf([{ name: 'BrainDog', path: '/' }, { name: site.nav.agents, path: '/agents' }])]} />
<PageHead title={a.title} lead={a.lead}>
  <div class="connect">
    <ConnectBox />
  </div>
</PageHead>

<section class="wrap brief">
  <div class="ftile split">
    <div>
      <h2 class="band-h2">{a.brief.title}</h2>
      <p class="band-say">{a.brief.say}</p>
    </div>
    <TermWindow title="zsh: ~/code/tidepool" label={DESK.agents.terminal} lines={TERM} play />
  </div>
</section>

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

<section class="wrap watch">
  <div class="ftile split">
    <div>
      <h2 class="band-h2">{a.watch.title}</h2>
      <p class="band-say">{a.watch.say}</p>
    </div>
    <div class="now" role="group" aria-label={a.watch.label}>
      <p class="thd"><span class="well"><Icon name="agent" /></span>{a.watch.head}<span class="r num">{TODAY.working.length}</span></p>
      <ul>
        {#each TODAY.working as w (w.agent)}
          {@const state = said[w.agent]}
          <li class:held={state}>
            <span class="face"><AgentMark id={w.agent} size={16} /></span>
            <span class="grow"><b>{w.what}</b><span>{state === 'stopped' ? a.watch.stopped : state === 'paused' ? a.watch.paused : w.sub}</span></span>
            {#if state !== 'stopped'}
              <span class="acts">
                <button type="button" class="btn line sm" onclick={() => pause(w.agent)}><Icon name={state === 'paused' ? 'play' : 'pause'} size="s" />{state === 'paused' ? a.watch.resume : a.watch.pause}</button>
                <button type="button" class="btn line sm" onclick={() => stop(w.agent)}>{a.watch.stop}</button>
              </span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
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
    padding-block-start: var(--band-pad);
  }

  .lists h2,
  .dev h2 {
    margin: 0 0 24px;
    font-size: var(--t-feature);
    line-height: 1.1;
    letter-spacing: -0.03em;
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
    border-radius: 50%;
    background: var(--paper);
    color: var(--ink2);
  }

  .ico :global(.icon) {
    inline-size: 18px;
    block-size: 18px;
  }

  .brief {
    padding-block-start: var(--first-pad);
  }

  .watch {
    padding-block-start: var(--band-pad);
  }

  /* THE DRAWN AGENTS PAGE: one white card in the paper tile, as the drawings on the other pages are, with the desk's
     head row, faces and two lines a row. */
  .now {
    padding: 20px 22px;
    border-radius: var(--r-tile);
    background: var(--desk-tile);
    box-shadow: var(--shadow-card);
    color: var(--ink);
  }

  .thd {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px;
    font: 600 15px/1.3 var(--ui);
  }

  .thd .well {
    display: grid;
    place-items: center;
    color: var(--muted);
  }

  .thd .well :global(.icon) {
    inline-size: 18px;
    block-size: 18px;
  }

  .thd .r {
    margin-inline-start: auto;
    color: var(--muted);
    font-size: var(--t-site-13);
    font-weight: 500;
  }

  .now ul {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .now li {
    display: flex;
    align-items: center;
    gap: 12px;
    min-block-size: 56px;
    padding: 10px 0;
    border-block-start: 1px solid var(--rule);
  }

  .now li:first-child {
    border-block-start: 0;
  }

  .face {
    position: relative;
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: 50%;
    background: var(--desk-tile-2);
  }

  /* The live dot, gone once the agent is paused or stopped. */
  .face::after {
    content: '';
    position: absolute;
    inset-block-end: -1px;
    inset-inline-end: -1px;
    inline-size: 8px;
    block-size: 8px;
    border-radius: 50%;
    background: var(--live);
    box-shadow: 0 0 0 2px var(--desk-tile);
  }

  .held .face::after {
    display: none;
  }

  .grow {
    flex: 1;
    min-inline-size: 0;
  }

  .grow b {
    display: block;
    font-weight: 600;
  }

  .grow span {
    display: block;
    color: var(--muted);
    font-size: var(--t-site-13);
  }

  .acts {
    display: flex;
    flex: none;
    gap: 8px;
  }

  .acts .btn {
    gap: 6px;
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
    .now {
      padding: 16px;
    }

    .now li {
      flex-wrap: wrap;
    }

    .acts {
      inline-size: 100%;
      padding-inline-start: 40px;
    }

    .dev .onwards {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
