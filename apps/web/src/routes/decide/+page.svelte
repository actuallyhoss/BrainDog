<!--
  Decide: every open question, ranked by the COST OF BEING WRONG, as a declared page drawn by the one page reader.

  A PAGE BODY LIKE ANY OTHER (DIRECTION §35). Its blocks are `views.ts` `decideHome`, drawn by the record with
  `previewPage` and through `PageView`, as Today's are: the head says how many wait and what the first suggests, the first
  question is drawn whole with its suggestion, why and what accepting it does, the rest are cards answered where they
  are shown, and what was put off and what was decided are folded shut under them. How the calls went is the one part
  the record does not answer as a block yet, so it is drawn here, under the page.

  CALM. No group control, no Select and no key hints in the head: a card's box shows on hover or focus, and the keys
  are the page reader's (`j`, `k`, `x`, Enter). A part that holds nothing is not drawn.

  THE OLD SCREEN IS KEPT, at `/decide?classic` (`Classic.svelte`), until this page does everything it did, and it is
  what a host too old to draw a body is shown. It is loaded only when it is asked for.

  `/decide/<id>` IS WHERE ONE QUESTION IS EXAMINED, and every card here opens it.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { untrack } from 'svelte';
  import { page as route } from '$app/state';
  import { since } from 'braindog-render';
  import type { QueueQuestion } from '@braindog/kernel';
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import { copy } from '$lib/copy.ts';
  import { said } from '$lib/voice.svelte.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import type { Opened } from '$lib/record/page-live.ts';
  import { typing } from '$lib/a11y/keys.svelte.ts';
  import { proposer } from '$lib/page/queue-answer.ts';
  import { listen } from '$lib/page/listen.svelte.ts';
  import PageView from '$lib/page/PageView.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import AskSheet from '$lib/ui/AskSheet.svelte';
  import Waffle from '$lib/viz/Waffle.svelte';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';
  import { mayAnswer, whyNotAnswering } from './answering.ts';
  import { callsRead, dayWord, decideDrawn, readCalls, readDecide, WORDS, type Call } from './views.ts';
  import { words } from './words.ts';

  let { data } = $props();

  const classic = $derived(route.url.searchParams.has('classic'));

  /* ── the reader ──────────────────────────────────────────────────────────── */

  const shell = $derived(route.data as unknown as Shell);
  const me = $derived(shell.me);
  const names = $derived(new Map(Object.entries(shell.names ?? {})));
  /* WHO MAY ANSWER, said before anybody presses: a card draws its options as words for a reader who may not
     (`QueueAnswer.svelte`), and this sentence says why, in the record's own words (`answering.ts`). */
  const answerable = $derived(mayAnswer(me.level, me.owner));
  const whyNot = $derived(whyNotAnswering(me.level, me.lists));

  /** Who asked the first question, by name, for the head's line; nothing for the reader themself. */
  function askerOf(q: QueueQuestion): string {
    const who = proposer(q.who, me.person || null, names);
    return who.kind === 'you' ? '' : who.name;
  }

  /* ── the read ────────────────────────────────────────────────────────────── */

  /** The record's answer for the page, `null` while it is out. */
  let got = $state<Opened | null>(null);
  /** A host too old to draw a body, which is shown the classic screen. */
  let unserved = $state(false);
  let calls = $state<Call[]>([]);
  let client: ReturnType<typeof createClient> | null = null;
  /** A read of the page's own is out: `listen` waits for it rather than asking again on top of it. */
  let reading = false;

  async function read(): Promise<boolean> {
    reading = true;
    client ??= createClient({ base: apiBase() });
    try {
      const [out, called] = await Promise.all([readDecide(apiBase()), readCalls(client)]);
      /* THE CALLS ARE THE PAGE'S COMPANY, NOT ITS CONDITION: a refusal of them keeps what was drawn before. */
      if (called.from === 'live') calls = called.value;
      /* A HOST TOO OLD TO DRAW THE BODY IS TOLD FROM THE FIRST ANSWER, and a later read that is refused keeps the page
         as it was drawn rather than blanking it for one sentence. */
      if (out === null) unserved = got === null;
      else if (out.from === 'live' || got === null) got = out;
      return out?.from === 'live';
    } finally {
      reading = false;
    }
  }

  $effect(() => {
    if (classic) return;
    untrack(() => {
      const at = opened();
      void read()
        .then((ok) => closed(ok, at))
        .catch(() => closed(false, at));
    });
  });

  /* A LANDED WRITE, AND A NEW VERSION OF THE RECORD, READ THE PAGE AGAIN without blanking it: an answered question
     goes, and one asked elsewhere arrives. */
  async function reread() {
    try {
      await read();
    } catch {
      /* The page as it was read stays; the next version asks again. */
    }
  }
  listen(reread, () => classic || reading || typing() || document.querySelector('main [aria-busy="true"]') !== null);

  /* ── the page as Decide draws it ─────────────────────────────────────────── */

  const live = $derived(got?.from === 'live' ? got : null);
  const shaped = $derived(live ? decideDrawn(live.page.blocks, live.now, askerOf) : null);
  const drawn = $derived<Opened | null>(got && got.from === 'live' && shaped ? { ...got, page: { page: got.page.page, blocks: shaped.blocks } } : got);
  /* NOTHING TO DRAW AT ALL: the head says so, and the other queue is offered when something waits in it. */
  const cleared = $derived(shaped !== null && !shaped.drawsAny);
  const now = $derived(live?.now ?? 0);
  const went = $derived(callsRead(calls));
  const checked = $derived(went.met + went.missed + went.unread);

  /* ASKING YOURSELF A QUESTION, filed through `AskSheet`; the new question is read back into the queue it joins. */
  let asking = $state(false);
  function filed() {
    asking = false;
    void reread();
  }

  $effect(() => {
    if (live) drew('ready');
  });
</script>

<svelte:head>
  {#if !classic && !unserved}<title>{titleOf(said('decide'))}</title>{/if}
</svelte:head>

{#if classic || unserved}
  {#await import('./Classic.svelte') then loaded}
    <loaded.default {data} />
  {/await}
{:else}
  <!-- THE LINE SAYS HOW MANY WAIT, in words with the first question's suggestion, so the title carries no count; on a
       page with nothing at all to draw the cleared mark under it says that, once. Asking yourself a question is the one
       ink pill, and only for somebody who may answer. -->
  <PageHead icon="decide" title={said('decide')} sentence={cleared ? undefined : shaped?.sentence.text} needs={shaped?.sentence.needs || undefined}>
    {#snippet actions()}
      {#if answerable}<Button weight="primary" onclick={() => (asking = true)}>{WORDS.ask}</Button>{/if}
    {/snippet}
  </PageHead>

  <AskSheet open={asking} onclose={() => (asking = false)} onfiled={filed} />

  <div class="page">
    {#if !answerable && (shaped?.open ?? 0) > 0}
      <!-- WHY THE CARDS OFFER THEIR OPTIONS AS WORDS, above them and not after a press. -->
      <p class="cannot" id="cannot-decide">{whyNot}</p>
    {/if}

    {#if cleared}
      <Empty kind="cleared" title={said('no_questions')}>
        {#snippet actions()}
          {#if Number(route.data.inbox ?? 0) > 0}<Button href="/inbox">{copy.decideOpenInbox}</Button>{/if}
        {/snippet}
      </Empty>
    {:else}
      <div class="body">
        <PageView slug="decide" got={drawn} mode="home" select {reread} />
      </div>
    {/if}

    <!-- HOW THE CALLS WENT: the share that came true, one line saying it, and each call folded under it, so a decision is
         judged by what followed and not by how sure it sounded. The word carries the outcome; the glyph is never the
         only sign. -->
    {#if live && calls.length}
      <Tile icon="observe" title={WORDS.calls}>
        <div class="calls-head">
          {#if checked > 0}
            <div class="calls-chart">
              <Waffle
                parts={[
                  { label: WORDS.met, value: went.met, tone: 'ink' },
                  { label: WORDS.missed, value: went.missed, tone: 'g2' },
                  { label: WORDS.unread, value: went.unread, tone: 'g4' },
                ]}
                summary={went.said}
              />
            </div>
          {/if}
          <p class="reading">{went.said}</p>
        </div>
        <details class="calls-fold">
          <summary>{words.callsEach}</summary>
          <ul class="ledger">
            {#each calls as c (c.id)}
              {@const when = dayWord(c.at, now)}
              <li>
                {#snippet body()}
                  <span class="line-mark"><IconWell name="observe" size="l" tone={c.went === 'met' ? 'earn' : undefined} /></span>
                  <span class="line-main">
                    <span class="line-title">{c.claim}</span>
                    <span class="line-detail call-went" data-went={c.went}>
                      {#if c.went === 'met'}<Icon name="check" size="s" />{WORDS.met}{:else if c.went === 'missed'}<Icon name="close" size="s" />{WORDS.missed}{:else if c.went === 'unread'}{WORDS.unread}{:else}<Icon name="clock" size="s" />{WORDS.due(when)}{/if}
                    </span>
                  </span>
                  {#if c.went !== 'due' && c.at}<span class="line-when">{since(c.at, now)}</span>{/if}
                {/snippet}
                {#if c.about}<a class="line" href={at(`/decide/${c.about}`)}>{@render body()}</a>{:else}<div class="line">{@render body()}</div>{/if}
              </li>
            {/each}
          </ul>
        </details>
      </Tile>
    {/if}
  </div>
{/if}

<style>
  /* ONE COLUMN, the page's own: its blocks carry their spans, and Decide adds no column of its own beside them. */
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    max-inline-size: var(--page-max);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
    min-inline-size: 0;
  }

  .body {
    min-inline-size: 0;
  }

  /* THE FIRST QUESTION CARRIES NO NAME OVER IT: the head's line just said what waits, and a name above the card would
     say it twice. Clipped, not removed, so the region keeps its name and a screen reader's list of headings keeps it,
     as `BlockSlot`'s unnamed heading is; while arranging, every tile shows its own. */
  .body :global(.block-slot:not([data-arranging]):has(.queue-lead) > .block-bar) {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: 0;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* THE STANDING SENTENCE OVER THE QUEUE, at the weight of a hint rather than an alarm: nothing has gone wrong, and this
     reader is doing exactly what they were invited to do. */
  .cannot {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* ── how the calls went ─────────────────────────────────────────────────── */

  .calls-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3) var(--sp-4);
  }

  .calls-chart {
    flex: 0 1 12rem;
    min-inline-size: 0;
  }

  .reading {
    flex: 1 1 14rem;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .calls-fold {
    margin-block-start: var(--sp-3);
  }

  .calls-fold > summary {
    color: var(--ink2);
    font-size: var(--t-sm);
    cursor: pointer;
  }

  @media (pointer: coarse) {
    .calls-fold > summary {
      min-block-size: var(--tap);
      display: flex;
      align-items: center;
    }
  }

  .ledger {
    display: grid;
    gap: var(--sp-1);
    margin: var(--sp-2) 0 0;
    padding: 0;
    list-style: none;
  }

  .line {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h, 44px);
    padding: var(--sp-2);
    border-radius: var(--r-md);
    color: inherit;
    text-decoration: none;
  }

  a.line:hover {
    background: var(--hover-wash);
  }

  .line-mark {
    flex: none;
  }

  .line-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-inline-size: 0;
  }

  .line-title {
    color: var(--ink);
    font-size: var(--t-base);
    overflow-wrap: anywhere;
  }

  .line-detail {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .line-when {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
    font-variant-numeric: tabular-nums;
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-2) var(--gutter) var(--sp-8);
    }
  }
</style>
