<!--
  Settings > Words and money: the record's home currency, what each list is called and what one of it is called, and
  the lines the record says in place of the house voice.

  THE TRIP TO THE ADD-ON FORM, MADE A PLACE (`research-customise-35.md` gap 4). All of this was only reachable at
  `/packs/usecase-<id>`, a form generated from the pack's settings with titles like "Label: one of tickets", and the
  currency at Money's own add-on page. It is the same settings, read with the same `packConfig` and written with the
  same `setPackConfig` (`record/packs.ts` `live`), sorted into what a person reads on every screen. `words-money.ts`
  says which setting is which.

  TAILORED: only what the record speaks is drawn. A record with no use case speaking has no words of its own to change,
  so it shows its currency and nothing else, and a list the use case gives no word for has no box (the record would
  refuse it). Of the lines, the four that name the tabs are drawn and the rest wait behind one fold.

  A CHANGE IS SEEN AT ONCE. After a save the shell is asked again (`forget` and `invalidateAll`), which reads the voice
  and the labels again (`voice.svelte.ts` `listen`) and the record's currency (`Boot.record.currency`), so the rail,
  the list's heading, Today's headings and every sum on Money redraw without a visit to the add-on. Each save toasts
  Undo, which sends what was held before.

  AN OWNER CHANGES THEM; everybody else reads them. A setting is the record's, for everyone, and `setPackConfig` is
  the owner's call, so a member sees each value and no control.
-->
<script lang="ts">
  import { covered } from '$lib/a11y/keys.svelte.ts';
  import { untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { live, type PackConfig, type Source } from '$lib/record/packs.ts';
  import { currencyChoices } from '$lib/record/currencies.ts';
  import { forget } from '$lib/record/boot-live.ts';
  import { speaking, withSpeaks } from '$lib/voice.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import type { IconName } from '$lib/ui/icons.ts';
  import { moduleName } from '@braindog/seed/usecases/names';
  import { TONES } from 'braindog-render';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import { ownsRecord } from '../../levels.ts';
  import type { AreaProps } from '../settings-state.svelte.ts';
  import {
    HOME_CURRENCY,
    TAB_MOST,
    changesOf,
    currencyIn,
    currencyPackOf,
    oneFor,
    undoOf,
    wordsOf,
    type Read,
    type Word,
  } from '../words-money.ts';
  import StateRow from './StateRow.svelte';

  let props: AreaProps = $props();
  const shell = $derived(props.shell);
  const owner = $derived(ownsRecord(shell.me));

  /* THIS AREA'S OWN WORDS. They name the person's things: their currency, their lists, what the record says. */
  const words = {
    money: 'Money',
    currency: 'Home currency',
    currencyWhy: 'Sums in other currencies are added up in this one, where there is a rate.',
    noMoney: 'Turn on Money in Add-ons to choose one.',
    currencyNow: (code: string) => (code ? `Home currency is now ${code}.` : 'No home currency now.'),
    lists: 'Your lists',
    called: 'Called',
    one: 'One is a',
    says: 'What it says',
    whose: (name: string) => `The words your ${name} setup gave this record. Clear a box to put its word back.`,
    ownerOnly: (name: string) => `The words your ${name} setup gave this record. Only the owner changes them.`,
    more: (n: number) => (n === 1 ? 'Show 1 more line' : `Show ${n} more lines`),
    fewer: 'Show fewer',
    save: 'Save',
    saved: 'Saved. Every screen uses your words now.',
    oneOf: (one: string) => `One is a ${one}`,
  } as const;

  /* ── reading ───────────────────────────────────────────────────────────── */

  let source: Source | null = null;
  let from = $state<'waiting' | 'ready' | 'refused'>('waiting');
  let refusal = $state<string | null>(null);
  /** The pack that keeps the home currency, and the use case the record speaks in; either may be none. */
  let money = $state<PackConfig | null>(null);
  let voice = $state<PackConfig | null>(null);

  async function load(): Promise<void> {
    from = 'waiting';
    const at = opened();
    source = live((await import('@braindog/client')).createClient({ base: apiBase() }));
    const held = await source.packs();
    if (!held.ok) {
      closed(false, at);
      refusal = held.refusal.fix;
      from = 'refused';
      return;
    }
    const s = source;
    const read: Read[] = await Promise.all(
      held.value
        .filter((p) => p.disabled_at === null)
        .map(async (state) => {
          const c = await s.config(state.id);
          return { state, settings: c.ok ? c.value : null };
        }),
    );
    /* THE SAME RULE THE SHELL HEARS THE VOICE BY, so the words here are the ones the rail draws. */
    const speaker = speaking(await withSpeaks(held.value, async (id) => read.find((r) => r.state.id === id)?.settings?.values ?? null));
    closed(true, at);
    money = currencyPackOf(read);
    voice = read.find((r) => r.state.id === speaker)?.settings ?? null;
    typed = {};
    oneTyped = {};
    from = 'ready';
  }

  /* ASKED ONCE FOR THIS VISIT: a save asks the shell again, and a new shell is not a reason to read the packs again,
     since the save already answered with what they hold. */
  let asked = false;
  $effect(() => {
    if (asked) return;
    /* A SHELL WHOSE RECORD REFUSED `boot` ASKS NOTHING, and says so as every area does. */
    if (shell.refused) {
      from = 'refused';
      return;
    }
    asked = true;
    untrack(() => void load());
  });

  /** The shell asked again, so every screen draws what was just kept. */
  async function kept(): Promise<void> {
    forget();
    await invalidateAll();
  }

  /* ── the currency ──────────────────────────────────────────────────────── */

  const code = $derived(currencyIn(money));
  /* THE ORDER IS THE SAVED CODE'S, as on the add-on's page: handed the draft, every pick moved itself to the front. */
  const choices = $derived(currencyChoices(code));
  let busy = $state(false);
  let fix = $state('');

  /** A select is chosen, not typed, so a pick is the change: kept at once, with Undo. */
  async function putCurrency(next: string, undoing = false, select?: HTMLSelectElement): Promise<void> {
    const s = source;
    const pack = money;
    if (!s || !pack || busy) return;
    const was = code;
    busy = true;
    fix = '';
    const at = opened();
    const out = await s.setConfig(pack.id, { [HOME_CURRENCY]: next === '' ? null : next });
    closed(true, at);
    busy = false;
    if (!out.ok) {
      /* A REFUSED PICK GOES BACK: `value` is one-way, and nothing changed for it to redraw from. */
      if (select) select.value = was;
      fix = out.refusal.fix;
      return;
    }
    money = out.value;
    if (!undoing) toasts.push(words.currencyNow(next), { undo: () => void putCurrency(was, true) });
    await kept();
  }

  /* ── the words ─────────────────────────────────────────────────────────── */

  const spoken = $derived(voice ? wordsOf(voice) : null);
  const voiceName = $derived(voice ? moduleName(voice.id) : '');
  const all = $derived(spoken ? [...spoken.lists.flatMap((l) => [l.name, l.one].filter((w): w is Word => w !== null)), ...spoken.tabs, ...spoken.lines] : []);
  /** What each box holds while somebody edits it, by setting; a box nobody touched reads the saved word. */
  let typed = $state<Record<string, string>>({});
  /** The lists whose singular was typed by hand, so renaming the list no longer offers one. */
  let oneTyped = $state<Record<string, true>>({});
  let unfolded = $state(false);
  const pending = $derived(changesOf(all, typed));
  const dirty = $derived(Object.keys(pending).length > 0);

  const valueIn = (w: Word): string => typed[w.setting] ?? w.value;
  const iconOf = (list: string): IconName => shell.index.registers.find((r) => r.id === list)?.icon ?? 'rows';
  const nameOf = (list: string): string => shell.index.registers.find((r) => r.id === list)?.name ?? list;
  const typedIn = (e: Event): string => (e.currentTarget as HTMLInputElement).value;

  /* RENAMING A LIST OFFERS ITS SINGULAR, until one is typed by hand: "Bakes" with "task" under it is two words for one list. */
  function rename(list: string, name: Word, one: Word | null, text: string): void {
    typed[name.setting] = text;
    if (one && !oneTyped[list] && text.trim() !== '') typed[one.setting] = oneFor(text);
  }

  async function sendWords(values: Record<string, string | null>, undoing = false): Promise<void> {
    const s = source;
    const pack = voice;
    if (!s || !pack || busy || Object.keys(values).length === 0) return;
    const before = all;
    busy = true;
    fix = '';
    const at = opened();
    const out = await s.setConfig(pack.id, values);
    closed(true, at);
    busy = false;
    if (!out.ok) {
      fix = out.refusal.fix;
      return;
    }
    voice = out.value;
    typed = {};
    oneTyped = {};
    if (!undoing && out.value.changed.length > 0) {
      const back = undoOf(before, values);
      toasts.push(words.saved, { intent: 'good', undo: () => void sendWords(back, true) });
    }
    await kept();
  }

  function submit(e?: Event): void {
    e?.preventDefault();
    if (dirty) void sendWords({ ...pending });
  }

  let form: HTMLFormElement | undefined = $state();
  /* ⌘↵ SENDS THE WORDS, only from inside their fields and never while something is open over the page. */
  function onkeydown(e: KeyboardEvent): void {
    if (covered()) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && e.target instanceof Node && form?.contains(e.target)) submit(e);
  }

  const shown = $derived(spoken ? (unfolded ? spoken.lines : []) : []);
</script>

<svelte:window {onkeydown} />

{#snippet field(w: Word, most: number | undefined)}
  <div class="field-row">
    <label class="field-row-label" for="w-{w.setting}">{w.title}</label>
    <div class="field">
      <input
        class="field-input"
        id="w-{w.setting}"
        type="text"
        value={valueIn(w)}
        placeholder={w.fallback}
        maxlength={most}
        disabled={busy}
        oninput={(e) => (typed[w.setting] = typedIn(e))}
      />
    </div>
  </div>
{/snippet}

{#snippet held(w: Word)}
  <div class="said-line"><dt>{w.title}</dt><dd dir="auto">{w.value}</dd></div>
{/snippet}

{#if from === 'waiting' || from === 'refused'}
  <ReadState state={from} {refusal} onretry={() => void load()} />
{:else}
  <Section title={words.money}>
    {#if money && owner}
      <div class="pick">
        <IconWell name="money" />
        <label class="pick-label" for="w-currency">{words.currency}</label>
        <select id="w-currency" value={code} disabled={busy} onchange={(e) => void putCurrency(e.currentTarget.value, false, e.currentTarget)}>
          <option value="">{copy.currencyNone}</option>
          <optgroup label={copy.currencyCommon}>{#each choices.common as c (c)}<option value={c}>{c}</option>{/each}</optgroup>
          <optgroup label={copy.currencyAll}>{#each choices.other as c (c)}<option value={c}>{c}</option>{/each}</optgroup>
        </select>
      </div>
      <p class="hint">{words.currencyWhy}</p>
    {:else}
      <StateRow icon="money" title={words.currency} line={money || !owner ? code || copy.currencyNone : words.noMoney} />
    {/if}
  </Section>

  {#if spoken && voice && all.length > 0}
    <p class="hint">{owner ? words.whose(voiceName) : words.ownerOnly(voiceName)}</p>

    {#if owner}
      <form class="words" bind:this={form} onsubmit={submit} novalidate>
        {#if spoken.lists.length > 0}
          <Section title={words.lists} count={spoken.lists.length}>
            <div class="lists">
              {#each spoken.lists as l (l.list)}
                <div class="list-words">
                  <IconWell name={iconOf(l.list)} />
                  {#if l.name}
                    {@const name = l.name}
                    <div class="field-row">
                      <label class="field-row-label" for="w-{name.setting}">{words.called}</label>
                      <div class="field">
                        <input
                          class="field-input"
                          id="w-{name.setting}"
                          type="text"
                          value={valueIn(name)}
                          placeholder={name.fallback}
                          disabled={busy}
                          oninput={(e) => rename(l.list, name, l.one, typedIn(e))}
                        />
                      </div>
                    </div>
                  {:else}
                    <!-- A LIST THE USE CASE GIVES ONLY A SINGULAR STILL SAYS WHICH LIST IT IS. -->
                    <span class="list-name">{nameOf(l.list)}</span>
                  {/if}
                  {#if l.one}
                    {@const one = l.one}
                    <div class="field-row">
                      <label class="field-row-label" for="w-{one.setting}">{words.one}</label>
                      <div class="field">
                        <input
                          class="field-input"
                          id="w-{one.setting}"
                          type="text"
                          value={valueIn(one)}
                          placeholder={one.fallback}
                          disabled={busy}
                          oninput={(e) => {
                            typed[one.setting] = typedIn(e);
                            oneTyped[l.list] = true;
                          }}
                        />
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </Section>
        {/if}

        {#if spoken.tabs.length + spoken.lines.length > 0}
          <Section title={words.says}>
            <div class="lines">
              {#each spoken.tabs as w (w.setting)}{@render field(w, TAB_MOST)}{/each}
              {#each shown as w (w.setting)}{@render field(w, undefined)}{/each}
            </div>
            {#if spoken.lines.length > 0}
              <div class="fold">
                <Button weight="bare" onclick={() => (unfolded = !unfolded)}>{unfolded ? words.fewer : words.more(spoken.lines.length)}</Button>
              </div>
            {/if}
          </Section>
        {/if}

        <div class="save">
          <Button weight="primary" type="submit" disabled={!dirty || busy} aria-busy={busy}>{words.save}</Button>
        </div>
      </form>
    {:else}
      {#if spoken.lists.length > 0}
        <Section title={words.lists} count={spoken.lists.length}>
          {#each spoken.lists as l (l.list)}
            <StateRow icon={iconOf(l.list)} title={l.name?.value ?? nameOf(l.list)} line={l.one ? words.oneOf(l.one.value) : undefined} />
          {/each}
        </Section>
      {/if}
      {#if spoken.tabs.length + spoken.lines.length > 0}
        <Section title={words.says}>
          <dl class="said">
            {#each spoken.tabs as w (w.setting)}{@render held(w)}{/each}
            {#each shown as w (w.setting)}{@render held(w)}{/each}
          </dl>
          {#if spoken.lines.length > 0}
            <div class="fold">
              <Button weight="bare" onclick={() => (unfolded = !unfolded)}>{unfolded ? words.fewer : words.more(spoken.lines.length)}</Button>
            </div>
          {/if}
        </Section>
      {/if}
    {/if}
  {/if}

  <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. -->
  <p class="refused" role="status">{#if fix}<span class="glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {fix}{/if}</p>
{/if}

<style>
  /* THE CURRENCY, AS ONE ROW: its well, its name, and its select at the row's end, where every settings control sits. */
  .pick {
    display: grid;
    grid-template-columns: var(--well) minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    max-inline-size: calc(var(--measure) + var(--sp-9));
  }

  .pick-label {
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 500;
  }

  .hint {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .pick + .hint {
    padding-inline-start: calc(var(--well) + var(--sp-3));
  }

  .words {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .lists,
  .lines {
    display: grid;
    gap: var(--sp-4);
    max-inline-size: calc(var(--measure) + var(--sp-9));
  }

  /* A LIST'S TWO WORDS SIDE BY SIDE after its well, read as one line: "Called Bakes, one is a bake". */
  .list-words {
    display: grid;
    grid-template-columns: var(--well) repeat(2, minmax(0, 1fr));
    align-items: end;
    column-gap: var(--sp-3);
  }

  .list-name {
    display: flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 500;
  }

  .list-words > :global(.well) {
    margin-block-end: calc((var(--ctl-h) - var(--well)) / 2);
  }

  .fold {
    margin-block-start: var(--sp-2);
  }

  .save {
    display: flex;
  }

  .said {
    display: grid;
    margin: 0;
    max-inline-size: calc(var(--measure) + var(--sp-9));
  }

  .said-line {
    display: grid;
    gap: 2px;
    padding-block: var(--sp-2);
  }

  .said-line dt {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .said-line dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
  }

  .refused {
    display: flex;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .refused:empty {
    display: none;
  }

  /* ON A PHONE A LIST'S SECOND WORD GOES UNDER ITS FIRST, both starting where the well ends. */
  @media (width < 520px) {
    .list-words {
      grid-template-columns: var(--well) minmax(0, 1fr);
      row-gap: var(--sp-2);
    }

    .list-words > :global(.field-row + .field-row),
    .list-words > .list-name + :global(.field-row) {
      grid-column: 2;
    }

    .pick {
      grid-template-columns: var(--well) minmax(0, 1fr);
      row-gap: var(--sp-2);
    }

    .pick > select {
      grid-column: 2;
    }
  }
</style>
