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
  import { arrive, lineIn } from '$lib/motion/index.ts';
  import { createClient } from '@braindog/client';
  import { invalidateAll } from '$app/navigation';

  import { apiBase, at } from '$lib/at.ts';
  import { reread } from '$lib/data/live.svelte.ts';
  import type { HomeChoice, MoneyAsk } from '$lib/tell/money-on.ts';
  import type { Open, TellChange, TellList, TellOptions, TellRow, tellRead } from '$lib/tell/read.ts';
  import Button from '$lib/ui/Button.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { isGlyph } from '$lib/ui/icons.ts';
  import { focusOnceDrawn } from '$lib/ui/keep-focus.ts';
  import { noteWith } from '$lib/tell/kept-note.ts';
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
    /* A LINE THAT NAMES SOMEBODY KEPT is offered their page (AN9). */
    openPage: (name: string) => `Open ${name}`,
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
    /* WHAT MONEY'S PLAN ASKS BEYOND ITS LISTS, said before the press approves it (RN3). */
    moneyAlso: 'Money will also:',
    /* A BIRTHDAY FOR SOMEBODY KEPT, kept on them (their note) where no list of dates is; two people's in one line, both. */
    keepOn: (names: readonly string[]) => `Add it to ${names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`}`,
    /* THE UNDO'S CODE DID NOT LOAD (RP1): offline, or an old tab after a deploy. The press says so and can be pressed again. */
    notLoaded: "Couldn't add it. Try again.",
    /* MONEY WENT ON AND THE LINE DID NOT GO IN (RP1): said on the card, and the line stays in the box for Add. */
    moneyNotAdded: "Money is on, but this wasn't added yet. Press Add to try again.",
    /* AN OPEN BILL, INVOICE OR ORDER SAID PAID BY ITS NUMBER, marked paid as its own page does. */
    markIt: 'Mark it paid',
    /* THE PRESS'S OWN PIECES DID NOT LOAD (RQ6): offline, or an old tab after a deploy. Said, and the press works again. */
    markNotLoaded: "Couldn't mark it. Try again.",
    /* THE RECORD'S CURRENCY, ASKED ONCE IN WORDS AND KEPT (AO2): the answer is every later amount's too. */
    whichHome: 'Which currency is your money in?',
    homeOnce: 'It is kept for every amount after this one, so you are asked once.',
    homeOther: 'Another one? Say it with the figure, like 2,400 euros.',
    homeKept: (name: string) => `Your currency is the ${name} now`,
    /* A LINE THAT FITS NOWHERE, ON A RECORD WITH NO THINGS TO DO (AO7): one press starts Work's list and adds it there. */
    todoOn: 'Start a to-do list and add it',
    todoTurning: 'Starting a to-do list…',
    todoTurned: 'Started a to-do list in Work',
    /* "NEW PROJECT: …" WHERE NO PROJECTS ARE KEPT (AP7): one press starts Projects and adds it there. */
    projectsOn: 'Start Projects and add it',
    projectsTurning: 'Starting Projects…',
    projectsTurned: 'Started Projects',
  };

  let typed = $state('');
  let sending = $state(false);

  /* THE UNDO'S MACHINERY COMES WITH THE FIRST PRESS, not with Today: `run` and the receipt's Undo behind it are only ever
     asked by an Add, so a cold open no longer waits for them. Warmed when the field takes the focus, which every press
     here follows, so the press itself does not wait; a failed load is asked again on the next press. */
  type Run = typeof import('$lib/data/optimistic.svelte.ts').run;
  let runIs: Promise<Run> | null = null;
  const runOf = (): Promise<Run | null> =>
    (runIs ??= import('$lib/data/optimistic.svelte.ts').then((m) => m.run)).catch(() => ((runIs = null), null));
  let field = $state<HTMLTextAreaElement | null>(null);

  /* THE READER COMES AFTER THE CARD: asked as the card is made, so the field draws with Today and a cold first load does
     not wait for the sentence rules (speed-c FL1). It is in long before anybody finishes a word; a sentence typed
     sooner is read the moment it lands. */
  let reader = $state<typeof tellRead | null>(null);
  void import('$lib/tell/read.ts').then((m) => (reader = m.tellRead));

  /* "INVOICE 1042 PAID": THE OPEN BILL, INVOICE OR ORDER KNOWN BY THAT NUMBER is asked of the record once a line names one
     and says paid, never with Today, and the line is read again with it (`tell/numbered.ts`). */
  const NUMBERED = /^\s*(?:order|invoice|inv|bill)\s*(?:#|no\.?|number)?\s*(\d{1,9})\b.*\bpaid\b/iu;
  /* AND ANY LINE THAT SAYS "PAID" (AP6): "Rent paid", "Salma's order is paid". The open ones are asked for once, under
     `PAID`, and the line is read against them while it still says paid. */
  const PAID = 'paid';
  const numberSaid = $derived(NUMBERED.exec(typed)?.[1] ?? (/\bpaid\b/iu.test(typed) ? PAID : ''));
  let numbered = $state.raw<{ n: string; open: readonly Open[] } | null>(null);
  let asking = '';
  /* STILL ASKING: Add waits a moment, so a quick press never adds a second payment for a bill it was about to find. */
  const looking = $derived(numberSaid !== '' && numbered?.n !== numberSaid);
  $effect(() => {
    const n = numberSaid;
    /* THE LINE CHANGED, SO WHAT WAS READ FOR IT GOES (RQ5): the same words typed again later are asked of the record again. */
    if (n === '') {
      asking = '';
      if (numbered !== null) numbered = null;
      return;
    }
    if (n === asking) return;
    asking = n;
    const lists = options.lists;
    void import('$lib/tell/numbered.ts')
      .then((m) => (n === PAID ? m.openToMark(apiBase(), lists) : m.openNumbered(apiBase(), lists, Number(n))))
      .then(
        (open) => void (asking === n && (numbered = { n, open })),
        /* A FAILED ASK READS THE LINE AS BEFORE, with nothing open to mark, and the next line asks again. */
        () => void (asking === n && (numbered = { n, open: [] })),
      );
  });
  const heard = $derived(numbered !== null && numbered.n === numberSaid ? { ...options, open: numbered.open } : options);

  const told = $derived(typed.trim() === '' || reader === null ? null : reader(typed, heard));
  const rows = $derived(told?.rows ?? []);
  /* WHAT CAN BE ADDED NOW: an entry that still needs something stays in the preview, saying what, and the rest go. */
  const ready = $derived(readyRows(rows));
  const offers = $derived(told?.offers ?? []);

  const iconOf = (r: TellRow) => (isGlyph(r.icon) ? r.icon : 'rows');
  const listName = (register: string): string => options.lists.find((l) => l.id === register)?.name ?? register;

  /** Adds these entries of the preview (`shown`), all under one batch, and keeps the lines they were said in. True when they landed. */
  async function send(sent: { register: string; fields: Record<string, unknown> }[], shown: readonly TellRow[], at: readonly number[], first: string | null = null, lists: readonly TellList[] = options.lists): Promise<boolean> {
    const nameOf = (register: string): string => lists.find((l) => l.id === register)?.name ?? register;
    if (sending || sent.length === 0) return false;
    sending = true;
    const pressed = typeof document === 'undefined' ? null : document.activeElement;
    /* SAID WHERE THE PREVIEW SAID IT GOES (AO10): money in kept as a paid item is "in Money", linked to Money, after the
       add as before it, never "in Bills and invoices". */
    const lines: ToldLine[] = at.flatMap((i) => {
      const row = shown[i];
      return row ? [{ said: row.said, list: row.where?.name ?? nameOf(row.register), href: row.where?.href ?? `/r/${row.register}` }] : [];
    });
    const client = createClient({ base: apiBase() });
    const run = await runOf();
    if (run === null) return notLoaded();
    /* THE UNDO IS THE RECORD'S, by the batch the capture answers: `run` offers `undoChange(base, batch)` on the receipt. */
    const out = await run({
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
    return out.ok;
  }

  /** The undo's code did not load: said, and the press is free again, so the next one asks for it again (RP1). */
  function notLoaded(): false {
    toasts.push(say.notLoaded, { intent: 'warn' });
    sending = false;
    return false;
  }

  function add(e: SubmitEvent) {
    e.preventDefault();
    if (looking) return;
    void send(ready, rows, readyAt(rows));
  }

  /** One of the lists offered for words that fit nowhere, as its one entry. */
  function addOffer(row: TellRow) {
    void send([{ register: row.register, fields: row.fields as Record<string, unknown> }], [row], [0]);
  }

  /* ── a fact about somebody kept, kept on them ──
     "Mum's birthday is 14 Nov" with Mum in People and no dates kept: one press keeps "Birthday 14 Nov" on her note at the
     version just read, replacing a birthday it already holds (`noteWith`, RP2), and the receipt's Undo writes the note
     back as it was. Two people's birthdays in one line are kept in the same press (`also`). A note that already says it
     is not written: the receipt says so, with no Undo. */
  async function keepOn(c: TellChange) {
    if (sending) return;
    sending = true;
    const pressed = typeof document === 'undefined' ? null : document.activeElement;
    const client = createClient({ base: apiBase() });
    const each = [c, ...(c.also ?? [])];
    /* What each note written held before, and the version it landed at, for the Undo. */
    const wrote = new Map<TellChange, { had: string; version: number }>();
    const putBack = async (): Promise<string | null> => {
      for (const [one, w] of wrote) {
        const out = await client.update({ register: one.register, seq: one.seq, patch: { [one.field]: w.had === '' ? null : w.had }, version: w.version });
        if (!out.ok) return 'refusal' in out ? out.refusal.fix : say.raced;
      }
      return null;
    };
    const run = await runOf();
    if (run === null) return void notLoaded();
    await run<{ wrote: number; batch?: string }>({
      apply: () => {},
      revert: () => {},
      send: async () => {
        let batch: string | undefined;
        for (const one of each) {
          const got = await client.get(one.register, one.seq);
          const row = got.ok ? (got.value as { fields?: Record<string, unknown>; version?: number } | null) : null;
          const fix = !row?.fields || typeof row.version !== 'number' ? say.raced : null;
          const note = row?.fields?.[one.field];
          const had = typeof note === 'string' ? note.trim() : '';
          const next = fix === null ? noteWith(had, one.line) : null;
          const out = next === null ? null : await client.update({ register: one.register, seq: one.seq, patch: { [one.field]: next }, version: row!.version! });
          /* ONE NOTE REFUSED TAKES BACK THE ONES ALREADY WRITTEN, so a press keeps all of it or none. */
          const refused = fix ?? (out !== null && !out.ok ? ('refusal' in out ? out.refusal.fix : say.raced) : null);
          if (refused !== null) return { ok: false as const, fix: (await putBack()) ?? refused };
          if (out === null || !out.ok) continue;
          const landed = out.value as { version?: number; batch?: string };
          wrote.set(one, { had, version: typeof landed.version === 'number' ? landed.version : row!.version! + 1 });
          batch = landed.batch;
        }
        /* THE RECORD'S UNDO TAKES ONE BATCH, so it is offered for one note written; two are put back by this card. */
        return { ok: true as const, value: wrote.size === 1 && batch !== undefined ? { wrote: 1, batch } : { wrote: wrote.size } };
      },
      said: (value) => (value.wrote === 0 ? (c.already ?? '') : c.done),
      undo: (value) =>
        value.wrote === 0
          ? null
          : {
              apply: () => {},
              revert: () => {},
              send: async () => {
                const fix = await putBack();
                return fix === null ? { ok: true as const, value: null } : { ok: false as const, fix };
              },
              settle: () => void reread(),
            },
      settle: (value) => {
        typed = '';
        void reread();
        if (value.wrote > 0) onadded?.([...wrote.keys()].map((one) => ({ said: `${one.name}, ${one.line.charAt(0).toLowerCase()}${one.line.slice(1)}`, list: listName(one.register), href: `/r/${one.register}/${one.seq}` })));
      },
    });
    sending = false;
    const was = field;
    focusOnceDrawn(() => (was?.isConnected ? was : [...document.querySelectorAll<HTMLElement>('[data-tell-one] .tell-one-field')].find((f) => f !== was)), { from: pressed });
  }

  /* ── an open bill, invoice or order, marked paid ──
     "Invoice 1042 paid" with invoice 1042 open: one press sets its state to paid at the version just read, as its own Mark
     paid does, and the receipt's Undo puts it back (`markPress`). */
  async function markOn(c: TellChange) {
    if (sending) return;
    sending = true;
    const pressed = typeof document === 'undefined' ? null : document.activeElement;
    const [run, press] = await Promise.all([runOf(), import('$lib/tell/numbered.ts').then((m) => m.markPress(apiBase(), c, say.raced, () => void reread())).catch(() => null)]);
    if (run !== null && press !== null)
      await run({
        apply: () => {},
        revert: () => {},
        ...press,
        said: c.done,
        settle: () => {
          typed = '';
          numbered = null;
          asking = '';
          void reread();
          onadded?.([{ said: `${c.name}, ${c.done.split(' ').pop()}`, list: listName(c.register), href: `/r/${c.register}/${c.seq}` }]);
        },
      });
    else toasts.push(say.markNotLoaded, { intent: 'warn' });
    sending = false;
    const was = field;
    focusOnceDrawn(() => (was?.isConnected ? was : [...document.querySelectorAll<HTMLElement>('[data-tell-one] .tell-one-field')].find((f) => f !== was)), { from: pressed });
  }
  const changeOn = (c: TellChange): Promise<void> => (c.mark ? markOn(c) : keepOn(c));

  /* ── turning Money on for a money line (AM4) ──
     THE PRESS TURNS MONEY ON, THEN THE SAME WORDS ARE READ AGAIN AGAINST THE LISTS IT BROUGHT and what they become is
     added, all in one press, under one batch with the one Undo every add has: the lists Money holds are learnt here
     (`learn`), the sentence read against them, and the rail read again after. Money stays on after an Undo; the line is
     what is taken back. A line that still cannot be placed once Money is on (which currency) says so on the card. */
  /** Money's own page, the address its place on the rail answers to. */
  const MONEY_PLACE = '/p/money';
  let moneyWait = $state(false);
  let moneyFix = $state<string | null>(null);
  /** What Money's plan would also approve, said on the card; the next press approves these lines and no others (RN3). */
  let moneyAsk = $state<MoneyAsk | null>(null);
  /** The words a press of "Turn on Money" read and the lists Money brought, until the page reads them itself (AO2). */
  let turned = $state<{ words: string; lists: TellList[] } | null>(null);
  async function moneyOn() {
    if (sending || moneyWait || reader === null) return;
    moneyFix = null;
    moneyWait = true;
    const words = typed;
    try {
      /* THE UNDO'S CODE FIRST (RP1): Money is never turned on for a line that then cannot be added. */
      if ((await runOf()) === null) {
        moneyFix = say.notLoaded;
        return;
      }
      const { moneyThenRead } = await import('$lib/tell/money-on.ts');
      const out = await moneyThenRead(apiBase(), words, options, reader, moneyAsk?.approve ?? []);
      if ('ask' in out) {
        moneyAsk = out.ask;
        return;
      }
      moneyAsk = null;
      if ('fix' in out) moneyFix = out.fix;
      else {
        const go = readyRows(out.told.rows);
        /* ONE PRESS, ONE TOAST: "Turned on Money. Added …" names Money, so the rail does not say it came as well, nor any
           place that came with it (AP17: "Agents is in your sidebar now" over "Turned on Money"). With nothing added yet,
           the one toast says Money is on. */
        toasts.named(MONEY_PLACE);
        toasts.hush();
        if (go.length === 0) toasts.push(say.moneyTurned);
        /* AND A LINE THAT DID NOT GO IN IS SAID ON THE CARD, still in the box, for Add once the page knows Money (RP1). */
        if (go.length > 0) {
          if (!(await send(go, out.told.rows, readyAt(out.told.rows), say.moneyTurned, out.lists))) moneyFix = say.moneyNotAdded;
        }
        /* NO CURRENCY SAID AND NONE KEPT (AO2): the card asks which, in words, and the answer adds the line. */
        else if (out.home === null && currencyMissing(words, out.lists)) turned = { words, lists: out.lists };
        else moneyFix = out.told.why ?? null;
      }
      await invalidateAll();
    } finally {
      moneyWait = false;
    }
    /* THE FOCUS STAYS IN TELL (AO2), never dropped to the page under a card that changed shape. */
    if (field?.isConnected) field.focus();
  }

  /* ── the record's currency, asked once (AO2) ──
     A LINE WITH AN AMOUNT AND NO CURRENCY, ON A RECORD THAT KEEPS NONE, asked "Which currency is that in?" on every
     money line after Money was turned on, while Money's own setup suggested the device's. Now it is asked once, as a
     choice in words with the likeliest first, and the answer is kept as the record's home currency and adds the line in
     the same press. A currency is never guessed: the reader is asked whether a figure with one in its place reads. */
  /** Any currency, put in the place of the one the line did not say, to learn whether that is all it lacks. */
  const PROBE = 'USD';
  function currencyMissing(words: string, lists: readonly TellList[]): boolean {
    if (reader === null) return false;
    const as = { ...options, lists };
    if (readyRows(reader(words, as).rows).length > 0) return false;
    return readyRows(reader(words, { ...as, currency: PROBE, home: null }).rows).length > 0;
  }
  /** The lists the currency question reads against: the ones Money brought, until the page holds them. */
  const homeLists = $derived.by((): TellList[] | null => {
    if (reader === null || typed.trim() === '' || options.currency !== null) return null;
    if (turned !== null && turned.words === typed) return turned.lists;
    if (told?.needsMoney || ready.length > 0) return null;
    return currencyMissing(typed, options.lists) ? [...options.lists] : null;
  });
  let choices = $state<HomeChoice[]>([]);
  $effect(() => {
    if (homeLists === null || choices.length > 0) return;
    void import('$lib/tell/money-on.ts').then((m) => m.homeChoices(typed)).then((c) => (choices = c), () => (choices = []));
  });
  let homeFix = $state<string | null>(null);
  /** The answer kept as the record's currency, then the line read in it and added, all in one press. */
  async function keepHome(c: HomeChoice) {
    const lists = homeLists;
    if (sending || reader === null || lists === null) return;
    homeFix = null;
    sending = true;
    const { keepHome: keep } = await import('$lib/tell/money-on.ts');
    const fix = await keep(apiBase(), c.code).catch(() => null);
    sending = false;
    if (fix !== null) return void (homeFix = fix);
    const out = reader(typed, { ...options, lists, currency: c.code, home: c.code });
    const go = readyRows(out.rows);
    turned = null;
    if (go.length > 0) await send(go, out.rows, readyAt(out.rows), say.homeKept(c.name), lists);
    await invalidateAll();
  }

  /* ── starting a to-do list for a line that fits nowhere (AO7) ──
     As Money above: Work is turned on, the same words read again against the lists it brought, and what they become
     added under one batch with the one Undo. Work stays on after an Undo; the line is what is taken back. */
  let todoWait = $state(false);
  let todoFix = $state<string | null>(null);
  async function todoOn() {
    if (sending || todoWait || reader === null) return;
    todoFix = null;
    todoWait = true;
    const words = typed;
    try {
      const { todoThenRead } = await import('$lib/tell/todo-on.ts');
      const out = await todoThenRead(apiBase(), words, options, reader);
      if ('fix' in out) todoFix = out.fix;
      else {
        const go = readyRows(out.told.rows);
        /* ONE PRESS, ONE TOAST, as Money's: "Started a to-do list in Work" names Work, so the rail does not say it came. */
        toasts.hush();
        if (go.length > 0) await send(go, out.told.rows, readyAt(out.told.rows), say.todoTurned, out.lists);
        else {
          toasts.push(say.todoTurned);
          todoFix = out.told.why ?? null;
        }
      }
      await invalidateAll();
    } finally {
      todoWait = false;
    }
  }

  /* ── starting Projects for "New project: …" (AP7) ──
     As the to-do list above: Projects is turned on, the same words read again against the lists it brought, and the
     project added under one batch with the one Undo. Projects stays on after an Undo; the project is what is taken back. */
  let projectsWait = $state(false);
  let projectsFix = $state<string | null>(null);
  async function projectsOn() {
    if (sending || projectsWait || reader === null) return;
    projectsFix = null;
    projectsWait = true;
    const words = typed;
    try {
      const { moduleThenRead, PROJECTS_MODULE, PROJECTS_SAID } = await import('$lib/tell/todo-on.ts');
      const out = await moduleThenRead(apiBase(), PROJECTS_MODULE, PROJECTS_SAID, words, options, reader);
      if ('fix' in out) projectsFix = out.fix;
      else {
        const go = readyRows(out.told.rows);
        toasts.hush();
        if (go.length > 0) await send(go, out.told.rows, readyAt(out.told.rows), say.projectsTurned, out.lists);
        else {
          toasts.push(say.projectsTurned);
          projectsFix = out.told.why ?? null;
        }
      }
      await invalidateAll();
    } catch {
      projectsFix = PROJECTS_FAILED;
    } finally {
      projectsWait = false;
    }
  }
  /** Said when the press's own code did not load, as Money's and Tell's own presses say it (RP1). */
  const PROJECTS_FAILED = "Couldn't start Projects. Try again.";

  /* CMD OR CTRL AND ENTER ADDS (AH20): Enter alone is a new line, for a pasted message. */
  function keyed(e: KeyboardEvent) {
    if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey) || e.isComposing) return;
    e.preventDefault();
    if (looking) return;
    if (ready.length > 0) void send(ready, rows, readyAt(rows));
    else if (rows.length === 0 && offers.length === 1 && !told?.about && !told?.needsTodo && !told?.needsProjects) addOffer(offers[0]!);
    else if (rows.length === 0 && told?.change) void changeOn(told.change);
    /* AND NEVER TURNS MONEY ON (RN3): ⌘↵ adds a line where a home for it exists; a module goes on by its own button. */
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
      onfocus={() => void runOf()}
      onkeydown={keyed}
    ></textarea>
    {#if rows.length > 0}
      <!-- WHAT IT BECOMES rises in under the words, and each line it adds opens as it is read (`$lib/motion`). -->
      <div class="tell-one-becomes" aria-live="polite" in:arrive={{ rise: 6, from: 1 }}>
        <p class="tell-one-quiet">{say.becomes}</p>
        <ul class="tell-one-lines">
          {#each rows as row, i (i)}
            <li class="tell-one-line" data-forming="told" in:lineIn>
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
        <Button weight="primary" type="submit" disabled={sending || looking || ready.length === 0}>{ready.length < rows.length && ready.length > 0 ? say.addReady(ready.length) : ready.length <= 1 ? say.addOne : say.addAll(ready.length)}</Button>
      </div>
    {/if}
    {#if told?.change}
      <!-- SOMETHING SAID OF SOMEBODY KEPT is offered on them, one press (a birthday where no dates are kept). -->
      {@const change = told.change}
      <div class="tell-one-becomes" aria-live="polite">
        <p class="tell-one-why">{change.ask}</p>
        <div class="tell-one-offers">
          <Button weight={rows.length === 0 ? 'primary' : 'quiet'} disabled={sending} onclick={() => void changeOn(change)}>{change.mark ? say.markIt : say.keepOn([change, ...(change.also ?? [])].map((k) => k.name))}</Button>
        </div>
      </div>
    {/if}
    {#if told?.which}
      <!-- TWO OPEN ENTRIES THE LINE COULD MEAN (AP6): which was paid is asked, each its own press, none chosen for him. -->
      <div class="tell-one-becomes" aria-live="polite">
        <p class="tell-one-why">{told.which.ask}</p>
        <div class="tell-one-offers">
          {#each told.which.marks as mark (`${mark.register}#${mark.seq}`)}
            <Button weight="quiet" disabled={sending} onclick={() => void changeOn(mark)}>{mark.label ?? mark.name}</Button>
          {/each}
        </div>
      </div>
    {/if}
    {#if homeLists !== null && choices.length > 0}
      <!-- THE RECORD'S CURRENCY, ASKED ONCE IN WORDS (AO2): the answer is kept and adds the line in the same press. -->
      <div class="tell-one-becomes" aria-live="polite">
        <p class="tell-one-why">{say.whichHome} <span class="tell-one-quiet">{say.homeOnce}</span></p>
        <div class="tell-one-offers">
          {#each choices as c, i (c.code)}
            <Button weight={i === 0 ? 'primary' : 'quiet'} disabled={sending} onclick={() => void keepHome(c)}>{c.name}</Button>
          {/each}
        </div>
        <p class="tell-one-quiet">{say.homeOther}</p>
        {#if homeFix}<p class="tell-one-needs" role="alert">{homeFix}</p>{/if}
      </div>
    {:else if told && told.why}
      <!-- NOTHING PLACED IS SAID IN WORDS, with the way on: never a card over nothing to press (AH1). -->
      <div class="tell-one-becomes" aria-live="polite">
        <p class="tell-one-why">{told.why}</p>
        {#if told.needsMoney}
          {#if moneyAsk}
            <div class="tell-one-also">
              <p class="tell-one-quiet">{say.moneyAlso}</p>
              <ul class="tell-one-also-lines">
                {#each moneyAsk.lines as line, i (i)}<li>{line}</li>{/each}
              </ul>
            </div>
          {/if}
          <div class="tell-one-offers">
            <Button weight="primary" disabled={sending || moneyWait} onclick={() => void moneyOn()}>{moneyWait ? say.moneyTurning : say.moneyOn}</Button>
          </div>
          {#if moneyFix}<p class="tell-one-needs" role="alert">{moneyFix}</p>{/if}
        {/if}
        {#if told.about || offers.length > 0 || told.needsTodo || told.needsProjects}
          <div class="tell-one-offers">
            {#if told.needsProjects}<Button weight="primary" disabled={sending || projectsWait} onclick={() => void projectsOn()}>{projectsWait ? say.projectsTurning : say.projectsOn}</Button>{/if}
            {#if told.needsTodo}<Button weight="primary" disabled={sending || todoWait} onclick={() => void todoOn()}>{todoWait ? say.todoTurning : say.todoOn}</Button>{/if}
            {#if told.about}<Button weight="primary" href={at(told.about.href)}>{say.openPage(told.about.name)}</Button>{/if}
            {#each offers as offer (offer.register)}
              <Button weight={offers.length === 1 && !told.about && !told.needsTodo && !told.needsProjects ? 'primary' : 'quiet'} disabled={sending} onclick={() => addOffer(offer)}>{say.addTo(listName(offer.register))}</Button>
            {/each}
          </div>
          {#if todoFix}<p class="tell-one-needs" role="alert">{todoFix}</p>{/if}
          {#if projectsFix}<p class="tell-one-needs" role="alert">{projectsFix}</p>{/if}
        {/if}
      </div>
    {/if}
  </form>
  {#if !slim || rows.length > 0 || offers.length > 0 || told?.needsMoney || told?.needsTodo || told?.needsProjects || told?.change || told?.which}
    <p class="tell-one-quiet">{say.notYet} {ready.length > 1 ? say.undoAll(ready.length) : ready.length === 1 ? say.undoOne : say.undoAny}</p>
  {/if}
  {#if last.length > 0 && typed.trim() === ''}
    <!-- WHAT WAS LAST ADDED, AND WHERE IT WENT, the same before and after a reload (AH23). -->
    <p class="tell-one-quiet tell-one-last" in:arrive={{ rise: 6, from: 1 }}>
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
    max-block-size: 40vh;
    padding: var(--sp-3);
    /* IT GROWS WITH WHAT IS TYPED (a pasted message too), so it needs no grip in its corner. */
    field-sizing: content;
    resize: none;
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

  /* WHAT MONEY WOULD ALSO DO, one call a line in ink under the quiet lead, before the press that approves them. */
  .tell-one-also {
    display: grid;
    gap: var(--sp-1);
  }

  .tell-one-also-lines {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    padding-inline-start: var(--sp-4);
    font-size: var(--fs-body);
    color: var(--ink);
    white-space: pre-line;
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
