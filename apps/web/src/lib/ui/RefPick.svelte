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
  import { apiBase } from '../at.ts';
  import { toasts } from './toast.svelte.ts';
  import { iconFor } from '../record/api.ts';
  import { REGISTERS, TITLES, refOptions } from '../record/held.ts';
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
    autofocus = false,
    fixed = false,
    people = false,
    onpick,
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
    /** The box takes the caret as it is drawn: a grid cell that just became this editor. */
    autofocus?: boolean | undefined;
    /**
     * The list is raised to the page's top layer (a manual popover) and placed under the box on the screen: a grid's row
     * clips anything that hangs out of a cell, and its table is a containing block a `position: fixed` list lands in.
     */
    fixed?: boolean | undefined;
    /**
     * PEOPLE MAY BE PICKED TOO, for a link to organisations that names who a thing is for: a task's Client (leftovers 2
     * Nov, 11). A client who is a person, a freelancer's or a shop's, is kept in People, and a Client box offered only
     * companies. A person picked is filed as the organisation they are with; one with none is given one in their own
     * name (a client), and they are put with it, so the link still points at the one list it names.
     */
    people?: boolean | undefined;
    /**
     * A row pressed or chosen with Enter, after the value holds it. A row page and a grid cell save on it, so the list
     * never stands between a pick and Save. A name typed and left is not a pick: it only fills the box.
     */
    onpick?: ((value: string) => void) | undefined;
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
  let box = $state<HTMLInputElement | null>(null);
  /* WHERE A FIXED LIST STANDS: under the box, as wide as it or 240px, and kept there while anything scrolls. */
  let at = $state('');

  function place() {
    const r = (box?.closest(".field") ?? box)?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(Math.max(r.width, 240), window.innerWidth - 16);
    const left = Math.min(Math.max(r.left, 8), window.innerWidth - width - 8);
    at = `position: fixed; inset-block-start: ${String(r.bottom + 4)}px; inset-inline-start: ${String(left)}px; inline-size: ${String(width)}px; inset-inline-end: auto;`;
  }

  $effect(() => {
    if (!fixed || !open || !ul) return;
    place();
    if (typeof ul.showPopover === 'function' && !ul.matches(':popover-open')) ul.showPopover();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  });

  $effect(() => {
    if (!typing) query = picked?.label ?? '';
  });

  /* THE PEOPLE A CLIENT MAY BE (`people`): read once, when the box is first opened. Each is offered under a value of its
     own below nought, so it is never taken for an organisation's number. */
  type Folk = { seq: number; id: string; name: string; org: string | null };
  let folk = $state<Folk[] | null>(null);
  async function readFolk() {
    if (!people || folk !== null || !REGISTERS.people) return;
    folk = [];
    try {
      const { createClient } = await import('@braindog/client');
      const out = await createClient({ base: apiBase() }).list({ register: 'people', limit: 500, fields: ['name', 'org', 'self'] });
      if (!out.ok) return;
      folk = (out.value.rows as { id: string; seq: number; fields?: Record<string, unknown> }[]).flatMap((r) =>
        typeof r.fields?.name === 'string' && r.fields.name.trim() !== '' && r.fields.self !== true
          ? [{ seq: r.seq, id: r.id, name: r.fields.name, org: typeof r.fields.org === 'string' && r.fields.org !== '' ? r.fields.org : null }]
          : [],
      );
    } catch {
      /* No people offered: the box still offers every organisation. */
    }
  }
  const asOptions = $derived<RefOption[]>((folk ?? []).filter((p) => !options.some((o) => o.label.trim().toLowerCase() === p.name.trim().toLowerCase())).map((p) => ({ value: -p.seq, label: p.name })));
  const everyone = $derived(people ? [...options, ...asOptions] : options);
  /* A PERSON PICKED IS FILED AS THEIR ORGANISATION, or one made in their name. `null` where that could not be written. */
  async function orgOf(person: Folk): Promise<RefOption | null> {
    try {
      const { createClient } = await import('@braindog/client');
      const client = createClient({ base: apiBase() });
      if (person.org !== null) {
        const orgs = await client.list({ register: 'organisations', limit: 500, fields: ['name'] });
        const row = orgs.ok ? (orgs.value.rows as { id: string; seq: number; fields?: Record<string, unknown> }[]).find((r) => r.id === person.org) : undefined;
        if (row) return { value: row.seq, label: typeof row.fields?.name === 'string' ? row.fields.name : person.name };
      }
      const made = await client.create({ register: 'organisations', fields: { name: person.name, kind: 'client' } });
      if (!made.ok) return null;
      const org = made.value as { id: string; seq: number };
      await client.update({ register: 'people', seq: person.seq, patch: { org: org.id } });
      person.org = org.id;
      /* THE NEW ROW IS NAMED IN THIS TAB, so the box and the list draw it by name at once. */
      TITLES.set('organisations', new Map([...(TITLES.get('organisations') ?? []), [org.seq, person.name]]));
      return { value: org.seq, label: person.name };
    } catch {
      return null;
    }
  }

  const found = $derived(matching(everyone, typing ? query : ''));
  const shown = $derived(found.slice(0, SHOWN));
  /* "None" leads while the list is browsed, for a link that may be empty and holds a row now. */
  const offerNone = $derived(!required && !typing && held !== null);
  const rows = $derived<(RefOption | null)[]>(offerNone ? [null, ...shown] : shown);

  /* THE HELD ROW IN VIEW, so a list longer than its box opens on the row it is about. */
  const reveal = () => void Promise.resolve().then(() => ul?.querySelector(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: 'nearest' }));

  function show() {
    void readFolk();
    open = true;
    const at = rows.findIndex((o) => o !== null && o.value === held);
    active = at < 0 ? 0 : at;
    reveal();
    /* AND THE LIST IN VIEW, so a box at the foot of a sheet does not open a list below the fold. */
    void Promise.resolve().then(() => ul?.scrollIntoView({ block: 'nearest' }));
  }

  function pick(o: RefOption | null, chosen = false) {
    if (o !== null && o.value < 0) {
      const person = (folk ?? []).find((p) => p.seq === -o.value);
      typing = false;
      query = o.label;
      open = false;
      if (person)
        void orgOf(person).then((org) => {
          /* NOT FILED, SAID SO: the box goes back to what it held, and the toast says what to do. */
          if (org === null) {
            query = picked?.label ?? '';
            toasts.push(words.personFailed(person.name), { intent: 'bad' });
            return;
          }
          value = String(org.value);
          query = org.label;
          if (chosen) onpick?.(value);
        });
      return;
    }
    value = o === null ? '' : String(o.value);
    typing = false;
    query = o?.label ?? '';
    open = false;
    if (chosen) onpick?.(value);
  }

  /* A BOX LEFT WITHOUT A PICK: the row its words name, none when it was emptied, else the row it held. */
  function settle() {
    if (!typing) {
      open = false;
      return;
    }
    if (query.trim() === '' && !required) return pick(null);
    const o = meant(everyone, query);
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
      pick(rows[Math.min(active, rows.length - 1)] ?? null, true);
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
    <!-- svelte-ignore a11y_autofocus -->
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
      placeholder={people && REGISTERS.people ? words.searchWithPeople(list) : words.search(list)}
      {autofocus}
      {required}
      bind:value={query}
      bind:this={box}
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
    <ul class="pick-rows" id={listId} role="listbox" aria-label={label} style={fixed ? at : undefined} popover={fixed ? 'manual' : undefined} bind:this={ul}>
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
          onclick={() => pick(o, true)}
          onmousemove={() => (active = i)}
        >
          {#if o === null}
            <span class="pick-name">{words.none}</span>
          {:else}
            <span class="pick-row-icon" aria-hidden="true"><Icon name={o.value < 0 ? 'people' : icon} size="s" /></span>
            <span class="pick-name" dir="auto">{o.label}</span>
            {#if o.value < 0}<span class="pick-kind">{words.person}</span>{/if}
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

  /* IN THE TOP LAYER the browser's own popover box is taken back: its margin, its inset and its colours. */
  .pick-rows[popover] {
    margin: 0;
    color: var(--ink);
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

  .pick-kind {
    color: var(--ink-3);
    font-size: var(--fs-meta);
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
