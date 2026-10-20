<!--
  The end of the first run, and the first of the five minutes: the BrainDog is made, and the person connects their agent.

  ONE APP AT A TIME (the UI pass of 20 October, first F1). A segmented control of the five apps, Claude Code first and
  chosen, each with its maker's mark; under it that app's steps only, numbered where there are two, each step's command
  or address in its own block with its own Copy (`CodeLine`). All of it in one tile at most 720 wide, on the frame's
  start edge. Under the tile the live sign: "Waiting for your agent…" beside a grey dot until the record hears its
  first session, then "Connected: Claude Code on MacBook" beside a green one. It asks the way the connect sheet does
  (`listenFor`, `poll`, every two seconds while the tab is shown), and stops asking once it has heard. "Skip for now"
  and "Go to Today" both go to Today, so nobody is held here.

  `.cmd`, NEVER `.line`: the ledger's global `.line` (`rows.css`) is a four-column grid, and it broke every command
  into a 120px column with its Copy a whole window away (SF5).

  NO KEY IS SHOWN: an MCP app signs in by OAuth and `braindog setup` signs in itself.

  `modules` (`made.modules`) is what was just made; nothing here reads it, and the prop stays so `/start`'s call is unchanged.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { markOf } from '@braindog/skin/agent-marks.ts';
  import { apiBase } from '$lib/at.ts';
  import { heardOf, poll, type Heard } from '$lib/agents/connect.ts';
  import { appLines, firstWords, signOf, type AppLine } from '$lib/agents/first-connect.ts';
  import { listenFor } from '$lib/agents/listen.ts';
  import { INSTALL_LINES, osOf } from '$lib/device.ts';
  import { connectLines } from '$lib/record/device.ts';
  import { step } from '$lib/funnel.ts';
  import Button from '$lib/ui/Button.svelte';
  import CodeLine from '$lib/ui/CodeLine.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';

  let made: { modules?: readonly string[] | null | undefined } = $props();
  void made;

  /* This screen's own words. The sub-line says what connecting does, and no longer asks anybody to paste "its line". */
  const words = {
    sub: 'Pick the app you use. Your agent can then read and update this BrainDog.',
    apps: 'Your app',
    install: 'Install BrainDog',
    connect: 'Connect this BrainDog',
  } as const;

  let heading = $state<HTMLHeadingElement | undefined>(undefined);
  onMount(() => {
    step('signed_up');
    step('saw_connect');
    void tick().then(() => heading?.focus());
  });

  /* THIS RECORD'S LINES: the bare host, and the record's own address where the shell names it. */
  const slug = $derived(page.data.live === true ? (page.data.index?.slug ?? null) : null);
  const apps = $derived(appLines(connectLines(page.url.origin, slug), INSTALL_LINES[osOf(typeof navigator === 'undefined' ? undefined : navigator)]));

  /* CLAUDE CODE FIRST AND CHOSEN, the app a person reading this is likeliest to have. */
  let chosenId = $state<string | null>(null);
  const chosen = $derived(apps.find((a) => a.id === chosenId) ?? apps[0]);

  /** An app's steps: install, then connect, where it needs the command line first; else its one place to paste. */
  const stepsOf = (a: AppLine): { said: string; line: string }[] =>
    a.before !== null ? [{ said: words.install, line: a.before }, { said: words.connect, line: a.line }] : [{ said: a.what, line: a.line }];

  /* THE FUNNEL HEARS A COPY, which `CodeLine` does on its own: a press on any Copy in the steps counts once. */
  function countCopies(el: HTMLElement) {
    const on = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('button')) step('copied_line');
    };
    el.addEventListener('click', on);
    return () => el.removeEventListener('click', on);
  }

  let heard = $state<Heard[]>([]);
  const sign = $derived(signOf(heard));

  /* THE LIVE CHANNEL THE CONNECT SHEET USES, and no faster; it stops for good once an agent has been heard. */
  const listen = listenFor(createClient({ base: apiBase() }));
  let asking = false;
  async function ask() {
    if (asking) return;
    asking = true;
    const said = await listen(false);
    asking = false;
    if (said) heard = heardOf(said.rows);
    if (signOf(heard).connected) step('agent_connected');
  }
  $effect(() => {
    if (sign.connected) return;
    return poll(() => void ask());
  });
</script>

<section class="made" aria-labelledby="made-h">
  <div class="made-tile">
    <header class="head">
      <h1 class="entry-title" id="made-h" tabindex="-1" bind:this={heading}>{firstWords.title}</h1>
      <p class="entry-lede">{words.sub}</p>
    </header>

    <Segmented full role="group" aria-label={words.apps}>
      {#each apps as a (a.id)}
        {@const m = markOf(a.mark)}
        {@const on = a.id === chosen?.id}
        <button type="button" class="segment" data-on={on ? '' : undefined} aria-pressed={on} onclick={() => (chosenId = a.id)}>
          <span class="seg-label"
            ><svg class="mark" data-tone={m.tone} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
              ><path d={m.d} fill-rule={m.rule} clip-rule={m.rule} /></svg
            >{a.name}</span
          >
        </button>
      {/each}
    </Segmented>

    {#if chosen}
      {@const steps = stepsOf(chosen)}
      <ol class="steps" data-numbered={steps.length > 1 ? '' : undefined} {@attach countCopies}>
        {#each steps as s, i (s.said)}
          <li class="cmd-step">
            <p class="cmd-said">
              {#if steps.length > 1}<span class="cmd-n" aria-hidden="true">{i + 1}</span>{/if}{s.said}
            </p>
            <div class="cmd"><CodeLine text={s.line} label={s.said} /></div>
          </li>
        {/each}
      </ol>
    {/if}
  </div>

  <p class="sign" role="status" data-on={sign.connected ? '' : undefined}><span class="dot" aria-hidden="true"></span>{sign.said}</p>

  <div class="go">
    {#if sign.connected}
      <Button weight="primary" href="/">{firstWords.go}</Button>
    {:else}
      <Button weight="bare" href="/">{firstWords.skip}</Button>
    {/if}
  </div>
</section>

<style>
  .made {
    display: grid;
    justify-items: start;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  /* ONE TILE, AT MOST 720, on the frame's start edge: 24 in, 20 on a phone. */
  .made-tile {
    display: grid;
    gap: var(--sp-5);
    box-sizing: border-box;
    inline-size: min(720px, 100%);
    min-inline-size: 0;
    padding: var(--sp-5);
    background: var(--tile);
    border-radius: var(--r-tile);
  }

  @media (width < 640px) {
    .made-tile {
      padding: 20px;
    }
  }

  .head {
    display: grid;
    gap: var(--sp-2);
  }

  /* THE APP'S MARK BEFORE ITS NAME in the segment, 16 at the label's ink, or its maker's colour. */
  .seg-label {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .mark {
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    fill: currentColor;
  }

  .mark[data-tone='claude'] {
    fill: var(--agent-claude);
  }

  .steps {
    display: grid;
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .cmd-step {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .cmd-said {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 22px;
  }

  /* THE STEP'S NUMBER in a 24 well of the quiet fill: a count of steps is not an alarm, so never red. */
  .cmd-n {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: 24px;
    block-size: 24px;
    background: var(--tile-2);
    border-radius: var(--r-round);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .cmd {
    min-inline-size: 0;
  }

  /* WAITING IN THE QUIET INK beside a grey dot; connected in ink beside the live green one. */
  .sign {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .dot {
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--r-round);
    background: var(--ink-3);
    transition: background var(--d-state) var(--ease-out);
  }

  .sign[data-on] {
    color: var(--ink);
    font-weight: 600;
  }

  .sign[data-on] .dot {
    background: var(--live);
  }

  .go :global(.btn) {
    min-block-size: max(40px, var(--ctl-h));
  }

  .go :global(.btn[data-weight='bare']) {
    margin-inline-start: calc(-1 * var(--sp-3));
  }

  @media (forced-colors: active) {
    .mark {
      fill: CanvasText;
    }
  }
</style>
