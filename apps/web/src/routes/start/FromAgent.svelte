<!--
  /start?agent=1: the first run from a person's own agent, modelled on PostHog's install step
  (`docs/19-INTERFACE.md`, "The first run from your own agent").

  THREE THINGS, TOP TO BOTTOM. How to plug in, for any agent and none by name, in the lines Settings, Agents shows; the
  one line to paste into it, with its own Copy; and under them the build, which says it waits until the agent files its
  proposal and is then drawn as the build, in the same tile the start page draws (`Building.svelte`), with Make it mine.

  ASKED EVERY FIVE SECONDS AT THE FASTEST, only while the tab is shown, and never again once the page is left
  (`from-agent.ts`, `watch`). Loaded by `import()` from the start page, so nothing here is in what every screen loads.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { apiBase, at } from '$lib/at.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { osOf } from '$lib/device.ts';
  import CodeForm from '$lib/agents/CodeForm.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Building from './Building.svelte';
  import { approverFor, askBuild, linesFor, makeItMine, watch, words, type Waiting } from './from-agent.ts';

  let {
    base = apiBase(),
    onmade,
  }: {
    /** The record's API base; the page's own by default. */
    base?: string;
    /** Called once the build is made; without it the page opens Today. */
    onmade?: (() => void) | undefined;
  } = $props();

  const ways = $derived(linesFor(base, osOf(globalThis.navigator)));
  /* THE SIX DIGITS `braindog setup` SHOWS, typed under its line, as Settings, Agents takes them. */
  const approve = $derived(approverFor(base));

  /** The build waiting, `null` before one is filed. A read the record did not answer keeps what was drawn. */
  let build = $state.raw<Waiting | null>(null);
  let busy = $state(false);
  let fix = $state<string | null>(null);
  let made = false;

  $effect(() => {
    const from = base;
    let asking = false;
    /* UNTRACKED, so a press turning `busy` on and off does not start the asking over. */
    return untrack(() =>
      watch(() => {
        if (asking || busy || made) return;
        asking = true;
        void askBuild(from)
          .then((got) => {
            if (got !== undefined && !made) build = got;
          })
          .finally(() => (asking = false));
      }),
    );
  });

  async function press() {
    if (!build || busy) return;
    busy = true;
    fix = null;
    const out = await makeItMine(base, build.id);
    busy = false;
    if (!out.ok) {
      fix = out.fix;
      return;
    }
    made = true;
    if (onmade) onmade();
    else await goto(at('/'), { invalidateAll: true });
  }
</script>

{#snippet copyable(line: string, button: string)}
  <div class="copy-line">
    <code class="mono">{line}</code>
    <span class="copy"><Button onclick={() => void clipboard.put(line, line, words.lineCopied)}>{button}</Button></span>
  </div>
{/snippet}

<section class="from-agent" aria-labelledby="from-agent-h">
  <header class="head">
    <h1 id="from-agent-h">{words.title}</h1>
    <p class="headline">{words.headline}</p>
  </header>

  <div class="steps">
    <Tile icon="session" title={words.plugIn}>
      <ol class="ways">
        {#each ways as way (way.hint)}
          <li class="way">
            <p class="hint">{way.hint}</p>
            {#each way.lines as l (l.id)}
              <p class="step">{l.label}</p>
              {@render copyable(l.text, l.copy)}
              {#if l.id === 'setup'}<CodeForm id="from-agent-code" {approve} />{/if}
            {/each}
          </li>
        {/each}
      </ol>
    </Tile>

    <Tile icon="copy" title={words.paste}>
      {@render copyable(words.line, words.copyLine)}
    </Tile>
  </div>

  <div class="build" aria-live="polite">
    {#if build}
      <p class="said" data-build-arrived>{words.arrived}{#if build.why}: {build.why}{/if}</p>
      <Building parts={[]} places={build.places} locale={globalThis.navigator?.language ?? 'en'} meta={words.arrived} />
      <div class="press">
        <Button weight="primary" disabled={busy} onclick={() => void press()}>{busy ? words.makingIt : words.makeIt}</Button>
        {#if fix}<p class="fix" role="status">{words.notMade}. {fix}</p>{/if}
      </div>
    {:else}
      <Tile icon="home" title={words.build}>
        <p class="waiting" data-build-waiting>{words.waiting}</p>
        <p class="hint">{words.waitingWhy}</p>
      </Tile>
    {/if}
    <a class="by-hand" href={at('/start')}>{words.byHand}</a>
  </div>
</section>

<style>
  /* THE BOARD'S OWN WIDTH, with the fluid gutters every page has: never a narrow centred column. */
  .from-agent {
    display: grid;
    gap: var(--sp-5);
    min-inline-size: 0;
  }
  .head {
    display: grid;
    gap: var(--sp-2);
  }
  h1 {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-page);
    font-weight: 600;
    line-height: var(--lead-page);
  }
  .headline {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-head);
    line-height: var(--lead-head);
  }
  /* THE TWO STEPS SIDE BY SIDE WHERE THEY FIT, one above the other on a phone. */
  .steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: var(--sp-4);
    align-items: start;
  }
  .ways {
    display: grid;
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .way {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }
  .hint,
  .step,
  .waiting,
  .said,
  .fix {
    margin: 0;
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }
  .hint,
  .step {
    color: var(--ink-2);
  }
  .waiting,
  .said {
    color: var(--ink);
    font-weight: 500;
  }
  /* A LINE AND ITS COPY on one row where both fit, the button under the line where they do not. */
  .copy-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }
  /* A command is compared character by character, so it is in the code face, breaking anywhere. */
  .mono {
    flex: 1 1 24ch;
    min-inline-size: 0;
    padding-block: var(--sp-2);
    padding-inline: var(--sp-3);
    background: var(--tile);
    border-radius: var(--r-pop);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: var(--fs-body);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  /* THE COPY IS 44PX TALL, the thumb's size, on every pointer: it is the one press this page asks for first. */
  .copy {
    display: inline-flex;
  }
  .copy :global(.btn) {
    min-block-size: 44px;
  }
  .build {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }
  .press {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }
  .press :global(.btn) {
    min-block-size: 44px;
  }
  .fix {
    color: var(--ink-2);
  }
  /* THE ORDINARY START, one link away, as PostHog keeps its manual setup. */
  .by-hand {
    display: inline-flex;
    align-items: center;
    justify-self: start;
    min-block-size: 44px;
    color: var(--red);
    font-size: var(--fs-body);
  }
</style>
