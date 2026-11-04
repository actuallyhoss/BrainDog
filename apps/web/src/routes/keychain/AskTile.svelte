<!--
  KEYCHAIN ACCESS ASKS, at the top of the Keychain while any wait: "<machine> wants to use <key>" with Allow once, Always
  allow and Deny. It reads again when the page's data changes (`refresh`) and on a short poll while the page is open, and
  it draws nothing when no ask waits. `?ask=` (an alert's link) marks that ask, and says so if it was answered already.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { createClient } from '@braindog/client';
  import { since } from 'braindog-render';
  import Button from '$lib/ui/Button.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { accessWords as w, askLine, askRun, focusOf, waitingAsks, type KeyAsk } from './access.ts';

  const POLL_MS = 15_000;

  let {
    client,
    refresh = 0,
    focus = null,
    paused = false,
    acts = true,
    onread,
  }: {
    client: ReturnType<typeof createClient> | null;
    /** Bumped by the page when its own data changes. */
    refresh?: number;
    /** The ask an alert linked to. */
    focus?: string | null;
    /** The screen is locked: the record would refuse the read, so none is made. */
    paused?: boolean;
    acts?: boolean;
    /** Its first read is back, asks or none: the page shows what it held out of sight under it (nojump, 2 Nov). */
    onread?: (() => void) | undefined;
  } = $props();

  let list = $state.raw<KeyAsk[]>([]);
  let now = $state(Date.now());
  let busy = $state<string | null>(null);
  const waiting = $derived(waitingAsks(list, now));
  const pointed = $derived(focusOf(list, focus, now));

  async function load() {
    if (paused) onread?.();
    if (!client || paused) return;
    const out = await client.keyAsks({ recent: focus !== null }).catch(() => null);
    if (out && out.ok) {
      list = out.value.asks as KeyAsk[];
      now = Date.now();
    }
    onread?.();
  }

  onMount(() => {
    const t = setInterval(() => void load(), POLL_MS);
    const tick = setInterval(() => (now = Date.now()), 1000);
    return () => {
      clearInterval(t);
      clearInterval(tick);
    };
  });
  $effect(() => {
    void refresh;
    void client;
    void paused;
    void load();
  });
  $effect(() => {
    if (focus && pointed?.waiting) document.getElementById(`ask-${focus}`)?.scrollIntoView({ block: 'center' });
  });

  async function answer(a: KeyAsk, how: 'once' | 'always' | 'deny') {
    if (!client || busy) return;
    busy = a.id;
    const out = await client.answerKeyAsk({ id: a.id, answer: how }).catch(() => null);
    busy = null;
    if (!out || !out.ok) toasts.push(out && 'refusal' in out ? out.refusal.fix : w.answerRefused, { intent: 'warn' });
    await load();
  }
</script>

{#if waiting.length}
  <Tile icon="lock" title={w.askTitle} count={waiting.length > 1 ? waiting.length : undefined} data-part="key-asks">
    <ul class="ledger asks">
      {#each waiting as a, i (a.id)}
        <li id={`ask-${a.id}`} data-intent="warn" data-needs data-focus={focus === a.id ? '' : undefined}>
          <div class="ask">
            <span class="ask-mark"><IconWell name="key" size="l" /></span>
            <span class="ask-main">
              <span class="ask-title" data-own>{askLine(a)}</span>
              {#if askRun(a)}<span class="ask-detail" data-own>{askRun(a)}</span>{/if}
            </span>
            <span class="ask-when">{since(a.expires, now)}</span>
            {#if acts}
              <span class="ask-verbs">
                <!-- ONE RED ON THE SCREEN: the first request's Allow once; any under it answers in ink. -->
                <Button size="sm" weight={i === 0 ? 'primary' : 'ink'} disabled={busy !== null} onclick={() => void answer(a, 'once')}>{w.allowOnce}</Button>
                <Button size="sm" disabled={busy !== null} onclick={() => void answer(a, 'always')}>{w.allowAlways}</Button>
                <Button size="sm" weight="quiet" disabled={busy !== null} onclick={() => void answer(a, 'deny')}>{w.deny}</Button>
              </span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </Tile>
{:else if focus && pointed && !pointed.waiting}
  <Tile icon="lock" title={w.askTitle} data-part="key-asks"><p class="said">{w.answered}</p></Tile>
{/if}

<style>
  /* AN ASK IS A TALL LEDGER ROW: the key's well, what wants it over the run, when it lapses, and the three answers,
     always shown because every ask waits on him. Hairlines between asks, as `rows.css` draws them. */
  .ask {
    position: relative;
    display: grid;
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    padding: var(--sp-2) var(--sp-3);
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .asks > li + li > .ask::after {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: var(--sp-3);
    block-size: 1px;
    background: var(--rule);
    pointer-events: none;
  }

  .ask-mark {
    display: grid;
    place-items: center;
    inline-size: var(--well-l);
  }

  .ask-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .ask-title {
    font-weight: 500;
    line-height: calc(20px * var(--type, 1));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ask-detail {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  .ask-when {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .ask-verbs {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* On a phone the answers take a line of their own under the words. */
  @media (width < 640px) {
    .ask {
      grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    }

    .ask-title {
      white-space: normal;
    }

    .ask-verbs {
      grid-column: 2 / -1;
      flex-wrap: wrap;
    }
  }
</style>
