<!--
  The end of the first run, and the first of the five minutes: the BrainDog is made, and the person is shown what to do
  first, in the app, and then, for whoever uses one, how to connect an AI app.

  TODAY LEADS, THE AGENT IS SECOND (first hour audit, E3). The screen opened on "Connect your agent" with Claude Code's
  `curl` install chosen and a small "Skip for now" at its foot, for a bakery, while the site says connecting an AI tool
  is optional and nobody needs to be technical. Now the first tile says what was made and the one thing to do on Today,
  with "Go to Today" as the press; the second tile, under it, is the connect step for people who want it.

  ONE APP AT A TIME (first F1), in the second tile. A segmented control of the five apps, Claude Code first and chosen,
  each with its maker's mark; under it that app's steps only, numbered where there are two, each step's command or
  address in its own block with its own Copy (`CodeLine`). Under them the live sign: "Waiting for your agent…" beside a
  grey dot until the record hears its first session, then "Connected: Claude Code on MacBook" beside a green one. It asks
  the way the connect sheet does (`listenFor`, `poll`, every two seconds while the tab is shown), and stops asking once
  it has heard. Both tiles at most 720 wide, on the frame's start edge.

  `.cmd`, NEVER `.line`: the ledger's global `.line` (`rows.css`) is a four-column grid, and it broke every command
  into a 120px column with its Copy a whole window away.

  NO KEY IS SHOWN: an MCP app signs in by OAuth and `braindog setup` signs in itself.

  `modules` (`made.modules`) is what was just made; nothing here reads it, and the prop stays so `/start`'s call is unchanged.
  `places` are the names of the places made, said in one line over the first step, so the screen first says what
  was built. On a phone (under 640) Claude comes first and chosen, since nobody runs a terminal command there, and a
  command breaks only at its spaces (`CodeLine` `words`).
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { focusWhenDrawn } from '$lib/ui/keep-focus.ts';
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

  let made: { modules?: readonly string[] | null | undefined; places?: readonly string[] | null | undefined } = $props();
  const madeLine = $derived(firstWords.made(made.places ?? []));

  /* This screen's own words for the connect steps; the titles are `firstWords`. */
  const words = {
    apps: 'Your app',
    install: 'Install BrainDog',
    connect: 'Connect this BrainDog',
    /* WHAT `braindog setup` DOES NEXT, so the link and the six digits it prints are expected and not a surprise. */
    approve: 'It prints a link and six digits. Open the link, type the digits, and the terminal carries on.',
  } as const;

  let heading = $state<HTMLHeadingElement | undefined>(undefined);
  onMount(() => {
    step('signed_up');
    step('saw_connect');
    void tick().then(() => heading?.focus());
  });
  /* AND AGAIN ONCE THE NAVIGATION HAS SETTLED (first-hour audit AH20): after the passkey the router put the focus back on
     the page after this mounted, so a keyboard started from the top. Only where it fell to the page. */
  afterNavigate(() => focusWhenDrawn(() => heading));

  /* THIS RECORD'S LINES: the bare host, and the record's own address where the shell names it. */
  const slug = $derived(page.data.live === true ? (page.data.index?.slug ?? null) : null);
  /* UNDER 640, A PHONE: the apps with no terminal come first (`appLines`). Read once; a turned phone keeps its choice. */
  const phone = globalThis.matchMedia?.('(width < 640px)').matches ?? false;
  const apps = $derived(appLines(connectLines(page.url.origin, slug), INSTALL_LINES[osOf(typeof navigator === 'undefined' ? undefined : navigator)], phone));

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
  /* THE YES OR NO ALONE, which the poll hangs on: `signOf` makes a new object each time, and an effect over it ran
     again on every answer. A kept read answers from memory at once, so that loop never let the page paint. */
  const connected = $derived(sign.connected);

  /** The same calls, heard at the same times: a kept read's answer moves nothing. */
  const same = (a: readonly Heard[], b: readonly Heard[]): boolean =>
    a.length === b.length && a.every((h, i) => h.tile === b[i]?.tile && h.app === b[i]?.app && h.machine === b[i]?.machine && h.at === b[i]?.at);

  /* THE LIVE CHANNEL THE CONNECT SHEET USES, and no faster; it stops for good once an agent has been heard. */
  const listen = listenFor(createClient({ base: apiBase() }));
  let asking = false;
  async function ask() {
    if (asking) return;
    asking = true;
    const said = await listen(false);
    asking = false;
    if (!said) return;
    const next = heardOf(said.rows);
    if (same(next, heard)) return;
    heard = next;
    if (signOf(next).connected) step('agent_connected');
  }
  $effect(() => {
    if (connected) return;
    /* `untrack`, as the connect sheet asks: what an ask reads never starts the poll again. */
    return poll(() => untrack(() => void ask()));
  });
</script>

<section class="made" aria-labelledby="made-h">
  <div class="made-tile">
    <header class="head">
      <p class="made-line">{madeLine}</p>
      <h1 class="entry-title" id="made-h" tabindex="-1" bind:this={heading}>{firstWords.title}</h1>
      <p class="entry-lede">{firstWords.sub}</p>
    </header>
    <div class="go">
      <Button weight="primary" href="/">{firstWords.go}</Button>
    </div>
  </div>

  <section class="made-tile agent" aria-labelledby="agent-h">
    <header class="head">
      <h2 class="agent-h" id="agent-h">{firstWords.agentTitle}</h2>
      <p class="agent-sub">{firstWords.agentSub}</p>
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
            <div class="cmd"><CodeLine text={s.line} label={s.said} words /></div>
            {#if s.line.startsWith('braindog setup')}<p class="cmd-then">{words.approve}</p>{/if}
          </li>
        {/each}
      </ol>
    {/if}

    <p class="sign" role="status" data-on={sign.connected ? '' : undefined}><span class="dot" aria-hidden="true"></span>{sign.said}</p>
  </section>
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

  /* THE SECOND STEP READS AS ONE: a heading in the head size, under the page's title, never a second page title. */
  .agent-h {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: 24px;
    text-wrap: balance;
  }

  .agent-sub {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
    text-wrap: pretty;
  }

  /* WHAT WAS MADE, over the title in the body size and ink, so the first thing read is the record, not a command. */
  .made-line {
    margin: 0 0 var(--sp-2);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 22px;
    text-wrap: pretty;
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

  .cmd-then {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
    text-wrap: pretty;
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

  @media (forced-colors: active) {
    .mark {
      fill: CanvasText;
    }
  }
</style>
