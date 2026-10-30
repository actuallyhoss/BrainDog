<!--
  A LINK FIELD'S BOX: the linked list searched by name, each row with the list's icon, one picked. Never an id.

  ONE PICKER FOR EVERY LINK, on the new-row form and on a row page's field alike, so a category is chosen the same way
  wherever it is chosen. The rows are `refOptions` (`held.ts`); the bound value is the picked row's number, which the
  write turns into its id the way it always did. `ref-pick.ts` says which row a typed name means.

  THE LIST FLOATS UNDER THE BOX, as a menu does. Drawn in the flow it pushed Save down, and a Save pressed while a typed
  name was still open closed the list on the way and moved the button out from under the press.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import { iconFor } from '../record/api.ts';
  import { REGISTERS, refOptions } from '../record/held.ts';
  import { listName } from '../record/names.ts';
  import { matching, meant, pickWords as words, seqOf, SHOWN, type RefOption } from './ref-pick.ts';

  let {
    to,
    value = $bindable(),
    label,
    id,
    required = false,
    describedBy,
    invalid = false,
  }: {
    /** The list the link points at. */
    to: string;
    /** The picked row's number as text, `''` for none. */
    value?: string | undefined;
    label: string;
    id?: string | undefined;
    required?: boolean | undefined;
    describedBy?: string | undefined;
    invalid?: boolean | undefined;
  } = $props();

  const uid = $props.id();
  const listId = $derived(`${id ?? uid}-rows`);
  const optionId = (i: number) => `${id ?? uid}-row-${String(i)}`;

  const held = $derived(seqOf(value ?? ''));
  const options = $derived(refOptions(to, held));
  const picked = $derived(options.find((o) => o.value === held) ?? null);
  const icon = $derived(iconFor(REGISTERS[to]?.icon, 'rows'));
  const list = $derived(listName(to));

  /* WHAT THE BOX SAYS: the picked row's name until somebody types, then what they typed. */
  let query = $state('');
  let typing = $state(false);
  let open = $state(false);
  let active = $state(0);
  let ul = $state<HTMLUListElement | null>(null);

  $effect(() => {
    if (!typing) query = picked?.label ?? '';
  });

  const found = $derived(matching(options, typing ? query : ''));
  const shown = $derived(found.slice(0, SHOWN));
  /* "None" leads while the list is browsed, for a link that may be empty and holds a row now. */
  const offerNone = $derived(!required && !typing && held !== null);
  const rows = $derived<(RefOption | null)[]>(offerNone ? [null, ...shown] : shown);

  /* THE HELD ROW IN VIEW, so a list longer than its box opens on the row it is about. */
  const reveal = () => void Promise.resolve().then(() => ul?.querySelector(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: 'nearest' }));

  function show() {
    open = true;
    const at = rows.findIndex((o) => o !== null && o.value === held);
    active = at < 0 ? 0 : at;
    reveal();
    /* AND THE LIST IN VIEW, so a box at the foot of a sheet does not open a list below the fold. */
    void Promise.resolve().then(() => ul?.scrollIntoView({ block: 'nearest' }));
  }

  function pick(o: RefOption | null) {
    value = o === null ? '' : String(o.value);
    typing = false;
    query = o?.label ?? '';
    open = false;
  }

  /* A BOX LEFT WITHOUT A PICK: the row its words name, none when it was emptied, else the row it held. */
  function settle() {
    if (!typing) {
      open = false;
      return;
    }
    if (query.trim() === '' && !required) return pick(null);
    const o = meant(options, query);
    if (o) return pick(o);
    typing = false;
    query = picked?.label ?? '';
    open = false;
  }

  function step(by: number) {
    if (!open) return show();
    if (rows.length === 0) return;
    active = Math.min(Math.max(active + by, 0), rows.length - 1);
    reveal();
  }

  /* ON THE BOX ITSELF AND NOT DELEGATED: Svelte hands `onkeydown` to the root, after the form round it has heard the key,
     so an Esc that closed the list closed the editor with it. */
  const ownKeys = (input: HTMLInputElement) => {
    input.addEventListener('keydown', keys);
    return () => input.removeEventListener('keydown', keys);
  };

  function keys(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'Enter' && open && rows.length > 0) {
      /* ENTER PICKS while the list is open, and does not send the form; a second Enter saves. */
      e.preventDefault();
      pick(rows[Math.min(active, rows.length - 1)] ?? null);
    } else if (e.key === 'Enter' && typing) {
      settle();
    } else if (e.key === 'Escape' && open) {
      /* ESC CLOSES THE LIST FIRST, and only the next one closes what holds it. */
      e.preventDefault();
      e.stopPropagation();
      typing = false;
      query = picked?.label ?? '';
      open = false;
    }
  }
</script>

<div class="pick">
  <div class="field">
    <span class="pick-icon" aria-hidden="true"><Icon name={icon} size="s" /></span>
    <input
      class="field-input"
      {id}
      type="text"
      role="combobox"
      autocomplete="off"
      spellcheck="false"
      aria-label={id ? undefined : label}
      aria-expanded={open}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={open && rows.length > 0 ? optionId(active) : undefined}
      aria-describedby={describedBy}
      aria-invalid={invalid ? 'true' : undefined}
      placeholder={words.search(list)}
      {required}
      bind:value={query}
      onfocus={(e) => {
        /* THE NAME IT HOLDS IS SELECTED, so the first letter typed starts a search rather than adding to it. */
        e.currentTarget.select();
        show();
      }}
      onclick={() => {
        if (!open) show();
      }}
      oninput={() => {
        typing = true;
        open = true;
        active = 0;
      }}
      onblur={settle}
      {@attach ownKeys}
    />
  </div>
  {#if open}
    <ul class="pick-rows" id={listId} role="listbox" aria-label={label} bind:this={ul}>
      {#each rows as o, i (o === null ? 'none' : o.value)}
        <!-- THE KEYS ARE THE BOX'S (arrows, Enter, Esc), which keeps the caret: an option is pressed, never focused. -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li
          id={optionId(i)}
          role="option"
          class="pick-row"
          aria-selected={i === active}
          data-none={o === null ? '' : undefined}
          onmousedown={(e) => e.preventDefault()}
          onclick={() => pick(o)}
          onmousemove={() => (active = i)}
        >
          {#if o === null}
            <span class="pick-name">{words.none}</span>
          {:else}
            <span class="pick-row-icon" aria-hidden="true"><Icon name={icon} size="s" /></span>
            <span class="pick-name">{o.label}</span>
            {#if o.value === held}<span class="pick-on" aria-hidden="true"><Icon name="check" size="s" /></span>{/if}
          {/if}
        </li>
      {:else}
        <li class="pick-empty" role="presentation">{typing && query.trim() !== '' ? words.noMatch(query) : words.nothing(list)}</li>
      {/each}
      {#if found.length > SHOWN}<li class="pick-empty" role="presentation">{words.more(found.length - SHOWN)}</li>{/if}
    </ul>
  {/if}
</div>

<style>
  .pick {
    position: relative;
    min-inline-size: 0;
  }

  .pick-icon {
    display: inline-flex;
    padding-inline-start: var(--sp-2);
    color: var(--ink-3);
  }

  .pick-rows {
    position: absolute;
    inset-block-start: calc(100% + var(--sp-1));
    inset-inline: 0;
    z-index: var(--z-palette);
    box-sizing: border-box;
    max-block-size: 240px;
    margin: 0;
    padding: var(--sp-1);
    overflow-y: auto;
    overscroll-behavior: contain;
    list-style: none;
    background: var(--tile);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-pop);
  }

  .pick-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 36px;
    padding-inline: var(--sp-2);
    border-radius: var(--r-ctl);
    color: var(--ink);
    font-size: var(--fs-ctl);
    cursor: pointer;
  }

  .pick-row[aria-selected='true'] {
    background: var(--hover);
  }

  .pick-row[data-none] {
    color: var(--ink-2);
  }

  .pick-row-icon {
    display: inline-flex;
    color: var(--ink-3);
  }

  .pick-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pick-on {
    display: inline-flex;
    color: var(--ink-2);
  }

  .pick-empty {
    padding: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-ctl);
  }

  @media (pointer: coarse) {
    .pick-row {
      min-block-size: var(--tap);
    }
  }
</style>
