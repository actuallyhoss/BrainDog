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
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { Table } from 'braindog-render/svelte';
  import { copy } from '$lib/copy.ts';
  import { REGISTERS, columnsFor, display, entry, identityOf, list, toRows, type Filter } from '$lib/record/api.ts';
  import IdentityMark from '$lib/ui/IdentityMark.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';

  const DOM_CAP = 2000;

  const id = $derived(page.params.register ?? '');
  const decl = $derived(REGISTERS[id]);

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

  const columns = $derived(columnsFor(id));
  const result = $derived(list(id, { filters, q, ...(sort ? { sort } : {}) }));
  const rows = $derived(toRows(id, result.entries.slice(0, DOM_CAP), columns));

  let focus = $state({ row: 0, col: 1 });
  let peeked = $state<number | null>(null);
  let filterOpen = $state(false);

  const peekedEntry = $derived(peeked === null ? undefined : entry(id, peeked));

  /** Only INDEXED fields are offered, in declaration order, at most eight. A filter on an unindexed
      field is a promise the storage cannot keep at 5,000 rows. */
  const filterable = $derived((decl?.fields ?? []).filter((f) => f.indexed).slice(0, 8));

  function setParam(mutate: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(page.url.searchParams);
    mutate(next);
    goto(`?${next}`, { replaceState: false, noScroll: true, keepFocus: true });
  }

  const toggleFilter = (field: string, value: string) =>
    setParam((p) => {
      const existing = p.getAll('f').filter((v) => !v.startsWith(`${field}:`));
      const current = filters.find((f) => f.field === field)?.values ?? [];
      const values = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      p.delete('f');
      for (const v of existing) p.append('f', v);
      if (values.length) p.append('f', `${field}:in:${values.join(',')}`);
    });

  function onkeydown(e: KeyboardEvent) {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

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
    }
  }

  const emptyKind = $derived(
    result.total === 0 ? 'no-data-yet' : q || filters.length ? 'no-results' : 'cleared',
  );
</script>

<svelte:window {onkeydown} />

{#if !decl}
  <div class="page">
    <Empty kind="error" title="Couldn't load {id}." rid="r7k2m9qd4x">
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <PageHead
    title={decl.name}
    count={result.matched}
    total={result.total}
  >
    {#snippet actions()}
      <Button weight="quiet" onclick={() => (filterOpen = true)}>
        <Icon name="filter" size="s" />
        {copy.filter}
      </Button>
      <Button weight="primary">{copy.newRow} {decl.one}</Button>
    {/snippet}
  </PageHead>

  <div class="page">
    <div class="bar">
      <label class="search">
        <Icon name="search" size="s" />
        <input
          class="search-input"
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
        <div class="chips" role="group" aria-label={f.id}>
          {#each f.values ?? [] as value}
            {@const on = filters.find((x) => x.field === f.id)?.values.includes(value)}
            <button type="button" class="chip" data-on={on ? '' : undefined} onclick={() => toggleFilter(f.id, value)}>
              {value.replace(/_/g, ' ')}
            </button>
          {/each}
        </div>
      {/each}

      {#if q || filters.length}
        <Button weight="bare" href="/r/{id}">{copy.clearFilters}</Button>
      {/if}

      <span class="bar-hint">
        <Kbd keys="j  k" /> move <Kbd keys="p" /> peek <Kbd keys="↵" /> open
      </span>
    </div>

    {#if rows.length === 0}
      <Empty
        kind={emptyKind}
        title={emptyKind === 'no-results'
          ? `${result.total} rows, none matching “${q || filters.map((f) => f.values.join(', ')).join(' ')}”.`
          : emptyKind === 'cleared'
            ? 'Nothing outstanding.'
            : `Nothing in ${decl.name} yet.`}
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
            <Button weight="primary">{copy.addOne}</Button>
            <Button>{copy.showExample}</Button>
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
              <span class="card-title">{display(id, decl.mobile[0], e.fields[decl.mobile[0]]) ?? '—'}</span>
              <span class="card-b">{display(id, decl.mobile[1], e.fields[decl.mobile[1]]) ?? ''}</span>
              <span class="card-c">{display(id, decl.mobile[2], e.fields[decl.mobile[2]]) ?? ''}</span>
            </a>
          </li>
        {/each}
      </ul>

      <div class="table-slot">
        <Table
          {columns}
          {rows}
          total={result.matched}
          cap={DOM_CAP}
          label={decl.name}
          {sort}
          bind:focus
          onactivate={(row) => goto(`/r/${id}/${row.key.split('#')[1]}`)}
          onsort={(field) =>
            setParam((p) => p.set('sort', `${field}:${sort?.field === field && sort.dir === 'asc' ? 'desc' : 'asc'}`))}
        >
          {#snippet cellSnippet(row, column, value)}
            {@const seq = Number(row.key.split('#')[1])}
            {@const ident = identityOf(id, column.field, entry(id, seq)?.fields[column.field])}
            {#if ident}
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
    id="{id}#{peeked ?? ''}"
    onclose={() => (peeked = null)}
  >
    {#if peekedEntry}
      <dl class="peek">
        {#each decl.fields as f}
          <dt>{f.label ?? f.id.replace(/_/g, ' ')}</dt>
          <dd>{peekedEntry.fields[f.id] ?? '—'}</dd>
        {/each}
      </dl>
    {/if}
    {#snippet footer()}
      <Button weight="primary" href="/r/{id}/{peeked}">{copy.openRow}</Button>
      <Button weight="bare" onclick={() => (peeked = null)}>Close</Button>
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

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* A field is a HOLE cut into the page, so it takes the raised surface and a real border rather
     than the sunk one: on a cream ground a sunk field and the page are the same colour, and the
     input stops looking like somewhere you can type. */
  .search {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--dim);
    transition: border-color var(--d-state) var(--ease-out);
  }

  .search:hover {
    border-color: var(--edge);
  }

  /* The ring is drawn on the WRAPPER, because the input inside it has no border of its own and a
     ring around a borderless box lands in the wrong place by a pixel on every platform. */
  .search:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
  }

  .search-input {
    inline-size: 22ch;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--ink);
    font-size: var(--t-ui);
  }

  /* A segmented control, not a row of buttons: one sunk track, and the chosen option is a raised
     card sitting in it. The selected state has to be a SHAPE and not a shade — a slightly lighter
     grey behind one word out of four is the single most-missed control in dense software. */
  .chips {
    display: flex;
    gap: 2px;
    padding: 2px;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
  }

  .chip {
    min-block-size: 28px;
    padding: 0 var(--sp-3);
    background: none;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .chip:hover:not([data-on]) {
    background: color-mix(in srgb, var(--ink) 5%, transparent);
    color: var(--ink2);
  }

  .chip[data-on] {
    background: var(--s3);
    border-color: var(--line);
    color: var(--ink);
    font-weight: 600;
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
