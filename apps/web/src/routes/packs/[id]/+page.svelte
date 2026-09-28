<!--
  One add-on's settings: `/packs/<id>`.

  A FORM GENERATED FROM WHAT THE ADD-ON DECLARES, by the rule `06 §8` gives a register's create form,
  over the six types of `loop/research-modular.md` §1.3. A label is always visible, an error sits
  beside its field, and Ctrl or Cmd with Enter saves from anywhere in the form.

  SAVE SENDS ONLY WHAT MOVED, and Reset sends `null` for one setting, which the record reads as its
  default. Nothing installed changes: the record fills `{{config:}}` when the add-on is next installed
  or updated, and that is the one sentence this screen says. An add-on that declares no settings
  draws no settings section.
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
     was the sample's `PACKS`, which carried the same six and two add-ons nobody wrote (wave C1), then a hand copy with
     stale versions (USE-3). */
  import { firstPartyModules } from '@braindog/seed/packs/modules';
  import { PAGES, REGISTERS } from '$lib/record/held.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import { HOME_CURRENCY_SETTING } from '@braindog/kernel';
  import { currencyChoices } from '$lib/record/currencies.ts';
  import RatesForm from './RatesForm.svelte';
  import { settingChoices } from './said.ts';
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
    type Source,
    type Unit,
  } from '$lib/record/packs.ts';
  import { reprove } from '$lib/record/vault.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';
  import { moduleName } from '@braindog/seed/usecases/names';
  import { SPEAKS } from '$lib/voice.ts';

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
    if (chosen.first.ok) {
      show(chosen.first.value);
      from = 'ready';
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
    toasts.push(words.saved(names), { intent: 'good' });
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
  <PageHead icon="packs" kicker={copy.packs} back="/packs" title={name} />

  <div class="page">
    {#if pack}<p class="blurb">{pack.blurb}</p>{/if}

    {#if entries.length}
      <Section title={words.settings}>
        <form class="settings" bind:this={form} onsubmit={submit} novalidate>
          <p class="when">{words.when}</p>

          {#each entries as [key, decl] (key)}
            {@const d = drafts[key]}
            {@const label = labelOf(key, decl)}
            {@const why = pending.wrong[key] ?? (besideField && fixAt === key ? fix : '')}
            {@const segmented = decl.type === 'enum' && (decl.values?.length ?? 0) <= 4}
            <!-- THE ONE USE CASE ON SPEAKS whatever `speaks` holds, which is written down only once two are on. -->
            {@const only = key === SPEAKS && alone}
            {#if d}
              <div class="setting">
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
                    <div class="segmented" role="radiogroup" aria-labelledby="set-{key}-label">
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
                    </div>
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
                {#if why}<p class="setting-why" id="set-{key}-why" data-intent="bad">{why}</p>{/if}
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
          <p class="setting-said" role="status" data-intent={fix && !besideField ? 'bad' : undefined}>{fix && !besideField ? fix : ''}</p>
        </form>
      </Section>
      {#if HOME_CURRENCY_SETTING in settings.config}
        <Section title={copy.ratesHeading}>
          <RatesForm home={typeof settings.values[HOME_CURRENCY_SETTING] === 'string' ? String(settings.values[HOME_CURRENCY_SETTING]) : ''} />
        </Section>
      {/if}
    {:else}
      <!-- A PAGE THAT WAS ONE SENTENCE. An add-on with no settings still adds things, and this is
           where somebody comes to find out what they were. -->
      <Empty kind="no-data-yet" glyph="settings" title={copy.packNothingToSet} body={copy.packNothingToSetWhy} />
    {/if}
    {#if pack && (pack.registers.length || pack.pages.length)}
      <Section title={copy.installDiff} count={pack.registers.length + pack.pages.length}>
        <ul class="ledger ledger-glyph">
          {#each pack.registers as r (r)}
            <li>
              <a class="line" href={at(`/r/${r}`)}>
                <span class="seq"><Icon name="rows" size="s" /></span>
                <span class="line-main"><span class="line-title">{REGISTERS[r]?.name ?? ((page.data.lists ?? []) as { id: string; name: string }[]).find((l) => l.id === r)?.name ?? r}</span></span>
                <span class="line-amount"></span>
                <span class="line-when"></span>
              </a>
            </li>
          {/each}
          {#each pack.pages as p (p)}
            <li>
              <a class="line" href={at(`/p/${p}`)}>
                <span class="seq"><Icon name="doc" size="s" /></span>
                <span class="line-main"><span class="line-title">{PAGES[p]?.title ?? p}</span></span>
                <span class="line-amount"></span>
                <span class="line-when"></span>
              </a>
            </li>
          {/each}
        </ul>
      </Section>
    {/if}
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: 820px;
  }

  .blurb {
    max-inline-size: 62ch;
    color: var(--ink2);
    font-size: var(--t-ui);
    line-height: 1.6;
  }

  .settings {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .when {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* The label in a column of its own, so a form of seven reads down one edge. */
  .setting {
    display: grid;
    grid-template-columns: minmax(12ch, 18ch) minmax(0, 1fr);
    align-items: center;
    gap: var(--sp-1) var(--sp-4);
  }

  .setting-label {
    color: var(--ink2);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  .setting-control {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .setting-field {
    flex: 1 1 16ch;
    max-inline-size: 40ch;
  }

  .setting-number {
    flex: 0 1 12ch;
  }

  /* A LIST'S LINES STACK, each box beside its Remove, and the label sits level with the first line. */
  .setting:has(.setting-lines) {
    align-items: start;
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
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  .setting-select {
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  .setting-note,
  .setting-why {
    grid-column: 2;
    margin: 0;
    font-size: var(--t-sm);
  }

  .setting-note {
    color: var(--dim);
  }

  .setting-said {
    margin: 0;
    font-size: var(--t-ui);
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

  /* A SWITCH, AND ITS TARGET IS THE CONTROL'S HEIGHT ON BOTH AXES: 44px on a coarse pointer. */
  /* The switch is the shared one in `controls.css`. */

  @media (width < 640px) {
    .setting {
      grid-template-columns: minmax(0, 1fr);
    }

    .setting-note,
    .setting-why {
      grid-column: 1;
    }
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }
</style>
