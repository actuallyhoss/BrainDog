<!--
  A register: one typed collection, all of it.

  The grid is CSS grid with DECLARED column tracks, not a `<table>`, and that is a measured decision
  rather than a taste one. At 8 columns in Chrome 151, `<table>` layout scales superlinearly —
  26.9 / 59.6 / 149 / 318 / 790 ms across 500 / 1k / 2k / 5k / 10k rows — and `content-visibility`
  does not work on table rows, by spec and by measurement. Grid with chunked CV takes 5,000 rows to
  0.6 ms of layout (22 §4).

  No virtualisation at any size. Rows arrive in keyset pages into chunks, the DOM caps at 2,000 with
  a visible cap line, and the way past it is a filter or an export. Virtualisation breaks
  find-in-page, breaks the scrollbar as a position cue, and only HIDES the measured wall, which is
  DOM construction (13 §4.3).
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { MISSING } from 'braindog-render';
  import { Table } from 'braindog-render/svelte';
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import * as pref from '$lib/pref.ts';
  import { silenced } from '$lib/a11y/keys.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { iconFor, REGISTERS, columnsFor, display, dirOf, entry, identityOf, labelOf, list, noticed, readableFields, toRows, whereOf, type Filter } from '$lib/record/api.ts';
  import IdentityMark from '$lib/ui/IdentityMark.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import RowMenu from '$lib/ui/RowMenu.svelte';
  import RowForm from '$lib/ui/RowForm.svelte';
  import BindBlock from '$lib/ui/BindBlock.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';

  const DOM_CAP = 2000;

  const id = $derived(page.params.register ?? '');
  const decl = $derived(REGISTERS[id]);

  /* WHAT THE RECORD HAS NOTICED ABOUT THIS REGISTER, if anything crossed a threshold. It is derived
     from the register alone — not from the filters — because a pattern in thirty days of refusals
     is not a property of the rows currently on screen. */
  const seen = $derived(noticed(id));

  /* URL state: filters and the query define WHICH ROWS YOU ARE LOOKING AT, so they must be
     shareable. View options and the peeked row are not the same thing and do not travel (19 §5). */
  const q = $derived(page.url.searchParams.get('q') ?? '');
  const sortParam = $derived(page.url.searchParams.get('sort'));
  const sort = $derived.by(() => {
    const [field, dir] = (sortParam ?? '').split(':');
    return field ? { field, dir: (dir === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc' } : undefined;
  });
  const filters = $derived.by((): Filter[] =>
    page.url.searchParams.getAll('f').map((raw) => {
      const [field = '', op = 'is', values = ''] = raw.split(':');
      return { field, op, values: values.split(',') };
    }),
  );

  /* The columns actually drawn: the register's projection minus whatever the reader has hidden. */
  let createOpen = $state(false);
  let displayOpen = $state(false);
  let bindOpen = $state(false);

  /**
   * Which columns this register shows, and it is PER REGISTER and PER READER.
   *
   * 50 §5.2 names it `prefs.columns[register]` — a view preference, not a declaration. The
   * difference matters: `columns:` on a page block is what everyone sees and travels in a pack;
   * this is what YOU see on the grid, and it never leaves your device. Two people looking at the
   * same register may want different columns and neither is editing the record.
   *
   * The title column is not offerable. A register whose title is hidden is a list of ids.
   */
  let hidden = $state(new Set<string>());

  /* SEEDED FROM THE COOKIE AND WRITTEN BACK TO IT. This was client state with no store behind it,
     so unticking a column and reloading put it back — on a screen whose search, filters and sort all
     survive in the URL, which is precisely why a reader expects this to. The effect is keyed on the
     register, so walking between two registers loads each one's own answer. */
  $effect(() => {
    hidden = new Set(pref.read().columns?.[id] ?? []);
  });

  /** Every column back, and the register's entry out of the cookie rather than emptied in it. */
  function showAll() {
    hidden = new Set();
    const all = { ...pref.read().columns };
    delete all[id];
    pref.write({ columns: all });
  }

  function hide(field: string, off: boolean) {
    const next = new Set(hidden);
    if (off) next.add(field);
    else next.delete(field);
    hidden = next;
    const all = { ...pref.read().columns };
    if (next.size === 0) delete all[id];
    else all[id] = [...next];
    pref.write({ columns: all });
  }

/**
   * A LEADING COLUMN FOR THE SELECTION, and it is a column rather than a decoration on the id.
   *
   * The selection model was keyboard-only: `x`, `⇧x`, `⌘a`, `Esc` and nothing else — no way to pick
   * a row with a mouse or a finger at all, on the one screen that is a list of rows. It could not
   * go inside the `#` cell, which is 9ch wide because the spoken id is what that column is FOR and
   * it truncates in the middle; a checkbox in front of it would take the prefix.
   *
   * The control is `tabindex="-1"` on purpose. A grid is a composite widget with exactly one tab
   * stop — at 500 rows a focusable control per row is 500 tab stops — so the keyboard path stays
   * `x`, which the `?` sheet already advertises, and the pointer path is this.
   */
  const columns = $derived([
    { field: 'select', label: copy.select, hideLabel: true, width: '3ch', align: 'start' as const, truncate: 'never' as const },
    ...columnsFor(id).filter((c) => !hidden.has(c.field)),
  ]);
  const found = $derived(list(id, { filters, q, ...(sort ? { sort } : {}) }));
  const result = $derived({
    ...found,
    entries: found.entries.filter((e) => !archived.has(e.seq)),
    matched: found.entries.filter((e) => !archived.has(e.seq)).length,
  });
  const rows = $derived(toRows(id, result.entries.slice(0, DOM_CAP), columns));

  function archive(seq: number) {
    archived = new Set([...archived, seq]);
    toasts.push(copy.archived(`${id}#${seq}`), {
      undo: () => {
        const next = new Set(archived);
        next.delete(seq);
        archived = next;
      },
    });
  }

  const copyId = (seq: number) => clipboard.putSpoken(id, seq);

  /**
   * The LINK, not the id. `⇧Y` has been on the `?` sheet since the registry was written and was
   * bound nowhere: `e.key` for shift-Y is `'Y'`, so the `'y'` branch never saw it and the sheet was
   * advertising a key that did nothing. A cheat sheet is only a cheat sheet if it is true.
   *
   * Two outcomes, same as `copyId`, and the toast says which — the clipboard is absent over plain
   * HTTP and in a sandboxed frame.
   */
  const copyLink = (seq: number) => clipboard.putLink(id, seq);

  /* Column 2, not 1: 0 is the picker and 1 is the spoken id, so the caret starts on the first cell
     that says what the row IS. It was 1 when the id was the leading column. */
  let focus = $state({ row: 0, col: 2 });
  let peeked = $state<number | null>(null);
  let filterOpen = $state(false);

  /**
   * Archived rows, in the mock-up, held in the page rather than in the record.
   *
   * A destructive action here is UNDONE, never confirmed. A confirmation dialog asks its question
   * before anything has happened, when the reader knows the least they ever will about it, and the
   * answer is always yes — which is why people stop reading them. Ten seconds of undo, with the row
   * named in the past tense, gives back the one thing a dialog cannot.
   */
  let archived = $state(new Set<number>());

  const peekedEntry = $derived(peeked === null ? undefined : entry(id, peeked));

  /** Only INDEXED fields are offered, in declaration order, at most eight. A filter on an unindexed
      field is a promise the storage cannot keep at 5,000 rows. */
  const filterable = $derived((decl?.fields ?? []).filter((f) => f.index).slice(0, 8));

  function setParam(mutate: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(page.url.searchParams);
    mutate(next);
    goto(`?${next}`, { replaceState: false, noScroll: true, keepFocus: true });
  }

/**
   * A value is SELECTED when the filter includes it, and a `not-in` filter includes nothing.
   *
   * The test used to be `values.includes(value)` with no regard for the operator, so the URL a
   * declared metric hands the reader — `?f=state:not-in:cancelled`, the one that opens "Cost per
   * year" — drew `cancelled` as the value being shown. Fifteen live rows on screen, and the control
   * above them saying the one word none of them held.
   */
  const isOn = (field: string, value: string): boolean => {
    const f = filters.find((x) => x.field === field);
    if (!f) return false;
    /* A SEGMENT SAYS WHAT YOU ARE LOOKING AT, so under a `not-in` filter it is on when the value is
       NOT excluded — which is what the grid underneath it shows. Reading `values.includes` for both
       operators drew `cancelled` as the selected state on the one URL a metric tile hands the
       reader, with fifteen live rows under it and not one cancelled. */
    return f.op === 'not-in' ? !f.values.includes(value) : f.values.includes(value);
  };

  /**
   * Toggling KEEPS THE OPERATOR. It always wrote `:in:`, so one press on a neighbouring segment of a
   * `not-in` filter turned exclusion into inclusion and pulled the excluded rows back in — silently,
   * and in the direction that adds rows to a figure somebody had just clicked through to check.
   */
  const toggleFilter = (field: string, value: string) =>
    setParam((p) => {
      const existing = p.getAll('f').filter((v) => !v.startsWith(`${field}:`));
      const at = filters.find((f) => f.field === field);
      const op = at?.op ?? 'in';
      const current = at?.values ?? [];
      const values = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      p.delete('f');
      for (const v of existing) p.append('f', v);
      if (values.length) p.append('f', `${field}:${op}:${values.join(',')}`);
    });

  function onkeydown(e: KeyboardEvent) {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;

    /* THE CHORDS COME FIRST, and the blanket `if (modifier) return` above them was eating four of
       them: `⌘Home`, `⌘End`, `⌘a`, `⌥V` and `⌥B` were all registered in the keymap, printed on `?`,
       and dropped one line into the handler. A guard written to protect the BARE letters was
       protecting them from keys that are not bare. */
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'Home') {
      e.preventDefault();
      focus = { row: 0, col: focus.col };
      return;
    }
    if (mod && e.key === 'End') {
      e.preventDefault();
      focus = { row: rows.length - 1, col: focus.col };
      return;
    }
    if (mod && e.key.toLowerCase() === 'a') {
      /* All LOADED, never all matching. A select-all reaching rows the DOM has never held is a
         count you cannot verify by looking — the same argument as 13 §4.3's 2,000-row cap, from the
         other side. */
      e.preventDefault();
      selected = new Set(result.entries.slice(0, DOM_CAP).map((r) => r.seq));
      return;
    }
    if (e.altKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      toasts.push(copy.notWritten('The filter would be saved as a named view on this register'), { intent: 'warn' });
      return;
    }
    if (e.altKey && e.key.toLowerCase() === 'b') {
      /* IT OPENS THE BINDER, which is 204 lines that nothing could reach. The chord already holds
         the register and the filters — which is everything the binder needs — and it answered with
         a toast describing what it would do instead of doing the readable half of it. The sentence
         it builds, its destination picker and its "a page cannot read a register it did not
         declare" rule were all written and none of them had ever been on a screen. */
      e.preventDefault();
      bindOpen = true;
      return;
    }
    if (e.shiftKey && e.key === 'Y') {
      const row = result.entries[focus.row];
      if (row) {
        e.preventDefault();
        void copyLink(row.seq);
      }
      return;
    }
    if (e.shiftKey && e.key === 'F10') {
      e.preventDefault();
      openRowMenu();
      return;
    }
    if (e.key === 'ContextMenu') {
      e.preventDefault();
      openRowMenu();
      return;
    }
    if (mod || e.altKey) return;
    /* THE BARE NAMESPACE, AND THE SWITCH THAT TURNS IT OFF. Everything above this line is a chord or
       a named key and keeps working; everything below is a single character and does not. The arrows
       are below it and survive, because an arrow is not a character shortcut. */
    if (silenced(e)) return;

    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      focus = { ...focus, row: Math.min(focus.row + 1, rows.length - 1) };
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      focus = { ...focus, row: Math.max(focus.row - 1, 0) };
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focus = { ...focus, col: Math.min(focus.col + 1, columns.length - 1) };
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focus = { ...focus, col: Math.max(focus.col - 1, 0) };
    } else if (e.key === 'p') {
      e.preventDefault();
      peeked = result.entries[focus.row]?.seq ?? null;
    } else if (e.key === 'Enter') {
      const row = result.entries[focus.row];
      if (row) goto(`/r/${id}/${row.seq}`);
    } else if (e.key === 'f') {
      e.preventDefault();
      filterOpen = true;
    } else if (e.key === 'v') {
      e.preventDefault();
      displayOpen = true;
    } else if (e.key === 'y') {
      const row = result.entries[focus.row];
      if (row) {
        e.preventDefault();
        void copyId(row.seq);
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const row = result.entries[focus.row];
      if (row) {
        e.preventDefault();
        archive(row.seq);
        focus = { ...focus, row: Math.min(focus.row, result.entries.length - 2) };
      }
    } else if (e.key === 'Home') {
      /* Bare `Home`/`End` are ROW ends; with the modifier they are REGISTER ends. The distinction is
         the whole reason both exist — a grid where Home jumps to row one is a grid where you cannot
         get back to the first column without arrowing across it. */
      e.preventDefault();
      focus = { ...focus, col: 0 };
    } else if (e.key === 'End') {
      e.preventDefault();
      focus = { ...focus, col: columns.length - 1 };
    } else if (e.key === 'n') {
      e.preventDefault();
      createOpen = true;
    } else if (e.key === 'o') {
      /* The RELATED register: the one the focused cell points at. A `ref` cell knows its target, so
         `o` follows it; on any other cell there is nothing related and nothing happens. */
      const field = columns[focus.col]?.field;
      const to = field ? decl?.fields.find((f) => f.id === field)?.to : undefined;
      if (to) {
        e.preventDefault();
        void goto(`/r/${to}`);
      }
    } else if (e.key === 'x' || e.key === 'X') {
      /* `X` and not `x` when shift is down — `e.key` carries the SHIFTED character, so a check for
         the lowercase letter alone silently drops every `⇧x`. */
      const row = result.entries[focus.row];
      if (row) {
        e.preventDefault();
        toggleSelect(row.seq, e.shiftKey);
      }
    } else if (e.key === 'Escape' && selected.size > 0) {
      e.preventDefault();
      selected = new Set();
    } else if (e.key === 'e' || e.key === 'F2') {
      e.preventDefault();
      toasts.push(copy.notWritten('The cell would open for editing in place'), { intent: 'warn' });
    }
  }

  /**
   * Selection, and it is CLIENT STATE that never leaves.
   *
   * `x` toggles, `⇧x` extends from the last one touched, `⌘a` takes everything loaded, `Esc` clears.
   * The anchor is the last SIMPLE toggle rather than the last change, which is what makes a run of
   * `⇧x` presses extend the same range instead of walking it.
   */
  let selected = $state(new Set<number>());
  let anchor = 0;

  /* ⇧F10 and the context-menu key. The rect is taken at open and not tracked: a menu that follows
     a scrolling row is a menu that walks away from the pointer. */
  let menuAt = $state<{ x: number; y: number; height: number } | null>(null);
  const menuOpen = $derived(menuAt !== null);
  const menuRow = $derived(result.entries[focus.row]);

  function openRowMenu() {
    const el = document.querySelectorAll('.rowgroup .tr')[focus.row];
    if (!el) return;
    const r = el.getBoundingClientRect();
    menuAt = { x: r.x + 24, y: r.y, height: r.height };
  }

  /** The Table speaks in row KEYS (`register#seq`), which is the id a row is addressed by. */
  const selectedKeys = $derived(new Set([...selected].map((seq) => `${id}#${seq}`)));

  function toggleSelect(seq: number, extend: boolean) {
    const at = result.entries.findIndex((r) => r.seq === seq);
    if (extend) {
      const [from, to] = anchor <= at ? [anchor, at] : [at, anchor];
      const next = new Set(selected);
      for (const row of result.entries.slice(from, to + 1)) next.add(row.seq);
      selected = next;
      return;
    }
    anchor = at;
    const next = new Set(selected);
    if (next.has(seq)) next.delete(seq);
    else next.add(seq);
    selected = next;
  }

  /* ── the verbs a selection is FOR ──────────────────────────────────────────
     The anchor-extend model was implemented, drawn, and consumed by nothing: a selection you can
     make and cannot use is a mode you enter and cannot leave usefully. Three verbs, and the first
     of them is the one that actually works here — a mock has no write path, and the rule for that
     is the app's own: say what it would have done, once, in the toast. */

  /**
   * THE SELECTION, CUT TO THE ANSWER ON SCREEN.
   *
   * `selected` is a set of numbers and nothing pruned it when the filter or the query changed, so a
   * reader could tick five rows, search, see two ticks and a toolbar saying five, press Archive, and
   * archive three rows they could not see. Every verb and every count reads this, not the set: what
   * a bulk action acts on is what the reader is looking at.
   */
  const picked = $derived(result.entries.filter((e) => selected.has(e.seq)));

  async function copyIds() {
    const text = picked.map((e) => `${id}#${e.seq}`).join(' ');
    try {
      await navigator.clipboard.writeText(text);
      toasts.push(copy.copied(`${picked.length} ${picked.length === 1 ? 'id' : 'ids'}`));
    } catch {
      toasts.push(copy.copyRefused, { intent: 'warn' });
    }
  }

  function archiveSelected() {
    const seqs = picked.map((e) => e.seq);
    archived = new Set([...archived, ...seqs]);
    selected = new Set();
    toasts.push(copy.archived(`${seqs.length} ${decl?.name.toLowerCase() ?? 'rows'}`), {
      undo: () => {
        const next = new Set(archived);
        for (const seq of seqs) next.delete(seq);
        archived = next;
        selected = new Set(seqs);
      },
    });
  }

  /** The register's own states, so the menu is the vocabulary rather than a list typed here. */
  const states = $derived(decl?.fields.find((f) => f.id === decl.state)?.values ?? []);

  const emptyKind = $derived(
    result.total === 0 ? 'no-data-yet' : q || filters.length ? 'no-results' : 'cleared',
  );
</script>

<svelte:head><title>{titleOf(decl?.name)}</title></svelte:head>

<svelte:window {onkeydown} />

{#if !decl}
  <div class="page">
    <Empty kind="error" heading title="Couldn't load {id}." rid="r7k2m9qd4x">
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <PageHead icon={iconFor(decl.icon, 'rows')}
    title={decl.name}
    count={result.matched}
    total={result.total}
  >
    {#snippet actions()}
      <Button weight="quiet" onclick={() => (filterOpen = true)}>
        <Icon name="filter" size="s" />
        {copy.filter}
      </Button>
      <Button weight="primary" onclick={() => (createOpen = true)}><Icon name="plus" size="s" />{copy.newRow} {decl.one}</Button>
    {/snippet}
  </PageHead>

  <div class="page">
    <div class="bar">
      <label class="field">
        <Icon name="search" size="s" />
        <input
          class="field-input"
          type="search"
          placeholder="Search {decl.name.toLowerCase()}"
          value={q}
          oninput={(e) => setParam((p) => {
            const v = (e.currentTarget as HTMLInputElement).value;
            if (v) p.set('q', v);
            else p.delete('q');
          })}
        />
      </label>

      {#each filterable.filter((f) => f.type === 'enum') as f}
        <div class="segmented" role="group" aria-label={f.id}>
          {#each f.values ?? [] as value}
            {@const on = isOn(f.id, value)}
            <button type="button" class="segment" data-on={on ? '' : undefined} onclick={() => toggleFilter(f.id, value)}>
              {value.replace(/_/g, ' ')}
            </button>
          {/each}
        </div>
      {/each}

      {#if q || filters.length}
        <Button weight="bare" href="/r/{id}"><Icon name="close" size="s" />{copy.clearFilters}</Button>
      {/if}

      <span class="bar-hint">
        <Kbd keys="j  k" /> move <Kbd keys="p" /> peek <Kbd keys="↵" /> open <Kbd keys="⌫" /> archive
      </span>
    </div>

    <!-- WHAT THE RECORD NOTICED, ON THE SCREEN IT IS ABOUT.

         The observe loop is the most careful mechanism in this product — nine signals, four
         detectors whose counts come from the rule of three, a dispersion requirement on every one
         because a burst is not a pattern — and none of it had ever reached a person. It went here
         and not on a findings page because `write.refused` carries `<register>.<field>:<code>`,
         which IS this screen: the grid somebody keeps being refused at.

         IT IS A NOTE, NOT AN ALARM. Nothing is broken and nothing is urgent; a thing has been
         happening for weeks and the record is the only one that counted. `role="note"` and no
         intent colour, because the day it looks like an error is the day it gets dismissed
         unread. -->
    {#if seen}
      <aside class="seen" role="note">
        <Icon name="observe" size="s" />
        <p class="seen-said">
          <strong>{seen.n} writes</strong> to
          <!-- A NAME AND NOT A LINK. The writes were REFUSED, so there are no rows to filter to and
               nowhere in this build that shows a field's own declaration; a link that went to a
               filter matching nothing would be worse than the plain word. -->
          {#if seen.field}<em class="seen-field">{seen.field.label}</em>{:else}this register{/if}
          were refused over {seen.days} days — {seen.fix}.
          <span class="seen-code" title={seen.why}>{seen.code} · {seen.window}</span>
        </p>
        <Button
          weight="quiet"
          onclick={() => toasts.push(copy.notWritten(`${seen?.field?.label ?? id} would be raised as a question on /decide, with the ${seen?.n} refused writes attached`), { intent: 'warn' })}
        >{copy.raiseIt}</Button>
      </aside>
    {/if}

    {#if rows.length === 0}
      <!-- THE QUERY IS QUOTED VERBATIM, in its own line and in the id face, rather than folded into
           the title as a curly-quoted fragment of a sentence. That is where a predicate stops being
           checkable: a reader cannot tell a filter they typed from one the app built. `Empty` has
           had the prop and the styling for it since it was written and no call site passed it. -->
      <Empty
        kind={emptyKind}
        title={emptyKind === 'no-results'
          ? `${result.total} rows, none matching:`
          : emptyKind === 'cleared'
            ? 'Nothing outstanding.'
            : `Nothing in ${decl.name} yet.`}
        query={emptyKind === 'no-results' ? q || whereOf(filters) : undefined}
        body={emptyKind === 'no-data-yet'
          ? `${decl.name} holds ${decl.holds}.`
          : undefined}
        agentPrompt={emptyKind === 'no-data-yet'
          ? `read my record, then add every ${decl.one} you find`
          : undefined}
      >
        {#snippet actions()}
          {#if emptyKind === 'no-results'}
            <Button href="/r/{id}">{copy.clearFilters}</Button>
          {:else if emptyKind === 'no-data-yet'}
            <Button weight="primary" onclick={() => (createOpen = true)}>{copy.addOne}</Button>
            <Button onclick={() => toasts.push(copy.notWritten('One example row would be added, marked `example`'), { intent: 'warn' })}>{copy.showExample}</Button>
          {/if}
        {/snippet}
      </Empty>
    {:else}
      <!-- Below 640px the default body is CARDS over the register's three declared `mobile:` fields,
           and the table is one `v` away. Which fields a card shows comes from the declaration, never
           from a media query: a phone is not a narrow desktop, and the register knows what matters
           about its own rows better than a breakpoint does (13 §10, 50 §5.2 step 10). -->
      <ul class="cards">
        {#each result.entries.slice(0, DOM_CAP) as e}
          <li>
            <a class="card" href="/r/{id}/{e.seq}">
              <span class="card-seq">#{e.seq}</span>
              <span class="card-title" dir={dirOf(id, decl.mobile[0])}>{display(id, decl.mobile[0], e.fields[decl.mobile[0]]) ?? '—'}</span>
              <span class="card-b" dir={dirOf(id, decl.mobile[1])}>{display(id, decl.mobile[1], e.fields[decl.mobile[1]]) ?? ''}</span>
              <span class="card-c" dir={dirOf(id, decl.mobile[2])}>{display(id, decl.mobile[2], e.fields[decl.mobile[2]]) ?? ''}</span>
            </a>
          </li>
        {/each}
      </ul>

      <!-- THE VERBS, above the rows they act on and nowhere else. It appears with the selection and
           goes with it: a permanently visible bulk bar is a row of disabled controls, which tells
           you a thing exists and refuses to say why it will not work. -->
      {#if picked.length > 0}
        <div class="picked-bar" role="toolbar" aria-label="{picked.length} {copy.selected}">
          <span class="picked-n num">{picked.length}</span>
          <span class="picked-word">{copy.selected}</span>
          <Button weight="quiet" onclick={() => void copyIds()}>
            <Icon name="copy" size="s" />{copy.copyIds}
          </Button>
          {#if states.length}
            <Menu label={copy.setState}>
              {#snippet trigger()}<span class="picked-verb"><Icon name="edit" size="s" />{copy.setState}</span>{/snippet}
              {#each states as state}
                <button
                  class="mi"
                  role="menuitem"
                  type="button"
                  onclick={() =>
                    toasts.push(copy.notWritten(`${picked.length} rows would be set to ${state.replace(/_/g, ' ')}`), {
                      intent: 'warn',
                    })}
                >
                  <span class="mi-name">{state.replace(/_/g, ' ')}</span>
                </button>
              {/each}
            </Menu>
          {/if}
          <Button weight="quiet" onclick={archiveSelected}>
            <Icon name="archive" size="s" />{copy.archiveSelected}
          </Button>
          <button type="button" class="picked-clear" onclick={() => (selected = new Set())}>{copy.clear}</button>
        </div>
      {/if}

      <div class="table-slot">
        <Table
          {columns}
          {rows}
          total={result.matched}
          cap={DOM_CAP}
          label={decl.name}
          {sort}
          selected={selectedKeys}
          bind:focus
          onactivate={(row) => goto(`/r/${id}/${row.key.split('#')[1]}`)}
          onsort={(field) =>
            setParam((p) => p.set('sort', `${field}:${sort?.field === field && sort.dir === 'asc' ? 'desc' : 'asc'}`))}
        >
          {#snippet cellSnippet(row, column, value)}
            {@const seq = Number(row.key.split('#')[1])}
            {@const ident = identityOf(id, column.field, entry(id, seq)?.fields[column.field])}
            {#if column.field === 'select'}
              <button
                type="button"
                class="pick"
                tabindex="-1"
                data-on={selected.has(seq) ? '' : undefined}
                aria-label="{selected.has(seq) ? copy.deselect : copy.select} {display(id, decl.title, entry(id, seq)?.fields[decl.title]) ?? `#${seq}`}"
                onclick={(e) => {
                  /* The cell activates the row. Without this, picking one opened it. */
                  e.stopPropagation();
                  toggleSelect(seq, e.shiftKey);
                }}
              >
                {#if selected.has(seq)}<Icon name="check" size="s" />{/if}
              </button>
            {:else if ident}
              <IdentityMark identity={ident} />
            {:else if value === null}
              <span class="missing">—</span>
            {:else}{value}{/if}
          {/snippet}
        </Table>
      </div>
    {/if}
  </div>

  <!-- Peek: a drawer, with the list still visible, for triage. It needs a VISIBLE affordance —
       Linear's own docs admit the flaw that Peek can only be launched with the keyboard shortcut,
       and users do not press `?` to discover what they do not know exists (19 §4). -->
  <Sheet
    open={peeked !== null}
    title={String(peekedEntry?.fields[decl.title] ?? '')}
    id="#{peeked ?? ''}"
    onclose={() => (peeked = null)}
  >
    {#if peekedEntry}
      <!-- FORMATTED, through the same `display` every other surface goes through.

           This drew `peekedEntry.fields[f.id]` straight out of the row, which is how the drawer
           came to show `amount 480000`, `party 1` and `due 2026-07-27` beside a table showing
           `GBP 4,800.00`, `Halden Type Co` and `27 Jul 2026` for the same row. Money in minor units
           on a screen a person reads is the one formatting bug this product cannot ship, and a
           `ref` rendered as the integer it is stored as is a row nobody can identify.

           Labels go through `labelOf` for the same reason: the drawer was printing raw field ids. -->
      <dl class="peek">
        {#each readableFields(id) as f}
          <dt>{labelOf(f)}</dt>
          <dd dir={dirOf(id, f.id)}>{display(id, f.id, peekedEntry.fields[f.id]) ?? MISSING}</dd>
        {/each}
      </dl>
    {/if}
    {#snippet footer()}
      <Button weight="primary" href="/r/{id}/{peeked}"><Icon name="external" size="s" />{copy.openRow}</Button>
      <Button weight="bare" onclick={() => (peeked = null)}><Icon name="close" size="s" />{copy.close}</Button>
    {/snippet}
  </Sheet>

  <!-- Put this filter on a page as a block. `⌥B`, and it was a toast until now. -->
  <BindBlock
    bind:open={bindOpen}
    register={id}
    predicate={whereOf(filters) || q || copy.everything}
    says={whereOf(filters) || (q ? `matching “${q}”` : copy.everything)}
    onbind={(toPage, kind) =>
      toasts.push(copy.notWritten(`This ${kind} would be added to ${toPage}, reading ${decl.name.toLowerCase()}`), { intent: 'warn' })}
  />

  <!-- Display options: what YOU see, never what the record says. `v`. -->
  <Sheet bind:open={displayOpen} title={copy.display}>
    <p class="display-note">{copy.displayNote}</p>
    <div class="filter-groups">
      <fieldset class="filter-group">
        <legend class="filter-legend">{copy.columns}</legend>
        <div class="filter-values">
          {#each columnsFor(id) as c}
            {@const locked = c.field === 'seq' || c.field === decl.title}
            <button
              type="button"
              class="filter-value"
              data-on={!hidden.has(c.field) ? '' : undefined}
              aria-pressed={!hidden.has(c.field) ? 'true' : 'false'}
              disabled={locked}
              onclick={() => hide(c.field, !hidden.has(c.field))}
            >
              <span class="filter-box" aria-hidden="true">{hidden.has(c.field) ? '' : '✓'}</span>
              {c.label}
              {#if locked}<span class="locked">{copy.always}</span>{/if}
            </button>
          {/each}
        </div>
      </fieldset>
    </div>

    {#snippet footer()}
      <Button weight="primary" onclick={() => (displayOpen = false)}><Icon name="check" size="s" />{copy.done}</Button>
      {#if hidden.size > 0}
        <Button weight="bare" onclick={() => showAll()}>{copy.showAll}</Button>
      {/if}
    {/snippet}
  </Sheet>

  <!-- The filter drawer. The bar above holds the enum filters because they are the ones worth a
       permanent control; everything else declared `indexed:` lives here, so the bar stays one line
       on a register with eight filterable fields.

       ONLY INDEXED FIELDS ARE OFFERED. A filter on an unindexed field is a promise the storage
       cannot keep at five thousand rows, and a control that gets slower the more rows you have is a
       control that breaks exactly when the register becomes worth filtering. -->
  <RowMenu
    open={menuOpen}
    at={menuAt}
    label={copy.rowMenu}
    onclose={() => (menuAt = null)}
  >
    {#if menuRow}
      {@const seq = menuRow.seq}
      <!-- A glyph per verb. The rail's menu has always had them and this one never did, so four
           rows of identical grey text carried the whole distinction between opening a row and
           throwing it away. -->
      <a class="mi" role="menuitem" href="/r/{id}/{seq}">
        <Icon name="external" size="s" />
        <span class="mi-name">{copy.openRow}</span><Kbd keys="↵" />
      </a>
      <button class="mi" role="menuitem" type="button" onclick={() => (peeked = seq)}>
        <Icon name="eye" size="s" />
        <span class="mi-name">{copy.peek}</span><Kbd keys="p" />
      </button>
      <button class="mi" role="menuitem" type="button" onclick={() => void copyId(seq)}>
        <Icon name="copy" size="s" />
        <span class="mi-name">{copy.copyId}</span><Kbd keys="y" />
      </button>
      <button class="mi" role="menuitem" type="button" onclick={() => void copyLink(seq)}>
        <Icon name="link" size="s" />
        <span class="mi-name">{copy.copyLink}</span><Kbd keys="⇧Y" />
      </button>
      <hr class="mi-rule" />
      <button class="mi" role="menuitem" type="button" onclick={() => archive(seq)}>
        <Icon name="archive" size="s" />
        <span class="mi-name">{copy.archive}</span><Kbd keys="⌫" />
      </button>
    {/if}
  </RowMenu>

  <!-- The new-row drawer. Every control in it comes from the register's own field declarations —
       see RowForm — so a pack that adds a field gets a form field, and nobody writes a second copy
       of the schema in markup. -->
  <Sheet bind:open={createOpen} title="{copy.newRow} {decl.one}">
    <RowForm register={id} />
    {#snippet footer()}
      <Button
        weight="primary"
        onclick={() => {
          createOpen = false;
          toasts.push(copy.savedNothing, { intent: 'warn' });
        }}
      >
        {copy.addRow} {decl.one}
      </Button>
      <Button weight="bare" onclick={() => (createOpen = false)}>{copy.close}</Button>
    {/snippet}
  </Sheet>

  <Sheet bind:open={filterOpen} title={copy.filter}>
    {#if filterable.length === 0}
      <p class="filter-none">{copy.noFilters}</p>
    {:else}
      <div class="filter-groups">
        {#each filterable as f}
          <fieldset class="filter-group">
            <legend class="filter-legend">{labelOf(f)}</legend>
            {#if f.type === 'enum'}
              <div class="filter-values">
                {#each f.values ?? [] as value}
                  {@const on = isOn(f.id, value)}
                  <button
                    type="button"
                    class="filter-value"
                    data-on={on ? '' : undefined}
                    aria-pressed={on ? 'true' : 'false'}
                    onclick={() => toggleFilter(f.id, value)}
                  >
                    <span class="filter-box" aria-hidden="true">{on ? '✓' : ''}</span>
                    {value.replace(/_/g, ' ')}
                  </button>
                {/each}
              </div>
            {:else}
              <!-- ABSENT, not disabled. A range control that cannot be built yet is not shown as a
                   greyed-out one: a disabled control tells you a thing exists and refuses to say
                   why it will not work (23 §8). This says what it can filter on instead. -->
              <p class="filter-kind">{copy.filterKind(f.type)}</p>
            {/if}
          </fieldset>
        {/each}
      </div>
    {/if}

    {#snippet footer()}
      <Button weight="primary" onclick={() => (filterOpen = false)}>{copy.done}</Button>
      {#if filters.length}
        <Button weight="bare" href="/r/{id}">{copy.clearFilters}</Button>
      {/if}
    {/snippet}
  </Sheet>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-4) var(--sp-6) var(--sp-9);
  }

  /* A NOTE READS AS A NOTE. One hairline, the page's own paper, no intent colour and no fill: it
     sits above the grid the way a margin annotation sits beside a paragraph. The code is set in the
     id face at the smallest size so an operator can find it and a bookkeeper's eye skips it. */
  .seen {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink2);
  }

  .seen-said {
    flex: 1;
    margin: 0;
    font-size: var(--t-sm);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .seen-said strong { color: var(--ink); font-weight: 600; }
  .seen-field { color: var(--ink); font-style: normal; font-weight: 600; }

  .seen-code {
    margin-inline-start: var(--sp-2);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    color: var(--dim);
    white-space: nowrap;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* The menu rows: the same 34px, the same tint-on-hover, and each printing the key it stands in
     for — so using the menu teaches the key that replaces it. */
  .mi {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: 34px;
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-ui);
    text-align: start;
    text-decoration: none;
    cursor: pointer;
  }

  .mi:hover,
  .mi:focus-visible {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
  }

  .mi-name {
    flex: 1;
  }

  .mi-rule {
    margin: 4px 0;
    border: 0;
    border-block-start: 1px solid var(--line);
  }

  /* Above the rows it acts on, and only while there is a selection: a permanently visible bulk bar
     is a row of disabled controls, which tells you a thing exists and refuses to say why it will
     not work. It wraps rather than scrolls, so the verbs survive a phone. */
  .picked-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-block-end: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: var(--r-md);
    color: var(--accent-text);
    font-size: var(--t-ui);
  }

  .picked-word {
    margin-inline-end: var(--sp-2);
  }

  .picked-verb {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .picked-n {
    font-weight: 700;
  }

  /* The pointer's way in. It is `tabindex="-1"` — a grid has one tab stop — so it never takes focus
     and never needs a focus ring; the keyboard path is `x`, which the `?` sheet advertises. */
  .pick {
    display: grid;
    place-items: center;
    inline-size: 16px;
    block-size: 16px;
    padding: 0;
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--accent-ink);
    cursor: pointer;
  }

  .pick[data-on] {
    background: var(--accent);
    border-color: var(--accent-edge);
  }

  .picked-clear {
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 0.18em;
    cursor: pointer;
  }

  .bar-hint {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-inline-start: auto;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .peek {
    display: grid;
    grid-template-columns: minmax(0, 12ch) minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-3);
    margin: 0;
  }

  .filter-groups {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .filter-group {
    margin: 0;
    padding: 0;
    border: 0;
  }

  .filter-legend {
    margin-block-end: var(--sp-2);
    padding: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .filter-values {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* A full-width row, not a chip. Eight values in a wrapped chip cloud is a shape you have to scan;
     a column of rows with the boxes aligned is a shape you can run your eye down. */
  .filter-value {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 34px;
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .filter-value:hover {
    background: color-mix(in srgb, var(--ink) 5%, transparent);
    color: var(--ink);
  }

  .filter-value[data-on] {
    color: var(--ink);
    font-weight: 500;
  }

  .filter-box {
    display: grid;
    place-items: center;
    inline-size: 17px;
    block-size: 17px;
    flex: none;
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--accent-ink);
    font-size: var(--t-xs);
    line-height: 1;
  }

  .filter-value[data-on] .filter-box {
    background: var(--accent);
    border-color: var(--accent);
  }

  .display-note {
    margin-block-end: var(--sp-4);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .locked {
    margin-inline-start: auto;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .filter-value:disabled {
    cursor: default;
    opacity: 0.75;
  }

  .filter-kind,
  .filter-none {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .peek dt {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .peek dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    overflow-wrap: anywhere;
  }

  /* Above 640px the cards do not exist. Below it, the table does not — the register keeps ONE body
     and the other is an explicit choice, so there is never a moment where both are half-visible. */
  .cards {
    display: none;
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }

    /* Only ONE rule belongs in this block, and thirty lines of `.mi` and `.picked` were pasted in
       beside it — identical to the top-level ones, at the wrong indentation, re-declaring what was
       already true. Dead weight in the bundle, and a media query that lies about what it changes. */
  .bar-hint {
      display: none;
    }
  }

  @media (width < 640px) {
    .table-slot {
      display: none;
    }

    .cards {
      display: block;
      margin: 0;
      padding: 0;
      list-style: none;
      background: var(--s1);
      border: 1px solid var(--line);
      border-radius: var(--r-md);
      box-shadow: var(--raise);
      overflow: hidden;
    }

    .cards li + li .card {
      border-block-start: 1px solid var(--line);
    }

    .card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 2px var(--sp-3);
      /* 44px on both axes. A control grown only in height measures 38 x 44 and fails (13 §7). */
      min-block-size: 56px;
      padding: var(--sp-2) var(--sp-4);
      color: var(--ink);
      font-size: var(--t-ui);
      text-decoration: none;
    }

    .card-seq {
      grid-column: 2;
      grid-row: 1;
      color: var(--dim);
      font-family: var(--font-id);
      font-size: var(--t-xs);
      text-align: end;
    }

    .card-title {
      grid-column: 1;
      grid-row: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-b {
      grid-column: 1;
      grid-row: 2;
      color: var(--dim);
      font-size: var(--t-xs);
      font-variant-numeric: tabular-nums;
    }

    .card-c {
      grid-column: 2;
      grid-row: 2;
      color: var(--dim);
      font-size: var(--t-xs);
      font-variant-numeric: tabular-nums;
      text-align: end;
    }
  }
</style>
