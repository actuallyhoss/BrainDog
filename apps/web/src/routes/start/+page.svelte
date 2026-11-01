<!--
  The first run: a conversation on the left, and the BrainDog building beside it.

  ONE QUESTION, ONE FIELD, FOUR CHIPS, AND IT LISTENS WHILE YOU TYPE. "Who are you?", answered in a sentence, with a chip
  for each of the four people the product is for. As it is typed, simple rules read it on this device
  (`lib/start/propose.ts`, `propose`): the parts it would make light up beside the field, and each phrase heard is said
  under it. The press asks Slash's model (`proposeFirst`), which reads any language and names things in the person's own
  words; where a host has none, or the month's asks are spent, the rules' reading is the answer. Nothing is refused.

  OR POINT AT AN EXPORT. A CSV or JSON file from another app, dropped on the screen or picked, is read on this device
  (`lib/start/export.ts`); the model reads its first entries and says which list it goes into and which column fills
  what, and the pages below are drawn over the file's own entries. A file no list holds becomes a list of its own. A
  zip, as Notion exports a workspace, is one tile for each table inside, each mapped and left out on its own, and the
  pages of notes it held are counted and said once under them, never written.

  THEN A CONVERSATION, AND NOTHING WRITTEN. The words come back marked with what each phrase became, then BrainDog's
  reply: what it heard, what it is for, the one question the words cannot answer (the currency, with the ones worth
  offering numbered and one suggested with its reason), and a field to tell it more. Each later turn is read with the
  first, and BrainDog says what it added. Beside it, the BrainDog builds: its parts, each lighting up as a phrase asks
  for it, and the reading itself, phrase by phrase as it is typed and "Reading" while the model reads; then a tile for
  each part with why it is on and the entries the words filled, and every page it makes, drawn by the record over the
  person's own entries and file rows, never saved (`PagesPreview.svelte`).

  ONE BUTTON FAMILY, `Button`, in three weights by what each does: the one ink primary, quiet pills for the choices,
  and bare words for the other way in (a file). The primary sits at the end of the row under the field, where the eye
  lands when the sentence is done, and it is never drawn disabled before anything is typed: pressed then, it puts the
  caret in the field.

  A BUSINESS NO USE CASE FITS IS DRAFTED FOR, where a model answers. Slash drafts lists,
  figures and pages made for what was said (`slashDraft`), which files nothing; they are drawn over its sample rows, and
  the same one press files and accepts them. The sample rows are never written.

  THEN ONE PRESS. "Make it mine" (or Ctrl Enter from anywhere) writes it all through the install path Browse uses
  (`accept.ts`), and the screen becomes its end (`Made.svelte`): one agent and one source, each saying what it would
  find here, a passkey for a person with none, then Home. `/start#made` opens on that end directly, which is where
  sign-up lands once it has written what was said there into the new record. There is no one-row form: a list with
  nothing in it draws its own empty state, and a record with no lists is sent here by the root layout.

  THE WHOLE WINDOW (`Frame.svelte`), as sign-up has it: the conversation and the build share it from 900px.

  NO SKIP, because a record with no lists has no other screen to show (19 §6). A colleague who holds lists and not the
  record, and an owner whose record is already made, are told so before the question, with the way back.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { USE_CASES } from '@braindog/seed/usecases';
  import { dayOf } from '@braindog/seed/usecases/install';
  import { moduleName } from '@braindog/seed/usecases/names';
  import { apiBase, at } from '$lib/at.ts';
  import { covered, typing } from '$lib/a11y/keys.svelte.ts';
  import { silenced } from '$lib/a11y/chars.ts';
  import { methods } from '$lib/auth.ts';
  import { copy } from '$lib/copy.ts';
  import { firstRun } from '$lib/first-run.ts';
  import * as pref from '$lib/pref.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { onNoRecord } from '$lib/record/boot-live.ts';
  import { landing } from '$lib/record/landing.ts';
  import { INSTALL_ORDER, LEANS_ON } from '$lib/shape.ts';
  import { byRules, draftChange, type Drafted, type SlashClient } from '$lib/record/slash.ts';
  import { becameShown, draftBrief, filledBy, outsideCatalogue, propose, proposeFirst, railPlaces, type Proposal } from '$lib/start/propose.ts';
  import { slashAsks } from '$lib/start/ask.ts';
  import { MADE_ADDONS, heardOf, offerOf, readCatalogueOffer, tradeAddons, tradesKept, type CatalogueOffer, type TradeOffer } from '$lib/start/offer.ts';
  import { BYTES_MOST, drawnWith, entriesOf, EXPORTS_MOST, leftSaid, mapExport, newListDeclarations, ownList, readExports, type Export, type Mapping } from '$lib/start/export.ts';
  import { allLists, listById } from '$lib/start/lists.ts';
  import { titleOf } from '$lib/title.ts';
  import { drew } from '$lib/ui/screen.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Face from '$lib/ui/Face.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { PEOPLE } from '$lib/who.ts';
  import { accept, pressKey, type NotMade, type SetupRow } from './accept.ts';
  import {
    added,
    browserCurrencyEnv,
    casePart,
    currencyChoices,
    iconOfBecame,
    joinTurns,
    making,
    makingStates,
    marksIn,
    missingIn,
    partsOf,
    statusOf,
    stepsOf,
    watchHeld,
    words,
    zoneCurrency,
    type CurrencyEnv,
    type Held,
    type MakingPart,
    type Refused,
    type Part as PartOf,
    type Said,
  } from './building.ts';
  import { caseOf, changesAsked, draftAsked, keepsCurrency, pagesOf, reminds, words as drawing } from './preview.ts';
  import Currency from './Currency.svelte';
  import FromFile from './FromFile.svelte';
  import PagesPreview from './PagesPreview.svelte';
  import Part from './Part.svelte';
  import Remind from './Remind.svelte';
  import NoRecord from './NoRecord.svelte';
  import Frame from './Frame.svelte';
  import Made from './Made.svelte';
  import { assemble } from '$lib/start/assembling.ts';
  import { MADE_SAID, saidMade, saidMadeOf, type SaidMade } from '$lib/start/made.ts';
  import Making from './Making.svelte';

  /**
   * A COLLEAGUE WHO HOLDS LISTS AND NOT THE RECORD IS NEVER ASKED TO SET ONE UP. A record's shape is its owner's, and
   * every install this screen makes would be refused for them; they are told whose it is and sent to the lists they
   * came for (`landing.ts`).
   */
  const colleague = $derived(Boolean(page.data.live) && (page.data as unknown as Shell).me.lists != null);

  /**
   * SIGNED IN AND ON NO RECORD: a proved mailbox that has not paid yet, or a person whose only record closed.
   * `/` sends that session here, and the `boot` under it answered 403, so the screen asks for a name and a payment
   * instead of drawing an empty record that says nothing is here.
   */
  const noRecord = $derived(!page.data.live && onNoRecord((page.data as unknown as Shell).refused));
  const notTheirs = $derived(colleague ? landing(page.data as unknown as Shell) : null);

  /**
   * WHETHER THE RECORD BEHIND THIS SCREEN IS ALREADY MADE. The root layout spares `/start` from the redirect that sends
   * an empty record here, which is what lets somebody open it again on a record with pages and lists; they are told so
   * before the question, with the door back.
   */
  const alreadyMade = $derived(Boolean(page.data.live) && (page.data.pages.length > 0 || page.data.index.registers.length > 0));

  /**
   * THE END OF THE FIRST RUN: the BrainDog is made, and `Made` offers an agent and a source before Home. Set by a "Make it
   * mine" that wrote everything, and by arriving at `#made`, which sign-up opens once it wrote the build itself. The
   * fragment is wiped as it is read, so a reload is the question again, with the "already made" note over it.
   */
  let made = $state(false);
  let madeModules = $state.raw<string[] | null>(null);
  /* THE PLACES MADE, by name, which the end says first. */
  let madePlaces = $state.raw<string[] | null>(null);
  /* THE ADD-ONS A TRADE SAID NAMES, offered by name at the end and never installed (AH8, FB5). */
  let madeAddons = $state.raw<TradeOffer[]>([]);
  /* THE WORDS AND WHAT THEY BUILT (1 Nov), which the end has the model read once more for drafts on Today. */
  let madeSaid = $state.raw<SaidMade | null>(null);
  /* `/start` IS A BRAINDOG ASSEMBLING for as long as it is open (`assembling.ts`). */
  onMount(() => assemble());
  onMount(() => {
    /* A SET-UP BRAINDOG GOES TO TODAY (first hour audit, AH31): its address back at /start drew sign-up again over
       "This BrainDog is set up". Only the end of the run (`#made`), an agent's set-up (`?agent=1`) and "Or bring in a
       file" (`?more=1`, `made.ts`) open the question on a made record. */
    if (location.hash !== '#made' && alreadyMade && !colleague && !page.url.searchParams.has('agent') && !page.url.searchParams.has('more')) {
      void goto(at('/'), { replaceState: true });
      return;
    }
    if (location.hash !== '#made') return;
    history.replaceState(history.state, '', location.pathname + location.search);
    if (page.data.live) made = true;
    /* AND THE PLACES SIGN-UP MADE, which it left in this tab, read once and let go. */
    try {
      const kept: unknown = JSON.parse(globalThis.sessionStorage?.getItem('braindog.made.places') ?? 'null');
      globalThis.sessionStorage?.removeItem('braindog.made.places');
      if (Array.isArray(kept) && kept.every((x) => typeof x === 'string')) madePlaces = kept;
    } catch {
      /* Nothing kept: the end says only that it is made. */
    }
    try {
      madeAddons = tradesKept(globalThis.sessionStorage?.getItem(MADE_ADDONS) ?? null);
      globalThis.sessionStorage?.removeItem(MADE_ADDONS);
    } catch {
      /* Storage off: no add-on is offered. */
    }
    try {
      madeSaid = saidMadeOf(globalThis.sessionStorage?.getItem(MADE_SAID) ?? null);
      globalThis.sessionStorage?.removeItem(MADE_SAID);
    } catch {
      /* Storage off: the end reads nothing more. */
    }
  });

  /* WHERE AND HOW THE SENTENCE WAS TYPED, for a date such as "on the 1st", for the currency names and for the currency
     worth suggesting. */
  const locale = typeof navigator === 'undefined' ? 'en' : navigator.language;
  const zone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      return null;
    }
  })();
  /* THE CURRENCY THIS DEVICE'S ZONE KEEPS, read in with the words, so a shop in Cairo keeps EGP without being asked. */
  const deviceCurrency = zoneCurrency(zone);

  /* THE CATALOGUE'S USE CASES, read once as the page opens: the rules listen for their words (`heardOf`) and the model may
     choose them (`offerOf`). Until it answers, or when there is none, only what this build ships is offered. */
  let cat = $state.raw<CatalogueOffer | null>(null);
  onMount(() => {
    void readCatalogueOffer().then((c) => (cat = c));
  });

  /* "09:38", in the person's own clock, beside each turn of the conversation. */
  const clock = (() => {
    try {
      return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  })();
  const timeOf = (ms: number): string => clock?.format(ms) ?? '';

  /* ── the prompt ─────────────────────────────────────────────────────────── */

  /* The sentence stays in memory and never in the address, so it is nowhere a link or a history entry can carry it. */
  let sentence = $state('');
  let field = $state<HTMLTextAreaElement | undefined>(undefined);
  let heardHeading = $state<HTMLHeadingElement | undefined>(undefined);

  /* ENTER READS THE SENTENCE AND SHIFT+ENTER STARTS A NEW LINE, as a chat box does, because the field is one answer. */
  function enter(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    read();
  }

  /**
   * WHAT IT HEARS WHILE THE SENTENCE IS TYPED, read a beat after the last key so a fast typist is not slowed. It draws
   * the parts lighting up beside the field and the phrases under it, and decides nothing: the press reads it for real.
   */
  let live = $state.raw<Proposal | null>(null);
  $effect(() => {
    const said = sentence;
    if (proposal !== null) return;
    if (said.trim() === '') {
      live = null;
      return;
    }
    const wait = setTimeout(() => {
      live = propose(said, { zone, locale, currency: deviceCurrency, catalogue: heardOf(cat), offer: offerOf(cat) });
    }, 140);
    return () => clearTimeout(wait);
  });

  /* ── the proposal ───────────────────────────────────────────────────────── */

  let proposal = $state<Proposal | null>(null);
  /** The use case chosen, which starts as the one proposed. */
  let chosen = $state<string | null>(null);
  /** The modules the person left on, beside the ones something chosen needs. */
  let kept = $state<string[]>([]);
  let currency = $state<string | null>(null);

  /**
   * WHAT THE PERSON DECIDED BY HAND OUTLIVES A NEW READING. Telling it more reads the whole of what was said again, and
   * a part they turned on or off, or a use case they picked, stays as they left it rather than snapping back.
   */
  let onByHand = $state.raw<Set<string>>(new Set());
  let offByHand = $state.raw<Set<string>>(new Set());
  let caseByHand = $state(false);

  /** One turn of the conversation: what was said, when, and what it added to what was heard before (none for the first). */
  type Turn = { said: string; at: number; adds: Said[] | null };
  let turns = $state.raw<Turn[]>([]);

  /** Take a reading, keeping what the person decided by hand. */
  function take(p: Proposal) {
    const handCurrency = currency !== null && currency !== (proposal?.currency ?? null);
    proposal = p;
    owed = undefined;
    if (!caseByHand) chosen = p.usecase;
    kept = [...new Set([...p.modules.filter((id) => !offByHand.has(id)), ...onByHand])];
    /* A CURRENCY TYPED IS THE ANSWER; one chosen by hand stands until a later turn types one. */
    currency = p.currency ?? (handCurrency ? currency : null);
    failed = null;
    draft = null;
    drafting = false;
    drafts += 1;
    /* A FILE ALONE, WITH NOTHING SAID, IS NOT A BUSINESS TO DRAFT FOR: its own list is what it makes. */
    const brief = draftBrief(p, sentence).trim();
    if (model && outsideCatalogue(p) && brief !== '') void draftFor(brief);
  }

  /**
   * WHETHER SLASH IS READING WHAT WAS SAID. The rules' reading stays beside the field meanwhile, and each press is
   * numbered, so an answer that lands after the words were edited again is not drawn under them.
   */
  let thinking = $state(false);
  let readings = 0;

  /** The model's reading, or the rules' where there is no model, for the words as they stand. */
  const readingOf = (said: string): Promise<Proposal> => proposeFirst(said, { zone, locale, currency: deviceCurrency, catalogue: heardOf(cat), offer: offerOf(cat) }, door?.setup ?? null);

  async function read() {
    if (thinking) return;
    /* NOTHING SAID YET: the press puts the caret where the answer goes, rather than the button sitting greyed out. */
    if (sentence.trim() === '' && brought.length === 0) {
      field?.focus();
      return;
    }
    const mine = ++readings;
    thinking = true;
    const said = sentence.trim();
    const p = await readingOf(sentence);
    if (mine !== readings) return;
    thinking = false;
    /* A FILE ALONE IS AN ANSWER TOO, and its name stands where the words would. */
    turns = [{ said: said === '' ? source : said, at: Date.now(), adds: null }];
    take(p);
    void tick().then(() => heardHeading?.focus());
  }

  /* ── telling it more ────────────────────────────────────────────────────── */

  let extra = $state('');

  /**
   * A LATER TURN IS READ WITH EVERYTHING BEFORE IT, as one sentence, and BrainDog's answer to it is what it added. Focus
   * stays in the field, so a person can keep talking.
   */
  async function more() {
    const t = extra.trim();
    if (t === '' || proposal === null || busy || thinking) return;
    const was = proposal.heard;
    const joined = joinTurns(sentence, t);
    const mine = ++readings;
    thinking = true;
    const p = await readingOf(joined);
    if (mine !== readings) return;
    thinking = false;
    sentence = joined;
    turns = [...turns, { said: t, at: Date.now(), adds: added(was, p.heard) }];
    extra = '';
    take(p);
  }

  function moreKey(e: KeyboardEvent) {
    /* CTRL ENTER FINISHES FROM HERE TOO, and is not also a turn. */
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void make();
    }
  }

  /* ── what Slash drafts for a business outside the catalogue ─────────────── */

  /** Whether this host has a model behind Slash, the same fact the page sheet stands on (`ChangePage.svelte`). */
  const model = $derived(page.data.slash === true);
  /** The first run's two asks of Slash (`ask.ts`), `null` where no model is behind it and the rules read everything. */
  const door = $derived(model && typeof location !== 'undefined' ? slashAsks(apiBase()) : null);
  /** What Slash drafted for the sentence, `null` when it drafted nothing or was not asked. */
  let draft = $state.raw<Drafted | null>(null);
  let drafting = $state(false);
  /* EACH DRAFT IS NUMBERED, so an answer that arrives after the sentence changed is not drawn under the new words. */
  let drafts = 0;

  /**
   * ASK SLASH FOR LISTS AND PAGES MADE FOR THIS BUSINESS (`slashDraft`), which drafts, repairs and draws them and files
   * nothing. An answer from its own rules, which cannot read a sentence, or one with no draft that drew clean, leaves the
   * proposal as the lexicon made it: its modules, or the use cases to choose from.
   */
  async function draftFor(said: string) {
    const mine = drafts;
    drafting = true;
    try {
      const out = await draftChange(createClient({ base: apiBase() }) as unknown as SlashClient, said);
      if (mine !== drafts) return;
      draft = out.ok && !byRules(out.drafted) ? (out.drafted.drafts[0] ?? null) : null;
    } catch {
      if (mine === drafts) draft = null;
    } finally {
      if (mine === drafts) drafting = false;
    }
  }

  /* THE SENTENCE AGAIN, AS A FIELD. The preview goes with it, so nothing on screen describes words that changed. */
  function edit() {
    /* AN ANSWER STILL ON ITS WAY IS FOR THE WORDS BEING EDITED, so it is let go. */
    readings += 1;
    thinking = false;
    /* WHAT WAS READ STANDS BESIDE THE FIELD until the words are read again as they are typed. */
    live = proposal;
    proposal = null;
    owed = undefined;
    failed = null;
    draft = null;
    drafting = false;
    drafts += 1;
    void tick().then(() => {
      field?.focus();
      field?.setSelectionRange(sentence.length, sentence.length);
    });
  }

  const u = $derived(caseOf(chosen));
  /* THE USE CASES BESIDE IT belong to the proposal they were heard with, so choosing another use case leaves them out. */
  const also = $derived(proposal && chosen === proposal.usecase ? proposal.also.flatMap((id) => caseOf(id) ?? []) : []);
  const cases = $derived(u ? [u, ...also] : []);

  /** Whether the person opened the other use cases beside the one chosen. */
  let picking = $state(false);

  /** Choose a use case from the conversation, or put the one chosen down. */
  function pickCase(id: string) {
    caseByHand = true;
    chosen = chosen === id ? null : id;
  }

  /**
   * WHY A MODULE CANNOT BE TURNED OFF, or `null` when it can: a use case chosen stands on it, or a module kept leans on
   * it (`LEANS_ON`: Money points at the person an invoice is to), so the record would refuse the one without the other.
   */
  function heldBy(id: string): string | null {
    for (const b of brought) if (b.mapping?.module === id) return b.file.file;
    for (const c of cases) if (c.modules.includes(id)) return c.title;
    for (const m of kept) if (m !== id && (LEANS_ON[m] ?? []).includes(id)) return moduleName(m);
    return null;
  }

  /**
   * EVERY PACK THE PERSON CAN TURN ON HERE: the modules this build ships, in install order, then any other catalogue pack
   * the sentence was heard asking for or a use case chosen stands on, in the order they came.
   */
  const offered = $derived<string[]>([
    ...new Set([...INSTALL_ORDER, ...(proposal?.modules ?? []), ...kept, ...cases.flatMap((c) => c.modules)]),
  ]);

  /** What is installed: every pack kept, and every one something kept or chosen needs, in install order. */
  const modules = $derived<string[]>(offered.filter((id) => kept.includes(id) || heldBy(id) !== null));

  function flip(id: string) {
    if (heldBy(id) !== null) return;
    const on = !kept.includes(id);
    kept = on ? [...kept, id] : kept.filter((m) => m !== id);
    const drop = (s: Set<string>) => new Set([...s].filter((x) => x !== id));
    onByHand = on ? new Set([...drop(onByHand), id]) : drop(onByHand);
    offByHand = on ? drop(offByHand) : new Set([...drop(offByHand), id]);
    /* THE SWITCH MOVES BETWEEN A TILE AND A ROW, so focus goes with it rather than to the top of the page. */
    void tick().then(() => document.querySelector<HTMLElement>(`[data-keep="${id}"]`)?.focus());
  }

  /* THE CURRENCY IS ASKED ONLY WHEN MONEY IS KEPT AND THE SENTENCE TYPED NONE; the module that keeps it says so. */
  const money = $derived(modules.find(keepsCurrency) ?? null);
  const asksCurrency = $derived(money !== null && proposal !== null && proposal.currency === null);
  const ring = $derived(proposal !== null && reminds(cases, modules));
  const pages = $derived(pagesOf(cases, modules));

  /* ── the files they pointed at ─────────────────────────────────────────── */

  /**
   * ONE TILE FOR EACH FILE BROUGHT: one plain file is one, and a zip is one for each table inside it, eight at most
   * (`readExports`). Each holds the export read, how it maps (`null` while it is being read), and its own handle, so a
   * tile left out does not move the others' state.
   */
  type Brought = { key: number; file: Export; mapping: Mapping | null };
  let brought = $state.raw<Brought[]>([]);
  /** What the file held and left out, said once under the tiles ("14 pages of notes were left out"), or `null`. */
  let leftLine = $state<string | null>(null);
  /** Why a file could not be read, said under the field. */
  let fileWhy = $state<string | null>(null);
  let picker = $state<HTMLInputElement | undefined>(undefined);
  let dragging = $state(false);
  /* EACH FILE IS NUMBERED, so a mapping that lands after another file was brought in is not drawn over it. */
  let files = 0;
  /** The handle each tile is keyed by, never given twice on this page. */
  let tileKeys = 0;
  /** The name of the file as it was picked, which stands where the words would when nothing was said. */
  let source = '';

  /**
   * READ ON THIS DEVICE, THEN MAPPED: the model sees each table's first entries, one ask for each in the order the tiles
   * stand, and the rules map them where there is no model. The module that keeps the list a table goes into is turned on,
   * and stays on while that tile is in (`heldBy`).
   */
  async function bring(f: File | undefined) {
    if (!f || busy) return;
    fileWhy = null;
    if (!/\.zip$/iu.test(f.name) && f.size > BYTES_MOST) {
      fileWhy = firstRun.exportTooBig;
      return;
    }
    const bytes = new Uint8Array(await f.arrayBuffer().catch(() => new ArrayBuffer(0)));
    const got = await readExports(f.name, bytes);
    if ('why' in got) {
      /* THE PLAIN FILE'S TWO WHYS ARE SAID AS THEY ALWAYS WERE; a zip's is a sentence of its own, drawn as it is. */
      fileWhy = got.why === 'notJson' ? firstRun.exportNotJson : got.why === 'noEntries' ? firstRun.exportNoEntries : got.why;
      return;
    }
    const mine = ++files;
    source = f.name;
    const read = got.exports.slice(0, EXPORTS_MOST).map((file): Brought => ({ key: ++tileKeys, file, mapping: null }));
    brought = read;
    leftLine = leftSaid(got.left);
    for (const b of read) {
      /* A TILE LEFT OUT BEFORE ITS TURN IS NOT ASKED ABOUT. */
      if (!brought.some((x) => x.key === b.key)) continue;
      const m = await mapExport(b.file, door?.mapping ?? null, locale);
      if (mine !== files) return;
      if (!brought.some((x) => x.key === b.key)) continue;
      brought = brought.map((x) => (x.key === b.key ? { ...x, mapping: m } : x));
      if (m.module !== null) {
        onByHand = new Set([...onByHand, m.module]);
        offByHand = new Set([...offByHand].filter((x) => x !== m.module));
        if (proposal !== null && !kept.includes(m.module)) kept = [...kept, m.module];
      }
    }
  }

  /** Take one file off the build. Its module stays as the person left it; the last one out takes the left-out line too. */
  function leaveFile(key: number) {
    brought = brought.filter((b) => b.key !== key);
    if (brought.length > 0) return;
    files += 1;
    leftLine = null;
    fileWhy = null;
  }

  function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    void bring(input.files?.[0]);
    input.value = '';
  }

  /* A FILE DRAGGED ONTO THE SCREEN is taken anywhere on it; only a drag that carries files says "Drop it here". */
  const carriesFiles = (e: DragEvent): boolean => [...(e.dataTransfer?.types ?? [])].includes('Files');
  /* EVERY FILE DRAG IS HELD, busy or not: one let through is the browser opening the file in place of the first run. */
  function dragover(e: DragEvent) {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    dragging = !busy;
  }
  function drop(e: DragEvent) {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    dragging = false;
    if (!busy) void bring(e.dataTransfer?.files[0]);
  }

  /**
   * EACH TILE AS IT IS DRAWN: a list of the file's own while it maps to none this build ships, named so no tile before
   * it took the name; its entries as their list stores them, in the currency as it stands; each column that fills a
   * field of a list this build ships, with that field's name; and what it becomes, in the one line the conversation
   * says it in.
   */
  const tiled = $derived.by(() => {
    const taken = allLists().map((l) => l.id);
    return brought.map((b) => {
      const { file, mapping } = b;
      const own = mapping && mapping.list === null ? ownList(file, mapping.name, currency, locale, taken) : null;
      if (own) taken.push(own.id);
      const entries = mapping ? entriesOf(file, mapping, currency, locale, own ?? undefined) : null;
      const pairs =
        mapping && mapping.list !== null
          ? mapping.fields.map((m) => ({ column: m.column, label: listById(mapping.list ?? '')?.fields.find((f) => f.id === m.field)?.label ?? m.field }))
          : [];
      const said =
        mapping === null
          ? firstRun.exportReading
          : (mapping.summary ?? (mapping.list === null ? firstRun.exportOwn(mapping.name) : firstRun.exportInto(entries?.fields.length ?? 0, mapping.name)));
      return { ...b, own, entries, pairs, said };
    });
  });
  /** The rail with each file's own page on it. */
  const rail = $derived([...pages, ...tiled.flatMap((t) => (t.own ? [{ section: t.own.name, pages: [t.own.name] }] : []))]);

  /* THE DRAFT STANDS ONLY WHILE NO USE CASE IS CHOSEN: choosing one from the chips is choosing its pages instead. */
  const using = $derived(chosen === null ? draft : null);
  const today = dayOf(Date.now());
  /**
   * WHAT THE RECORD IS ASKED TO DRAW: the draft as Slash drew it, over its sample rows, beside the modules kept; or every
   * page of the use cases and modules, over the person's own entries and file rows. Every one is a rehearsal that keeps
   * nothing.
   *
   * ASKED AGAIN ONLY WHEN IT CHANGES: a turn that adds a client to People asks for the same pages, and the record is not
   * asked to draw them twice.
   */
  const plain = $derived(using ? [draftAsked(using), ...changesAsked([], modules, today)] : changesAsked(cases, modules, today));
  const asks = $derived(
    tiled.reduce(
      (drawn, t) => (t.mapping && t.entries ? drawnWith(drawn, t.entries.register, t.entries.fields, t.own ? { declarations: newListDeclarations(t.own, t.mapping.summary) } : null) : drawn),
      plain as Record<string, unknown>[],
    ),
  );
  let drawAsked = $state.raw<Record<string, unknown>[]>([]);
  let drawKey = '';
  $effect(() => {
    const key = JSON.stringify(asks);
    if (key === drawKey) return;
    drawKey = key;
    drawAsked = asks as Record<string, unknown>[];
  });

  /* ── the one question ──────────────────────────────────────────────────── */

  /* THE DEVICE'S FACTS ARE READ ONCE: every currency and the zones of each region, which is a few dozen milliseconds. */
  let device: CurrencyEnv | null = null;
  const deviceOf = (): CurrencyEnv =>
    (device ??= browserCurrencyEnv(locale, typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? [])], zone));
  const ask = $derived(asksCurrency ? currencyChoices(sentence, deviceOf()) : null);

  /**
   * NOTHING PLACED: no use case, nothing Slash drafted or is drafting, and no part on. The question then is which use
   * case is closest, numbered, and turning parts on by hand is the other way on.
   */
  const closest = $derived(proposal !== null && u === null && using === null && !drafting && modules.length === 0);
  /** The open question's short form, for the sentence under the title, or `null` when nothing waits. */
  const waitingOn = $derived(
    asksCurrency && currency === null ? (ask && ask.said.length > 0 ? words.whichOf(ask.said) : words.whichCurrency) : closest ? words.whatClosest : null,
  );

  /* ── the parts ─────────────────────────────────────────────────────────── */

  /**
   * WHAT THE RIGHT-HAND SIDE DRAWS: while typing, the live reading, with no switches; once read, the proposal as the
   * person has left it. A use case is a part too, since it carries lists and pages of its own.
   */
  const reading = $derived(proposal ?? live);
  const caseParts = $derived.by<PartOf[]>(() => {
    if (proposal !== null) return cases.map((c) => casePart(c, proposal?.heard ?? [], caseByHand));
    if (live === null) return [];
    return [live.usecase, ...live.also].flatMap((id) => caseOf(id) ?? []).map((c) => casePart(c, live?.heard ?? [], false));
  });
  const moduleParts = $derived.by<PartOf[]>(() => {
    if (proposal !== null)
      return partsOf({ offered, modules, heard: proposal.heard, rows: proposal.rows, names: proposal.names, heldBy, byHand: onByHand, waiting: asksCurrency && currency === null ? money : null });
    const liveOffered = [...new Set([...INSTALL_ORDER, ...(live?.modules ?? [])])];
    return partsOf({ offered: liveOffered, modules: live?.modules ?? [], heard: live?.heard ?? [], rows: live?.rows ?? [], heldBy: () => null, byHand: new Set(), waiting: null });
  });
  const allParts = $derived([...caseParts, ...moduleParts]);
  const steps = $derived(stepsOf(allParts));
  /** Whether anything is on at all: a yes or a no, never how many. */
  const anyOn = $derived(steps.length > 0);
  const status = $derived(proposal ? statusOf(waitingOn, !anyOn) : null);

  /**
   * WHAT THE LAST THING SAID ADDED TAKES THE ARRIVAL TINT for a second and a half: a part that came on
   * and an entry that came in, while typing and after each turn alike. The first drawing is not an arrival.
   */
  let fresh = $state.raw<Set<string>>(new Set());
  let seen: Set<string> | null = null;
  let fading: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const now = new Set([...allParts.filter((p) => p.on).map((p) => `part:${p.id}`), ...allParts.flatMap((p) => p.entries.map((e) => e.key))]);
    const was = seen;
    seen = now;
    if (was === null || reading === null) return;
    const came = [...now].filter((k) => !was.has(k));
    if (came.length === 0) return;
    fresh = new Set([...fresh, ...came]);
    clearTimeout(fading);
    fading = setTimeout(() => (fresh = new Set()), 1500);
  });
  $effect(() => () => clearTimeout(fading));

  /* ── the accept ─────────────────────────────────────────────────────────── */

  let busy = $state(false);
  /**
   * THE RECORD BEING MADE, WATCHED (`Making.svelte`): the parts that were on when the press landed, what the record holds
   * of them, read every 400 ms while `setup` runs, and the call's own answer once it is back. `null` before a press, and
   * again once the person goes back from a press that left something not made.
   */
  let watched = $state.raw<{ parts: MakingPart[]; held: readonly Held[]; answer: readonly Refused[] | null } | null>(null);
  /** Whether a press has come back already, so the next one asks the record only for what is missing. */
  let pressed = false;
  /**
   * THE HANDLE OF A PRESS THAT NEVER CAME BACK, and the entries it carried. Pressed again with the same entries, it is
   * sent under the same handle and with `again`, so a call that went in and lost its answer writes nothing twice. A
   * press that answers clears it, and other entries are another press.
   */
  let unanswered: { key: string; rows: string } | null = null;
  /**
   * THE USE CASE'S PLAN STILL TO MAKE, as the last answered press handed it back (`Accepted.plan`), sent with the next
   * press in place of the plan formed whole from the sentence: an answered press is followed by one under a new key,
   * and the record passes over only a key it holds, so the whole plan would be written a second time. `undefined`
   * until a press has answered with one, and again once the reading it belonged to is replaced.
   */
  let owed: readonly SetupRow[] | undefined;
  /** What could not be made, `null` until a press has come back with something refused. */
  let failed = $state<NotMade[] | null>(null);
  const nothing = $derived(u === null && modules.length === 0 && using === null && !brought.some((b) => b.mapping !== null));
  /* A FILE STILL BEING READ HOLDS THE PRESS, so no tile on screen is left out of what it writes. */
  const ready = $derived(proposal !== null && !busy && !nothing && !(asksCurrency && currency === null) && !brought.some((b) => b.mapping === null));

  async function make() {
    if (!proposal || !ready) return;
    /* WHAT THE PRESS MAKES IS WHAT WAS ON SCREEN WHEN IT LANDED, read once here, before the first call goes out. */
    const asked = {
      sentence,
      proposal,
      usecase: u?.usecase ?? null,
      also: also.map((a) => a.usecase),
      modules,
      currency: money === null ? null : currency,
      today: dayOf(Date.now()),
      nav: pref.read().nav ?? [],
      drafted: using,
      imported: brought.flatMap((b) => (b.mapping ? [{ file: b.file, mapping: b.mapping }] : [])),
      locale,
    };
    busy = true;
    failed = null;
    /* THE SAME TILES THE BUILD WAS DRAWN IN, now each saying where it is. Read from the record, never timed. */
    const tiles = steps.map((p): MakingPart => ({ id: p.id, name: p.name, icon: p.icon, why: p.why }));
    watched = { parts: tiles, held: [], answer: null };
    const client = createClient({ base: apiBase() });
    const stop = watchHeld(
      async () => {
        const read = await client.packs();
        return read.ok ? (read.value as readonly Held[]) : null;
      },
      (held) => {
        if (watched && watched.answer === null) watched = { ...watched, held };
      },
    );
    try {
      const signed = await methods();
      const rows = JSON.stringify(asked.proposal.rows);
      const resent = unanswered !== null && unanswered.rows === rows;
      if (!resent) unanswered = { key: pressKey(), rows };
      const out = await accept(client, { ...asked, key: unanswered!.key, again: alreadyMade || pressed || resent, email: signed.ok ? (signed.value.me?.email ?? null) : null, ...(owed === undefined ? {} : { plan: owed }) });
      if (!out.unheard) unanswered = null;
      if (!out.unheard && out.plan !== undefined) owed = out.plan;
      stop();
      pressed = true;
      /* WHAT THE RECORD REFUSED STAYS ON ITS TILE, in the record's own sentence, until the person goes back. A press
         that failed some other way (a draft, a file, the whole call) has no tile to say it on, so it is said in the
         conversation as it always was. */
      const refused = out.refused ?? [];
      watched = refused.length > 0 ? { parts: tiles, held: watched?.held ?? [], answer: refused } : null;
      if (out.nav) pref.write({ nav: out.nav });
      /* THE SHELL READS THE RECORD AGAIN, so the rail shows the new pages and speaks in the new voice. */
      (await import('$lib/record/boot-live.ts')).forget();
      if (out.failed.length === 0) {
        madeModules = asked.modules;
        madePlaces = railPlaces(asked.proposal.places, filledBy(asked.proposal.rows)).filter((x) => x.kind !== 'today').map((x) => x.name);
        madeAddons = tradeAddons(sentence, cat).map((u) => ({ id: u.id, title: u.title, summary: u.summary }));
        madeSaid = sentence.trim() === '' ? null : saidMade(sentence, asked.proposal.rows);
        made = true;
        globalThis.scrollTo?.({ top: 0 });
        return;
      }
      /* WHAT WENT IN STAYS IN, AND IS NOT ASKED FOR AGAIN: the proposal keeps only the entries not written, so pressing
         "Make it mine" after a refusal writes only the ones that were not made. */
      if (out.left.length < asked.proposal.rows.length && proposal === asked.proposal) proposal = { ...asked.proposal, rows: out.left };
      /* A DRAFT ON DECIDE IS NOT FILED TWICE: kept, or waiting there, the next press leaves it where it is. */
      if (out.filed && draft === asked.drafted) draft = null;
      failed = out.failed;
    } catch (e) {
      watched = null;
      throw e;
    } finally {
      stop();
      busy = false;
    }
  }

  /* ── the keys ───────────────────────────────────────────────────────────── */

  /**
   * CTRL ENTER FINISHES, AND 1 TO 9 ANSWER THE QUESTION, from anywhere on the page once there is something to finish. A
   * digit is a character a person may be typing, so it answers only when no field has focus and character keys are on;
   * nothing answers through a page opened over this one.
   */
  function onkeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || covered() || proposal === null) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      void make();
      return;
    }
    if (typing() || mod || e.altKey || silenced(e) || busy) return;
    if (!/^[1-9]$/u.test(e.key)) return;
    const n = Number(e.key) - 1;
    if (ask) {
      const c = ask.choices[n];
      if (!c) return;
      e.preventDefault();
      currency = c.code;
    } else if (closest) {
      const one = USE_CASES[n];
      if (!one) return;
      e.preventDefault();
      pickCase(one.usecase);
    }
  }

  /* THIS SCREEN DRAWS FROM WHAT IS TYPED, with no read to wait on, so it is ready as soon as it is drawn. */
  $effect(() => drew('ready'));

  /* THE PHRASES MISSING A FACT, said by BrainDog only where Money is kept to hold the entry they began. */
  const missing = $derived(proposal !== null && money !== null ? missingIn(sentence, today) : []);
  /** How many answers the number keys reach, printed beside the conversation's heading: at most three caps. */
  const answers = $derived(Math.min(3, ask ? ask.choices.length : closest ? USE_CASES.length : 0));
  const onParts = $derived(allParts.filter((p) => p.on));
  const offParts = $derived(moduleParts.filter((p) => !p.on));
</script>

<svelte:head><title>{titleOf('Start')}</title></svelte:head>
<svelte:window {onkeydown} ondragover={dragover} ondrop={drop} ondragleave={(e) => (e.relatedTarget === null ? (dragging = false) : undefined)} />

{#snippet you(at: number)}
  <div class="who"><span class="who-name">{proposal?.name ?? words.you}</span><time class="who-time num" datetime={new Date(at).toISOString()}>{timeOf(at)}</time></div>
{/snippet}

{#snippet dog(at: number)}
  <div class="who"><span class="who-name">{words.dog}</span><time class="who-time num" datetime={new Date(at).toISOString()}>{timeOf(at)}</time></div>
{/snippet}

{#snippet bringer()}
  <!-- ONE QUIET CONTROL, AND ITS HINT ONLY ON HOVER OR FOCUS: the screen asks one question, and a file is the other way
       to answer it. The input is the browser's own picker; a drop anywhere on the screen does the same. -->
  {#if brought.length === 0}
    <span class="bring">
      <input class="bring-input" type="file" accept=".csv,.tsv,.json,.txt,.zip,text/csv,text/tab-separated-values,application/json,text/plain,application/zip" tabindex="-1" aria-hidden="true" bind:this={picker} onchange={pick} />
      <Button weight="bare" size="sm" disabled={busy} aria-describedby="bring-hint" onclick={() => picker?.click()}>{firstRun.exportPoint}</Button>
      <span class="bring-hint" id="bring-hint">{firstRun.exportHint}</span>
    </span>
  {/if}
{/snippet}

{#snippet keys()}
  {#if proposal}
    <span class="keys" aria-hidden="true">
      {#if answers > 0}{#each { length: answers } as _, n (n)}<Kbd keys={String(n + 1)} />{/each}<span class="keys-word">{words.answerKeys}</span>{/if}
      <Kbd keys="⌘↵" /><span class="keys-word">{words.finishKeys}</span>
    </span>
  {/if}
{/snippet}

<!-- THE WHOLE WINDOW (`Frame.svelte`): the conversation on the ground at the left, the build in tiles at the right. -->
<Frame>
  <div class="frame" data-making={proposal !== null ? '' : undefined}>
    {#if noRecord}
      <div class="alone">
        <NoRecord title={copy.noRecordTitle} why={firstRun.noRecordWhy} describe />
      </div>
    {:else if colleague}
      <section class="again alone" aria-labelledby="again-h">
        <p class="again-h" id="again-h">{copy.startNotYours}</p>
        <p class="again-why">{copy.startNotYoursWhy}</p>
        <div class="actions">
          {#if notTheirs?.kind === 'list'}
            <Button weight="primary" href={notTheirs.href}>{copy.openList(notTheirs.name)}</Button>
          {:else if notTheirs}
            {#each notTheirs.lists as l (l.href)}<Button href={l.href}>{copy.openList(l.name)}</Button>{/each}
          {/if}
        </div>
      </section>
    {:else if made}
      <Made modules={madeModules} places={madePlaces} addons={madeAddons} said={madeSaid} />
    {:else if watched}
      <!-- AFTER THE PRESS: the record being made, tile by tile. Today opens when the call answers; where the record
           refused a part, its tile says why and the way back is one button. -->
      <div class="watched">
        <Making parts={watched.parts} states={makingStates(watched.parts, watched.held, watched.answer)} />
        {#if watched.answer}
          <div class="actions">
            <Button weight="primary" onclick={() => (watched = null)}>{making.back}</Button>
          </div>
        {/if}
      </div>
    {:else if page.url.searchParams.get('agent') === '1'}
      <!-- SET UP FROM HIS OWN AGENT: the agent proposes, the page draws it, and Make it mine is pressed here. Its own chunk. -->
      {#await import('./FromAgent.svelte') then { default: FromAgent }}<FromAgent />{/await}
    {:else}
      {#if alreadyMade}
        <section class="again made-note" data-surface="tile" aria-labelledby="again-h">
          <IconWell name="home" size="l" />
          <div class="again-main">
            <p class="again-h" id="again-h">{firstRun.againMade}</p>
            <p class="again-why">{firstRun.againMore}</p>
          </div>
          <Button href="/">{firstRun.againBack}</Button>
        </section>
      {/if}

      <!-- THE TITLE ROW: the question, and once it is read, the sentence that says where the build stands. -->
      <header class="title">
        <h1 class="entry-title" id="who-h">{firstRun.whoQuestion}</h1>
        {#if status}
          <p class="sentence">{status.before}{#if status.needs}<span class="needs" data-needs>{status.needs}</span>{/if}{status.after}</p>
        {/if}
      </header>

      <div class="board">
        <!-- ── THE CONVERSATION ──────────────────────────────────────────── -->
        <!-- IN A TILE, AS ON /signup (first F5): its field sits on white, never on the bare ground. -->
        <section class="talk" aria-label={words.talk} data-dragging={dragging ? '' : undefined}>
          {#if dragging}<p class="drop" aria-hidden="true">{firstRun.exportDrop}</p>{/if}
          {#if proposal === null}
            <form
              class="prompt"
              onsubmit={(e) => {
                e.preventDefault();
                read();
              }}
            >
              <textarea
                class="prompt-field"
                rows="3"
                autocomplete="off"
                aria-labelledby="who-h"
                placeholder={firstRun.whoPlaceholder}
                bind:this={field}
                bind:value={sentence}
                onkeydown={enter}
              ></textarea>
              <!-- THE OTHER WAY IN AT THE START OF THE ROW, AND THE PRIMARY AT ITS END, under the field's own edge, where
                   the eye is when the sentence is done. What it hears as it is typed is drawn beside, in the build. -->
              <div class="actions go">
                {@render bringer()}
                <!-- THE CAP ONLY WHILE THE KEY WORKS: a cap on a press that only moves the caret would promise more. -->
                <Button weight="primary" type="submit" kbd={sentence.trim() === '' || thinking ? undefined : '↵'} disabled={thinking} aria-busy={thinking}
                  >{thinking ? firstRun.whoReading : firstRun.whoGo}</Button
                >
              </div>
              {#if fileWhy}<p class="nudge" role="status">{fileWhy}</p>{/if}
            </form>
          {:else}
            <ol class="log">
              {#each turns as t, i (i)}
                <li class="turn">
                  <Face name={proposal.name ?? words.you} you size="l" />
                  <div class="turn-main">
                    {@render you(t.at)}
                    <!-- THE WORDS, MARKED WITH WHAT EACH PHRASE BECAME, and pressing them opens the whole of what was
                         said for editing. -->
                    <button type="button" class="said-line" disabled={busy} onclick={edit}>
                      <span class="said-text">
                        {#each marksIn(t.said, proposal.heard, i === 0 ? proposal.name : null) as r, j (j)}
                          {#if r.became}<mark class="said-mark" title={r.became}>{r.text}</mark>{:else}{r.text}{/if}
                        {/each}
                      </span>
                      <span class="said-edit">{firstRun.whoEdit}</span>
                    </button>
                  </div>
                </li>

                {#if i === 0}
                  <li class="turn">
                    <Face name={words.dog} kind="system" size="l" />
                    <div class="turn-main">
                      {@render dog(t.at)}
                      <section class="reply" aria-labelledby="heard-h">
                        <h3 class="reply-h" id="heard-h" tabindex="-1" bind:this={heardHeading}>{firstRun.heardTitle}</h3>
                        {#if proposal.name}<p class="heard-name">{firstRun.heardName(proposal.name)}</p>{/if}
                        {#if proposal.heard.some((h) => h.you !== true)}
                          <ul class="heard">
                            {#each proposal.heard.filter((h) => h.you !== true) as h, k (k)}
                              <li class="heard-one">
                                <IconWell name={iconOfBecame(h.became, proposal.names)} size="l" />
                                <span class="heard-main">
                                  <q class="phrase">{h.phrase}</q>
                                  <span class="became"><span class="sr">: </span>{becameShown(h, proposal)}</span>
                                </span>
                              </li>
                            {/each}
                          </ul>
                        {:else if tiled.length > 0}
                          {#each tiled as t (t.key)}<p class="quiet">{t.said}</p>{/each}
                        {:else}
                          <p class="quiet">{firstRun.heardNone}</p>
                          {#if proposal.name && modules.includes(PEOPLE)}<p class="quiet">{firstRun.heardNote}</p>{/if}
                        {/if}
                        {#if proposal.name && !modules.includes(PEOPLE)}<p class="quiet">{firstRun.nameNotKept}</p>{/if}
                        {#if proposal.fell === 'SLASH_BUDGET_SPENT'}<p class="quiet">{firstRun.readByRules}</p>{:else if proposal.by === undefined || proposal.by === 'rules'}<p class="quiet">{firstRun.readByRulesAny}</p>{/if}
                        {#each missing as m (m.title)}
                          <p class="nudge">{words.missing(m.title, m.missing)}</p>
                        {/each}
                      </section>

                      <section class="reply" aria-labelledby="mine-h">
                        <h3 class="reply-h" id="mine-h">{firstRun.mineTitle}</h3>
                        {#if u}
                          <p class="mine-title">
                            <span>{u.title}{#if also.length > 0}<span class="quiet">, {firstRun.and(also.map((a) => a.title))}</span>{/if}</span>
                            {#if !picking && !closest}<button type="button" class="change" disabled={busy} onclick={() => (picking = true)}>{words.changeCase}</button>{/if}
                          </p>
                          <p class="quiet">{proposal.summary ?? u.summary}</p>
                        {:else if using}
                          <p class="mine-title">{drawing.drafted}</p>
                          <p class="quiet">{using.question}</p>
                        {:else if drafting}
                          <p class="quiet drafting" role="status"><span class="live-dot" aria-hidden="true"></span>{drawing.drafting}</p>
                        {:else if proposal.summary}
                          <p class="quiet">{proposal.summary}</p>
                        {/if}
                        <!-- THE OTHER USE CASES ONLY WHEN ASKED FOR: one line says what it is, and Change opens the rest. -->
                        {#if !closest && (picking || u === null)}
                          <div class="chips" role="group" aria-label={firstRun.mineFor}>
                            {#each USE_CASES as one (one.usecase)}
                              <Button size="sm" aria-pressed={chosen === one.usecase} disabled={busy} onclick={() => pickCase(one.usecase)}>{one.title}</Button>
                            {/each}
                          </div>
                        {/if}
                      </section>
                    </div>
                  </li>
                {:else}
                  <li class="turn">
                    <Face name={words.dog} kind="system" size="l" />
                    <div class="turn-main">
                      {@render dog(t.at)}
                      <!-- THE NEWEST ANSWER IS SAID ALOUD; the older ones stay quiet. -->
                      <p class="reply-line" role={i === turns.length - 1 ? 'status' : undefined}>
                        {#if t.adds && t.adds.length > 0}{words.adds(t.adds.map((h) => firstRun.mineIn(`“${h.phrase}”`, h.became)))}{:else}{words.addsNothing}{/if}
                      </p>
                    </div>
                  </li>
                {/if}
              {/each}
            </ol>

            <!-- ── THE ONE QUESTION ─────────────────────────────────────── -->
            {#if asksCurrency || closest}
              <section class="ask" aria-labelledby={asksCurrency ? 'currency-q' : 'closest-q'} data-open={waitingOn ? '' : undefined}>
                <p class="ask-label"><IconWell name="ask" size="m" tone={waitingOn ? 'danger' : undefined} /><span class="ask-word">{words.oneQuestion}</span><span class="ask-meta">{words.cannotTell}</span></p>
                {#if asksCurrency}
                  <Currency bind:value={currency} {locale} choices={ask?.choices ?? []} suggested={ask?.suggested ?? null} find={ask?.find ?? null} />
                {:else}
                  <h3 class="ask-q" id="closest-q">{words.closest}</h3>
                  <p class="quiet">{words.closestWhy}</p>
                  <div class="chips" role="group" aria-label={firstRun.mineFor}>
                    {#each USE_CASES as one, n (one.usecase)}
                      <Button weight="quiet" kbd={n < 9 ? String(n + 1) : undefined} aria-pressed={chosen === one.usecase} disabled={busy} onclick={() => pickCase(one.usecase)}>{one.title}</Button>
                    {/each}
                  </div>
                {/if}
              </section>
            {/if}

            {#if ring}<Remind />{/if}

            <!-- ── TELL IT MORE ────────────────────────────────────────── -->
            <form
              class="more"
              onsubmit={(e) => {
                e.preventDefault();
                more();
              }}
            >
              <div class="field more-field">
                <input class="field-input" id="start-more" type="text" autocomplete="off" aria-label={words.more} placeholder={words.more} disabled={busy} bind:value={extra} onkeydown={moreKey} />
                <Button weight="quiet" size="sm" type="submit" kbd="↵" disabled={busy || thinking || extra.trim() === ''} aria-busy={thinking}>{thinking ? firstRun.whoReading : words.moreGo}</Button>
              </div>
              <div class="actions">{@render bringer()}</div>
              {#if fileWhy}<p class="nudge" role="status">{fileWhy}</p>{/if}
            </form>

            {#if failed}
              <section class="failed-part" aria-labelledby="failed-h" role="status">
                <h3 class="reply-h" id="failed-h">{firstRun.notAllMade}</h3>
                <ul class="failed">
                  {#each failed as f, i (i)}
                    <li>
                      {f.said}
                      {#if f.why !== ''}
                        <details class="why"><summary>{firstRun.whyDetails}</summary><p class="quiet">{f.why}</p></details>
                      {/if}
                    </li>
                  {/each}
                </ul>
                <div class="actions">
                  <Button href="/">{firstRun.openHome}</Button>
                </div>
              </section>
            {/if}
            {@render keys()}
          {/if}
        </section>

        <!-- ── THE BUILD ─────────────────────────────────────────────────── -->
        <div class="build">
          <Tile icon="home" title={waitingOn || !anyOn || proposal === null ? words.building : words.ready}>
            <!-- NO ROW OF INK SQUARES (first F6): they cut the parts' names short ("Photograp…"), and the sentence under the
                 reading says the same parts aloud, once, whole. -->
            <!-- THE READING ITSELF, BUILDING AS IT IS TYPED: each phrase heard and what it became, then "Reading" while the
                 model reads the whole. Not a live region while typing, or a screen reader would be told on every key; the
                 press says it all in the conversation. -->
            {#if thinking}
              <p class="reading drafting" role="status"><span class="live-dot" aria-hidden="true"></span>{words.readingNow}</p>
            {:else if proposal === null && live && live.heard.length > 0}
              <ul class="heard-live">
                {#each live.heard as h, i (i)}
                  <li class="heard-one">
                    <IconWell name={iconOfBecame(h.became, live?.names)} />
                    <span class="heard-main">
                      <q class="phrase">{h.phrase}</q>
                      <span class="became"><span class="sr">: </span>{becameShown(h, live)}</span>
                    </span>
                  </li>
                {/each}
              </ul>
            {:else if proposal === null && !anyOn}
              <p class="reading">{words.beforeTyping}</p>
            {/if}
            <!-- NOTHING SAVED IS SAID ONCE THERE IS SOMETHING TO SAVE, so the empty tile is one line. -->
            {#if anyOn}
              <p class="reading">
                {words.onReading(
                  steps.filter((p) => p.state !== 'waiting').map((p) => p.name),
                  steps.find((p) => p.state === 'waiting')?.name ?? null,
                )}
                {words.nothingSaved}
              </p>
            {/if}
            {#if proposal}
              <!-- WHY THE PRIMARY IS OFF sits above the bar, not in it, so the bar a phone keeps on screen stays one button tall. -->
              {#if nothing}<p class="quiet" id="make-why">{firstRun.makeSomething}</p>{/if}
              <!-- ONE PRIMARY, AND ON A PHONE IT RIDES THE BOTTOM EDGE, clear of the home indicator. -->
              <div class="make-bar">
                <Button weight="primary" kbd={ready ? '⌘↵' : undefined} disabled={!ready} aria-busy={busy} onclick={() => void make()} aria-describedby={nothing ? 'make-why' : undefined}>
                  {busy ? firstRun.makingIt : firstRun.makeIt}
                </Button>
              </div>
            {/if}
          </Tile>

          {#each tiled as t (t.key)}
            <FromFile
              file={t.file}
              mapping={t.mapping}
              line={t.said}
              pairs={t.pairs}
              going={t.entries?.fields.length ?? 0}
              held={t.entries?.skipped ?? 0}
              reading={t.mapping === null}
              {busy}
              onremove={() => leaveFile(t.key)}
            />
          {/each}
          <!-- WHAT THE FILE HELD AND NOTHING WRITES, said once under its tiles, never as a tile of its own. -->
          {#if tiled.length > 0 && leftLine}<p class="quiet">{leftLine}</p>{/if}

          {#if onParts.length > 0}
            <div class="parts" role="group" aria-label={firstRun.mineKeeps} data-live={proposal === null ? '' : undefined}>
              {#each onParts as p (p.id)}
                <Part part={p} live={proposal === null || p.id.startsWith('usecase-')} {busy} {locale} arrived={fresh.has(`part:${p.id}`)} {fresh} onflip={flip} />
              {/each}
            </div>
          {/if}

          {#if proposal && offParts.length > 0}
            <Tile class="section" data-surface="tile" title={words.alsoHere} count={offParts.length || undefined}>
              <div class="section-body">
                <div class="keeps">
                  {#each offParts as p (p.id)}
                    <Part part={p} {busy} {locale} onflip={flip} />
                  {/each}
                </div>
              </div>
            </Tile>
          {/if}

          {#if proposal}
            <!-- EVERY PAGE IT MAKES, one row a page, each opening as the record would draw it. -->
            <PagesPreview asked={drawAsked} {rail} typed={proposal.rows} name={proposal.name} />
          {/if}
        </div>
      </div>
    {/if}
  </div>
</Frame>

<style>
  /* THE FRAME: the title row, then the board, 20 apart. `min-inline-size: 0` everywhere a long word could otherwise
     widen a track past the screen and take the page sideways. */
  .frame {
    display: grid;
    align-content: start;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  /* A STATE THAT IS NOT THE BUILD (no record yet, a colleague's) is a column on the ground under the brand, no tile, at
     a reading measure and never floated in the middle of the window. */
  .alone {
    justify-self: start;
    inline-size: min(40rem, 100%);
  }

  /* THE RECORD BEING MADE takes the whole width of the frame, its tiles as many across as fit. */
  .watched {
    display: grid;
    align-content: start;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  /* ── the title row ─────────────────────────────────────────────────────── */

  .title {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* THE SENTENCE: 16/24 in the second ink, and the phrase that needs him in red. */
  .sentence {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 24px;
  }

  .needs {
    color: var(--red);
    font-weight: 500;
  }

  /* ── the board ─────────────────────────────────────────────────────────── */

  /* ONE COLUMN ON A PHONE; FROM 900PX THE CONVERSATION AND THE BUILD SIDE BY SIDE, 12 apart. */
  .board {
    display: grid;
    align-items: start;
    gap: var(--inset);
    min-inline-size: 0;
  }

  @media (width >= 900px) {
    .board {
      grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr);
    }
  }

  .build,
  .parts {
    display: grid;
    gap: var(--inset);
    min-inline-size: 0;
  }

  /* WHILE TYPING ON A PHONE the build tile alone says what lit up; the part tiles arrive once the sentence is read. */
  @media (width < 900px) {
    .parts[data-live] {
      display: none;
    }
  }

  /* A TILE THAT JUST CAME ON takes the arrival tint and fades back to the tile over a second and a half. */
  @media (prefers-reduced-motion: no-preference) {
    .build :global(.tile) {
      transition: background-color 1500ms var(--ease-out);
    }
  }

  .build :global(.tile[data-arrived]) {
    background: var(--arrived);
    transition: none;
  }

  /* ── the prompt ────────────────────────────────────────────────────────── */

  .prompt {
    display: grid;
    gap: var(--sp-3);
  }

  /* THE ONE FIELD, drawn at the size of a sentence rather than a form row, in the tile's well, and
     16px so a phone does not zoom it. Its focus is the a11y layer's 2px ink ring. */
  .prompt-field {
    inline-size: 100%;
    box-sizing: border-box;
    padding: var(--sp-3) var(--sp-4);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    line-height: 24px;
    resize: vertical;
    /* IT SCROLLS CLEAR OF THE PHONE'S KEYBOARD with the chips and the press under it still in view. */
    scroll-margin-block: var(--sp-6) var(--sp-9);
  }

  .prompt-field::placeholder {
    color: var(--ink-3);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* THE CHOICES ARE `Button`'S QUIET PILLS, as every other choice on the screen is; the chosen one on the selected fill. */
  .chips :global(.btn[aria-pressed='true']) {
    background: var(--red-tint);
    color: var(--ink);
    font-weight: 600;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* THE ROW UNDER THE FIELD: the other way in at its start, the primary at its end. */
  .actions.go {
    justify-content: space-between;
    padding-block-start: var(--sp-1);
  }

  .actions.go > :global(.btn[data-weight='primary']) {
    margin-inline-start: auto;
  }

  /* ── a file ────────────────────────────────────────────────────────────── */

  /* THE PICKER IS THE BROWSER'S, kept out of sight; the quiet button opens it. */
  /* THE BARE BUTTON'S WORDS ON THE COLUMN'S START EDGE, under the field's own edge (first F6). */
  .bring {
    position: relative;
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin-inline-start: calc(-1 * var(--sp-2));
  }

  .bring-input {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    opacity: 0;
    pointer-events: none;
  }

  /* THE HINT ONLY ON HOVER OR FOCUS (§35): the control is one quiet word until a person reaches for it. */
  /* UNDER THE BUTTON, OUT OF THE ROW (P49): taking room in the row, the hidden hint pushed "Show
     my BrainDog" onto a line of its own at 1512, and beside it, it ran under that button. It lies in the tile's foot,
     on the words' start edge. */
  .bring-hint {
    position: absolute;
    inset-block-start: calc(100% + 2px);
    inset-inline-start: var(--sp-2);
    max-inline-size: 60ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
    opacity: 0;
    transition: opacity 120ms var(--ease-out);
  }

  .bring:hover .bring-hint,
  .bring:focus-within .bring-hint {
    opacity: 1;
  }

  @media (pointer: coarse) {
    .bring-hint {
      display: none;
    }
  }

  /* A FILE HELD OVER THE SCREEN: the conversation says where it goes, in the ink, over a quiet wash. */
  .talk[data-dragging] {
    position: relative;
  }

  .drop {
    position: absolute;
    inset: 0;
    z-index: var(--z-raise);
    display: grid;
    place-items: center;
    margin: 0;
    border: 1px dashed var(--ink-2);
    border-radius: inherit;
    background: color-mix(in srgb, var(--tile) 92%, transparent);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    pointer-events: none;
  }

  /* ── the conversation ──────────────────────────────────────────────────── */

  /* IN A TILE (first F5): its fill and radius, 24 in and 20 on a phone, so the field and its words sit on white. */
  .talk {
    display: grid;
    gap: var(--sp-4);
    align-content: start;
    min-inline-size: 0;
    padding: var(--sp-5);
    background: var(--tile);
    border-radius: var(--r-tile);
  }

  @media (width < 640px) {
    .talk {
      padding: 20px;
    }
  }

  .talk > .keys {
    justify-self: end;
  }

  .log {
    display: grid;
    gap: var(--sp-5);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .turn {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--sp-3);
  }

  .turn-main {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .who {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    min-block-size: 20px;
  }

  .who-name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  /* TIMES IN A FEED ARE GEIST MONO. */
  .who-time {
    color: var(--ink-3);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
  }

  /* HIS WORDS IN THE TILE'S WELL, whole, with each phrase heard lifted onto the tile's own fill. The whole of it is one
     press away from editing. */
  .said-line {
    display: grid;
    gap: var(--sp-2);
    inline-size: 100%;
    min-block-size: var(--tap);
    padding: var(--sp-3) var(--sp-4);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    text-align: start;
    cursor: text;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .said-line:hover:not(:disabled) {
      background: var(--tile-2);
    }
  }

  .said-text {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  /* THE LIFT REACHES PAST THE WORD AND THE WORD DOES NOT MOVE: a padding and the same margin back, so a phrase before
     a comma keeps its comma against it. */
  .said-mark {
    margin-inline: -3px;
    padding: 1px 3px;
    background: var(--tile);
    border-radius: var(--r-xs);
    color: var(--ink);
    font-weight: 500;
    box-decoration-break: clone;
  }

  .said-edit {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .reply {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .reply + .reply {
    margin-block-start: var(--sp-3);
  }

  /* THE HEADING FOCUS LANDS ON AFTER A READ is a place, not a control: focus-ok: it is `tabindex="-1"`, reached only
     by the script that moves the reader to the answer, and it takes no press, so no ring is drawn round it. */
  .reply-h:focus {
    outline: none;
  }

  .reply-h {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 20px;
  }

  .reply-line {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .heard-name,
  .mine-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
  }

  .mine-title {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-1) var(--sp-3);
  }

  /* CHANGE IS A WORD IN THE LINK INK, not another pill: the line says what was chosen, and this opens the rest. Ink and
     underlined, never the red, which is kept for what is late or failing. */
  .change {
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-underline-offset: 3px;
    font: inherit;
    font-size: var(--fs-body);
    font-weight: 500;
    cursor: pointer;
  }

  .change:disabled {
    color: var(--ink-3);
    cursor: default;
  }

  /* WHAT IT FOUND, one phrase to a cell, two a row where there is room (the board's grid of found things). */
  .heard {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(13rem, 100%), 1fr));
    gap: var(--sp-2) var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .heard-one {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .heard-main {
    display: grid;
    min-inline-size: 0;
  }

  .phrase {
    overflow: hidden;
    color: var(--ink-2);
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* WHAT A PHRASE BECAME, in ink: a place is not an alarm, so never red (first F6). */
  .became {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
  }

  /* A SCREEN READER HEARS "BECAME" AS AN ARROW between the phrase and what it became; the eye reads the two lines. */
  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .nudge {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  /* A SENTENCE IN THE QUIET INK IS STILL A SENTENCE, read at the body size. */
  .quiet {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .drafting {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  /* SLASH AT WORK WEARS THE ONE HUE THAT MEANS ALIVE (`live`). Still, never pulsing. */
  .live-dot {
    inline-size: var(--dot);
    block-size: var(--dot);
    flex: none;
    border-radius: var(--r-ctl);
    background: var(--live);
  }

  /* ── the question ──────────────────────────────────────────────────────── */

  /* THE ONE QUESTION, set off from the conversation by a hairline above it, not a box. */
  .ask {
    display: grid;
    gap: var(--sp-3);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  .ask-label {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    margin: 0;
  }

  .ask-word {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .ask[data-open] .ask-word {
    color: var(--red);
  }

  .ask-meta {
    margin-inline-start: auto;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .ask-q {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  /* ── telling it more ───────────────────────────────────────────────────── */

  .more-field {
    padding-inline-end: var(--sp-1);
  }

  .more-field .field-input {
    font-size: var(--fs-body);
  }

  .failed-part {
    display: grid;
    gap: var(--sp-3);
  }

  .failed {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink);
  }

  .why summary {
    min-block-size: var(--tap);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    cursor: pointer;
  }

  /* ── the keys, at the conversation's heading ───────────────────────────── */

  .keys {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
  }

  .keys-word {
    margin-inline: 2px var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .keys-word:last-child {
    margin-inline-end: 0;
  }

  /* THE KEYS ARE PRINTED WHEN ASKED FOR: while the conversation is pointed at or has focus, and never
     as standing chrome over the one question. Hidden and not removed, so the head does not move when they come. */
  .talk:not(:hover, :focus-within) .keys {
    visibility: hidden;
  }

  /* AND A BUTTON'S OWN CAP the same way: under the pointer or with keyboard focus. Without its cap a pill takes its
     even padding back, so it reads as every other pill on the screen. */
  .frame :global(.btn:not(:hover, :focus-visible) > .btn-kbd) {
    display: none;
  }

  .frame :global(.btn:not(:hover, :focus-visible):has(> .btn-kbd)) {
    padding-inline-end: var(--sp-4);
  }

  .frame :global(.btn[data-size='sm']:not(:hover, :focus-visible):has(> .btn-kbd)) {
    padding-inline-end: var(--sp-3);
  }

  /* ── the build ─────────────────────────────────────────────────────────── */

  /* WHAT IT HEARD SO FAR, one phrase to a line, each with the glyph of what it became. */
  .heard-live {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .reading {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  /* THE ONE PRIMARY, AT THE END OF THE BUILD at 1440. */
  .make-bar {
    display: flex;
    justify-content: flex-start;
  }

  .keeps {
    display: grid;
  }

  /* ── the again note ────────────────────────────────────────────────────── */

  /* THE NOTE SPANS THE FRAME, so its one press sits at the board's own right edge rather than wherever the words end. */
  .again {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
  }

  /* THE "ALREADY MADE" NOTE IS A TILE: on the bare board its words and its white button
     floated over the question like a stray line of the page. A tile, one row, its button the tile's quiet fill. */
  .made-note {
    padding: var(--sp-4) var(--sp-5);
    background: var(--tile);
    border-radius: var(--r-tile);
  }

  .made-note .again-h {
    font-size: var(--fs-body);
    line-height: 20px;
  }

  .made-note .again-why {
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .again.alone {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .again-main {
    display: grid;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .again-h {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: 24px;
  }

  .again-why {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 24px;
  }

  /* ── a phone ───────────────────────────────────────────────────────────── */

  @media (width < 900px) {
    /* MAKE IT MINE RIDES THE BOTTOM EDGE on the board's own flat colour (no glass), as the tab bar does:
       the button's own 44 and 4 either side, which is the `--sticky` height, with the home indicator's inset paid once
       under it. */
    .make-bar {
      position: fixed;
      inset-inline: 0;
      inset-block-end: 0;
      z-index: var(--z-sheet);
      padding: var(--sp-1) var(--gutter) calc(var(--sp-1) + env(safe-area-inset-bottom));
      background: var(--board);
    }

    .make-bar :global(.btn) {
      inline-size: 100%;
      min-block-size: var(--tap);
    }

    .frame[data-making] {
      padding-block-end: calc(var(--tap) + var(--sp-2) + env(safe-area-inset-bottom));
    }

    .again {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .again > :global(.btn) {
      grid-column: 2 / -1;
      justify-self: start;
    }
  }

  /* NO KEY CAPS UNDER A THUMB OR ON A PHONE: there is no keyboard to press them with. */
  @media (width < 900px), (pointer: coarse) {
    .keys,
    .frame :global(.btn-kbd) {
      display: none;
    }
  }

  @media (forced-colors: active) {
    .said-mark {
      border: 1px solid CanvasText;
    }

    .make-bar {
      border-block-start: 1px solid CanvasText;
    }
  }
</style>
