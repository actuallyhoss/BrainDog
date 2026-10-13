<!--
  Decide: every open question, ranked by the COST OF BEING WRONG, as a declared page drawn by the one page reader.

  A PAGE BODY LIKE ANY OTHER (DIRECTION §35). Its blocks are `views.ts` `decideHome`, drawn by the record with
  `previewPage` and through `PageView`, as Today's are: the head says how many wait and what the first suggests, the first
  question is drawn whole with its suggestion, why and what accepting it does, the rest are cards answered where they
  are shown, and what was put off and what was decided are folded shut under them. How the calls went is the one part
  the record does not answer as a block yet, so it is drawn here, under the page.

  CALM. No group control, no Select and no key hints in the head: a card's box shows on hover or focus. `j` and `k` are
  the page reader's and move the cursor; on the question it is on, Enter accepts, Backspace declines and `e` opens it to
  change what accepting takes (DIRECTION §37, `press.ts`). Nothing moves or fades when a key lands. A part that holds
  nothing is not drawn.

  EVERY QUESTION IS THE ONE DECISION CARD (`lib/decide/DecisionCard.svelte`, through `QueueAnswer`): why first, who
  asked, what it moves, and one press with Undo. The suggestion is an outline with a small dot, his pick, and not drawn
  at all on a card that is hard to undo or moves money. Enter answers only a card that costs nothing; one that costs
  something opens whole on its own page, where Accept names the amount.

  BRAINDOG'S OWN PAGE UPDATES ARE ONE CARD under the questions, for the owner (`Improved.svelte`): "BrainDog improved 4
  of your pages", what changes, and Accept. It reads what waits from the same place Add-ons does (`improved.ts`).

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
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { goto } from '$app/navigation';
  import { choose, type PackState } from '$lib/record/packs.ts';
  import { hostedHere } from '../settings/billing.ts';
  import { fromInput, keyAct } from './press.ts';
  import type { Improved } from './improved.ts';
  import { askerOf as cardAsker } from '$lib/decide/card.ts';
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
  import { callsRead, dayWord, decideDrawn, readCalls, readDecide, WORDS, type Call, type DecideBody } from './views.ts';
  import { words } from './words.ts';
  import { waitsNow } from '$lib/home/waits.svelte.ts';

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

  /** Who asked the first question, by name, as its card's by-line says it (a run by its app); nothing for the reader. */
  function askerOf(q: QueueQuestion): string {
    const who = cardAsker(q, me.person || null, names);
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

  /* AN ARRANGED DECIDE IS THE RECORD'S OWN PAGE: once Done installed `decide`, its body is read and drawn, and the
     preview is only what a record that never arranged it sees. */
  async function storedDecide(): Promise<DecideBody | undefined> {
    if (!shell.pages.includes('decide')) return undefined;
    const one = await (await import('$lib/record/pages-live.ts')).pagesReader(apiBase()).readOne('decide');
    return one.from === 'live' ? (one.page.body as unknown as DecideBody) : undefined;
  }

  async function read(): Promise<boolean> {
    reading = true;
    client ??= createClient({ base: apiBase() });
    try {
      const [out, called] = await Promise.all([storedDecide().then((body) => readDecide(apiBase(), body)), readCalls(client)]);
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
      await Promise.all([read(), readImproved()]);
    } catch {
      /* The page as it was read stays; the next version asks again. */
    }
  }

  /* ── what BrainDog itself has improved ───────────────────────────────────── */

  /**
   * BRAINDOG'S OWN PAGE UPDATES, read for the owner once the page has drawn, so no question waits on them: the packs the
   * record holds, and what this build ships newer (`improved.ts`). The module is loaded only then, because the seed's
   * modules and use cases are a weight the questions do not need.
   */
  let improved = $state.raw<{ updates: Improved[]; held: PackState[]; nameOf: (id: string) => string } | null>(null);

  async function readImproved() {
    if (!me.owner) return;
    client ??= createClient({ base: apiBase() });
    const [mod, { first }] = await Promise.all([import('./improved.ts'), choose(client)]);
    if (!first.ok) return;
    const lists = (route.data.lists ?? []) as { id: string; name: string }[];
    improved = { updates: mod.firstPartyUpdates(first.value), held: first.value, nameOf: (id) => mod.declarationName(id, lists, mod.packName) };
  }

  let improvedAsked = false;
  $effect(() => {
    if (!live || improvedAsked) return;
    improvedAsked = true;
    untrack(() => void readImproved().catch(() => undefined));
  });

  const improving = $derived(improved?.updates.length ?? 0);

  /* ── Decide's own keys ───────────────────────────────────────────────────── */

  /**
   * ON THE QUESTION THE CURSOR IS ON, Enter accepts, Backspace declines and `e` opens it to change what accepting takes
   * (DIRECTION §37). `j` and `k` stay the page reader's, and so does every other key.
   *
   * THE CARD'S OWN BUTTON IS PRESSED, so a key gives the answer a pointer gives: the same write, the same line the card
   * becomes, the same reason line where the record still asks for one. Taken before the page reader's Enter, which opens
   * the question, and only when there is a button to press.
   *
   * ENTER ANSWERS ONLY A QUESTION THAT WEIGHS NOTHING, a card with no cost on it: with its suggested answer, or Accept. A
   * card that is hard to undo, changes the setup or adds things may move money this page cannot see, so Enter opens it
   * whole on its own page, where Accept names the amount and a key never accepts money (`press.ts` `acceptKey`).
   */
  let goAt = 0;

  /**
   * The question under the cursor: the card holding the focus, or the one the cursor's ring is on.
   *
   * NOT THE RING'S WHILE A CONTROL ELSEWHERE HOLDS THE FOCUS. The ring stays on the last card `j` reached, so with the
   * focus moved on to Ask, a fold or BrainDog's own card, Backspace declined a question the reader was no longer on.
   */
  function questionUnder(): HTMLElement | null {
    const on = document.activeElement;
    const held = on instanceof HTMLElement ? on.closest<HTMLElement>('.qa[data-row^="q:"]') : null;
    if (held) return held;
    if (on instanceof HTMLElement && on.closest('button, a[href], summary, select, dialog') !== null) return null;
    return document.querySelector<HTMLElement>('#main .qa[data-row^="q:"][data-row-cursor]');
  }

  /** The record's two answers on a card, by the ids the card gives its buttons, or nothing on a question of options. */
  function twoOn(card: HTMLElement): { accept: HTMLElement; reject: HTMLElement } | null {
    const acts = [...card.querySelectorAll<HTMLElement>('.queue-act')];
    const accept = acts.find((b) => b.id.endsWith('-opt-accept'));
    const reject = acts.find((b) => b.id.endsWith('-opt-reject'));
    return acts.length === 2 && accept && reject ? { accept, reject } : null;
  }

  function onkey(e: KeyboardEvent) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    /* A KEY THAT STARTS INSIDE A FIELD OR A BOX IS THAT FIELD'S, whatever holds the focus by now (`press.ts` `fromInput`). */
    if (covered() || typing() || fromInput(e.target) || silenced(e)) return;
    /* A `g` PRESSED FIRST IS THE SHELL'S, and so is the key after it: `g` then `e` is not an edit. */
    if (e.key === 'g') return void (goAt = Date.now());
    const act = keyAct(e.key);
    if (act === null || Date.now() - goAt < 1000) return;
    const card = questionUnder();
    if (!card) return;
    if (act === 'edit') {
      const id = card.dataset.row?.slice('q:'.length);
      if (!id || !answerable) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void goto(at(`/decide/${encodeURIComponent(id)}?edit`));
      return;
    }
    let press: HTMLElement | null | undefined;
    if (act === 'accept') {
      /* ENTER ON A CONTROL IS THAT CONTROL'S: on an answer it gives that answer, on a link or a fold it opens it. */
      const on = document.activeElement;
      if (on instanceof HTMLElement && on !== card && on.closest('button, a[href], summary, select') !== null) return;
      if (card.querySelector('.queue-cost') !== null) return;
      /* THE BUTTON THE CARD SAYS ENTER PRESSES (`card.ts` `enter`): Decide with the answer chosen, or Accept, and none
         where money moves or it is hard to undo. */
      press = card.querySelector<HTMLElement>('[data-enter]');
    } else press = twoOn(card)?.reject;
    if (!press || (press instanceof HTMLButtonElement && press.disabled)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    /* THE CARD'S OWN BUTTON, so a key gives the answer a pointer gives: the card becomes its line with Undo on it for six
       seconds, and only then sends it. A declined question is never reopened, and the Undo is the way back. */
    press.click();
  }

  $effect(() => {
    if (classic) return;
    window.addEventListener('keydown', onkey, { capture: true });
    return () => window.removeEventListener('keydown', onkey, { capture: true });
  });
  /* NOT WHILE AN ANSWER WAITS FOR ITS UNDO, so the card holding it is not drawn afresh under the reader. */
  listen(reread, () => classic || reading || typing() || document.querySelector('main [data-held], main [aria-busy="true"]') !== null);

  /* ── the page as Decide draws it ─────────────────────────────────────────── */

  const live = $derived(got?.from === 'live' ? got : null);
  /* THE SENTENCE'S COUNTS ARE `boot`'S (`waits`, EXP-E07), the number the rail's badge and Today's header say, and late is
     the record's own mark (`lateDays`). An older host sends neither and the queue's counts stand. */
  const shaped = $derived(live ? decideDrawn(live.page.blocks, live.now, askerOf, waitsNow(), shell.lateDays ?? null) : null);
  const drawn = $derived<Opened | null>(got && got.from === 'live' && shaped ? { ...got, page: { page: got.page.page, blocks: shaped.blocks } } : got);
  /* NOTHING TO DRAW AT ALL: the head says so, and the other queue is offered when something waits in it. */
  const cleared = $derived(shaped !== null && !shaped.drawsAny);
  /* THE HEAD'S LINE IS THE RECORD'S, and there is none with no question waiting: the head is then the page's name, and
     BrainDog's own card under it says what waits in its own heading. Said in the head as well, the same sentence stood
     twice, one over the other. */
  const headLine = $derived(cleared ? undefined : shaped?.sentence.text);
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
  <!-- THE PAGE'S NAME AND ITS LINE, the header every page draws (DIRECTION §39), and THE SIBLING BEFORE THE PAGE, as
       Home draws it: no element of its own round it and nothing between its sentence and `.page`. The sticky head
       sticks inside this screen's own box either way, and on a phone the page's menu is raised to the end of the
       sentence only where the sentence is the sibling before the page (`PageView`, look fault N). So the sheet for
       asking a question is drawn after the page, not here. -->
  <PageHead icon="decide" title={said('decide')} sentence={headLine} needs={cleared ? undefined : shaped?.sentence.needs || undefined}>
    {#snippet actions()}
      {#if answerable}<Button weight="primary" onclick={() => (asking = true)}>{WORDS.ask}</Button>{/if}
    {/snippet}
  </PageHead>

  <div class="page">
    {#if !answerable && (shaped?.open ?? 0) > 0}
      <!-- WHY THE CARDS OFFER THEIR OPTIONS AS WORDS, above them and not after a press. -->
      <p class="cannot" id="cannot-decide">{whyNot}</p>
    {/if}

    {#if cleared}
      {#if improving === 0}
        <Empty kind="cleared" title={said('no_questions')}>
          {#snippet actions()}
            {#if Number(route.data.inbox ?? 0) > 0}<Button href="/inbox">{copy.decideOpenInbox}</Button>{/if}
          {/snippet}
        </Empty>
      {/if}
    {:else}
      <div class="body">
        <PageView slug="decide" got={drawn} mode="home" select whole {reread} />
      </div>
    {/if}

    <!-- BRAINDOG'S OWN PAGE UPDATES, one card under the questions, for the owner. Loaded only when something waits. -->
    {#if improved && improving > 0}
      {@const held = improved}
      {#await import('./Improved.svelte') then loaded}
        <Tile>
          <loaded.default updates={held.updates} held={held.held} nameOf={held.nameOf} hosted={hostedHere(shell)} ondone={() => void reread()} />
        </Tile>
      {/await}
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

  <AskSheet open={asking} onclose={() => (asking = false)} onfiled={filed} />
{/if}

<style>
  /* ONE COLUMN, the page's own: its blocks carry their spans, and Decide adds no column of its own beside them. */
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--tile-gap);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
    min-inline-size: 0;
  }

  .body {
    min-inline-size: 0;
  }

  /* EACH QUESTION IS A TILE (DIRECTION §39, "Decide reads like a form"). The page reader draws a queue as one tile with
     its questions under hairlines, which is right for a page holding a few among other things; Decide is the questions,
     so here the queue's own tile steps back to the board and every question is a tile of its own, a tile's gap apart.
     The group's name ("Also waiting") is kept for a screen reader and not drawn: nothing floats on the board but the
     head, and the head already said what waits. */
  .body :global(.block-slot:has(> .queue)) {
    padding: 0;
    background: none;
    border-radius: 0;
  }

  .body :global(.block-slot:not([data-arranging]):has(> .queue) > .block-bar) {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: 0;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .body :global(.block-slot > .queue) {
    gap: var(--tile-gap);
  }

  .body :global(.block-slot > .queue > .qa) {
    padding: var(--tile-pad);
    background: var(--tile);
    border-radius: var(--tile-r);
  }

  /* THE TILE IS THE EDGE NOW: no hairline over a question and no band of air under the lead. */
  .body :global(.block-slot > .queue > .qa > .queue-card) {
    padding-block: 0;
    border-block-start: 0;
  }

  /* ON A PHONE A QUESTION'S TILE GIVES ITS WORDS A LITTLE MORE OF THE WIDTH. */
  @media (width < 600px) {
    .body :global(.block-slot > .queue > .qa) {
      padding: var(--sp-4);
    }
  }

  /* THE CURSOR'S RING FOLLOWS THE TILE'S CORNERS, so `j` and `k` land on a question the shape it is. */
  .body :global(.block-slot > .queue > .qa[data-row-cursor]) {
    border-radius: var(--tile-r);
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

  /* NOTHING MOVES OR FADES WHEN A KEY LANDS ON A CARD (DIRECTION §37). Who asked and when are always there on Decide,
     where they are half of what is decided, so `j` and `k` move the ring and nothing else: a by-line that waited for
     the cursor took a line's room as it came, and the card under it moved. The box for answering several at once
     appears without a fade. */
  .page :global(.queue-card > .queue-by) {
    display: flex;
    transition: none;
  }

  .page :global(.queue-card > .queue-by > *) {
    opacity: 1;
    transition: none;
  }

  .page :global(.qa-select) {
    transition: none;
  }

  /* THE STANDING SENTENCE OVER THE QUEUE, at the weight of a hint rather than an alarm: nothing has gone wrong, and this
     reader is doing exactly what they were invited to do. */
  .cannot {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-base);
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
    font-size: var(--t-base);
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

  /* WHERE THE MENU IS RAISED TO THE SENTENCE (a phone, the questions first under the head), the page keeps the room
     Home keeps over its body. The menu is a tap tall and stands on the body's top edge, so with less room under the
     sentence it would reach up into the name's row and lie over the foot of Ask a question. */
  @media (hover: none) and (width <= 600px) {
    .page:has(> .body:first-child) {
      padding-block-start: var(--sp-4);
    }
  }
</style>
