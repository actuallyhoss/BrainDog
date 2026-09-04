<!--
  A saved view: `/v/obligations.overdue`.

  The up half of the two-altitude ladder. Filter a register, press ⌥V, and the filter becomes a
  NAMED PREDICATE on the register's own declaration — a first-class object with an owner and a share
  link, in one keystroke, because THE URL IS THE SERIALISATION. There is no "save this search"
  dialog and nothing to publish (19 §1).

  `order` stays URL state and is not part of the saved object: what you are looking at is the
  predicate; how it is sorted is how you happen to be looking at it today.
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { Table } from 'braindog-render/svelte';
  import { copy } from '$lib/copy.ts';
  import { iconFor, REGISTERS, columnsFor, list, toRows, type Filter } from '$lib/record/api.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import BindBlock from '$lib/ui/BindBlock.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { PAGES } from '$lib/record/data.ts';

  /** A register's named predicate, never a free-form slug. */
  const VIEWS: Record<string, { register: string; name: string; filters: Filter[]; says: string }> = {
    'obligations.overdue': {
      register: 'obligations',
      name: 'Overdue',
      filters: [{ field: 'state', op: 'in', values: ['open', 'part'] }],
      says: 'state is open or part, and due is before today',
    },
    'services.lapsing': {
      register: 'services',
      name: 'Lapsing',
      filters: [{ field: 'state', op: 'in', values: ['lapsing'] }],
      says: 'state is lapsing',
    },
  };

  const key = $derived(page.params.view ?? '');
  const view = $derived(VIEWS[key]);
  const decl = $derived(view ? REGISTERS[view.register] : undefined);
  const columns = $derived(view ? columnsFor(view.register) : []);
  const result = $derived(view ? list(view.register, { filters: view.filters }) : { entries: [], total: 0, matched: 0 });
  const rows = $derived(view ? toRows(view.register, result.entries, columns) : []);

  let focus = $state({ row: 0, col: 1 });
  let binding = $state(false);

  /* `⌥B`, which 50 §5.2 step 9 has specified all along and nothing bound. */
  function onkeydown(e: KeyboardEvent) {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
    if (e.altKey && e.key.toLowerCase() === 'b' && view) {
      e.preventDefault();
      binding = true;
    }
  }
</script>

<svelte:head><title>{titleOf(view?.name, 'View')}</title></svelte:head>

<svelte:window {onkeydown} />

{#if !view || !decl}
  <div class="page">
    <Empty kind="error" heading title="No view called {key}." body="A saved view is a register and a predicate name, joined by a dot." rid="r7k2m9qd4x">
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <PageHead icon={iconFor(decl.icon, 'rows')} kicker="{decl.name} · saved view" title={view.name} count={result.matched} total={result.total}>
    {#snippet actions()}
      <Button weight="bare" href="/r/{view.register}">Open the register<Kbd keys="o" /></Button>
      <Button weight="quiet" onclick={() => (binding = true)}>{copy.bindBlock}<Kbd keys="⌥B" /></Button>
    {/snippet}
  </PageHead>

  <BindBlock
    bind:open={binding}
    register={view.register}
    predicate={view.name}
    says={view.says}
    onbind={(target, kind) => toasts.push(copy.bound(kind, PAGES[target]?.title ?? target), { intent: 'warn' })}
  />

  <div class="page">
    <p class="predicate">
      <span class="predicate-label">Filter</span>
      <code>{view.says}</code>
    </p>

    <Table
      {columns}
      {rows}
      total={result.matched}
      label={view.name}
      bind:focus
      onactivate={(row) => goto(`/r/${view.register}/${row.key.split('#')[1]}`)}
    />
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
  }

  .predicate {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .predicate-label {
    letter-spacing: 0.055em;
    text-transform: uppercase;
  }

  .predicate code {
    padding: 2px var(--sp-2);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-family: var(--font-id);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }
  }
</style>
