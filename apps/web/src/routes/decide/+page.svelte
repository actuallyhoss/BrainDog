<!--
  Decide: every open question, ranked by the COST OF BEING WRONG, as a declared page drawn by the one page reader.

  A PAGE BODY LIKE ANY OTHER. Its blocks are `views.ts` `decideHome`, drawn by the record with
  `previewPage` and through `PageView`, as Today's are: the head says how many wait and what the first suggests, the first
  question is drawn whole with its suggestion, why and what accepting it does, the rest are cards answered where they
  are shown, and what was put off and what was decided are folded shut under them. How the calls went is the one part
  the record does not answer as a block yet, so it is drawn here, under the page.

  CALM. No group control, no Select and no key hints in the head: a card's box shows on hover or focus. `j` and `k` are
  the page reader's and move the cursor; on the question it is on, Enter accepts, Backspace declines and `e` opens it to
  change what accepting takes (`press.ts`). Nothing moves or fades when a key lands. A part that holds
  nothing is not drawn.

  EVERY QUESTION IS THE ONE DECISION CARD (`lib/decide/DecisionCard.svelte`, through `QueueAnswer`): why first, who
  asked, what it moves, and one press with Undo. The suggestion is an outline with a small dot, and not drawn
  at all on a card that is hard to undo or moves money. Enter answers only a card that costs nothing; one that costs
  something opens whole on its own page, where Accept names the amount.

  BRAINDOG'S OWN PAGE UPDATES ARE ONE CARD under the questions, for the owner (`Improved.svelte`): "BrainDog improved 4
  of your pages", what changes, and Accept. It reads what waits from the same place Add-ons does (`improved.ts`).

  THE OLD SCREEN IS GONE (24 October). Its keys are this page's now: a number answers with that option and `x`
  chooses a card for one answer to several (the page reader's), `a` gives the suggested answer and `d` defers. `/decide?classic`
  is an address somebody kept, and it opens this page. A host that cannot draw a body says so in the page's own refusal.

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
  import { recordNow, type Shell } from '$lib/record/boot-live.ts';
  import type { Opened } from '$lib/record/page-live.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { goto } from '$app/navigation';
  import { choose, type PackState } from '$lib/record/packs.ts';
  import { hostedHere } from '../settings/billing.ts';
  import { fromInput, keyAct, queueAct } from './press.ts';
  import type { Improved } from './improved.ts';
  import { askerOf as cardAsker } from '$lib/decide/card.ts';
  import { cardNow, loadCard } from '$lib/decide/card-load.ts';
  import { listen } from '$lib/page/listen.svelte.ts';
  import PageView from '$lib/page/PageView.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import AskSheet from '$lib/ui/AskSheet.svelte';
  import Waffle from '$lib/viz/Waffle.svelte';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';
  import { mayAnswer, whyNotAnswering } from './answering.ts';
  import { keepLocal, localTicket, nearLocal, settledLocal } from '$lib/data/local-tab.ts';
  import { painted } from '$lib/data/timing.ts';
  import type { Near } from '$lib/data/local.ts';
  import { EVERY, QUESTIONS } from '$lib/data/local.ts';
  import { decideSpots, keepDecide, keptDecide } from './kept-decide.ts';
  import { holdCopyMark } from '$lib/data/copy-mark.svelte.ts';
  import { live as poll } from '$lib/data/live.svelte.ts';
  import { blocksMineFirst, boardOf, callsRead, dayWord, decideDrawn, GROUP_KEY, GROUP_WORDS, mineFirst, readCalls, readDecide, WORDS, type Call, type Column, type DecideBody } from './views.ts';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Handled from '$lib/home/Handled.svelte';
  import { loadHandled, ownCount, toldHandled, withTold, type Handled as HandledFound } from '$lib/home/handled.ts';
  import ToldNeeds from '$lib/home/ToldNeeds.svelte';
  import { toldNow } from '$lib/home/told-now.svelte.ts';
  import { toldNeedOf } from '$lib/record/told-live.ts';
  import { words } from './words.ts';
  import { waitsNow } from '$lib/home/waits.svelte.ts';
  import { leadOf } from './lead.ts';
  import { columnOrder } from './column-order.ts';

  let { data } = $props();

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

  /**
   * THE QUEUE AS THE LOCAL COPY LAST HELD IT, drawn while the first read is out and only to read: no card answers, by
   * press or by key, until the record's own answer replaces it (`lib/data/local.ts`). Every open asks the record once
   * behind it; a move of the record is placed on the kept queue where it can be (`decideSpots`) and drawn from it
   * (`follow`), and asked again where it cannot. It reads `EVERY`, since a card names rows of lists no spot holds.
   */
  const DECIDE_COPY = 'Decide';
  type KeptDecide = { got: Opened; calls: Call[] };
  let fromCopy = $state(false);
  $effect(() => {
    if (!fromCopy) return;
    return untrack(() => holdCopyMark());
  });
  const offlineNow = () => shell.offline === true || poll.state === 'offline';

  /**
   * THE QUEUE INTO THE LOCAL COPY, patched as the log moves. ONE READ WHILE THE COPY CAUGHT UP (its first claim, an agent's
   * write) is kept too, marked never current, so the next open draws it and asks again rather than drawing nothing: on a
   * record its agents write to all day, a first open's queue was never kept.
   */
  async function keepQueue(out: Extract<Opened, { from: 'live' }>, kept: KeptDecide, mark: number): Promise<void> {
    if (localTicket() === mark) return keepLocal(DECIDE_COPY, apiBase(), [QUESTIONS, EVERY], kept, mark, {}, { spots: decideSpots(out) });
    await settledLocal();
    keepLocal(DECIDE_COPY, apiBase(), [QUESTIONS, EVERY], kept, localTicket(), {}, { always: true });
  }

  async function read(drawnKept?: () => void): Promise<boolean> {
    reading = true;
    client ??= createClient({ base: apiBase() });
    const mark = localTicket();
    /* WHAT THIS TAB LAST DREW is drawn at once on a return, held to read like the copy's, and the read lands over it. */
    const remembered = got === null ? keptDecide<KeptDecide>(apiBase()) : null;
    if (remembered !== null) {
      got = remembered.got;
      calls = remembered.calls;
      fromCopy = true;
      painted('decide', 'memory');
      drawnKept?.();
    }
    /* One later than the wait is drawn when it lands, while the read is out and nothing is drawn. */
    if (got === null) {
      const draw = (near: Near<KeptDecide> | null) => {
        if (near === null || got !== null || !reading || near.value.got.from !== 'live') return;
        got = near.value.got;
        calls = near.value.calls;
        fromCopy = true;
        painted('decide', 'copy');
        /* THE COPY'S QUEUE IS THE SCREEN TOO, as what this tab kept is: drawn and marked, the read lands over it. */
        drawnKept?.();
      };
      void nearLocal<KeptDecide>(DECIDE_COPY, apiBase(), apiBase(), draw).then(draw);
    }
    try {
      const [out, called] = await Promise.all([storedDecide().then((body) => readDecide(apiBase(), body)), readCalls(client)]);
      /* THE CALLS ARE THE PAGE'S COMPANY, NOT ITS CONDITION: a refusal of them keeps what was drawn before. */
      if (called.from === 'live') calls = called.value;
      /* A HOST THAT CANNOT DRAW THE BODY, OR WAS NOT REACHED, IS A REFUSAL like any other: a later read that is refused
         keeps the page as it was drawn rather than blanking it for one sentence, and the copy's page stays while
         nobody was reached. */
      if (out === null) {
        if (got === null || (fromCopy && !offlineNow())) {
          got = { from: 'refused', fix: offlineNow() ? copy.readOffline : copy.screenFailed };
          fromCopy = false;
        }
      } else if (out.from === 'live' || got === null || (fromCopy && !offlineNow())) {
        got = out;
        fromCopy = false;
        if (out.from === 'live') painted('decide', 'network');
      }
      if (out?.from === 'live') keepDecide(apiBase(), { got: out, calls: called.from === 'live' ? called.value : calls });
      if (out?.from === 'live') void keepQueue(out, { got: out, calls: called.from === 'live' ? called.value : calls }, mark);
      return out?.from === 'live' || (fromCopy && offlineNow());
    } finally {
      reading = false;
    }
  }

  /* ── what BrainDog handled itself, the third column ────────────────────── */

  /**
   * WHAT BRAINDOG DID WITHOUT ASKING TODAY, each with its Undo (`lib/home/handled.ts`): the third column beside Money and
   * Quick (plan of 20 October), read once the questions are asked for and never holding them up. `null` draws nothing.
   */
  let handledRead = $state.raw<HandledFound | null>(null);
  async function readHandled() {
    handledRead = await loadHandled(apiBase());
  }
  /* AND WHAT AGENTS FINISHED TODAY OF WHAT HE TOLD THEM (`toldHandled`), from the shell's read: the same column. */
  const handled = $derived(withTold(handledRead, toldHandled(toldNow().done, toldNow().agents, recordNow())));
  /* WHAT AGENTS ASKED HIM BACK, of what he told them: counted in the badge, drawn over the questions. */
  const toldNeeds = $derived(toldNow().needs.map((t) => toldNeedOf(t, toldNow().agents)));

  $effect(() => {
    untrack(() => void readHandled());
  });

  $effect(() => {
    untrack(() => {
      const at = opened();
      /* A RETURN DRAWN FROM WHAT THIS TAB KEPT IS THE SCREEN, so the bracket closes when it is drawn, as a page's does
         (`/p/[slug]`); a refusal of the read behind it is still said. */
      let released = false;
      const close = (ok: boolean): void => {
        if (released) return ok ? undefined : closed(false, opened());
        released = true;
        closed(ok, at);
      };
      void read(() => close(true))
        .then((ok) => close(ok))
        .catch(() => close(false));
    });
  });

  /**
   * THE RECORD MOVED: once the copy has placed what the log says, a queue it kept current is drawn from it and nothing
   * is asked. One it dropped, or a page still drawn from the copy or being read, is read again as before.
   */
  async function follow(): Promise<void> {
    if (!reading && !fromCopy && got?.from === 'live') {
      await settledLocal();
      const near = await nearLocal<KeptDecide>(DECIDE_COPY, apiBase(), apiBase());
      if (near?.current && near.value.got.from === 'live' && !reading && !fromCopy) {
        got = near.value.got;
        calls = near.value.calls;
        return;
      }
    }
    await reread();
  }

  /* A LANDED WRITE, AND A NEW VERSION OF THE RECORD, READ THE PAGE AGAIN without blanking it: an answered question
     goes, and one asked elsewhere arrives. */
  async function reread() {
    try {
      await Promise.all([read(), readImproved(), readHandled()]);
    } catch {
      /* The page as it was read stays; the next version asks again. */
    }
  }

  /* A DECIDE KEPT (OR PUT BACK) BY SAYING IT CHANGES THE SHELL'S PAGES, not the queue, so nothing else asks again: read the
     page the record now holds, or the built one once Undo retires it. */
  let heldDecide = untrack(() => shell.pages.includes('decide'));
  $effect(() => {
    const has = shell.pages.includes('decide');
    if (has === heldDecide) return;
    heldDecide = has;
    untrack(() => void reread());
  });

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
   * ON THE QUESTION THE CURSOR IS ON, Enter accepts, Backspace declines and `e` opens it to change what accepting takes.
   * `j` and `k` stay the page reader's, and so does every other key.
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
    /* A queue drawn from the copy answers nothing. */
    if (fromCopy) return null;
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
    const queued = queueAct(e.key);
    if ((act === null && queued === null) || Date.now() - goAt < 1000) return;
    const card = questionUnder();
    if (!card) return;
    if (queued !== null) return void queueKey(e, card, queued);
    if (act === null) return;
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

  /**
   * `a` AND `d` ON THE QUESTION UNDER THE CURSOR. `a` presses the suggested answer, or Accept where the record answers
   * with its two, and never one that is hard to undo or moves money: such a card opens whole on its own page, where its
   * button names the amount, as a number on a hard option did on the old screen. `d` opens the question to defer it,
   * with its reason and wake date.
   */
  function queueKey(e: KeyboardEvent, card: HTMLElement, queued: 'approve' | 'defer') {
    const id = card.dataset.row?.slice('q:'.length);
    if (!id || !answerable) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (queued === 'defer') return void goto(at(`/decide/${encodeURIComponent(id)}?defer`));
    const press = card.querySelector<HTMLElement>('.queue-act[data-recommended], .queue-option[data-recommended] .queue-act') ?? twoOn(card)?.accept ?? null;
    if (!press || (press instanceof HTMLButtonElement && press.disabled)) return;
    /* THE BUTTON ENTER WOULD PRESS IS THE SAFE ONE (`card.ts` `enter`): any other weighs something. */
    const weighs = card.querySelector('.queue-cost') !== null || press.dataset.enter === undefined;
    if (weighs) return void goto(at(`/decide/${encodeURIComponent(id)}`));
    press.click();
  }

  $effect(() => {
    window.addEventListener('keydown', onkey, { capture: true });
    return () => window.removeEventListener('keydown', onkey, { capture: true });
  });
  /* NOT WHILE AN ANSWER WAITS FOR ITS UNDO, so the card holding it is not drawn afresh under the reader. */
  listen(follow, () => reading || typing() || document.querySelector('main [data-held], main [aria-busy="true"]') !== null);

  /* ── the page as Decide draws it ─────────────────────────────────────────── */

  const live = $derived(got?.from === 'live' ? got : null);
  /* THE SENTENCE'S COUNTS ARE `boot`'S (`waits`), the number the rail's badge and Today's header say, and late is
     the record's own mark (`lateDays`). An older host sends neither and the queue's counts stand. */
  const shaped = $derived(live ? decideDrawn(blocksMineFirst(live.page.blocks, shell.me?.person ?? null), live.now, askerOf, waitsNow(), shell.lateDays ?? null) : null);
  /* THE QUESTIONS NAMED FOR THE READER LEAD THE FIRST OPEN QUEUE, under one heading; none, and nothing is drawn. */
  const yours = $derived.by(() => {
    const queue = live?.page.blocks.find((b) => b.kind === 'queue' && b.source === 'governance.open')?.queue;
    return queue ? mineFirst(queue, shell.me?.person ?? null).heading : null;
  });
  /* ONE LEAD TILE ACROSS THE BOARD, THE REST A COMPACT QUEUE UNDER IT: the first group's first question, whole. */
  const led = $derived(shaped ? leadOf(shaped.blocks, shaped.first === 'quick' ? [GROUP_KEY.quick, GROUP_KEY.money] : [GROUP_KEY.money, GROUP_KEY.quick]) : null);
  /* THE QUESTIONS WAIT FOR THEIR CARD, AND DRAW ONCE WITH IT: the card's code comes beside the read (`card-load.ts`), and
     on a slow phone the read won, so every question stood as an empty row for a frame or two and the lead then grew
     248px over the rest (0.55 of the phone's layout shift). The screen is held open until it lands, as Today holds its
     page reader. A card that fails to load lets the page draw as before. */
  let cardIn = $state(cardNow() !== null);
  if (cardNow() === null) {
    const held = opened();
    void loadCard().then(
      () => ((cardIn = true), closed(true, held)),
      () => ((cardIn = true), closed(false, held)),
    );
  }
  /* UNDER THE LEAD, EACH COLUMN IN ITS OWN ORDER (`column-order.ts`): due sooner, then hard to undo, then the newest, so
     a question an agent just asked is at the top of its column. The lead keeps the record's ranking. */
  const columned = $derived(
    led
      ? led.blocks.map((b) =>
          b.kind === 'queue' && (b.key === GROUP_KEY.money || b.key === GROUP_KEY.quick) && Array.isArray(b.queue)
            ? { ...b, queue: columnOrder(b.queue, shell.me?.person ?? null) }
            : b,
        )
      : null,
  );
  const drawn = $derived<Opened | null>(!cardIn ? null : got && got.from === 'live' && columned ? { ...got, page: { page: got.page.page, blocks: columned } } : got);
  /* NOTHING TO DRAW AT ALL: the head says so, and the other queue is offered when something waits in it. */
  const cleared = $derived(shaped !== null && !shaped.drawsAny);
  /* THE HEAD'S LINE IS THE RECORD'S, and there is none with no question waiting: the head is then the page's name, and
     BrainDog's own card under it says what waits in its own heading. Said in the head as well, the same sentence stood
     twice, one over the other. */
  /* WITH NOTHING TO ASK THE LINE SAYS SO, and what BrainDog did by itself today (today F12). */
  const handledToday = $derived(ownCount(handled));
  const headLine = $derived(cleared ? (handledToday > 0 ? words.nothingHandled(handledToday) : undefined) : shaped?.sentence.text);
  const now = $derived(live?.now ?? 0);
  const went = $derived(callsRead(calls));
  const checked = $derived(went.met + went.missed + went.unread);

  /* ── the board: Money, Quick and Handled ──────────────────────────────── */

  /* HOW MANY EACH COLUMN HOLDS, as the phone's switch says it: the questions, as the head's sentence counts them, and the lines BrainDog handled. */
  const handledCount = $derived(handled ? handled.rows.length + handled.more : 0);
  const counts = $derived<Record<Column, number>>({
    money: Math.max(0, (shaped?.groups.money ?? 0) - (led?.group === GROUP_KEY.money ? 1 : 0)),
    quick: Math.max(0, (shaped?.groups.quick ?? 0) - (led?.group === GROUP_KEY.quick ? 1 : 0)),
    handled: handledCount,
  });
  /* THE LEAD'S OWN COLUMN, where that column has a tab: on a phone the lead is drawn under its tab only, so the tab's
     count holds it and the head's "3 about money" and the tab's "Money 3" agree. */
  const ledColumn = $derived<Column | null>(led?.group === GROUP_KEY.money ? 'money' : led?.group === GROUP_KEY.quick ? 'quick' : null);
  const tabCount = (c: Column): number => counts[c] + (c === ledColumn ? 1 : 0);
  /* WHERE EACH SITS ON A WIDE BOARD (`boardOf`): a third each, or a half, or the row, for those that hold something. */
  const board = $derived(boardOf({ money: counts.money > 0, quick: counts.quick > 0, handled: counts.handled > 0 }, shaped?.first));
  const columns = $derived((shaped?.first === 'quick' ? (['quick', 'money', 'handled'] as const) : (['money', 'quick', 'handled'] as const)).filter((c) => counts[c] > 0));
  /* ON A PHONE ONE COLUMN AT A TIME, switched with the segmented control over them; the first that holds something.
     `?show=handled` (Today's "Review") opens on Handled, and on a wide board scrolls it into view. */
  let chosenColumn = $state<Column | null>(route.url.searchParams.get('show') === 'handled' ? 'handled' : null);
  let shownHandled = false;
  $effect(() => {
    if (shownHandled || !handled || route.url.searchParams.get('show') !== 'handled') return;
    shownHandled = true;
    requestAnimationFrame(() => document.getElementById('handled')?.scrollIntoView({ block: 'nearest' }));
  });
  const showing = $derived<Column | null>(chosenColumn !== null && columns.includes(chosenColumn) ? chosenColumn : (columns[0] ?? null));

  /* ASKING YOURSELF A QUESTION, filed through `AskSheet`; the new question is read back into the queue it joins. */
  let asking = $state(false);
  /* SELECT, FROM THE "⋯": the boxes for answering several at once are drawn only then, or once one is chosen with `x`. */
  let selecting = $state(false);
  function filed() {
    asking = false;
    void reread();
  }

  $effect(() => {
    if (live) drew('ready');
  });
</script>

<svelte:head>
  <title>{titleOf(said('decide'))}</title>
</svelte:head>

  <!-- THE LINE SAYS HOW MANY WAIT, in words with the first question's suggestion, so the title carries no count; on a
       page with nothing at all to draw the cleared mark under it says that, once. NOTHING RED IN THE HEAD (plan of 20
       October): noting a choice to make is the rarest thing done here, so it and Select are in the "⋯", and only for
       somebody who may answer. -->
  <!-- THE PAGE'S NAME AND ITS LINE, the header every page draws, and THE SIBLING BEFORE THE PAGE, as
       Home draws it: no element of its own round it and nothing between its sentence and `.page`. The sticky head
       sticks inside this screen's own box either way, and on a phone the page's menu is raised to the end of the
       sentence only where the sentence is the sibling before the page (`PageView`, look fault N). So the sheet for
       asking a question is drawn after the page, not here. -->
  <PageHead icon="decide" title={said('decide')} heldLines={1} sentence={headLine} needs={cleared ? undefined : shaped?.sentence.needs || undefined}>
    {#snippet actions()}
      <!-- NOT OVER A CLEARED PAGE (UI pass 1 Nov): with no line beside it the "⋯" stood alone on a row of its own above
           "Nothing needs you", offering Select with nothing to select. -->
      <!-- AND ONLY OVER A CLEARED PAGE: while questions wait, the body's own "⋯" (the page's menu, Edit layout and Change
           this page) carries Note a choice and Select first, so the head and the body no longer draw two "⋯" one over
           the other (live verify, 2 Nov). -->
      {#if answerable && cleared && headLine}
        <Menu label={WORDS.more} align="end">
          {#snippet trigger()}<span class="head-more"><Icon name="more" size="m" /><span class="dsr">{WORDS.more}</span></span>{/snippet}
          <!-- EACH ROW LEADS WITH ITS GLYPH, as every menu's does (VERIFY H47). -->
          <button type="button" role="menuitem" data-ask onclick={() => (asking = true)}><Icon name="ask" size="m" /><span class="mi-name">{WORDS.ask}</span></button>
          <button type="button" role="menuitemcheckbox" aria-checked={selecting} data-select onclick={() => (selecting = !selecting)}><Icon name="check" size="m" /><span class="mi-name">{WORDS.select}</span></button>
        </Menu>
      {/if}
    {/snippet}
  </PageHead>

  <!-- THE COPY'S QUEUE IS NOT INERT, ONLY HELD: its cards keep their boxes, quiet, and no press or key answers one until
       the record's own answer replaces it (`held.svelte.ts`, which the quiet mark holds), while a question's link still
       opens it. -->
  <div class="page" data-selecting={selecting ? '' : undefined}>
    <!-- NOT WHILE THE SHELL IS THE KEPT COPY (VERIFY H45): a copy reads every reader as `read` (`boot-copy.ts`
         `drawnFrom`), so on a cold open this line drew for a frame for an owner and went when the live shell landed,
         and the page jumped 58px and back. Only the live shell says who may answer. -->
    {#if !answerable && !shell.stale && (shaped?.open ?? 0) > 0}
      <!-- WHY THE CARDS OFFER THEIR OPTIONS AS WORDS, above them and not after a press. -->
      <p class="cannot" id="cannot-decide">{whyNot}</p>
    {/if}

    <ToldNeeds rows={toldNeeds} />
    {#if cleared}
      {#if improving === 0 && !handled && toldNeeds.length === 0}
        <Empty kind="cleared" title={said('no_questions')} body={copy.noQuestionsWhy}>
          {#snippet actions()}
            {#if Number(route.data.inbox ?? 0) > 0}<Button href="/inbox">{copy.decideOpenInbox}</Button>{/if}
          {/snippet}
        </Empty>
      {/if}
    {:else}
      {#if yours}<h2 class="yours">{yours}</h2>{/if}
      <!-- ON A PHONE, ONE COLUMN AT A TIME: Money, Quick and Handled, each with how many it holds. -->
      {#if columns.length > 1}
        <div class="switch">
          <Segmented role="group" aria-label={WORDS.columns} full>
            {#each columns as c (c)}
              <button type="button" class="segment" data-on={showing === c ? '' : undefined} aria-pressed={showing === c} onclick={() => (chosenColumn = c)}
                >{GROUP_WORDS[c]} <span class="num switch-n">{tabCount(c)}</span></button
              >
            {/each}
          </Segmented>
        </div>
      {/if}
      <!-- THE BOARD'S FIRST ROW IS MONEY AND QUICK SIDE BY SIDE, each where `boardOf` puts it, Handled a strip under them,
           and what was put off and decided folds under all of it. -->
      <div
        class="body"
        data-board={columns.length > 0 ? '' : undefined}
        data-switch={columns.length > 1 ? '' : undefined}
        data-showing={showing ?? undefined}
        data-led={led?.group ? '' : undefined}
        data-led-column={ledColumn !== null && columns.includes(ledColumn) ? ledColumn : undefined}
        style:--col-money={board.money ?? 'auto'}
        style:--col-quick={board.quick ?? 'auto'}
        style:--col-handled={board.handled ?? '1 / -1'}
      >
        <PageView
          slug="decide"
          got={drawn}
          mode="home"
          select
          whole
          {reread}
          opens={handled ? handledColumn : undefined}
          more={answerable
            ? [
                { label: WORDS.ask, icon: 'ask', onclick: () => (asking = true) },
                { label: WORDS.select, icon: 'check', checked: selecting, onclick: () => (selecting = !selecting) },
              ]
            : []}
        />
      </div>
    {/if}
    {#if cleared && handled}<div class="handled-alone" id="handled"><Handled found={handled} heading={GROUP_WORDS.handled} head="strip" /></div>{/if}

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

{#snippet handledColumn()}
  {#if handled}<div class="handled-col" id="handled"><Handled found={handled} heading={GROUP_WORDS.handled} head="strip" /></div>{/if}
{/snippet}

<style>
  /* ON A PHONE THE PAGE'S "⋯" STANDS AT THE END OF THE SENTENCE'S ROW (look fault N), as Today's does: here the body's
     menu is the page's only one, and on a row of its own it left a band of air between the sentence and the first
     question (leftovers 3, live verify of 2 Nov). The sentence keeps a tap's room so no word runs under it. */
  @media (hover: none) and (width <= 600px) {
    .page > .body:first-child > :global(.home-page:not([data-arranging]) > .home-tools) {
      position: absolute;
      margin: 0;
      inset-block-end: calc(100% + var(--sp-4));
    }

    :global(.page-head:has(+ .page > .body:first-child > .home-page:not([data-arranging]) > .home-tools :is(button, a)) .page-said) {
      padding-inline-end: calc(var(--gutter) + var(--tap) + var(--sp-2));
    }
  }

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

  /* ── the board: Money, Quick and Handled side by side ───────────────────
     ON A WIDE BOARD the three take the first row of the page's twelve columns, where `boardOf` puts each (a third, a
     half, or the row), and the folds under them start the next. Handled is the board's opening strip (`PageBody`'s
     `opens`), placed on the same row. The page's own twelve columns hold, so nothing here draws a grid of its own. */
  @media (width >= 900px) {
    .body[data-board] :global(.page:not([data-narrow]) .block-slot[data-key='decide-money']) {
      grid-row: 1;
      grid-column: var(--col-money);
    }

    .body[data-board] :global(.page:not([data-narrow]) .block-slot[data-key='decide-quick']) {
      grid-row: 1;
      grid-column: var(--col-quick);
    }

    /* HANDLED IS THE STRIP UNDER THEM (T16), across the row, one line a thing with its Undo at the end. */
    .body[data-board] :global(.page:not([data-narrow]) > .page-strip[data-opens]) {
      grid-row: 2;
      grid-column: var(--col-handled);
      align-self: start;
    }

    /* WITH NOTHING WAITING, HANDLED IS THE FIRST ROW (2 Nov): held at the second, it went under "Decided lately", so the
       fold of old answers read before what BrainDog did today. */
    .body[data-board] :global(.page:not([data-narrow]):not(:has(> .block-slot:is([data-key='decide-money'], [data-key='decide-quick'], [data-key='decide-lead']))) > .page-strip[data-opens]) {
      grid-row: 1;
    }

    /* THE LEAD TILE IS THE BOARD'S FIRST ROW, ACROSS IT, and the groups and Handled are the row under it. */
    .body[data-board] :global(.page:not([data-narrow]) .block-slot[data-key='decide-lead']) {
      grid-row: 1;
      grid-column: 1 / -1;
    }

    .body[data-board][data-led] :global(.page:not([data-narrow]) .block-slot[data-key='decide-money']),
    .body[data-board][data-led] :global(.page:not([data-narrow]) .block-slot[data-key='decide-quick']) {
      grid-row: 2;
    }

    .body[data-board][data-led] :global(.page:not([data-narrow]) > .page-strip[data-opens]) {
      grid-row: 3;
    }
  }

  /* THE LEAD IS ONE TILE, and the cards under it keep their tiles: they are a compact queue, each the question, who
     asked and its answers. */
  .body :global(.block-slot[data-key='decide-lead']) {
    padding: 0;
  }

  /* THE LEAD CARD STOPS AT A READING WIDTH (T17, ops look 3 Nov): across the page its amount stood 900px from its
     title. Now the card itself ends at the measure, and the amount sits at the card's right edge, as an ops row's
     value does, a short reach from its title. */
  .body :global(.block-slot[data-key='decide-lead']) {
    max-inline-size: calc(var(--measure, 72ch) + 2 * var(--sp-5, 24px));
  }

  .body :global(.block-slot[data-key='decide-lead'] .dc-row) {
    max-inline-size: none;
  }

  /* A MONEY QUESTION'S TITLE IS A QUESTION'S SIZE HERE (T18): 15 beside Quick's 17. Today's tile keeps its 15. */
  .body :global(.dc-row > .dr-title) {
    font-size: var(--fs-head);
    line-height: 24px;
  }

  /* THE PHONE'S SWITCH: one column at a time, the others out of the way until they are chosen. On a wide board the
     switch is not drawn and every column shows. */
  .switch {
    display: none;
  }

  .switch-n {
    color: var(--ink-3);
  }

  /* THE COLUMNS' WELLS ARE QUIET: every question here needs you, so red is kept for the answer and for what is late. */
  .body :global(.block-slot[data-key^='decide-'] > .block-bar .well) {
    background: var(--tile-2);
    color: var(--ink-2);
  }

  @media (width < 900px) {
    .switch {
      display: flex;
    }

    .switch > :global(.segmented) {
      inline-size: 100%;
      margin-inline: 0;
    }

    .switch > :global(.segmented > .segment) {
      flex: 1 1 0;
      min-inline-size: 0;
    }

    /* THE SWITCH ALREADY NAMES THE COLUMN SHOWN, so its tile's name is said to a screen reader and not drawn again. */
    .body[data-switch] :global(.block-slot[data-key^='decide-']:not([data-arranging]) > .block-bar) {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      margin: 0;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    /* THE PAGE'S OWN ⋯ IS NOT DRAWN UNDER THE SWITCH (decide-390-light.png): the rule that raises it to the
       sentence's row reaches only a body first under the head, so here it stood alone on a line of its own under the
       switch, and later on the tab's edge. The head's ⋯ is the menu, and Edit layout is offered only from 900px. */
    .body[data-switch] :global(.home-page:not([data-arranging]) > .home-tools) {
      display: none;
    }

    .body[data-showing='money'] :global(.block-slot[data-key='decide-quick']),
    .body[data-showing='quick'] :global(.block-slot[data-key='decide-money']),
    .body[data-showing='handled'] :global(:is(.block-slot[data-key='decide-money'], .block-slot[data-key='decide-quick'])),
    .body:not([data-showing='handled']) :global(.page-strip[data-opens]) {
      display: none;
    }

    /* THE LEAD BELONGS TO ITS TAB: under another tab it is not drawn, as its column's other cards are not. */
    .body[data-led-column='money']:not([data-showing='money']) :global(.block-slot[data-key='decide-lead']),
    .body[data-led-column='quick']:not([data-showing='quick']) :global(.block-slot[data-key='decide-lead']) {
      display: none;
    }
  }

  /* IN THE ROOM OF A NARROW WINDOW ON A WIDE ONE (a docked panel), one column, and Handled after the questions. */
  .body :global(.page[data-narrow] > .page-strip[data-opens]) {
    order: 1;
  }

  /* ON THE PHONE'S HANDLED TAB, HANDLED COMES FIRST and what was decided lately after it (today F6). */
  @media (width < 900px) {
    .body[data-showing='handled'] :global(.page > .page-strip[data-opens]) {
      order: -1;
    }
  }

  /* EACH QUESTION IS A TILE ("Decide reads like a form"). The page reader draws a queue as one tile with
     its questions under hairlines, which is right for a page holding a few among other things; Decide is the questions,
     so here the queue's own tile steps back to the board and every question is a tile of its own, a tile's gap apart.
     A queue's name is kept for a screen reader and not drawn, except Money's and Quick's, which name the columns they
     head (`data-key`, `views.ts` `GROUP_KEY`). */
  .body :global(.block-slot:has(> .queue)) {
    padding: 0;
    background: none;
    border-radius: 0;
  }

  .body :global(.block-slot:not([data-arranging], [data-key^='decide-']):has(> .queue) > .block-bar) {
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

  /* EACH QUESTION IS AN OPS CARD (2.7.2): solid tile, its 1px edge and the two-layer card shadow (none in dark). */
  .body :global(.block-slot > .queue > .qa) {
    padding: var(--tile-pad);
    border: 1px solid var(--card-edge, transparent);
    background: var(--tile);
    border-radius: var(--r-tile);
    box-shadow: var(--shadow-card, none);
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
    border-radius: var(--r-tile);
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

  /* NOTHING MOVES OR FADES WHEN A KEY LANDS ON A CARD. Who asked and when are always there on Decide,
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

  /* THE BOXES WAIT BEHIND SELECT (plan of 20 October): a box on every card, unexplained, until "⋯" Select asks for
     them, or until one is chosen with `x`, when every card shows its own so the choice can be widened. */
  .page:not([data-selecting]) :global(.qa:not([data-picking]) .qa-select) {
    display: none;
  }

  .page[data-selecting] :global(.qa-select) {
    opacity: 1;
  }

  /* SAID TO A SCREEN READER, NOT DRAWN: the "⋯"'s name (motion F11). */
  .dsr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* HANDLED STANDS IN ITS COLUMN AS MONEY AND QUICK DO, from the top of the board's first row. */
  .handled-col,
  .handled-alone {
    min-inline-size: 0;
    scroll-margin-block-start: var(--sp-6);
  }

  /* "N MORE" UNDER A COLUMN IS A FULL-WIDTH QUIET PRESS (today F22), as wide as the cards it opens, a thumb tall. */
  .body :global(.block-slot[data-key^='decide-'] > .block-more) {
    display: flex;
    justify-content: center;
    align-items: center;
    inline-size: 100%;
    min-block-size: var(--ctl-page, var(--btn-h));
    margin-block-start: var(--tile-gap);
    border-radius: var(--r-pill, 999px);
    /* A QUIET BUTTON ON THE BOARD IS THE TILE'S COLOUR (2 Nov): bare, "2 more" floated alone in the middle of the
       column's foot and did not read as something to press. A capsule now, with the card's edge. */
    background: var(--tile);
    box-shadow: inset 0 0 0 0.5px var(--g-line, var(--rule));
    color: var(--ink-2);
    font-size: var(--fs-body);
    font-weight: 500;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .body :global(.block-slot[data-key^='decide-'] > .block-more:hover) {
      background: var(--tile) linear-gradient(var(--row-wash), var(--row-wash));
      color: var(--ink);
    }
  }

  /* WHAT WAS PUT OFF AND WHAT WAS DECIDED ARE PLAIN DISCLOSURE LINES (today F12), not tiles that say only a heading and
     Show: the name at 15/600 with a quiet well, and the fold's word at the end of the line. */
  /* THE OPS FOLD ROW (4.17): a 40px line on the text edge, no card round it. Only its Show is pressed, so the line
     itself takes no wash. */
  .body :global(.block-slot:has(> .block[data-kind='section'])) {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 40px;
    padding: 0 var(--title-inset, 12px);
    background: none;
    border: 0;
    border-radius: 10px;
    box-shadow: none;
  }


  .body :global(.block-slot:has(> .block[data-kind='section']) > .block-bar) {
    margin: 0;
  }

  .body :global(.block-slot:has(> .block[data-kind='section']) .well) {
    background: var(--tile-2);
    color: var(--ink-2);
  }

  .body :global(.block-slot:has(> .block[data-kind='section']) > .block) {
    margin: 0;
  }

  .body :global(.block-slot:has(> .block[data-kind='section']) .sec-toggle) {
    border-radius: var(--r-pill, 999px);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  /* THE "⋯" IN THE HEAD: a quiet square, a tap wide under a thumb. */
  /* THE "⋯" IN THE HEAD IS A GLASS CIRCLE (ops 4.1), the page tier: 36px, the control fill with its blur and hairline. */
  .head-more {
    display: inline-grid;
    place-items: center;
    inline-size: var(--ctl-page, var(--btn-h));
    block-size: var(--ctl-page, var(--btn-h));
    background: var(--g-fill, var(--tile-2));
    backdrop-filter: var(--g-bf, none);
    border-radius: var(--r-pill, 999px);
    box-shadow: inset 0 0 0 0.5px var(--g-line, transparent);
    color: var(--ink-2);
    transition: background var(--d-state) var(--ease-out);
  }
  @media (hover: hover) and (pointer: fine) {
    :global(.menu-trigger):hover > .head-more {
      background: var(--g-fill-hover, var(--hover));
      color: var(--ink);
    }
  }

  @media (pointer: coarse) {
    .head-more {
      inline-size: var(--tap);
      block-size: var(--tap);
    }
  }

  /* THE STANDING SENTENCE OVER THE QUEUE, at the weight of a hint rather than an alarm: nothing has gone wrong, and this
     reader is doing exactly what they were invited to do. */
  .yours {
    margin: 0;
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: var(--lh-body);
  }
  .cannot {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-body);
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
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .calls-fold {
    margin-block-start: var(--sp-3);
  }

  .calls-fold > summary {
    color: var(--ink-2);
    font-size: var(--fs-meta);
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
    border-radius: var(--r-pop);
    color: inherit;
    text-decoration: none;
  }

  a.line:hover {
    background: var(--hover);
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
    font-size: var(--fs-body);
    overflow-wrap: anywhere;
  }

  .line-detail {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .line-when {
    flex: none;
    color: var(--ink-3);
    font-size: var(--fs-meta);
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

    /* And where the phone's switch opens the page over the body. */
    .page:has(> .switch:first-child) {
      padding-block-start: var(--sp-4);
    }
  }
</style>
