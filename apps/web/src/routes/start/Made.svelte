<!--
  The end of the first run, and the first of the five minutes: the BrainDog is made, and the person connects their agent.

  ONE LINE PER APP, each with the exact command or address for THIS record and a Copy (`first-connect.ts`), and under
  them the live sign: "Waiting for your agent…" until the record hears its first session, then "Connected: Claude Code
  on MacBook". It asks the way the connect sheet does (`listenFor`, `poll`, every two seconds while the tab is shown),
  and stops asking once it has heard. "Skip for now" and "Go to Today" both go to Today, so nobody is held here.

  NO KEY IS SHOWN: an MCP app signs in by OAuth and `braindog setup` signs in itself.

  `modules` (`made.modules`) is what was just made; nothing here reads it, and the prop stays so `/start`'s call is unchanged.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { markOf } from '@braindog/skin/agent-marks.ts';
  import { apiBase } from '$lib/at.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { copy } from '$lib/copy.ts';
  import { heardOf, poll, type Heard } from '$lib/agents/connect.ts';
  import { appLines, firstWords, signOf } from '$lib/agents/first-connect.ts';
  import { listenFor } from '$lib/agents/listen.ts';
  import { connectLines } from '$lib/record/device.ts';
  import Button from '$lib/ui/Button.svelte';

  let made: { modules?: readonly string[] | null | undefined } = $props();
  void made;

  let heading = $state<HTMLHeadingElement | undefined>(undefined);
  onMount(() => void tick().then(() => heading?.focus()));

  /* THIS RECORD'S LINES: the bare host, and the record's own address where the shell names it. */
  const slug = $derived(page.data.live === true ? (page.data.index?.slug ?? null) : null);
  const apps = $derived(appLines(connectLines(page.url.origin, slug)));

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
  }
  $effect(() => {
    if (sign.connected) return;
    return poll(() => void ask());
  });
</script>

<section class="made" aria-labelledby="made-h">
  <header class="head">
    <h1 class="made-title" id="made-h" tabindex="-1" bind:this={heading}>{firstWords.title}</h1>
    <p class="sub">{firstWords.sub}</p>
  </header>

  <ul class="apps">
    {#each apps as a (a.id)}
      {@const m = markOf(a.mark)}
      <li class="app">
        <svg class="mark" data-tone={m.tone} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
          ><path d={m.d} fill-rule={m.rule} clip-rule={m.rule} /></svg
        >
        <div class="words">
          <span class="name">{a.name}</span>
          <span class="what">{a.what}</span>
          <code class="line mono">{a.line}</code>
        </div>
        <Button size="sm" onclick={() => void clipboard.put(a.line, a.line, copy.lineCopied)}>{a.button}</Button>
      </li>
    {/each}
  </ul>

  <p class="sign" role="status" data-on={sign.connected ? '' : undefined}>{sign.said}</p>

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
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .head {
    display: grid;
    gap: var(--sp-2);
  }

  .made-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-title);
    font-weight: 600;
    line-height: 1.2;
  }

  .made-title:focus {
    /* focus-ok: the heading takes focus only by script (tabindex -1) as the screen arrives, so a reader is told where
       it is; nobody tabs to it, and a ring round the title would read as a control. */
    outline: none;
  }

  .sub {
    margin: 0;
    color: var(--ink2);
  }

  .apps {
    display: grid;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .app {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: var(--sp-3);
    align-items: start;
    min-inline-size: 0;
  }

  .mark {
    flex: none;
    inline-size: var(--icon-l);
    block-size: var(--icon-l);
    fill: currentColor;
    color: var(--ink);
  }

  .mark[data-tone='claude'] {
    fill: var(--agent-claude);
  }

  .words {
    display: grid;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .name {
    color: var(--ink);
    font-weight: 600;
  }

  .what {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* A long line breaks anywhere so it never pushes the page sideways at 390px. */
  .line {
    overflow-wrap: anywhere;
    color: var(--ink);
    font-size: var(--t-sm);
  }

  .sign {
    margin: 0;
    color: var(--ink2);
  }

  .sign[data-on] {
    color: var(--ink);
    font-weight: 600;
  }

  @media (forced-colors: active) {
    .mark {
      fill: CanvasText;
    }
  }
</style>
