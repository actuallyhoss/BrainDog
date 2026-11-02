<!--
  One add-on's settings: `/addons/<id>`.

  A FORM GENERATED FROM WHAT THE ADD-ON DECLARES, by the rule `06 §8` gives a register's create form,
  over the six types a setting can declare. A label is always visible, an error sits
  beside its field, and Ctrl or Cmd with Enter saves from anywhere in the form.

  SAVE SENDS ONLY WHAT MOVED, and Reset sends `null` for one setting, which the record reads as its
  default. Each setting says when a change takes hold, worked out from the add-on's file (`takes-hold.ts`): at
  once for what reads it when drawn, or when the add-on next updates for a `{{config:}}` the record fills at
  install. Only when the file cannot be read does the form say the general rule once. An add-on that declares
  no settings draws no settings section.

  THE LOOK: what the add-on does is the title row's sentence and its switch is in the toolbar. The form
  is a group on the ground, each setting's label above its 40px field (a switch sits beside its label, as a switch
  does). Exchange rates are a tile of their own, and what the add-on added is a list of rows with their icon wells.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  /* THE MODULES THIS BUILD SHIPS, for their names, blurbs and lists, read off each one's own manifest and document. It
     was the sample's `PACKS`, which carried the same six and two add-ons nobody wrote, then a hand copy with
     stale versions. */
  import { firstPartyModules } from '@braindog/seed/packs/modules';
  /* THE GLYPH OF THE PLACE IT BRINGS, as its row on /packs wears it (agents F25). */
  import { glyphOf } from '../glyph.ts';
  import { isGlyph } from '$lib/ui/icons.ts';
  import { describe, moduleHolds } from '$lib/market/describe.ts';
  import { PAGES, REGISTERS } from '$lib/record/held.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { TONES, since } from 'braindog-render';
  import type { IconName } from '$lib/ui/icons.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import ShipsWidgets from '$lib/board/ShipsWidgets.svelte';
  import { HOME_CURRENCY_SETTING } from '@braindog/kernel';
  import { homeCurrency } from '$lib/record/api.ts';
  import { currencyOptions } from '$lib/record/currencies.ts';
  import { settingChoices } from './said.ts';
  import { heldNames, holdName, waitingIn, waitingLine } from './waiting.ts';
  import { answersIn, declarationsOf, holdsFoot, savedSaid, savingNote, targetSaid, targetsIn, type TakesHold } from './takes-hold.ts';
  import { foldOf, sharedNotes } from './fold.ts';
  import { KEEP_RATES_ASK, ratesFeedOf, ratesKept } from './rates-switch.ts';
  import { goto } from '$app/navigation';
  import { lineSaid, pairsOf, rateNote, rateSaid, readRates, type PairRead } from './rates.ts';
  import { Sparkline } from '$lib/viz/index.ts';
  import { kennelFetch, publishedText } from '$lib/market/publish.ts';
  import {
    UNITS,
    changesOf,
    currencyOf,
    draftOf,
    heldElsewhere,
    fieldAt,
    isDefault,
    labelOf,
    openSettings,
    signInFor,
    words,
    type ConfigDecl,
    type Draft,
    type PackConfig,
    type PackState,
    type Source,
    type Unit,
  } from '$lib/record/packs.ts';
  import { KEYS_REGISTER, reprove } from '$lib/record/keychain.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';
  import { moduleName } from '@braindog/seed/usecases/names';
  import { SPEAKS } from '$lib/voice.ts';
  import { words as market } from '$lib/market/words.ts';
  import { isCore } from '@braindog/declare';
  import type { CatalogueIndex } from '@braindog/declare/catalogue';
  import { readHostCatalogue, readShippedCatalogue } from '../catalogue.ts';
  import About from './About.svelte';
  import { foundListing, newerThan } from './found.ts';

  /** The pack id the record holds it under, when the address names it otherwise (`founder` for `usecase-founder`). */
  let { packId = null }: { packId?: string | null } = $props();
  const id = $derived(packId ?? String(page.params.id));
  /* BRAINDOG'S OWN PARTS HAVE NO OFF SWITCH: Projects, People, Work and Agents are
     BrainDog, not an add-on to choose, so their page says "Part of BrainDog" and draws no switch. */
  const core = $derived(isCore(id));

  /* WHAT THE STORE KNOWS OF IT, read as the store reads it (`found.ts`), so this page and the store never disagree on a
     version, a host or a licence: the host's catalogue, then the one this build ships for a private add-on. */
  let indexes = $state.raw<{ kennel: CatalogueIndex | null; shipped: CatalogueIndex | null } | null>(null);
  void Promise.all([readHostCatalogue(fetch).then((got) => (got.ok ? got.index : null)), readShippedCatalogue(fetch)])
    .then(([kennel, shipped]) => (indexes = { kennel, shipped }))
    .catch(() => (indexes = { kennel: null, shipped: null }));
  const found = $derived(indexes ? foundListing({ ...indexes, counts: null, id, kind: firstPartyModules().some((m) => m.id === id) ? 'module' : null }) : null);
  import { recordToday } from '$lib/record/zone.ts';

  const pack = $derived(firstPartyModules().find((p) => p.id === id));
  /* AN ADD-ON FROM THE STORE IS NO MODULE OF THIS BUILD (audit 31 Oct g, AG2): its name, what it is for and what it
     brings are its listing's, the one the store drew it from, so its page was "What it is for" over nothing. */
  const listing = $derived(pack || !found || found.listing.installedId !== id ? null : found.listing);
  /* A use case's pack by its use case, never `usecase-founder`. */
  const name = $derived(pack?.name ?? listing?.title ?? moduleName(id));
  const blurb = $derived(pack?.blurb ?? listing?.summary ?? '');
  /* THE CURRENCY THE RECORD'S MONEY IS IN, read as Settings > Words and money reads it, for a home currency not saved. */
  const moneyIn = $derived(((page.data.index as { currency?: string | null } | undefined)?.currency || homeCurrency() || '').toUpperCase());

  let from = $state<'reading' | 'ready' | 'refused'>('reading');
  let refusal = $state('');
  /** The record does not hold this add-on at all, which is an address and not a failure. */
  let unknown = $state(false);
  let settings = $state<PackConfig | null>(null);
  /** Whether this use case is the only one on, so its voice is the record's whatever `speaks` says. */
  let alone = $state(false);
  let drafts = $state<Record<string, Draft>>({});
  /** A list setting's lines as typed, one box each; `Draft` holds one text, so a list keeps its lines here. */
  let lines = $state<Record<string, string[]>>({});
  let source: Source | null = null;

  /**
   * A LIST SETTING IS LINES OF TEXT, one box per line. Read by its type's word and not through `ConfigType`, so the
   * form draws what the record declares whether or not the shared type has learnt the word yet.
   */
  const isList = (decl: ConfigDecl): boolean => (decl.type as string) === 'list';
  /** The most lines the add-on declares, when it says; the record refuses past its own ceiling in its own words. */
  const mostOf = (decl: ConfigDecl): number | null => {
    const max = (decl as { max?: unknown }).max;
    return typeof max === 'number' ? max : null;
  };
  const linesOf = (value: unknown): string[] => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))) : []);
  /** What Save would send for a list: the lines with something in them, trimmed, blank boxes left out. */
  const listOf = (typedLines: readonly string[]): string[] => typedLines.map((l) => l.trim()).filter((l) => l !== '');
  const listWords = {
    add: 'Add a line',
    remove: 'Remove',
    line: (label: string, n: number) => `${label}, line ${n}`,
    removeLine: (label: string, n: number) => `Remove line ${n} of ${label}`,
  } as const;

  /** Sent and waiting; the record's refusal, the setting it names, and whether signing in again answers it. */
  let busy = $state(false);
  let fix = $state('');
  let fixAt = $state<string | null>(null);
  let signin = $state(false);
  let reproving = $state(false);
  /** What was last sent, so signing in again can send it again. */
  let last: Record<string, unknown> | null = null;

  /** The record's answer, drawn. Only the named settings' controls are reset, so an edit to another survives a Reset. */
  function show(s: PackConfig, keys: readonly string[] = Object.keys(s.config)) {
    settings = s;
    const next = { ...drafts };
    /* A NEW HOME CURRENCY CHANGES WHAT EVERY SUM IS TYPED IN, so every box is drawn again. */
    const redraw = keys.includes('home_currency') ? Object.keys(s.config) : keys;
    const nextLines = { ...lines };
    for (const k of redraw) {
      const decl = s.config[k];
      if (!decl) continue;
      /* A LIST'S DRAFT IS A BLANK ONE, kept only so the row draws; its lines are what it sends. */
      next[k] = draftOf(decl, isList(decl) ? null : s.values[k], currencyOf(s, k));
      if (isList(decl)) nextLines[k] = linesOf(s.values[k]);
    }
    drafts = next;
    lines = nextLines;
  }

  function setLine(key: string, i: number, text: string) {
    const rows = [...(lines[key] ?? [])];
    rows[i] = text;
    lines[key] = rows;
  }

  function addLine(key: string) {
    lines[key] = [...(lines[key] ?? []), ''];
  }

  function dropLine(key: string, i: number) {
    lines[key] = (lines[key] ?? []).filter((_, n) => n !== i);
  }

  async function load(want: string) {
    from = 'reading';
    fix = '';
    fixAt = null;
    signin = false;
    drafts = {};
    lines = {};
    const at = opened();
    const chosen = await openSettings(createClient({ base: apiBase() }), want);
    /* An answer for an add-on somebody has already navigated away from draws nothing. */
    if (id !== want) return closed(true, at);
    source = chosen.source;
    alone = chosen.alone;
    installed = null;
    turnSaid = '';
    holds = undefined;
    if (chosen.first.ok) {
      show(chosen.first.value);
      heldRead = false;
      waitedLong = false;
      setTimeout(() => {
        if (id === want) waitedLong = true;
      }, 2500);
      from = 'ready';
      void readHeld(chosen.source, want);
      void readHolds(chosen.first.value, want);
    } else {
      refusal = chosen.first.refusal.fix;
      unknown = chosen.first.refusal.code === 'DECLARATION_UNKNOWN';
      from = 'refused';
    }
    closed(chosen.first.ok, at);
  }

  $effect(() => {
    const want = id;
    untrack(() => void load(want));
  });

  /**
   * WHEN EACH SETTING TAKES HOLD: at once, or when this add-on next updates, worked out from its own file
   * (`takes-hold.ts`). `undefined` while the file is read, and no line is drawn then; `null` when it cannot be read,
   * and the form says the general rule once instead of guessing per setting.
   */
  let holds = $state<Record<string, TakesHold> | null | undefined>(undefined);
  /* THE FIGURE EACH LIMIT HOLDS, from the same file (`targetsIn`), so its box says what it does. */
  let targets = $state<Record<string, string>>({});
  async function readHolds(s: PackConfig, want: string) {
    const firstParty = firstPartyModules().some((m) => m.id === want);
    const declarations = await declarationsOf(want, s.version, firstParty).catch(() => null);
    if (id !== want) return;
    holds = declarations === null ? null : answersIn(declarations, Object.keys(s.config));
    targets = declarations === null ? {} : targetsIn(declarations, Object.keys(s.config));
  }

  /* ── on or off ─────────────────────────────────────────────────────────── */

  /**
   * WHETHER THIS ADD-ON IS ON (`installed`), read beside its settings, so its own page carries the same switch its row on /packs does
   * (the page once had no version, switch or uninstall). `null` until the record answers, and the switch is
   * not drawn until then, because a switch that guesses is a switch that lies.
   */
  let installed = $state<PackState | null>(null);
  /** The version the store offers past the one held, and where its plan is read: the store's page, or the Updates card for one only this build ships. */
  const newer = $derived(found && installed?.version ? newerThan(found.listing, installed.version) : null);
  const updateAt = $derived(
    found === null ? null : found.shippedOnly || found.tier === 'link' ? '/settings/addons' : `/addons/${encodeURIComponent(found.listing.id)}?kind=${found.listing.kind}&update`,
  );  let turning = $state(false);
  /** The record's sentence when it refused the switch; the cascade that answers a dependent is offered on /packs. */
  let turnSaid = $state('');

  /**
   * UNINSTALL, ON THE ADD-ON'S OWN PAGE TOO, for every add-on that is not part of BrainDog. The record keeps every row
   * and, for thirty days, its settings and schedules (`uninstallPack`), exactly as for a built-in one, and the list of
   * add-ons it goes back to offers Put back under Removed.
   */
  let removing = $state(false);
  async function uninstall() {
    const s = source;
    if (!s || removing || core) return;
    removing = true;
    turnSaid = '';
    try {
      const out = await s.uninstall(id);
      if (!out.ok) {
        turnSaid = out.refusal.fix;
        return;
      }
      toasts.push(copy.uninstalled(name), { intent: 'good' });
      void goto(at('/settings/addons'));
    } finally {
      removing = false;
    }
  }

  /** The rates add-on this record holds, for the "Keep rates current" switch; `null` until one is set up. */
  let feed = $state<PackState | null>(null);
  let keeping = $state(false);
  const keptOn = $derived(ratesKept(feed));

  /** Off and never set up opens the rates ask (it asks for the address as usual); otherwise the switch turns the feed off or on, and off is undone. */
  async function pressKeep() {
    const s = source;
    if (keeping) return;
    if (feed === null) return void goto(at(KEEP_RATES_ASK));
    if (!s) return;
    keeping = true;
    try {
      const was = feed;
      const on = was.disabled_at !== null;
      const out = on ? await s.enable(was.id) : await s.disable(was.id);
      if (!out.ok) {
        turnSaid = out.refusal.fix;
        return;
      }
      if (!on && out.value.changed) toasts.push(copy.ratesTurnedOff, { undo: () => void pressKeep() });
      const got = await s.packs();
      if (got.ok) feed = ratesFeedOf(got.value);
    } finally {
      keeping = false;
    }
  }

  /* WHETHER THE PAGE MAY BE DRAWN: the store's listing and whether it is on are read with its settings, so its lead does
     not grow under the head (its line, its version, Open and Uninstall) and push every tile down by a phone's screen
     a moment after it is drawn (0.15 at 390, 0.04 at 1512). At most 2.5 s after its settings land. */
  let heldRead = $state(false);
  let widgetsRead = $state(false);
  let waitedLong = $state(false);
  const drawable = $derived(heldRead && indexes !== null);
  async function readHeld(s: Source, want: string) {
    const got = await s.packs().finally(() => {
      if (id === want) heldRead = true;
    });
    if (got.ok && id === want) {
      installed = got.value.find((p) => p.id === want) ?? null;
      feed = ratesFeedOf(got.value);
      void readWaiting(got.value, want);
      void readPairs(installed?.registers ?? [], want);
    }
  }

  /**
   * THE RATES THE RECORD HOLDS, for the rates tile: the newest of each pair, and its last 90 days. Read off whichever of
   * this add-on's own lists the kernel says holds the rates (`ratesListOf`), so no list is named here, and only on the page that sets the home
   * currency, which is where the tile is. Empty until the record answers and when it holds none, and the tile is then
   * the sentence and the button alone.
   */
  let rates = $state<Awaited<ReturnType<typeof readRates>>>([]);
  async function readPairs(registers: readonly string[], want: string) {
    rates = [];
    if (!settings || !(HOME_CURRENCY_SETTING in settings.config)) return;
    const got = await readRates(createClient({ base: apiBase() }), registers);
    if (id === want) rates = got;
  }
  /* Worked out again when the home currency is saved, because a pair is read into it. */
  const pairs = $derived.by((): PairRead[] => {
    const home = settings?.values[HOME_CURRENCY_SETTING];
    return pairsOf(rates, recordToday(), typeof home === 'string' && home !== '' ? home : null);
  });

  /**
   * WHAT OF THIS ADD-ON WAITS for the record to hold a list (`when: { holds }`), worked out on read: its own file at the
   * version installed, laid over the lists the record holds now. BrainDog's own modules say none, so they are not read.
   * Nothing is drawn while it is read, or when the file cannot be.
   */
  let waits = $state<string | null>(null);
  async function readWaiting(packs: PackState[], want: string) {
    waits = null;
    const version = packs.find((p) => p.id === want)?.version;
    if (!version || firstPartyModules().some((m) => m.id === want)) return;
    const text = await publishedText(kennelFetch, 'pack', want, version);
    if (text === null || id !== want) return;
    const waiting = await waitingIn(text, await heldNames(packs, REGISTERS));
    if (id !== want) return;
    const titles: Record<string, string> = Object.assign({}, ...firstPartyModules().map((m) => m.titles));
    for (const [id, list] of Object.entries(REGISTERS)) if (list?.name) titles[id] = list.name;
    waits = waitingLine(waiting, (hold) => holdName(hold, titles));
  }

  /**
   * THE HEAD'S SWITCH SAYS WHAT IT DOES AND ASKS BEFORE IT TURNS AN ADD-ON OFF. It sat
   * unlabelled at the head's end, where it read as a setting of the page, and one press took every list and page of the
   * add-on out of the menu. Off now asks once, in a line under the head, with what it takes away; on is at once.
   */
  const turnWords = {
    on: 'On',
    off: 'Off',
    ask: (name: string, n: number) =>
      `Turn ${name} off? ${n === 0 ? 'It stops working' : `Its ${n === 1 ? 'list or page leaves' : `${n} lists and pages leave`} the menu`} until you turn it on again. Nothing in it is deleted.`,
    yes: 'Turn off',
    no: 'Keep it on',
  } as const;
  let asking = $state(false);

  /** A press of the switch: on is at once, off asks first (`turnWords.ask`). */
  function pressSwitch() {
    if (!installed || turning) return;
    if (installed.disabled_at === null) asking = true;
    else void turn();
  }

  /** One press of the switch, or the confirm under it. Off can be undone too, as on /packs: the same call puts it back. */
  async function turn() {
    const s = source;
    const h = installed;
    if (!s || !h || turning) return;
    asking = false;
    const on = h.disabled_at !== null;
    turning = true;
    turnSaid = '';
    try {
      const out = on ? await s.enable(h.id) : await s.disable(h.id);
      if (!out.ok) {
        turnSaid = out.refusal.fix;
        return;
      }
      if (!on && out.value.changed) toasts.push(copy.packTurnedOffNamed([name]), { undo: () => void turn() });
      await readHeld(s, h.id);
    } finally {
      turning = false;
    }
  }
  $effect(() => {
    if (from === 'ready') drew('ready');
  });

  const entries = $derived(Object.entries(settings?.config ?? {}));
  /* THE BLANK LIMITS FOLD, AND WHAT EVERY SETTING SHARES IS SAID ONCE AT THE FOOT: the Money add-on was fourteen
     empty boxes, each with the same two lines under it. */
  const fold = $derived(foldOf(entries, settings?.values ?? {}));
  let unfoldedMore = $state(false);
  /* SAVING IS SAID ONCE, AT THE FOOT: a note that only says a setting holds once saved is not said again over it. */
  const shared = $derived(sharedNotes(entries).filter((n) => !(foot && savingNote(n))));
  /** The line under one setting: what the limit does when a figure names it, else its own note unless the foot says it. */
  const noteOf = (key: string, decl: ConfigDecl): string | null => {
    if (targets[key]) return targetSaid(targets[key]);
    if (!decl.note || sharedNotes(entries).includes(decl.note)) return null;
    return foot && savingNote(decl.note) ? null : decl.note;
  };
  /** What an empty limit's box shows: its default when it has one, else that it holds none. */
  const emptySaid = (key: string, decl: ConfigDecl): string | undefined =>
    decl.default !== undefined && decl.default !== null && typeof decl.default !== 'object' ? String(decl.default) : targets[key] ? words.noLimit : undefined;
  const foot = $derived(holdsFoot(holds ?? null, Object.fromEntries(entries.map(([k, d]) => [k, labelOf(k, d)])), name));
  /** Drawn: not folded, or the fold is open, or it holds a change or a refusal somebody must see. */
  const drawnHere = (key: string): boolean => unfoldedMore || !fold.folded.includes(key) || key in pending.values || key in pending.wrong || fixAt === key || asked === key;
  /**
   * A SETTING ASKED FOR BY THE ADDRESS (`?set=place`, audit 31 Oct f, AF8): Weather's empty page links "Set your town"
   * here, and the field is drawn, brought into view and focused once the settings have read, so nobody hunts for Place.
   */
  const asked = $derived(page.url.searchParams.get('set'));
  let focusedFor = '';
  $effect(() => {
    const key = asked;
    if (from !== 'ready' || key === null || !settings || !(key in settings.config) || focusedFor === `${id}:${key}`) return;
    focusedFor = `${id}:${key}`;
    requestAnimationFrame(() => {
      const el = document.getElementById(`set-${key}`);
      el?.scrollIntoView({ block: 'center' });
      (el?.matches('input, select, textarea') ? el : el?.querySelector<HTMLElement>('input, select, textarea'))?.focus({ preventScroll: true });
    });
  });
  /* A LIST'S LINES ARE COMPARED HERE, and its blank draft is kept out of `changesOf`, which would read the empty box as
     the setting cleared. A list that held nothing and still holds nothing has not moved. */
  const pending = $derived.by(() => {
    const s = settings;
    if (!s) return { values: {} as Record<string, unknown>, wrong: {} as Record<string, string> };
    const listed = new Set(Object.entries(s.config).filter(([, d]) => isList(d)).map(([k]) => k));
    const out = changesOf(s, Object.fromEntries(Object.entries(drafts).filter(([k]) => !listed.has(k))));
    for (const k of listed) {
      const now = listOf(lines[k] ?? []);
      if (JSON.stringify(now) !== JSON.stringify(linesOf(s.values[k]))) out.values[k] = now;
    }
    return out;
  });
  const dirty = $derived(Object.keys(pending.values).length > 0);
  const held = $derived(Object.keys(pending.wrong).length > 0);
  /* A refusal that names a setting this form draws is drawn beside it; any other under Save. */
  const besideField = $derived(fixAt !== null && settings !== null && fixAt in settings.config);

  async function send(values: Record<string, unknown>) {
    if (!source || !settings || busy) return;
    busy = true;
    last = values;
    const at = opened();
    const out = await source.setConfig(settings.id, values);
    closed(true, at);
    busy = false;
    if (!out.ok) {
      fix = out.refusal.fix;
      fixAt = fieldAt(out.refusal);
      signin = signInFor(out.refusal);
      return;
    }
    fix = '';
    fixAt = null;
    signin = false;
    last = null;
    show(out.value, Object.keys(values));
    const names = out.value.changed.map((k) => labelOf(k, out.value.config[k] as ConfigDecl));
    if (names.length === 0) return;
    /* A SAVED SETTING THAT WAITS FOR THE UPDATE SAYS SO, so a target changed with nothing moving is never unexplained. */
    const said = out.value.changed.map((k, i) => ({ name: names[i] ?? k, answer: holds?.[k] }));
    toasts.push(savedSaid(words.saved(names), said, name), { intent: 'good' });
  }

  function submit(e?: Event) {
    e?.preventDefault();
    if (dirty && !held) void send({ ...pending.values });
  }

  let form: HTMLFormElement | undefined = $state();

  function onkeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && e.target instanceof Node && form?.contains(e.target)) submit(e);
  }

  /* SIGNING IN AGAIN WITHOUT LEAVING, where a passkey can do it, and what was sent goes again. */
  async function signInAgain() {
    if (reproving) return;
    reproving = true;
    const back = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href));
    reproving = false;
    if (back && last) await send(last);
  }

  /** A radiogroup's arrows: they move and choose, and wrap. */
  function step(e: KeyboardEvent, values: readonly string[], i: number, d: Draft) {
    const by = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (by === 0 || values.length === 0) return;
    e.preventDefault();
    const n = (i + by + values.length) % values.length;
    d.text = values[n] ?? d.text;
    ((e.currentTarget as HTMLElement).parentElement?.children[n] as HTMLElement | undefined)?.focus();
  }

  const typed = (e: Event): string => (e.currentTarget as HTMLInputElement | HTMLSelectElement).value;

  /* A LIST OR PAGE THIS TAB HAS NOT READ YET IS ITS ADDRESS PUT IN WORDS, never the bare `money_overview`. */
  const inWords = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1).replaceAll(/[-_]/g, ' ');
  /* A PAGE IS CALLED WHAT THE RECORD CALLS IT (P45), the title the nav and the browse page say,
     before the sample's name for it or its address in words. */
  /* THE PAGES A PERSON OPENS BY NAME: a page drawn for each row of a list ("Someone",
     "Relation", titled by the row) is not one of them, so it is not listed as a page the add-on adds. */
  const shownPages = $derived((pack?.pages ?? []).filter((p) => !(pack?.rowPages ?? []).includes(p)));

  /* THE PAGES LISTED UNDER WHAT THE ADD-ON ADDED leave out the one that is the add-on itself: "Agents" inside Agents. */
  const ledgerPages = $derived(shownPages.filter((p) => pageName(p).trim().toLowerCase() !== name.trim().toLowerCase()));

  /* ── what a store add-on brought ─────────────────────────────────────── */

  const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
  /* ITS LISTS ARE THE ONES THE RECORD SAYS IT HOLDS, and its pages the ones its listing names at the version held, found
     in this record's menu by title, so a page it did not bring (or one taken out since) is never linked. */
  const heldReach = $derived.by(() => {
    if (!listing) return null;
    const held = installed?.version ?? settings?.version ?? null;
    return (listing.versions.find((v) => v.version === held) ?? listing.versions[0])?.reach ?? null;
  });
  const storePages = $derived(
    (heldReach?.pages ?? []).flatMap((title) => {
      const e = ((page.data.nav ?? []) as { id: string; title: string; row?: true }[]).find((n) => n.row !== true && same(n.title, title));
      return e ? [e.id] : [];
    }),
  );
  /* WHAT IT ADDED, A BUILT-IN'S FROM ITS MODULE AND A STORE ADD-ON'S FROM THE RECORD AND ITS LISTING. */
  const addedLists = $derived(pack ? pack.registers : listing ? (installed?.registers ?? []) : []);
  const addedPages = $derived(pack ? ledgerPages : storePages.filter((p) => !same(pageName(p), name)));
  const addsSaid = $derived(pack ? describe(moduleHolds(pack)) : describe({ lists: addedLists.length, pages: storePages.length }));
  /* "OPEN DEBTS": the page that is the add-on itself, else its first page, else its first list. */
  const openAt = $derived.by(() => {
    if (installed?.disabled_at || core) return null;
    const pages = pack ? shownPages : storePages;
    const own = pages.find((p) => same(pageName(p), name)) ?? pages[0];
    if (own !== undefined) return `/p/${own}`;
    const list = addedLists[0];
    return list === undefined ? null : `/r/${list}`;
  });

  /* EACH LIST'S OWN ICON AND COUNT, as the rail draws it, and when it last changed, from the newest page of the log: a
     list the log's newest page never touched says no age rather than a guess. */
  const railOf = (r: string) => ((page.data.index?.registers ?? []) as { id: string; count: number; icon: IconName; guessed?: true }[]).find((x) => x.id === r);
  let changedAt = $state<Record<string, string>>({});
  const nowMs = $derived(recordNow());
  /* NO `page.data.live` GUARD: the refused shell says `live: true` too, so it would witness nothing; a log that does not
     answer live is passed over below. */
  $effect(() => {
    untrack(() => {
      void import('$lib/record/news-live.ts')
        .then((m) => m.readLog(apiBase(), null))
        .then((out) => {
          if (out.from !== 'live') return;
          const seen: Record<string, string> = {};
          for (const e of out.events) {
            const reg = typeof e.target === 'string' ? e.target.split('#')[0] : undefined;
            if (reg && (seen[reg] === undefined || Date.parse(e.at) > Date.parse(seen[reg]))) seen[reg] = e.at;
          }
          changedAt = seen;
        })
        .catch(() => undefined);
    });
  });
  const metaOf = (r: string): string => {
    const x = railOf(r);
    const parts: string[] = [];
    /* KEYS COUNT RETIRED ROWS IN THE RAIL'S COUNT; THE KEYCHAIN LEAVES THEM OUT, so the two said 176 and 83. Say no number rather than the wrong one. */
    if (x && x.guessed !== true && r !== KEYS_REGISTER) parts.push(x.count === 1 ? '1 entry' : `${x.count.toLocaleString('en-GB')} entries`);
    const at = changedAt[r];
    if (at) parts.push(`changed ${since(at, nowMs)}`);
    return parts.join(' · ');
  };

  const pageName = (slug: string): string =>
    ((page.data.nav ?? []) as { id?: string; title?: string }[]).find((e) => e.id === slug)?.title || PAGES[slug]?.title || inWords(slug);
</script>

<svelte:window {onkeydown} />
<svelte:head><title>{titleOf(name, copy.packs)}</title></svelte:head>

{#if from === 'refused'}
  <div class="page">
    <!-- AN ADD-ON THAT IS NOT INSTALLED IS NOT AN ERROR. It drew the red warning glyph over the
         record's own sentence, which starts with the id in lower case; a mistyped address reads
         as the place it is, with the way back to the list of add-ons. -->
    <Empty
      kind={unknown ? 'no-results' : 'error'}
      glyph={unknown ? 'packs' : undefined}
      heading
      title={unknown ? copy.packNotInstalled(id) : refusal}
      body={unknown ? copy.packNotInstalledWhy : undefined}
    >
      {#snippet actions()}<Button href="/settings/addons">{copy.packs}</Button>{/snippet}
    </Empty>
  </div>
{:else if from === 'ready' && settings && (drawable || waitedLong)}
  <PageHead icon={(pack && isGlyph(pack.icon) ? pack.icon : null) ?? glyphOf(pack?.pages, page.data.nav ?? [])} kicker={copy.packs} back="/settings/addons" title={name} sentence="">
    {#snippet actions()}
      {#if newer && updateAt}<Button weight="primary" size="sm" href={updateAt}>{market.about.updateTo(newer)}</Button>{/if}
      {#if installed && !core}
        <!-- THE SWITCH WITH ITS WORD BESIDE IT, so it reads as the add-on's own on and off, not a setting of the page. -->
        <label class="head-switch">
          <span class="head-switch-word" aria-hidden="true">{installed.disabled_at === null ? turnWords.on : turnWords.off}</span>
          <button
            type="button"
            class="switch"
            role="switch"
            aria-checked={installed.disabled_at === null}
            aria-label={copy.packSwitch(name)}
            aria-expanded={asking}
            disabled={turning}
            onclick={pressSwitch}
          ><span class="switch-track"></span></button>
        </label>
      {/if}
    {/snippet}
  </PageHead>

  <div class="page">
   <div class="tiles">
    <!-- THE LEAD TILE, AS THE STORE'S PAGE DRAWS IT: what it is for, then its version and whether it is on. The head's
         switch says the state to a screen reader, and this line says it in words, so off is never colour alone. -->
    <!-- WHILE THE WIDGETS IT SHIPS AND WHEN EACH SETTING TAKES HOLD ARE READ, what follows the lead waits out of sight: the
         widgets' line grew the lead and the settings' lines grew the form, and each pushed the tiles under them down. -->
    <div class="lead-cell" aria-busy={widgetsRead && holds !== undefined ? undefined : 'true'}>
     <Tile lead icon={(pack && isGlyph(pack.icon) ? pack.icon : null) ?? glyphOf(pack?.pages, page.data.nav ?? [])} title={copy.useCaseFor} aria-label={copy.useCaseFor}>
      {#if blurb}<p class="summary">{blurb}</p>{/if}
      <p class="about">
        {#if installed?.version ?? settings.version}{@const v = (installed?.version ?? settings.version)!}<span class="num">{installed?.disabled_at ? market.about.off(v) : market.about.on(v)}</span>{/if}
        {#if core}<span>{market.about.partOf}</span>{/if}
        {#if installed?.disabled_at}<span>{copy.packTurnedOff}</span>{/if}
      </p>
      {#if asking}
        <div class="turn-ask" role="group" aria-label={copy.packSwitch(name)}>
          <p class="turn-ask-said">{turnWords.ask(name, addedLists.length + (pack ? shownPages.length : storePages.length))}</p>
          <div class="turn-ask-do">
            <Button size="sm" disabled={turning} onclick={() => void turn()}>{turnWords.yes}</Button>
            <Button size="sm" weight="bare" onclick={() => (asking = false)}>{turnWords.no}</Button>
          </div>
        </div>
      {/if}
      <p class="turn-said" role="status">{turnSaid}</p>
      {#if waits}<p class="waits">{waits}</p>{/if}
      <!-- BRAINDOG'S OWN PARTS ARE ALWAYS ON, AND THEIR PAGES ARE HIS TO HIDE: one line, and the way to Navigation. -->
      {#if core}<p class="waits">{market.about.alwaysOn} <a class="tap" href={at('/settings/navigation')}>{market.about.hidePages}</a></p>{/if}
      {#if installed && (openAt || !core)}
        <div class="lead-do">
          {#if openAt}<Button size="sm" href={at(openAt)}>{market.about.open(name)}</Button>{/if}
          {#if !core}<Button size="sm" weight="bare" disabled={removing} onclick={() => void uninstall()}>{copy.uninstall}</Button>{/if}
        </div>
      {/if}
      <ShipsWidgets pack={id} {name} on={!installed?.disabled_at} onread={() => (widgetsRead = true)} />
     </Tile>
    </div>

    <div class="wide-cell stack">
    {#if entries.length}
      <Tile icon="settings" class="section" data-surface="tile" title={words.settings}>
        <div class="section-body">
          <form class="settings" bind:this={form} onsubmit={submit} novalidate>
            {#if holds === null}<p class="when">{words.when}</p>{/if}

            {#each entries as [key, decl] (key)}
              {@const d = drafts[key]}
              {@const label = labelOf(key, decl)}
              {@const why = pending.wrong[key] ?? (besideField && fixAt === key ? fix : '')}
              {@const segmented = decl.type === 'enum' && (decl.values?.length ?? 0) <= 4}
              <!-- THE ONE USE CASE ON SPEAKS whatever `speaks` holds, which is written down only once two are on. -->
              {@const only = key === SPEAKS && alone}
              {#if d && drawnHere(key)}
                <div class="setting" data-kind={decl.type === 'bool' ? 'switch' : undefined}>
                  {#if decl.type === 'bool' || segmented || isList(decl)}
                    <span class="setting-label" id="set-{key}-label">{label}</span>
                  {:else}
                    <label class="setting-label" for="set-{key}">{label}</label>
                  {/if}

                  <div class="setting-control">
                    {#if decl.type === 'bool'}
                      <!-- THE ONE USE CASE ON SPEAKS, and the switch says so rather than sitting off beside a rail in its
                           words. There is nothing to choose between until a second use case is on. -->
                      <button
                        type="button"
                        class="switch"
                        role="switch"
                        id="set-{key}"
                        aria-checked={only || d.on ? 'true' : 'false'}
                        aria-labelledby="set-{key}-label"
                        disabled={only}
                        onclick={() => (d.on = !d.on)}
                      ><span class="switch-track"></span></button>
                    {:else if segmented}
                      {@const values = decl.values ?? []}
                      <Segmented role="radiogroup" aria-labelledby="set-{key}-label">
                        {#each settingChoices(decl) as [v, said], i (v)}
                          <button
                            type="button"
                            class="segment"
                            role="radio"
                            tabindex={d.text === v || (i === 0 && !values.includes(d.text)) ? 0 : -1}
                            data-on={d.text === v ? '' : undefined}
                            aria-checked={d.text === v ? 'true' : 'false'}
                            onclick={() => (d.text = v)}
                            onkeydown={(e) => step(e, values, i, d)}
                          >{said}</button>
                        {/each}
                      </Segmented>
                    {:else if isList(decl)}
                      <!-- A LIST IS ITS LINES, one box each, so a person reads the whole value and changes one line
                           without retyping the rest. A blank box is left out of what is saved. -->
                      {@const rows = lines[key] ?? []}
                      {@const most = mostOf(decl)}
                      <div class="setting-lines" id="set-{key}" role="group" aria-labelledby="set-{key}-label">
                        {#each rows as row, i (i)}
                          <div class="setting-line">
                            <div class="field setting-field">
                              <input
                                class="field-input"
                                type="text"
                                value={row}
                                aria-label={listWords.line(label, i + 1)}
                                oninput={(e) => setLine(key, i, typed(e))}
                                aria-invalid={why ? 'true' : undefined}
                                aria-describedby={why ? `set-${key}-why` : undefined}
                              />
                            </div>
                            <Button weight="bare" disabled={busy} aria-label={listWords.removeLine(label, i + 1)} onclick={() => dropLine(key, i)}>{listWords.remove}</Button>
                          </div>
                        {/each}
                        <div>
                          <Button weight="bare" disabled={busy || (most !== null && rows.length >= most)} onclick={() => addLine(key)}>{listWords.add}</Button>
                        </div>
                      </div>
                    {:else if decl.type === 'enum'}
                      <select class="setting-select" id="set-{key}" value={d.text} onchange={(e) => (d.text = typed(e))}>
                        {#each settingChoices(decl) as [v, said] (v)}<option value={v}>{said}</option>{/each}
                      </select>
                    {:else if key === HOME_CURRENCY_SETTING && decl.type === 'text'}
                      <!-- A HOME CURRENCY IS CHOSEN, NOT TYPED: the common ones first, then every ISO 4217 code. None is no home currency.
                           THE ORDER IS THE SAVED CURRENCY'S AND NOT THE DRAFT'S. `currencyChoices` moves the code it is
                           handed to the front, and handed the draft it moved every pick: stepping a closed select from GBP
                           with the down arrow, measured through `currencyChoices`, went AED, AUD, AED, AUD and never
                           reached a third code. A saved code the picker does not offer still draws, because the draft
                           starts as the saved value and every pick is an offered one. -->
                      <!-- AND WHERE NO CODE IS SAVED, THE ONE THE RECORD'S MONEY IS IN, as Settings > Words and money shows it
                           (audit 31 Oct g, AG28): Money's page said "None chosen" over a record in pounds. None is offered
                           only where it means something: a code is saved and could be cleared, or the record reads none. -->
                      {@const saved = typeof settings?.values[key] === 'string' ? String(settings?.values[key]).trim().toUpperCase() : ''}
                      {@const heldIn = saved || moneyIn}
                      {@const choices = currencyOptions(heldIn)}
                      <select class="setting-select" id="set-{key}" value={d.text.trim().toUpperCase() || heldIn} onchange={(e) => (d.text = typed(e))}>
                        {#if saved !== '' || heldIn === ''}<option value="">{copy.currencyNone}</option>{/if}
                        <optgroup label={copy.currencyCommon}>{#each choices.common as c (c.code)}<option value={c.code}>{c.label}</option>{/each}</optgroup>
                        <optgroup label={copy.currencyAll}>{#each choices.other as c (c.code)}<option value={c.code}>{c.label}</option>{/each}</optgroup>
                      </select>
                    {:else if decl.type === 'day'}
                      <input
                        class="setting-select"
                        id="set-{key}"
                        type="date"
                        value={d.text}
                        onchange={(e) => (d.text = typed(e))}
                        aria-invalid={why ? 'true' : undefined}
                        aria-describedby={why ? `set-${key}-why` : undefined}
                      />
                    {:else if decl.type === 'money'}
                      {@const currency = currencyOf(settings, key)}
                      <div class="field setting-field">
                        {#if currency}<span class="setting-unit">{currency}</span>{/if}
                        <input
                          class="field-input num"
                          id="set-{key}"
                          type="text"
                          inputmode="decimal"
                          placeholder={heldElsewhere(settings, key) ?? emptySaid(key, decl) ?? words.notSet}
                          value={d.text}
                          oninput={(e) => (d.text = typed(e))}
                          aria-invalid={why ? 'true' : undefined}
                          aria-describedby={why ? `set-${key}-why` : undefined}
                        />
                      </div>
                    {:else if decl.type === 'number'}
                      <div class="field setting-number">
                        <input
                          class="field-input num"
                          id="set-{key}"
                          type="text"
                          inputmode="decimal"
                          placeholder={emptySaid(key, decl)}
                          value={d.text}
                          oninput={(e) => (d.text = typed(e))}
                          aria-invalid={why ? 'true' : undefined}
                          aria-describedby={why ? `set-${key}-why` : undefined}
                        />
                      </div>
                    {:else if decl.type === 'duration'}
                      <div class="field setting-number">
                        <input
                          class="field-input num"
                          id="set-{key}"
                          type="text"
                          inputmode="numeric"
                          value={d.text}
                          oninput={(e) => (d.text = typed(e))}
                          aria-invalid={why ? 'true' : undefined}
                          aria-describedby={why ? `set-${key}-why` : undefined}
                        />
                      </div>
                      <select class="setting-select" aria-label="{label}, {words.unit}" value={d.unit} onchange={(e) => (d.unit = typed(e) as Unit)}>
                        {#each UNITS as [u] (u)}<option value={u}>{words.units[u]}</option>{/each}
                      </select>
                    {:else}
                      <div class="field setting-field">
                        <input
                          class="field-input"
                          id="set-{key}"
                          type="text"
                          value={d.text}
                          oninput={(e) => (d.text = typed(e))}
                          aria-invalid={why ? 'true' : undefined}
                          aria-describedby={why ? `set-${key}-why` : undefined}
                        />
                      </div>
                    {/if}

                    {#if !isDefault(decl, settings.values[key])}
                      <Button weight="bare" disabled={busy} aria-label="{words.reset} {label}" onclick={() => void send({ [key]: null })}>{words.reset}</Button>
                    {/if}
                  </div>

                  {#if only}<p class="setting-note">{words.speaksAlone}</p>{/if}
                  {#if noteOf(key, decl)}<p class="setting-note">{noteOf(key, decl)}</p>{/if}
                  {#if decl.type === 'secret'}<p class="setting-note">{copy.settingSecretSaid(d.text || String(decl.default ?? ''))} <a href={at('/keychain')}>{copy.settingSecretOpen}</a></p>{/if}
                  {#if why}<p class="setting-why" id="set-{key}-why" data-intent="bad"><span class="glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span>{why}</p>{/if}
                </div>
              {/if}
            {/each}

            {#if fold.folded.length > 0 && !unfoldedMore}
              <div class="more-limits">
                <Button weight="bare" onclick={() => (unfoldedMore = true)}>{fold.label === 'More settings' ? words.moreSettings(fold.folded.length) : words.moreLimits(fold.folded.length)}</Button>
              </div>
            {/if}
            {#each shared as note (note)}<p class="setting-note">{note}</p>{/each}
            {#if foot}<p class="setting-note">{foot}</p>{/if}
            <div class="settings-actions">
              <Button weight="primary" type="submit" disabled={!dirty || held || busy}>{words.save}</Button>
              {#if signin}
                <Button weight="quiet" disabled={reproving} onclick={() => void signInAgain()}>{copy.signInAgain}</Button>
              {/if}
            </div>
            <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. -->
            <p class="setting-said" role="status" data-intent={fix && !besideField ? 'bad' : undefined}>{#if fix && !besideField}<span class="glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span>{fix}{/if}</p>
          </form>
        </div>
      </Tile>
      {#if HOME_CURRENCY_SETTING in settings.config}
        <!-- EXCHANGE RATES ARE A PRESET OF THE NEW-ACTION SHEET, reached by its address.
             This page drew a form written for one pack, which it imported by name; now it links to the same sheet
             every scheduled action is made on, filled in for the rates. It stays offered once one is set up, because the
             one action fetches every currency the record holds, and the same press after a currency is added makes it
             again with that currency in it (`ratesPreset`). -->
        <!-- THE TILE HOLDS WHAT THE RECORD HOLDS: the newest rate of each pair, and a line of its last 90 days once
             there are points enough to draw (`rates.ts`). Until an action has fetched one there is no rate here, and
             it is the control tile it was, which the design system allows to hold no figure. -->
        <Tile icon="money" title={copy.ratesHeading}>
          {#if pairs.length > 0}
            <ul class="rates">
              {#each pairs as p (`${p.currency} ${p.base}`)}
                <li class="rate">
                  <div class="rate-said">
                    <p class="rate-now num">{rateSaid(p)}</p>
                    <p class="rate-note">{rateNote(p)}</p>
                  </div>
                  {#if p.chart}
                    <span class="rate-line"><Sparkline values={p.points.map((point) => point.rate)} summary={lineSaid(p)} /></span>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
          <p class="rates-why">{copy.ratesWhy}</p>
          <label class="keep-rates" id="keep-rates">
            <span class="head-switch-word">{copy.ratesKeep}</span>
            <button type="button" class="switch" role="switch" aria-checked={keptOn} aria-label={copy.ratesKeep} disabled={keeping} onclick={pressKeep}
              ><span class="switch-track"></span></button>
          </label>
        </Tile>
      {/if}
    {:else if !(addedLists.length || addedPages.length)}
      <!-- ONLY WHEN IT ADDS NOTHING ELSE (P45): beside the lists and pages it added, a tile saying
           there is nothing to set was a tile of nothing. -->
      <!-- A PAGE THAT WAS ONE SENTENCE. An add-on with no settings still adds things, and this is
           where somebody comes to find out what they were. Nothing to set is a quiet line under its
           own heading, never a whole-screen state with a glyph above what the add-on does bring. -->
      <Tile icon="settings" class="section" data-surface="tile" title={words.settings}>
        <div class="section-body">
          <Empty
            kind="no-data-yet"
            compact
            title={copy.packNothingToSet}
            body={addedLists.length || addedPages.length ? copy.packNothingToSetWhy : undefined}
          />
        </div>
      </Tile>
    {/if}
    </div>
    {#if addedLists.length || addedPages.length}
     <div class="adds-cell">
      <!-- WHAT IT HOLDS AS INSTALLED AND THE STORE SAY IT, "3 lists and 2 pages", never the two summed into one. -->
      <Tile icon="rows" class="section" data-surface="tile" title={copy.installDiff} meta={addsSaid || undefined}>
        <div class="section-body">
          <!-- EACH LIST AND PAGE IT ADDED, a 44px row with its well that opens it. -->
          <ul class="ledger">
            <!-- TWO PARTS, EACH NAMED (1 Nov): Money's Filing rules, Accounts and Ledger stood twice in one run, as a list
                 and as a page, and read as the same thing said twice. -->
            {#if addedLists.length > 0 && addedPages.length > 0}<li class="adds-part">{words.addsLists}</li>{/if}
            {#each addedLists as r (r)}
              <li>
                <a class="line added" href={at(`/r/${r}`)}>
                  <span class="line-mark"><IconWell name={railOf(r)?.icon ?? 'rows'} size="l" /></span>
                  <span class="line-title">{((page.data.lists ?? []) as { id: string; name: string }[]).find((l) => l.id === r)?.name ?? REGISTERS[r]?.name ?? inWords(r)}</span>
                  {#if metaOf(r)}<span class="added-meta">{metaOf(r)}</span>{/if}
                  <span class="added-go"><Icon name="chevron" size="s" /></span>
                </a>
              </li>
            {/each}
            {#if addedLists.length > 0 && addedPages.length > 0}<li class="adds-part">{words.addsPages}</li>{/if}
            {#each addedPages as p (p)}
              <li>
                <a class="line added" href={at(`/p/${p}`)}>
                  <span class="line-mark"><IconWell name="doc" size="l" /></span>
                  <span class="line-title">{pageName(p)}</span>
                  <span class="added-go"><Icon name="chevron" size="s" /></span>
                </a>
              </li>
            {/each}
          </ul>
        </div>
      </Tile>
     </div>
    {/if}
    {#if found}
      <div class="about-row"><About listing={found.listing} tier={found.tier} held={installed?.version ?? settings.version ?? null} /></div>
    {/if}
   </div>
  </div>
{/if}

<style>
  .lead-cell[aria-busy='true'] ~ :global(*) {
    visibility: hidden;
    animation: lead-shown 0s linear 2.5s forwards;
  }

  @keyframes lead-shown {
    to {
      visibility: visible;
    }
  }

  .adds-part {
    padding: var(--sp-3) var(--sp-3) var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .adds-part:first-child {
    padding-block-start: 0;
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    min-inline-size: 0;
  }

  /* THE STORE PAGE'S TILES: the lead beside what it adds, settings across the width under them. One column on a phone. */
  .tiles {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--tile-gap);
    min-inline-size: 0;
  }

  .tiles > * {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .stack {
    gap: var(--tile-gap);
  }

  /* OPEN AND UNINSTALL, under what it is for: the way into it, and the way out. */
  .lead-do {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .summary {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 24px;
    text-wrap: pretty;
  }

  @media (width >= 900px) {
    .tiles {
      grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
      grid-auto-flow: row dense;
    }

    .lead-cell {
      grid-column: 1;
    }

    .adds-cell {
      grid-column: 2;
    }

    .wide-cell {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }

  /* WHAT THE STORE KNOWS OF IT, under everything this record holds of it: three tiles across, one column on a phone. */
  .tiles > .about-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-column: 1 / -1;
    align-items: start;
    gap: var(--tile-gap);
  }

  @media (width >= 900px) {
    .tiles > .about-row {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  /* META WRAPS AS WHOLE ITEMS, with space between them and no separator glyph to lead a wrapped line. */
  .about {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .about:empty,
  .turn-said:empty {
    display: none;
  }

  .keep-rates {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    cursor: pointer;
  }

  .head-switch {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    cursor: pointer;
  }

  .head-switch-word {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  /* THE CONFIRM, A LINE AND TWO VERBS ON THE GROUND under the head, as Backups asks before putting a copy back. */
  .turn-ask {
    display: grid;
    gap: var(--sp-2);
    max-inline-size: var(--measure);
  }

  .turn-ask-said {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .turn-ask-do {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .turn-said {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* WHAT WAITS IS READ AS A SENTENCE, at body size, under the version: the count and the list it waits for are the words. */
  .waits {
    margin: var(--sp-1) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  /* THE FORM KEEPS THE READING MEASURE, not the page: the page runs the window's width with the rest, and a switch
     stays within reach of the label it answers. */
  .settings {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    max-inline-size: var(--measure);
    min-inline-size: 0;
  }

  .when {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .rates-why {
    max-inline-size: 62ch;
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 20px;
    text-wrap: pretty;
  }

  /* THE RATES: one line a pair, what one is worth and as of when on the left, its last 90 days on the right. */
  .rates {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rate {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
  }

  .rate-now {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: 24px;
  }

  .rate-note {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 20px;
  }

  .rate-line {
    flex: 0 1 120px;
    min-inline-size: 80px;
  }

  /* ONE SETTING: its label above its control, its note and any refusal under it. */
  .setting {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* A SWITCH SITS BESIDE ITS LABEL, the way a switch reads everywhere else, with its note under both. */
  .setting[data-kind='switch'] {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--sp-4);
  }

  .setting[data-kind='switch'] > :not(.setting-label, .setting-control) {
    grid-column: 1 / -1;
  }

  .setting-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: 18px;
  }

  .setting[data-kind='switch'] .setting-label {
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 20px;
  }

  .setting-control {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .setting-field {
    flex: 1 1 16ch;
    max-inline-size: 40ch;
  }

  .setting-number {
    flex: 0 1 12ch;
  }

  .setting-lines {
    display: grid;
    flex: 1 1 16ch;
    gap: var(--sp-2);
    min-inline-size: 0;
    max-inline-size: 48ch;
  }

  .setting-line {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .setting-unit {
    color: var(--ink-3);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
  }

  /* A SELECT OR A DATE IS A FIELD: the `--tile-2` well, no border, the `--r-pop` corner, 40 tall and 44 under a thumb. The
     house chevron is `controls.css`'s. */
  .setting-select {
    /* NEVER WIDER THAN ITS CARD (audit j, AJ10): a select is as wide as its longest choice, and the home currency's
       "United Arab Emirates dirham" ran it past the card's edge on a phone. */
    max-inline-size: 100%;
    min-inline-size: 0;
    text-overflow: ellipsis;
    min-block-size: 40px;
    padding: 0 var(--sp-3);
    background-color: var(--tile-2);
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .setting-note,
  .setting-why {
    margin: 0;
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .setting-note {
    color: var(--ink-3);
  }

  /* A REFUSAL BESIDE ITS FIELD: its dot in the danger fill and its words in ink (a tone is its glyph, never colour). */
  .setting-why,
  .setting-said {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink);
  }

  .setting-said {
    margin: 0;
    font-size: var(--fs-body);
  }

  .setting-said:empty {
    display: none;
  }

  .settings-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  /* A ROW OF WHAT IT ADDED: its well, its name, and the chevron that says it opens. */
  .added {
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto auto;
    column-gap: var(--sp-3);
  }

  .added-meta {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    white-space: nowrap;
  }

  /* A ROW WITH NO FIGURES KEEPS ITS CHEVRON AT THE END. */
  .added > :global(.added-go) {
    grid-column: -2 / -1;
  }

  @media (width < 640px) {
    .added-meta {
      display: none;
    }
  }

  .added-go {
    display: inline-grid;
    color: var(--ink-3);
  }

  .added-go:dir(rtl) {
    scale: -1 1;
  }

  @media (pointer: coarse) {
    .setting-select {
      min-block-size: var(--tap);
    }
  }

  @media (width < 900px) {
    .added {
      min-block-size: 60px;
    }
  }
</style>
