<!--
  "Tell it one real thing": a first Today's first act (use case 6, step 5; planner-45, the onboarding target). One
  field; what she types is read on the device (`tellRead`, `lib/tell/read.ts`) into the entries it would become, drawn
  under "That becomes"; one press adds them all under one batch (the record's `capture`), and the receipt's one Undo
  takes them all back (`undoChange`, through `data/optimistic.svelte.ts` `run`, the Undo every write on every screen has).

  NOTHING IS ADDED UNTIL THE PRESS, and the card says so beside the button. An entry the record would refuse (a required
  field the sentence did not give) says what it needs, in words, and stays behind: the press adds the entries that are
  ready (`readyRows`), all or none of those, as the record writes them. The receipt names what went by what each is
  ("Added an order, a client and a payment", `addedSaid`) and what stayed behind with what it needs (`heldSaid`), so
  nothing held is dropped quietly when the card goes.

  ITS WORDS ARE ITS OWN, in `say` below and not in `copy.ts`, as `first-run.ts` keeps the first run's. `first-today.ts`
  says when Today draws it (`showTell`), and home-first-46 mounts it.

  NEVER OVER NOTHING (first-hour audit AH1): a sentence it cannot place still says so, in words (`why`), and offers the
  way on: the same words as one entry of a list it could go into (`offers`), each its own button.

  THREE SHAPES OF THE ONE CARD. The first Today's card; the slim line Today keeps after the first thing, for a week or
  until hidden (`slim`, AH9), which says under it what was last added and where (AH23, `tell-line.ts`); and the paste
  box for a bank's text (`bank`, AH10). The keyboard adds from the field with Cmd or Ctrl and Enter, and the field keeps
  the focus after a press, so the next thing is typed straight away (AH20).
-->
<script lang="ts">
  import { createClient } from '@braindog/client';
  import { invalidateAll } from '$app/navigation';

  import { apiBase, at } from '$lib/at.ts';
  import { run } from '$lib/data/optimistic.svelte.ts';
  import { reread } from '$lib/data/live.svelte.ts';
  import type { TellList, TellOptions, TellRow, tellRead } from '$lib/tell/read.ts';
  import Button from '$lib/ui/Button.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { isGlyph } from '$lib/ui/icons.ts';
  import { focusOnceDrawn } from '$lib/ui/keep-focus.ts';
  import { addedSaid, countWord, heldSaid, readyAt, readyRows } from './first-today.ts';
  import type { ToldLine } from './tell-line.ts';

  let {
    options,
    onadded,
    slim = false,
    bank = false,
    last = [],
    onhide,
  }: {
    /** What the sentence is read against: the lists this record holds, the day, its currency, its people (`tellLists`). */
    options: TellOptions;
    /** After the entries are added, with each as the line under the field says it, so the page can keep and draw them. */
    onadded?: ((lines: ToldLine[]) => void) | undefined;
    /** Today's slim line after the first thing (AH9): one line, a Hide, and what was last added under it. */
    slim?: boolean | undefined;
    /** The paste box for a bank's text (AH10). */
    bank?: boolean | undefined;
    /** What was last added here, said under the field (AH23). */
    last?: readonly ToldLine[] | undefined;
    /** After Hide is pressed on the slim line. */
    onhide?: (() => void) | undefined;
  } = $props();

  /** The card's own words. */
  const say = {
    title: 'Tell it one real thing',
    slimTitle: 'Tell it something',
    bankTitle: 'Paste a bank text',
    field: 'Say it, or paste a message',
    bankField: 'Paste the text your bank sent',
    becomes: 'That becomes',
    needs: (what: readonly string[]) => `Needs ${what.join(' and ')}`,
    left: (words: readonly string[]) => `Not placed: ${words.join(', ')}`,
    addOne: 'Add it',
    /* "BOTH" FOR TWO: "Add all two" read as a machine counting (first hour audit, E19). */
    addAll: (n: number) => (n === 2 ? 'Add both' : `Add all ${countWord(n)}`),
    /* Some wait for what they need: the button names only what goes, never "all" over lines that stay. */
    addReady: (n: number) => (n === 1 ? 'Add the one that is ready' : `Add the ${countWord(n)} that are ready`),
    addTo: (list: string) => `Add it to ${list}`,
    notYet: 'Nothing is added until you press.',
    undoOne: 'One Undo takes it back.',
    undoAll: (n: number) => (n === 2 ? 'One Undo takes both back.' : `One Undo takes all ${countWord(n)} back.`),
    undoAny: 'One Undo takes all of it back.',
    raced: 'Something changed on your BrainDog while this was sent. Press Add again.',
    hide: 'Hide',
    hideLabel: 'Hide the line to tell it something',
    justAdded: 'Just added',
    inList: (list: string) => `in ${list}`,
    /* MONEY TOLD WHERE NONE IS KEPT (AM4): one press turns Money on and adds the line. */
    moneyOn: 'Turn on Money and add it',
    moneyTurning: 'Turning on Money…',
    moneyTurned: 'Turned on Money',
  };

  let typed = $state('');
  let sending = $state(false);
  let field = $state<HTMLTextAreaElement | null>(null);

  /* THE READER COMES AFTER THE CARD: asked as the card is made, so the field draws with Today and a cold first load does
     not wait for the sentence rules (speed-c FL1). It is in long before anybody finishes a word; a sentence typed
     sooner is read the moment it lands. */
  let reader = $state<typeof tellRead | null>(null);
  void import('$lib/tell/read.ts').then((m) => (reader = m.tellRead));

  const told = $derived(typed.trim() === '' || reader === null ? null : reader(typed, options));
  const rows = $derived(told?.rows ?? []);
  /* WHAT CAN BE ADDED NOW: an entry that still needs something stays in the preview, saying what, and the rest go. */
  const ready = $derived(readyRows(rows));
  const offers = $derived(told?.offers ?? []);

  const iconOf = (r: TellRow) => (isGlyph(r.icon) ? r.icon : 'rows');
  const listName = (register: string): string => options.lists.find((l) => l.id === register)?.name ?? register;

  /** Adds these entries of the preview (`shown`), all under one batch, and keeps the lines they were said in. */
  async function send(sent: { register: string; fields: Record<string, unknown> }[], shown: readonly TellRow[], at: readonly number[], first: string | null = null, lists: readonly TellList[] = options.lists) {
    const nameOf = (register: string): string => lists.find((l) => l.id === register)?.name ?? register;
    if (sending || sent.length === 0) return;
    sending = true;
    const pressed = typeof document === 'undefined' ? null : document.activeElement;
    const lines: ToldLine[] = at.flatMap((i) => (shown[i] ? [{ said: shown[i]!.said, list: nameOf(shown[i]!.register), href: `/r/${shown[i]!.register}` }] : []));
    const client = createClient({ base: apiBase() });
    /* THE UNDO IS THE RECORD'S, by the batch the capture answers: `run` offers `undoChange(base, batch)` on the receipt. */
    await run({
      apply: () => {},
      revert: () => {},
      send: async () => {
        const answer = await client.capture({ rows: sent });
        if (answer.ok) return { ok: true as const, value: answer.value };
        return { ok: false as const, fix: 'refusal' in answer ? answer.refusal.fix : say.raced };
      },
      /* EACH ENTRY BY WHAT IT IS, read from the fields it was sent with: the capture answers in the order it was sent. */
      said: (value) =>
        [first ?? '', addedSaid(value.made.map((m, i) => ({ register: m.register, fields: sent[i]?.fields })), lists), heldSaid(shown)]
          .filter((line) => line !== '')
          .join('. '),
      settle: () => {
        typed = '';
        void reread();
        onadded?.(lines);
      },
    });
    sending = false;
    /* THE FIELD KEEPS THE FOCUS (AH20): the next thing is typed straight away, never from the top of the page. AND THE
       SLIM LINE TAKES IT WHEN THIS CARD MAKES WAY FOR IT (AJ7): the first Add it by a click left the focus on a button
       that was gone, so it is watched for until the line is drawn, and moved off the pressed button too. */
    const was = field;
    focusOnceDrawn(() => (was?.isConnected ? was : [...document.querySelectorAll<HTMLElement>('[data-tell-one] .tell-one-field')].find((f) => f !== was)), { from: pressed });
  }

  function add(e: SubmitEvent) {
    e.preventDefault();
    void send(ready, rows, readyAt(rows));
  }

  /** One of the lists offered for words that fit nowhere, as its one entry. */
  function addOffer(row: TellRow) {
    void send([{ register: row.register, fields: row.fields as Record<string, unknown> }], [row], [0]);
  }

  /* ── turning Money on for a money line (AM4) ──
     THE PRESS TURNS MONEY ON, THEN THE SAME WORDS ARE READ AGAIN AGAINST THE LISTS IT BROUGHT and what they become is
     added, all in one press, under one batch with the one Undo every add has: the lists Money holds are learnt here
     (`learn`), the sentence read against them, and the rail read again after. Money stays on after an Undo; the line is
     what is taken back. A line that still cannot be placed once Money is on (which currency) says so on the card. */
  /** Money's own page, the address its place on the rail answers to. */
  const MONEY_PLACE = '/p/money';
  let moneyWait = $state(false);
  let moneyFix = $state<string | null>(null);
  async function moneyOn() {
    if (sending || moneyWait || reader === null) return;
    moneyFix = null;
    moneyWait = true;
    const words = typed;
    try {
      const { moneyThenRead } = await import('$lib/tell/money-on.ts');
      const out = await moneyThenRead(apiBase(), words, options, reader);
      if ('fix' in out) moneyFix = out.fix;
      else {
        const go = readyRows(out.told.rows);
        /* ONE PRESS, ONE TOAST: "Turned on Money. Added …" names Money, so the rail does not say it came as well. */
        if (go.length > 0) toasts.named(MONEY_PLACE);
        if (go.length > 0) await send(go, out.told.rows, readyAt(out.told.rows), say.moneyTurned, out.lists);
        else moneyFix = out.told.why ?? null;
      }
      await invalidateAll();
    } finally {
      moneyWait = false;
    }
  }

  /* CMD OR CTRL AND ENTER ADDS (AH20): Enter alone is a new line, for a pasted message. */
  function keyed(e: KeyboardEvent) {
    if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey) || e.isComposing) return;
    e.preventDefault();
    if (ready.length > 0) void send(ready, rows, readyAt(rows));
    else if (rows.length === 0 && offers.length === 1) addOffer(offers[0]!);
    else if (told?.needsMoney) void moneyOn();
  }

  const title = $derived(bank ? say.bankTitle : slim ? say.slimTitle : say.title);
  const placeholder = $derived(bank ? say.bankField : say.field);
</script>

{#snippet hideAction()}
  <Button weight="bare" size="sm" aria-label={say.hideLabel} onclick={() => onhide?.()}>{say.hide}</Button>
{/snippet}

<Tile icon={bank ? 'money' : 'slash'} {title} lead={!slim && !bank} class="tell-one" data-tell-one data-slim={slim ? '' : undefined} actions={slim && onhide ? hideAction : undefined}>
  <form class="tell-one-form" onsubmit={add}>
    <textarea
      class="tell-one-field"
      name="tell"
      rows={slim ? 1 : 2}
      autocomplete="off"
      {placeholder}
      aria-label={placeholder}
      aria-keyshortcuts="Meta+Enter Control+Enter"
      bind:value={typed}
      bind:this={field}
      onkeydown={keyed}
    ></textarea>
    {#if rows.length > 0}
      <div class="tell-one-becomes" aria-live="polite">
        <p class="tell-one-quiet">{say.becomes}</p>
        <ul class="tell-one-lines">
          {#each rows as row, i (i)}
            <li class="tell-one-line">
              <IconWell name={iconOf(row)} />
              <span class="tell-one-words">
                <span class="tell-one-said">{row.said}</span>
                {#if row.detail}<span class="tell-one-detail">{row.detail}</span>{/if}
                {#if row.missing.length > 0}<span class="tell-one-needs">{say.needs(row.missing)}</span>{/if}
              </span>
            </li>
          {/each}
        </ul>
        {#if told && told.left.length > 0}<p class="tell-one-quiet">{say.left(told.left)}</p>{/if}
        <Button weight="primary" type="submit" disabled={sending || ready.length === 0}>{ready.length < rows.length && ready.length > 0 ? say.addReady(ready.length) : ready.length <= 1 ? say.addOne : say.addAll(ready.length)}</Button>
      </div>
    {/if}
    {#if told && told.why}
      <!-- NOTHING PLACED IS SAID IN WORDS, with the way on: never a card over nothing to press (AH1). -->
      <div class="tell-one-becomes" aria-live="polite">
        <p class="tell-one-why">{told.why}</p>
        {#if told.needsMoney}
          <div class="tell-one-offers">
            <Button weight="primary" disabled={sending || moneyWait} onclick={() => void moneyOn()}>{moneyWait ? say.moneyTurning : say.moneyOn}</Button>
          </div>
          {#if moneyFix}<p class="tell-one-needs" role="alert">{moneyFix}</p>{/if}
        {/if}
        {#if offers.length > 0}
          <div class="tell-one-offers">
            {#each offers as offer (offer.register)}
              <Button weight={offers.length === 1 ? 'primary' : 'quiet'} disabled={sending} onclick={() => addOffer(offer)}>{say.addTo(listName(offer.register))}</Button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </form>
  {#if !slim || rows.length > 0 || offers.length > 0 || told?.needsMoney}
    <p class="tell-one-quiet">{say.notYet} {ready.length > 1 ? say.undoAll(ready.length) : ready.length === 1 ? say.undoOne : say.undoAny}</p>
  {/if}
  {#if last.length > 0 && typed.trim() === ''}
    <!-- WHAT WAS LAST ADDED, AND WHERE IT WENT, the same before and after a reload (AH23). -->
    <p class="tell-one-quiet tell-one-last">
      <span>{say.justAdded}:</span>
      {#each last as line, i (i)}<span class="tell-one-was">{line.said}, <a href={at(line.href)}>{say.inList(line.list)}</a>{i < last.length - 1 ? ';' : ''}</span>{/each}
    </p>
  {/if}
</Tile>

<style>
  .tell-one-form {
    display: grid;
    gap: var(--sp-4);
    margin: 0;
  }

  /* THE FIELD IS THE CARD'S ONE CONTROL: full width, two lines for a pasted message, 15 or more. */
  .tell-one-field {
    inline-size: 100%;
    min-block-size: 64px;
    padding: var(--sp-3);
    resize: vertical;
    font: inherit;
    font-size: var(--fs-body);
    color: var(--ink);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
  }

  .tell-one-becomes {
    display: grid;
    gap: var(--sp-3);
    justify-items: start;
  }

  .tell-one-lines {
    display: grid;
    gap: var(--sp-3);
    inline-size: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tell-one-line {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--sp-3);
    align-items: center;
  }

  .tell-one-words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .tell-one-said {
    font-size: var(--fs-body);
    font-weight: 500;
  }

  .tell-one-detail,
  .tell-one-quiet {
    margin: 0;
    font-size: var(--fs-body);
    color: var(--ink-2);
  }

  .tell-one-why {
    margin: 0;
    font-size: var(--fs-body);
    color: var(--ink);
  }

  .tell-one-offers {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .tell-one-last {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1) var(--sp-2);
  }

  .tell-one-last a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  /* THE SLIM LINE IS ONE LINE until something is typed: a phone's Today is not given over to it. */
  :global(.tell-one[data-slim]) .tell-one-field {
    min-block-size: 44px;
  }

  /* WHAT AN ENTRY NEEDS IS SAID IN WORDS, and only tinted: never colour alone. */
  .tell-one-needs {
    font-size: var(--fs-body);
    color: var(--red);
  }
</style>
