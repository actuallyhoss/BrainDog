<!--
  The palette: ONE surface, one grammar, and a `<dialog>` combobox.

  Prefixes work in EVERY mode — `>` commands, `#` rows, `@` people, `/` pages and registers, none =
  everything ranked. GitHub's palette has one grammar per mode and a second opener that fast-paths
  you into it; both are refused here, so there is no command mode and no second opener (19 §4).

  A bare spoken id resolves directly — D41, SG23 — because ids in this product are said out loud and
  must be typeable exactly as heard. The one exception is `#125`: every register has a `#1`, so it
  never resolves bare. Type `tasks#125`.

  `⇥` COMPLETES THE QUERY AND NOTHING ELSE. Raycast rebinds it to "abandon the query and submit to
  AI", unconditionally, even with no text typed — and in a search input `⇥` universally means
  complete. Losing a half-typed query to a chat is a real cost.

  EVERY ROW PRINTS ITS BINDING on the trailing edge. This is the highest-leverage single component
  in the spec: the palette becomes the shortcut teacher, the slow path and the fast path are the same
  list, and there is no cheat sheet to keep in sync.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { copy } from '../copy.ts';
  import { overlays } from '../a11y/keys.svelte.ts';
  import { REGISTERS, ROWS, iconFor, search, type NavEntry, type SearchHit } from '../record/api.ts';
  import Kbd from '../ui/Kbd.svelte';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/Icon.svelte';

  let { open = $bindable(false), nav }: { open?: boolean; nav: NavEntry[] } = $props();

  type Row = {
    id: string;
    title: string;
    href: string;
    group: string;
    detail?: string | undefined;
    keys?: string | undefined;
    icon?: IconName | undefined;
    spoken?: string | undefined;
  };

  let el = $state<HTMLDialogElement>();
  let input = $state<HTMLInputElement>();
  let q = $state('');
  let cursor = $state(0);

  const COMMANDS: Row[] = [
    { id: 'c-home', title: copy.home, href: '/', group: copy.destinations, keys: 'g h', icon: 'home' },
    { id: 'c-decide', title: copy.decide, href: '/decide', group: copy.destinations, keys: 'g d', icon: 'decide' },
    { id: 'c-inbox', title: copy.inbox, href: '/inbox', group: copy.destinations, keys: 'g i', icon: 'inbox' },
    { id: 'c-vault', title: copy.vault, href: '/vault', group: copy.destinations, keys: 'g v', icon: 'vault' },
    { id: 'c-packs', title: copy.packs, href: '/packs', group: copy.destinations, keys: 'g p', icon: 'packs' },
    { id: 'c-settings', title: copy.settings, href: '/settings/appearance', group: copy.destinations, keys: 'g ,', icon: 'settings' },
    { id: 'c-audit', title: copy.audit, href: '/audit', group: copy.destinations, icon: 'clock' },
    { id: 'c-shot', title: copy.screenshotOn, href: '/settings/appearance', group: copy.commands, icon: 'monitor' },
    { id: 'c-keys', title: copy.keymap, href: '/settings/keyboard', group: copy.commands, keys: '?', icon: 'keyboard' },
  ];

  /** 34 §4's two regexes: a prefixed spoken id, and `register#seq`. `#125` is plain text. */
  const SPOKEN = /^([A-Z]{1,3})(\d+)$/;
  const QUALIFIED = /^([a-z][a-z0-9_]*)#(\d+)$/;

  const parsed = $derived.by(() => {
    const raw = q.trim();
    const prefix = ['>', '#', '@', '/'].includes(raw[0] ?? '') ? raw[0]! : null;
    return { prefix, text: prefix ? raw.slice(1).trim() : raw };
  });

  const rows = $derived.by((): Row[] => {
    const { prefix, text } = parsed;
    const needle = text.toLowerCase();
    const out: Row[] = [];

    // Exact spoken id first, always. It is the string a person heard out loud.
    const spoken = SPOKEN.exec(text.toUpperCase());
    const qualified = QUALIFIED.exec(text);
    if (spoken) out.push({ id: 'spoken', title: text.toUpperCase(), detail: 'Open by spoken id', href: `/${text.toUpperCase()}`, group: copy.records, icon: 'arrow' });
    if (qualified) out.push({ id: 'qualified', title: text, detail: `${REGISTERS[qualified[1]!]?.name ?? qualified[1]} row`, href: `/r/${qualified[1]}/${qualified[2]}`, group: copy.records, icon: 'arrow' });

    // Strict-prefix aliases outrank fuzzy matching. It is the only verified mechanism found that
    // keeps a growing action index from rotting (19 §7).
    if (prefix === null || prefix === '>') {
      const exact = COMMANDS.filter((c) => c.title.toLowerCase().startsWith(needle));
      const rest = COMMANDS.filter((c) => !exact.includes(c) && c.title.toLowerCase().includes(needle));
      out.push(...exact, ...rest);
    }

    if (prefix === null || prefix === '/') {
      /* EVERY ROW WEARS ITS OWN GLYPH. The ten commands each carried a real one and then every
         other row in the palette fell back to the same arrow, which is the one surface where a
         person is scanning a mixed list at speed and the glyph is the only thing separating a page
         from a list from a row. Both declarations already name an icon; the rail has been drawing
         them all along and this was throwing them away. */
      for (const entry of nav)
        if (entry.title.toLowerCase().includes(needle))
          out.push({ id: `p-${entry.id}`, title: entry.title, detail: `${entry.section} page`, href: entry.href, group: copy.pages, icon: entry.icon });
      for (const r of Object.values(REGISTERS))
        if (r.name.toLowerCase().includes(needle))
          /* The count, not a definition of the word "register". A row that explains the app's own
             vocabulary is a row nobody needed, and it was doing it in every search. */
          out.push({ id: `r-${r.id}`, title: r.name, detail: `${(ROWS[r.id] ?? []).length} rows`, href: `/r/${r.id}`, group: copy.pages, icon: iconFor(r.icon, 'rows') });
    }

    if ((prefix === null || prefix === '#') && text.length > 1)
      for (const hit of search(text, 8) as SearchHit[])
        out.push({ id: `h-${hit.href}`, title: hit.title, detail: hit.detail, href: hit.href, group: copy.records, spoken: hit.spoken, icon: hit.icon });

    return out.slice(0, 20);
  });

  const groups = $derived.by(() => {
    const out = new Map<string, Row[]>();
    for (const r of rows) {
      if (!out.has(r.group)) out.set(r.group, []);
      out.get(r.group)!.push(r);
    }
    return [...out];
  });

  const flat = $derived(groups.flatMap(([, r]) => r));

  $effect(() => {
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      overlays.open();
      q = '';
      cursor = 0;
      queueMicrotask(() => input?.focus());
    } else if (!open && el.open) {
      el.close();
      overlays.close();
    }
  });

  function run(row: Row | undefined) {
    if (!row) return;
    open = false;
    goto(row.href);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = Math.min(cursor + 1, flat.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = Math.max(cursor - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(flat[cursor]);
    } else if (e.key === 'Tab') {
      // Complete the query. Nothing else.
      e.preventDefault();
      const top = flat[cursor];
      if (top) q = (parsed.prefix ?? '') + top.title;
    }
  }

  /**
   * Click the backdrop to close.
   *
   * A modal `<dialog>` does not do this on its own, and the absence reads as the app being stuck:
   * the surface behind is visibly dimmed and visibly inert, so the first thing anybody tries is
   * clicking it, and nothing happening is the only feedback they get. Esc has always worked, which
   * is exactly why this went unnoticed by whoever wrote it.
   *
   * The test is GEOMETRY, not `e.target === el`. A click on the dialog's own padding also targets
   * the dialog, so identity would close the panel when somebody clicks the gap beside its title.
   * `e.detail > 0` keeps real pointer clicks only: activating a button with the keyboard dispatches
   * a click whose coordinates are (0, 0), which is outside every rect on screen.
   */
  function onbackdrop(e: MouseEvent) {
    if (!el || e.detail === 0) return;
    const r = el.getBoundingClientRect();
    const outside =
      e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (outside) open = false;
  }
</script>

<dialog bind:this={el} class="palette" onclick={onbackdrop} oncancel={(e) => (e.preventDefault(), (open = false))} onclose={() => (open = false)}>
  <div class="p-head">
    <Icon name="search" size="m" />
    <input
      bind:this={input}
      bind:value={q}
      {onkeydown}
      class="p-input"
      type="text"
      role="combobox"
      aria-expanded="true"
      aria-controls="palette-list"
      aria-label={copy.paletteLabel}
      placeholder={copy.palettePlaceholder}
      spellcheck="false"
      autocomplete="off"
    />
    <kbd class="p-esc">Esc</kbd>
  </div>

  <div class="p-body" id="palette-list" role="listbox" aria-label={copy.paletteLabel}>
    {#each groups as [group, items]}
      <p class="p-group">{group}</p>
      {#each items as row (row.id)}
        {@const index = flat.indexOf(row)}
        <button
          type="button"
          class="p-row"
          role="option"
          aria-selected={index === cursor}
          data-cursor={index === cursor ? '' : undefined}
          onmouseenter={() => (cursor = index)}
          onclick={() => run(row)}
        >
          {#if row.icon}<Icon name={row.icon} size="m" />{/if}
          <span class="p-title">{row.title}</span>
          {#if row.spoken}<span class="p-spoken">{row.spoken}</span>{/if}
          {#if row.detail}<span class="p-detail">{row.detail}</span>{/if}
          {#if row.keys}<Kbd keys={row.keys} />{/if}
        </button>
      {/each}
    {:else}
      <!-- A query matching nothing falls through to a fallback row when a model is configured.
           Without one the row, the status call and every "Ask BrainDog" button do not exist — ABSENT,
           not disabled (23 §8). This record has no model, so this is what you get. -->
      <p class="p-none">{copy.noMatches} “{q}”</p>
    {/each}
  </div>

  <footer class="p-foot">
    <Kbd keys="↑  ↓" /><span>move</span>
    <Kbd keys="↵" /><span>run</span>
    <Kbd keys="⇥" /><span>complete</span>
    <span class="p-hint">&gt; commands · # rows · @ people · / pages</span>
  </footer>
</dialog>

<style>
  .palette {
    inline-size: min(680px, calc(100vw - var(--sp-4)));
    max-block-size: min(72dvh, 620px);
    margin: 10dvh auto auto;
    padding: 0;
    background: var(--s2);
    border: 1px solid var(--edge);
    border-radius: var(--r-lg);
    color: var(--ink);
    box-shadow: var(--e3);
    overflow: hidden;
  }

  .palette:not([open]) {
    display: none;
  }

  .palette[open] {
    display: flex;
    flex-direction: column;
    animation: pop var(--d-enter) var(--ease-spring);
  }

  /* No `opacity: 0` in a start state — see Sheet.svelte. The palette is the one surface somebody
     reaches for a hundred times a day, and it is the one that can least afford to be invisible while
     an animation waits for its first frame. */
  @keyframes pop {
    from {
      transform: translateY(-8px) scale(0.985);
    }
  }

  .palette::backdrop {
    background: color-mix(in srgb, black 52%, transparent);
  }

  .p-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    border-block-end: 1px solid var(--line);
    color: var(--dim);
    transition: border-color var(--d-state) var(--ease-out);
  }

  /* The state change the input gave up. It is the row that looks like a field, so it is the row
     that should say it is live — and a border warming to the accent is a change a person reads
     without it reading as an error. */
  .p-head:focus-within {
    border-block-end-color: var(--accent);
    color: var(--ink2);
  }

  .p-input {
    flex: 1;
    min-inline-size: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--ink);
    font-size: var(--t-md);
  }

  /* A 2px ring plus a 4px halo drawn around a transparent, borderless input inside an already-modal
     dialog is a white box floating in the middle of the panel around nothing — it frames the text,
     not a control, because there is no control there to frame. The blinking caret is the platform's
     own focus indicator for a text field and is what every command palette relies on; this dialog
     opens with focus here and traps it, so there is nowhere else for focus to have gone.

     The ring is not simply deleted, though. It moves to `.p-head`, which is the thing that actually
     looks like a field, as a border tint rather than an outline — so there is still a visible
     change of state, it just belongs to the right box. */
  .p-input:focus-visible {
    /* focus-ok: the caret indicates focus here, and `.p-head:focus-within` above carries the state
       change for the field the reader actually sees. */
    outline: none;
    box-shadow: none;
  }

  .p-input::placeholder {
    color: var(--dim);
  }

  .p-esc {
    padding: 1px 6px;
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .p-body {
    flex: 1;
    padding: var(--sp-2);
    overflow-y: auto;
  }

  .p-group {
    padding: var(--sp-2) var(--sp-2) var(--sp-1);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .p-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: 38px;
    padding: 0 var(--sp-2);
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--ink2);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  /* The same tint the rail uses for "here", because it is the same idea: one row out of a list is
     the one you are on. It was `--s3` plus a 2px bar, which on a light palette is one rung of the
     surface ladder away from the ground it sits on — a highlight you have to hunt for in the one
     control that exists to be driven from the keyboard. */
  .p-row[data-cursor] {
    background: color-mix(in srgb, var(--accent) 13%, transparent);
    color: var(--ink);
  }

  .p-row[data-cursor] :global(.icon) {
    color: var(--accent-text);
  }

  .p-title {
    flex: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .p-spoken {
    padding: 0 5px;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .p-detail {
    flex: 1;
    color: var(--dim);
    font-size: var(--t-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .p-none {
    padding: var(--sp-5) var(--sp-3);
    color: var(--dim);
  }

  .p-foot {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-4);
    border-block-start: 1px solid var(--line);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .p-hint {
    margin-inline-start: auto;
    font-family: var(--font-id);
  }

  @media (width < 640px) {
    .palette {
      inline-size: 100vw;
      max-inline-size: none;
      block-size: 100dvh;
      max-block-size: none;
      margin: 0;
      border: 0;
      border-radius: 0;
    }

    .p-hint {
      display: none;
    }
  }
</style>
