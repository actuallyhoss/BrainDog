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
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { PACKS, PAGES, REGISTERS, pages } from '$lib/record/api.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import {
    UNITS,
    changesOf,
    currencyOf,
    draftOf,
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

  const id = $derived(String(page.params.id));
  const pack = $derived(PACKS.find((p) => p.id === id));
  const name = $derived(pack?.name ?? id);

  let from = $state<'reading' | 'ready' | 'refused'>('reading');
  let refusal = $state('');
  let settings = $state<PackConfig | null>(null);
  let drafts = $state<Record<string, Draft>>({});
  let source: Source | null = null;

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
    for (const k of keys) if (s.config[k]) next[k] = draftOf(s.config[k], s.values[k]);
    drafts = next;
  }

  async function load(want: string) {
    from = 'reading';
    fix = '';
    fixAt = null;
    signin = false;
    drafts = {};
    const at = opened();
    const chosen = await openSettings(createClient({ base: location.origin }), want, !page.data.live);
    /* An answer for an add-on somebody has already navigated away from draws nothing. */
    if (String(page.params.id) !== want) return closed(true, at);
    source = chosen.source;
    if (chosen.first.ok) {
      show(chosen.first.value);
      from = 'ready';
    } else {
      refusal = chosen.first.refusal.fix;
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
  const pending = $derived(settings ? changesOf(settings, drafts) : { values: {}, wrong: {} as Record<string, string> });
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
    /* THE DEMO SAYS NOTHING WAS SAVED, in the sentence every unwritten action in the product uses. */
    if (source.sample) toasts.push(out.value.said, { intent: 'warn' });
    else toasts.push(words.saved(names), { intent: 'good' });
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
    <Empty kind="error" heading title={refusal}>
      {#snippet actions()}<Button href="/packs">{copy.packs}</Button>{/snippet}
    </Empty>
  </div>
{:else if from === 'ready' && settings}
  <PageHead icon="packs" kicker={copy.packs} title={name} />

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
            {#if d}
              <div class="setting">
                {#if decl.type === 'bool' || segmented}
                  <span class="setting-label" id="set-{key}-label">{label}</span>
                {:else}
                  <label class="setting-label" for="set-{key}">{label}</label>
                {/if}

                <div class="setting-control">
                  {#if decl.type === 'bool'}
                    <button
                      type="button"
                      class="switch"
                      role="switch"
                      id="set-{key}"
                      aria-checked={d.on ? 'true' : 'false'}
                      aria-labelledby="set-{key}-label"
                      onclick={() => (d.on = !d.on)}
                    ><span class="switch-track"></span></button>
                  {:else if segmented}
                    {@const values = decl.values ?? []}
                    <div class="segmented" role="radiogroup" aria-labelledby="set-{key}-label">
                      {#each values as v, i (v)}
                        <button
                          type="button"
                          class="segment"
                          role="radio"
                          tabindex={d.text === v || (i === 0 && !values.includes(d.text)) ? 0 : -1}
                          data-on={d.text === v ? '' : undefined}
                          aria-checked={d.text === v ? 'true' : 'false'}
                          onclick={() => (d.text = v)}
                          onkeydown={(e) => step(e, values, i, d)}
                        >{v.replace(/_/g, ' ')}</button>
                      {/each}
                    </div>
                  {:else if decl.type === 'enum'}
                    <select class="setting-select" id="set-{key}" value={d.text} onchange={(e) => (d.text = typed(e))}>
                      {#each decl.values ?? [] as v (v)}<option value={v}>{v.replace(/_/g, ' ')}</option>{/each}
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
              <a class="line" href="/r/{r}">
                <span class="seq"><Icon name="rows" size="s" /></span>
                <span class="line-main"><span class="line-title">{REGISTERS[r]?.name ?? r}</span></span>
                <span class="line-amount"></span>
                <span class="line-when"></span>
              </a>
            </li>
          {/each}
          {#each pack.pages as p (p)}
            <li>
              <a class="line" href="/p/{p}">
                <span class="seq"><Icon name="doc" size="s" /></span>
                <span class="line-main"><span class="line-title">{pages()[p]?.title ?? PAGES[p]?.title ?? p}</span></span>
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
