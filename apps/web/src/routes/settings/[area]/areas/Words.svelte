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
  import Tile from '$lib/ui/Tile.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { at } from '$lib/at.ts';
  import { homeCurrency } from '$lib/record/api.ts';
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
    listed,
    moneyOn,
    oneFor,
    strandedBy,
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
    /* THE LISTS TILE IS "Your lists" (SPEC agents F4): this is the page where lists are named, so it says the word the
       rail's "Your things" keeps out of everywhere else. */
    lists: 'Your lists',
    money: 'Money',
    currency: 'Home currency',
    currencyWhy: 'Sums in other currencies are added up in this one, where there is a rate.',
    noMoney: 'Turn on Money in Add-ons to choose one.',
    /* MONEY IS ON AND KEEPS NO CURRENCY SETTING (the seed's): the currency its sums are in, said as what it is. */
    kept: (code: string) => `Your money is kept in ${code}.`,
    renameWith: 'A use case lets you rename them.',
    browse: 'Browse use cases',
    currencyNow: (code: string) => (code ? `Home currency is now ${code}.` : 'No home currency now.'),
    called: 'Called',
    /* NO "a" OR "an" BEFORE A WORD NOBODY HAS TYPED YET: "One is a update" and "One is a item" were on this screen. */
    one: 'One is called',
    says: 'What it says',
    whose: (name: string) => `The words your ${name} setup gave this record. Clear a box to put its word back.`,
    ownerOnly: (name: string) => `The words your ${name} setup gave this record. Only the owner changes them.`,
    more: (n: number) => (n === 1 ? 'Show 1 more line' : `Show ${n} more lines`),
    fewer: 'Show fewer',
    save: 'Save',
    saved: 'Saved. Every screen uses your words now.',
    oneOf: (one: string) => `One is called ${one}`,
    /* SAID BEFORE THE CURRENCY MOVES, with the limits typed in the old one, by their own names. The record holds them in
       the new one at the day's rate (`declare.ts` `liveTarget`), and with no home currency it has nothing to hold them in. */
    stranded: (names: readonly string[], from: string, to: string) => {
      const one = names.length === 1;
      return to
        ? `${one ? 'A limit' : 'Limits'} set in ${from} will be counted in ${to} at the day's rate, where there is one: ${listed(names)}.`
        : `With no home currency, ${one ? 'this limit stops' : 'these limits stop'} counting: ${listed(names)}.`;
    },
    change: (to: string) => (to ? `Change to ${to}` : 'Choose none'),
    keep: (code: string) => `Keep ${code}`,
  } as const;

  /* ── reading ───────────────────────────────────────────────────────────── */

  let source: Source | null = null;
  let from = $state<'waiting' | 'ready' | 'refused'>('waiting');
  let refusal = $state<string | null>(null);
  /** The pack that keeps the home currency, and the use case the record speaks in; either may be none. */
  let money = $state<PackConfig | null>(null);
  let voice = $state<PackConfig | null>(null);
  /** Every add-on switched on, with its settings: where the limits a currency change would strand are read. */
  let packs = $state<Read[]>([]);

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
    packs = read;
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
  /** A money add-on is on, whether or not it keeps a currency setting of its own. */
  const on = $derived(moneyOn(packs));
  /** What the money is in where no add-on keeps the code: the record's own read of its money (`api.ts`). */
  const keptIn = $derived(code || homeCurrency() || '');
  /* THE ORDER IS THE SAVED CODE'S, as on the add-on's page: handed the draft, every pick moved itself to the front. */
  const choices = $derived(currencyChoices(code));
  let busy = $state(false);
  let fix = $state('');

  /**
   * A PICK THAT MOVES A LIMIT TYPED AS MONEY WAITS, and says which. The select shows the pick, the line under it names
   * each limit typed in the old currency and what becomes of it, and the change is made only once it is confirmed; Keep
   * puts the select back. A pick that moves no limit is made at once, as before.
   */
  let asking = $state<{ to: string; names: string[] } | null>(null);
  let picker: HTMLSelectElement | undefined = $state();

  function pickCurrency(next: string): void {
    /* BACK TO THE ONE IT IS, while a pick waited: nothing to change. */
    if (next === code) {
      asking = null;
      return;
    }
    const names = strandedBy(packs, code, next);
    if (names.length === 0) {
      asking = null;
      void putCurrency(next, false, picker);
      return;
    }
    asking = { to: next, names };
  }

  function keepCurrency(): void {
    if (picker) picker.value = code;
    asking = null;
  }

  function confirmCurrency(): void {
    const to = asking?.to;
    asking = null;
    if (to !== undefined) void putCurrency(to, false, picker);
  }

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
    packs = packs.map((p) => (p.settings?.id === out.value.id ? { ...p, settings: out.value } : p));
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
    if (!one || oneTyped[list] || text.trim() === '') return;
    /* A NAME WHOSE ENDING DOES NOT SAY ITS SINGULAR OFFERS NONE, and the box goes back to the word it held. */
    const offered = oneFor(text);
    if (offered === null) delete typed[one.setting];
    else typed[one.setting] = offered;
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
  <Tile icon="money" title={words.money}>
    {#if money && owner}
      <div class="pick">
        <IconWell name="money" />
        <label class="pick-label" for="w-currency">{words.currency}</label>
        <select id="w-currency" bind:this={picker} value={code} disabled={busy} aria-describedby={asking ? 'w-stranded' : undefined} onchange={(e) => pickCurrency(e.currentTarget.value)}>
          <option value="">{copy.currencyNone}</option>
          <optgroup label={copy.currencyCommon}>{#each choices.common as c (c)}<option value={c}>{c}</option>{/each}</optgroup>
          <optgroup label={copy.currencyAll}>{#each choices.other as c (c)}<option value={c}>{c}</option>{/each}</optgroup>
        </select>
      </div>
      {#if asking}
        <div class="stranded" id="w-stranded">
          <p class="stranded-line">{words.stranded(asking.names, code, asking.to)}</p>
          <div class="stranded-acts">
            <Button weight="primary" onclick={confirmCurrency}>{words.change(asking.to)}</Button>
            <Button weight="bare" onclick={keepCurrency}>{words.keep(code || copy.currencyNone)}</Button>
          </div>
        </div>
      {:else}
        <p class="hint">{words.currencyWhy}</p>
      {/if}
    {:else}
      <StateRow icon="money" title={words.currency} line={money ? code || copy.currencyNone : !on ? words.noMoney : keptIn ? words.kept(keptIn) : copy.currencyNone} />
    {/if}
  </Tile>

  {#if spoken && voice && all.length > 0}
    <p class="hint">{owner ? words.whose(voiceName) : words.ownerOnly(voiceName)}</p>

    {#if owner}
      <form class="words" bind:this={form} onsubmit={submit} novalidate>
        {#if spoken.lists.length > 0}
          <Tile icon="rows" title={words.lists} count={spoken.lists.length}>
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
          </Tile>
        {/if}

        {#if spoken.tabs.length + spoken.lines.length > 0}
          <Tile icon="tag" title={words.says}>
            <div class="lines">
              {#each spoken.tabs as w (w.setting)}{@render field(w, TAB_MOST)}{/each}
              {#each shown as w (w.setting)}{@render field(w, undefined)}{/each}
            </div>
            {#if spoken.lines.length > 0}
              <div class="fold">
                <Button weight="bare" onclick={() => (unfolded = !unfolded)}>{unfolded ? words.fewer : words.more(spoken.lines.length)}</Button>
              </div>
            {/if}
          </Tile>
        {/if}

        <div class="save">
          <Button weight="primary" type="submit" disabled={!dirty || busy} aria-busy={busy}>{words.save}</Button>
        </div>
      </form>
    {:else}
      {#if spoken.lists.length > 0}
        <Tile icon="rows" title={words.lists} count={spoken.lists.length}>
          {#each spoken.lists as l (l.list)}
            <StateRow icon={iconOf(l.list)} title={l.name?.value ?? nameOf(l.list)} line={l.one ? words.oneOf(l.one.value) : undefined} />
          {/each}
        </Tile>
      {/if}
      {#if spoken.tabs.length + spoken.lines.length > 0}
        <Tile icon="tag" title={words.says}>
          <dl class="said">
            {#each spoken.tabs as w (w.setting)}{@render held(w)}{/each}
            {#each shown as w (w.setting)}{@render held(w)}{/each}
          </dl>
          {#if spoken.lines.length > 0}
            <div class="fold">
              <Button weight="bare" onclick={() => (unfolded = !unfolded)}>{unfolded ? words.fewer : words.more(spoken.lines.length)}</Button>
            </div>
          {/if}
        </Tile>
      {/if}
    {/if}
  {/if}

  <!-- THE LISTS ARE ALWAYS DRAWN (agents F4): with no use case speaking they are read-only names, and one line says what
       would let them be renamed. The area is never one row. -->
  {#if !(spoken && voice && all.length > 0) && shell.index.registers.length > 0}
    <Tile icon="rows" title={words.lists} count={shell.index.registers.length}>
      <ul class="list-lines">
        {#each shell.index.registers as r (r.id)}
          <li><Icon name={r.icon} size="s" /><span dir="auto">{r.name}</span></li>
        {/each}
      </ul>
      <p class="hint">{words.renameWith} <a class="link" href={at('/packs/browse')}>{words.browse}</a></p>
    </Tile>
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
    font-size: var(--fs-body);
    font-weight: 500;
  }

  .hint {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  .pick + .hint,
  .pick + .stranded {
    padding-inline-start: calc(var(--well) + var(--sp-3));
  }

  /* WHAT A CURRENCY CHANGE DOES TO THE LIMITS, under the select it waits on: one sentence and its two answers, no box. */
  .stranded {
    display: grid;
    gap: var(--sp-3);
    max-inline-size: calc(var(--measure) + var(--sp-9));
  }

  .stranded-line {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .stranded-acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
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

  /* A LIST'S TWO WORDS SIDE BY SIDE after its well, read as one line: "Called Bakes, one is called bake". */
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
    font-size: var(--fs-body);
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
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .said-line dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
  }

  /* THE LISTS AS NAMES, a column of them at 390 and as many as fit at 1512, each its glyph and its name. */
  .list-lines {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--sp-1) var(--sp-4);
    margin: 0 0 var(--sp-3);
    padding: 0;
    list-style: none;
  }

  .list-lines li {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 32px;
    min-inline-size: 0;
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .list-lines li > :global(.icon) {
    flex: none;
    color: var(--ink-2);
  }

  .list-lines li > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .link {
    color: var(--red);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .refused {
    display: flex;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
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
