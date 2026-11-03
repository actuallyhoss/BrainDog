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
  the list's heading, Today's headings and every sum on Money redraw without a visit to the add-on. Words save as they
  are typed and say Saved, with Undo; a currency change toasts its Undo.

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
  import { currencyLabel, currencyOptions } from '$lib/record/currencies.ts';
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
  import { listNameOf, othersOf, renameList } from '$lib/record/list-name.ts';
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
  import TimeZone from './TimeZone.svelte';

  let props: AreaProps = $props();
  const shell = $derived(props.shell);
  const owner = $derived(ownsRecord(shell.me));

  /* THIS AREA'S OWN WORDS. They name the person's things: their currency, their lists, what the record says. */
  /** "British pound, £" for GBP, as a person says it (P43, audit 2 B3); the code where Intl cannot. */
  const currencySaid = (code: string): string => currencyLabel(code);

  const words = {
    /* THE LISTS TILE IS "Your lists" (SPEC agents F4): this is the page where lists are named, so it says the word the
       rail's "Your things" keeps out of everywhere else. */
    lists: 'Your lists',
    listsHint: 'Clear a name to put the original back.',
    /* NOT THE PAGE'S NAME AGAIN (G13): the bar already says Time and money. */
    money: 'Currency and time zone',
    allLists: (n: number) => `Show all ${n}`,
    currency: 'Home currency',
    currencyWhy: 'Other currencies add up in this one, at the day’s rate.',
    noMoney: 'Turn on Money in Add-ons first.',
    /* MONEY IS ON AND KEEPS NO CURRENCY SETTING (the seed's): the currency its sums are in, said as what it is. */
    kept: (code: string) => currencySaid(code),
    renameWith: 'Rename them with a starter.',
    browse: 'Browse starters',
    currencyNow: (code: string) => (code ? `Home currency is now ${currencySaid(code)}.` : 'No home currency now.'),
    called: 'Called',
    /* EACH BOX NAMES ITS LIST TO A SCREEN READER (domains lane, 2 Nov): all twenty-two said "Called", and the list each
       renames was only its placeholder, which a filled box does not read. */
    calledFor: (list: string) => `What ${list} is called`,
    oneFor: (list: string) => `What one of ${list} is called`,
    /* NO "a" OR "an" BEFORE A WORD NOBODY HAS TYPED YET: "One is a update" and "One is a item" were on this screen. */
    one: 'One is called',
    says: 'What it says',
    whose: (name: string) => `From your ${name} starter. Clear a box to put its word back.`,
    from: (name: string) => `From your ${name} starter.`,
    ownerOnly: (name: string) => `From your ${name} starter. Only the owner changes them.`,
    more: (n: number) => (n === 1 ? 'Show 1 more line' : `Show ${n} more lines`),
    fewer: 'Show fewer',
    saved: 'Saved',
    sending: 'Keeping your words',
    oneOf: (one: string) => `One is called ${one}`,
    /* SAID BEFORE THE CURRENCY MOVES, with the limits typed in the old one, by their own names. The record holds them in
       the new one at the day's rate (`declare.ts` `liveTarget`), and with no home currency it has nothing to hold them in. */
    stranded: (names: readonly string[], from: string, to: string) => {
      const one = names.length === 1;
      return to
        ? `${one ? 'A limit' : 'Limits'} set in ${currencySaid(from)} will be counted in ${currencySaid(to)} at the day's rate, where there is one: ${listed(names)}.`
        : `With no home currency, ${one ? 'this limit stops' : 'these limits stop'} counting: ${listed(names)}.`;
    },
    change: (to: string) => (to ? `Change to ${currencySaid(to)}` : 'Choose none'),
    renamed: (was: string, now: string) => `${was} is called ${now} now.`,
    renameFiled: (now: string) => `The new name ${now} is waiting in Needs you.`,
    keep: (code: string) => `Keep ${code ? currencySaid(code) : copy.currencyNone}`,
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
  /* READ FROM THE SHELL, which a save asks again, so an Undo back to none draws the money the record is in once more. */
  const keptIn = $derived(code || shell.index.currency || homeCurrency() || '');
  /**
   * WHAT THE PICKER SHOWS AS CHOSEN: the code the add-on keeps, else the one the record's money is in (audit 2 B3). The
   * seed keeps no code and every screen is in pounds, and the picker said "None chosen" over them. Picking that same one
   * is no change, so the select starts on it and nothing is written until a different one is picked.
   */
  const heldIn = $derived(code || keptIn);
  /* NONE IS OFFERED ONLY WHERE IT MEANS SOMETHING: a code is kept and could be cleared, or the record reads none. */
  const offersNone = $derived(code !== '' || heldIn === '');
  /* THE ORDER IS THE SAVED CODE'S, as on the add-on's page: handed the draft, every pick moved itself to the front. */
  const choices = $derived(currencyOptions(heldIn));
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
    if (next === heldIn) {
      asking = null;
      return;
    }
    const names = strandedBy(packs, heldIn, next);
    if (names.length === 0) {
      asking = null;
      void putCurrency(next, false, picker);
      return;
    }
    asking = { to: next, names };
  }

  function keepCurrency(): void {
    if (picker) picker.value = heldIn;
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
    const showing = heldIn;
    busy = true;
    fix = '';
    const at = opened();
    const out = await s.setConfig(pack.id, { [HOME_CURRENCY]: next === '' ? null : next });
    closed(true, at);
    busy = false;
    if (!out.ok) {
      /* A REFUSED PICK GOES BACK: `value` is one-way, and nothing changed for it to redraw from. */
      if (select) select.value = showing;
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
  /* ON A PHONE THE LISTS FOLD AFTER EIGHT (G12): twenty-three names were 840px of one column. */
  let listsAll = $state(false);
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
    /* WHAT WAS TYPED WHILE IT SAVED STAYS TYPED: only a box whose words went is let go. */
    typed = Object.fromEntries(Object.entries(typed).filter(([k, v]) => !(k in values) || (values[k] ?? '') !== v.trim()));
    if (Object.keys(typed).length === 0) oneTyped = {};
    if (!undoing && out.value.changed.length > 0) {
      const back = undoOf(before, values);
      saveSaid = 'saved';
      undoLast = () => void sendWords(back, true);
    }
    await kept();
    if (dirty) soon();
  }

  /* SAVED AS YOU TYPE: a pause of most of a second sends what changed, and the line under the lists says Saved,
     with Undo for the last save. There is no Save button to forget. */
  let saveSaid = $state<'' | 'pending' | 'saved'>('');
  let undoLast = $state<(() => void) | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  function soon(): void {
    clearTimeout(timer);
    saveSaid = 'pending';
    timer = setTimeout(() => {
      if (dirty) void sendWords({ ...pending });
      else saveSaid = '';
    }, 700);
  }

  function submit(e?: Event): void {
    e?.preventDefault();
    clearTimeout(timer);
    if (dirty) void sendWords({ ...pending });
  }

  let form: HTMLFormElement | undefined = $state();
  /* ⌘↵ SENDS THE WORDS, only from inside their fields and never while something is open over the page. */
  function onkeydown(e: KeyboardEvent): void {
    if (covered()) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && e.target instanceof Node && form?.contains(e.target)) submit(e);
  }

  const shown = $derived(spoken ? (unfolded ? spoken.lines : []) : []);

  /* ── the lists no use case names ───────────────────────────────────────── */

  /* EVERY LIST THE RECORD HOLDS IS HERE: the use case names some, and the rest are renamed by their own name. */
  const others = $derived(spoken ? othersOf(spoken.lists.map((l) => l.list), shell.index.registers) : []);

  /** A list's own name, kept when the box is left: the record's change, accepted at once for the owner. */
  async function renameOther(r: { id: string; name: string }, e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    if (input.value.trim() === r.name) return;
    const asked = listNameOf(shell.index.registers, r.id, input.value);
    if (!asked.ok) {
      fix = asked.fix;
      input.value = r.name;
      return;
    }
    busy = true;
    fix = '';
    const at = opened();
    const out = await renameList(apiBase(), r.id, r.name, asked.name, owner);
    closed(out.from !== 'refused', at);
    busy = false;
    if (out.from === 'refused') {
      fix = out.fix;
      input.value = r.name;
      return;
    }
    toasts.push(out.from === 'filed' ? (out.fix ?? words.renameFiled(asked.name)) : words.renamed(r.name, asked.name));
    await kept();
  }
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
        oninput={(e) => ((typed[w.setting] = typedIn(e)), soon())}
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
        <select id="w-currency" bind:this={picker} value={heldIn} disabled={busy} aria-describedby={asking ? 'w-stranded' : undefined} onchange={(e) => pickCurrency(e.currentTarget.value)}>
          {#if offersNone}<option value="">{copy.currencyNone}</option>{/if}
          <optgroup label={copy.currencyCommon}>{#each choices.common as c (c.code)}<option value={c.code}>{c.label}</option>{/each}</optgroup>
          <optgroup label={copy.currencyAll}>{#each choices.other as c (c.code)}<option value={c.code}>{c.label}</option>{/each}</optgroup>
        </select>
      </div>
      {#if asking}
        <div class="stranded" id="w-stranded">
          <p class="stranded-line">{words.stranded(asking.names, heldIn, asking.to)}</p>
          <div class="stranded-acts">
            <Button weight="primary" onclick={confirmCurrency}>{words.change(asking.to)}</Button>
            <Button weight="bare" onclick={keepCurrency}>{words.keep(heldIn)}</Button>
          </div>
        </div>
      {:else}
        <p class="hint">{words.currencyWhy}</p>
      {/if}
    {:else}
      <StateRow icon="money" title={words.currency} line={money ? (heldIn ? currencySaid(heldIn) : copy.currencyNone) : !on ? words.noMoney : keptIn ? words.kept(keptIn) : copy.currencyNone} />
    {/if}
    <!-- AND THE TIME ZONE UNDER IT, as sign-up asks for the two together ("Time and money", audit 11-01 AP20). -->
    <TimeZone {owner} />
  </Tile>

  {#if spoken && voice && all.length > 0}
    <!-- WHERE THE WORDS CAME FROM IS SAID INSIDE THE FIRST TILE (Q19 of 29 October): between the tiles it floated as a
         stray line. Only a page with no list tile keeps it on its own. -->
    {#if !owner || spoken.lists.length + others.length === 0}
      <p class="hint">{owner ? words.whose(voiceName) : words.ownerOnly(voiceName)}</p>
    {/if}

    {#if owner}
      <form class="words" bind:this={form} onsubmit={submit} novalidate>
        {#if spoken.lists.length + others.length > 0}
          <Tile icon="rows" title={words.lists} count={spoken.lists.length + others.length}>
            <p class="hint">{words.from(voiceName)} {words.listsHint}</p>
            <div class="lists">
              {#each spoken.lists as l (l.list)}
                <div class="list-words">
                  <IconWell name={iconOf(l.list)} />
                  <!-- ONE ROW A LIST, RENAMED IN PLACE: the name, and its singular offered from it as it is typed. A list
                       the use case gives only a singular says which list it is, with that one word to rename. -->
                  {#if l.name}
                    {@const name = l.name}
                    <div class="field list-in">
                      <input
                        class="field-input"
                        id="w-{name.setting}"
                        type="text"
                        aria-label={words.calledFor(name.fallback)}
                        value={valueIn(name)}
                        placeholder={name.fallback}
                        oninput={(e) => (rename(l.list, name, l.one, typedIn(e)), soon())}
                      />
                    </div>
                  {:else if l.one}
                    {@const one = l.one}
                    <span class="list-name">{nameOf(l.list)}</span>
                    <div class="field list-in">
                      <input
                        class="field-input"
                        id="w-{one.setting}"
                        type="text"
                        aria-label={words.oneFor(nameOf(l.list))}
                        value={valueIn(one)}
                        placeholder={one.fallback}
                        oninput={(e) => ((typed[one.setting] = typedIn(e)), (oneTyped[l.list] = true), soon())}
                      />
                    </div>
                  {/if}
                </div>
              {/each}
              <!-- THE LISTS THE USE CASE NAMES NOTHING FOR, renamed by their own name when the box is left. -->
              {#each others as r (r.id)}
                <div class="list-words">
                  <IconWell name={r.icon} />
                  <div class="field list-in">
                    <input
                      class="field-input"
                      id="w-list-{r.id}"
                      type="text"
                      aria-label={words.calledFor(r.name)}
                      value={r.name}
                      disabled={busy}
                      onchange={(e) => void renameOther(r, e)}
                    />
                  </div>
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

        <p class="save" role="status">
          {#if saveSaid === 'pending'}{words.sending}{:else if saveSaid === 'saved'}{words.saved}{#if undoLast}{' '}<Button weight="bare" size="sm" onclick={() => (undoLast?.(), (undoLast = null), (saveSaid = ''))}>{copy.undo}</Button>{/if}{/if}
        </p>
      </form>
    {:else}
      {#if spoken.lists.length + others.length > 0}
        <Tile icon="rows" title={words.lists} count={spoken.lists.length + others.length}>
          {#each spoken.lists as l (l.list)}
            <StateRow icon={iconOf(l.list)} title={l.name?.value ?? nameOf(l.list)} line={l.one ? words.oneOf(l.one.value) : undefined} />
          {/each}
          {#each others as r (r.id)}
            <StateRow icon={r.icon} title={r.name} />
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
      <ul class="list-lines" data-all={listsAll ? '' : undefined}>
        {#each shell.index.registers as r (r.id)}
          <li><Icon name={r.icon} size="s" /><span dir="auto">{r.name}</span></li>
        {/each}
      </ul>
      {#if shell.index.registers.length > 8 && !listsAll}
        <button type="button" class="lists-more tap" onclick={() => (listsAll = true)}>{words.allLists(shell.index.registers.length)}</button>
      {/if}
      <p class="hint">{words.renameWith} <a class="link tap" href={at('/addons')}>{words.browse}</a></p>
    </Tile>
  {/if}

  <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. -->
  <p class="refused" role="status">{#if fix}<span class="glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {fix}{/if}</p>
{/if}

<style>
  /* THE CURRENCY, AS ONE ROW: its well, its name, and its select at the row's end, where every settings control sits. */
  /* ONE WIDTH FOR BOTH SELECTS (domains lane, 2 Nov): each took the width of its longest choice, so the currency and
     the time zone, two rows of one tile, started at two left edges. */
  .pick {
    display: grid;
    grid-template-columns: var(--well) minmax(0, 1fr) minmax(0, 20rem);
    align-items: center;
    column-gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    max-inline-size: calc(var(--measure) + var(--sp-9));
  }

  .pick > select {
    inline-size: 100%;
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
    line-height: var(--lead-meta);
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

  .lines {
    display: grid;
    gap: var(--sp-4);
    max-inline-size: calc(var(--measure) + var(--sp-9));
  }

  /* ONE ROW A LIST, 8 APART: the well and the name in place. */
  .lists {
    display: grid;
    gap: var(--sp-2);
    max-inline-size: calc(var(--measure) + var(--sp-9));
  }

  /* A LIST IS ITS WELL AND ITS NAME, typed over in place; a list named only by its singular shows its name before it. */
  .list-words {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .list-in {
    flex: 1;
    min-inline-size: 0;
  }

  .list-name {
    display: flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
  }


  .fold {
    margin-block-start: var(--sp-2);
  }

  .save {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
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
    line-height: var(--lead-meta);
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

  .lists-more {
    display: none;
  }

  @media (width < 640px) {
    .list-lines:not([data-all]) li:nth-child(n + 9) {
      display: none;
    }

    .lists-more {
      display: inline-flex;
      margin: 0 0 var(--sp-3);
      padding: 0;
      background: none;
      border: 0;
      color: var(--ink-2);
      font: inherit;
      font-size: var(--fs-meta);
      font-weight: var(--fw-medium);
      cursor: pointer;
    }
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
    line-height: var(--lead-meta);
  }

  .refused:empty {
    display: none;
  }

  /* ON A PHONE THE CURRENCY PICKER GOES UNDER ITS LABEL, starting where the well ends. */
  @media (width < 520px) {
    .pick {
      grid-template-columns: var(--well) minmax(0, 1fr);
      row-gap: var(--sp-2);
    }

    .pick > select {
      grid-column: 2;
    }
  }
</style>
