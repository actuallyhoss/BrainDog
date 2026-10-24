<!--
  One add-on's settings: `/packs/<id>`.

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
  import { describe, moduleHolds } from '$lib/market/describe.ts';
  import { PAGES, REGISTERS } from '$lib/record/held.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { TONES } from 'braindog-render';
  import Tile from '$lib/ui/Tile.svelte';
  import { HOME_CURRENCY_SETTING } from '@braindog/kernel';
  import { currencyChoices } from '$lib/record/currencies.ts';
  import { settingChoices } from './said.ts';
  import { heldNames, holdName, waitingIn, waitingLine } from './waiting.ts';
  import { answersIn, declarationsOf, savedSaid, takesHoldSaid, type TakesHold } from './takes-hold.ts';
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
  import { reprove } from '$lib/record/vault.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';
  import { moduleName } from '@braindog/seed/usecases/names';
  import { SPEAKS } from '$lib/voice.ts';
  import { words as market } from '$lib/market/words.ts';

  const id = $derived(String(page.params.id));
  const pack = $derived(firstPartyModules().find((p) => p.id === id));
  /* A use case's pack by its use case, never `usecase-founder`. */
  const name = $derived(pack?.name ?? moduleName(id));

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
    if (String(page.params.id) !== want) return closed(true, at);
    source = chosen.source;
    alone = chosen.alone;
    installed = null;
    turnSaid = '';
    holds = undefined;
    if (chosen.first.ok) {
      show(chosen.first.value);
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
   * WHEN EACH SETTING TAKES HOLD (SHL-A09): at once, or when this add-on next updates, worked out from its own file
   * (`takes-hold.ts`). `undefined` while the file is read, and no line is drawn then; `null` when it cannot be read,
   * and the form says the general rule once instead of guessing per setting.
   */
  let holds = $state<Record<string, TakesHold> | null | undefined>(undefined);
  async function readHolds(s: PackConfig, want: string) {
    const firstParty = firstPartyModules().some((m) => m.id === want);
    const declarations = await declarationsOf(want, s.version, firstParty).catch(() => null);
    if (String(page.params.id) !== want) return;
    holds = declarations === null ? null : answersIn(declarations, Object.keys(s.config));
  }

  /* ── on or off ─────────────────────────────────────────────────────────── */

  /**
   * WHETHER THIS ADD-ON IS ON (`installed`), read beside its settings, so its own page carries the same switch its row on /packs does
   * (the page once had no version, switch or uninstall). `null` until the record answers, and the switch is
   * not drawn until then, because a switch that guesses is a switch that lies.
   */
  let installed = $state<PackState | null>(null);
  let turning = $state(false);
  /** The record's sentence when it refused the switch; the cascade that answers a dependent is offered on /packs. */
  let turnSaid = $state('');

  async function readHeld(s: Source, want: string) {
    const got = await s.packs();
    if (got.ok && String(page.params.id) === want) {
      installed = got.value.find((p) => p.id === want) ?? null;
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
    if (String(page.params.id) === want) rates = got;
  }
  /* Worked out again when the home currency is saved, because a pair is read into it. */
  const pairs = $derived.by((): PairRead[] => {
    const home = settings?.values[HOME_CURRENCY_SETTING];
    return pairsOf(rates, new Date().toISOString().slice(0, 10), typeof home === 'string' && home !== '' ? home : null);
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
    if (text === null || String(page.params.id) !== want) return;
    const waiting = await waitingIn(text, await heldNames(packs, REGISTERS));
    if (String(page.params.id) !== want) return;
    const titles: Record<string, string> = Object.assign({}, ...firstPartyModules().map((m) => m.titles));
    for (const [id, list] of Object.entries(REGISTERS)) if (list?.name) titles[id] = list.name;
    waits = waitingLine(waiting, (hold) => holdName(hold, titles));
  }

  /**
   * THE HEAD'S SWITCH SAYS WHAT IT DOES AND ASKS BEFORE IT TURNS AN ADD-ON OFF (UI audit of 22 October, 23). It sat
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
  /* A PAGE IS CALLED WHAT THE RECORD CALLS IT (UI pass of 21 October, P45), the title the nav and the browse page say,
     before the sample's name for it or its address in words. */
  /* THE PAGES A PERSON OPENS BY NAME (UI audit of 22 October, 23): a page drawn for each row of a list ("Someone",
     "Relation", titled by the row) is not one of them, so it is not listed as a page the add-on adds. */
  const shownPages = $derived((pack?.pages ?? []).filter((p) => !(pack?.rowPages ?? []).includes(p)));

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
      title={unknown ? copy.packNotInstalled(String(page.params.id)) : refusal}
      body={unknown ? copy.packNotInstalledWhy : undefined}
    >
      {#snippet actions()}<Button href="/packs">{copy.packs}</Button>{/snippet}
    </Empty>
  </div>
{:else if from === 'ready' && settings}
  <PageHead icon={glyphOf(pack?.pages, page.data.nav ?? [])} kicker={copy.packs} back="/packs" title={name} sentence={pack?.blurb}>
    {#snippet actions()}
      {#if installed}
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
    <!-- WHICH VERSION AND WHETHER IT IS ON, under the sentence that says what it does: the head's switch says the state
         to a screen reader, and this line says it in words, so off is never colour alone. -->
    <div class="lead">
      <p class="about">
        {#if settings.version}<span class="num">{market.versionOf(settings.version)}</span>{/if}
        {#if installed?.disabled_at}<span>{copy.packTurnedOff}</span>{/if}
      </p>
      {#if asking}
        <div class="turn-ask" role="group" aria-label={copy.packSwitch(name)}>
          <p class="turn-ask-said">{turnWords.ask(name, (pack?.registers.length ?? 0) + shownPages.length)}</p>
          <div class="turn-ask-do">
            <Button size="sm" disabled={turning} onclick={() => void turn()}>{turnWords.yes}</Button>
            <Button size="sm" weight="bare" onclick={() => (asking = false)}>{turnWords.no}</Button>
          </div>
        </div>
      {/if}
      <p class="turn-said" role="status">{turnSaid}</p>
      {#if waits}<p class="waits">{waits}</p>{/if}
    </div>

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
              {#if d}
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
                      {@const saved = settings?.values[key]}
                      {@const choices = currencyChoices(typeof saved === 'string' ? saved : '')}
                      <select class="setting-select" id="set-{key}" value={d.text.trim().toUpperCase()} onchange={(e) => (d.text = typed(e))}>
                        <option value="">{copy.currencyNone}</option>
                        <optgroup label={copy.currencyCommon}>{#each choices.common as c (c)}<option value={c}>{c}</option>{/each}</optgroup>
                        <optgroup label={copy.currencyAll}>{#each choices.other as c (c)}<option value={c}>{c}</option>{/each}</optgroup>
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
                          placeholder={heldElsewhere(settings, key) ?? undefined}
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
                  {#if decl.note}<p class="setting-note">{decl.note}</p>{/if}
                  {#if holds?.[key]}<p class="setting-note">{takesHoldSaid(holds[key], name)}</p>{/if}
                  {#if why}<p class="setting-why" id="set-{key}-why" data-intent="bad"><span class="glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span>{why}</p>{/if}
                </div>
              {/if}
            {/each}

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
          <div class="settings-actions">
            <Button weight="quiet" href={at('/automations?new=action&preset=rates')}>{copy.ratesSetUp}</Button>
          </div>
        </Tile>
      {/if}
    {:else if !(pack && (pack.registers.length || shownPages.length))}
      <!-- ONLY WHEN IT ADDS NOTHING ELSE (UI pass of 21 October, P45): beside the lists and pages it added, a tile saying
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
            body={pack && (pack.registers.length || shownPages.length) ? copy.packNothingToSetWhy : undefined}
          />
        </div>
      </Tile>
    {/if}
    {#if pack && (pack.registers.length || shownPages.length)}
      <!-- WHAT IT HOLDS AS INSTALLED AND THE STORE SAY IT (E21), "3 lists and 2 pages", never the two summed into one. -->
      <Tile icon="rows" class="section" data-surface="tile" title={copy.installDiff} meta={describe(moduleHolds(pack)) || undefined}>
        <div class="section-body">
          <!-- EACH LIST AND PAGE IT ADDED, a 44px row with its well that opens it. -->
          <ul class="ledger">
            {#each pack.registers as r (r)}
              <li>
                <a class="line added" href={at(`/r/${r}`)}>
                  <span class="line-mark"><IconWell name="rows" size="l" /></span>
                  <span class="line-title">{((page.data.lists ?? []) as { id: string; name: string }[]).find((l) => l.id === r)?.name ?? REGISTERS[r]?.name ?? inWords(r)}</span>
                  <span class="added-go"><Icon name="chevron" size="s" /></span>
                </a>
              </li>
            {/each}
            {#each shownPages as p (p)}
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
    {/if}
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
  }

  .lead {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .lead:not(:has(:not(:empty))) {
    display: none;
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
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    column-gap: var(--sp-3);
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
