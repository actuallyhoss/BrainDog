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
  import { REGISTERS, applyFilters, columnsFor, entry, list, sortRows, toRows, type Filter } from '$lib/record/api.ts';
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
    subtitle={decl.holds}
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
      />
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
    padding: var(--sp-3) var(--sp-5) var(--sp-7);
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .search {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--dim);
  }

  .search:focus-within {
    border-color: var(--edge);
  }

  .search-input {
    inline-size: 22ch;
    border: 0;
    background: none;
    color: var(--ink);
    font-size: var(--t-ui);
    outline: none;
  }

  .chips {
    display: flex;
    gap: 4px;
    padding: 2px;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
  }

  .chip {
    min-block-size: 24px;
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: 4px;
    color: var(--dim);
    font-size: var(--t-xs);
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .chip:hover {
    color: var(--ink2);
  }

  .chip[data-on] {
    background: var(--s2);
    box-shadow: var(--raise);
    color: var(--ink);
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
    font-size: var(--t-xs);
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .peek dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    overflow-wrap: anywhere;
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-3) var(--sp-3) var(--sp-7);
    }

    .bar-hint {
      display: none;
    }
  }
</style>
