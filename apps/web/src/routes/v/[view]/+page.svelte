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
  import { silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { page } from '$app/state';
  import { Table } from 'braindog-render/svelte';
  import { copy } from '$lib/copy.ts';
  import { VIEWS, iconFor, REGISTERS, columnsFor, list, toRows, whereOf, type Filter } from '$lib/record/api.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import BindBlock from '$lib/ui/BindBlock.svelte';
  import RowCards from '$lib/ui/RowCards.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { PAGES } from '$lib/record/data.ts';

  /**
   * A register's named predicate, never a free-form slug.
   *
   * THE SENTENCE IS DERIVED, NOT TYPED. It used to be a `says:` string beside the filters, and the
   * two disagreed: Overdue printed "state is open or part, and due is before today" above a list
   * that only filtered on state, so 28 rows were drawn under the word Overdue and 24 of them were
   * not overdue — row four was due in four days. A printed predicate that is not the predicate is
   * worse than none, because it is checkable and wrong.
   */

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
    if (typing()) return;
    if (e.altKey && e.key.toLowerCase() === 'b' && view) {
      e.preventDefault();
      binding = true;
      return;
    }
    /* AND `o`, WHICH THE BUTTON BESIDE IT HAS PRINTED SINCE IT WAS WRITTEN. `Open {register}` in
       this page's own header carries a `<kbd>o</kbd>` and nothing listened for it — the same key,
       for the same thing, is live one route over on `/p/<slug>`. A printed key that does nothing
       teaches a reader that the printed keys do nothing.

       `silenced` FIRST, because `o` is a bare letter and `Character keys: off` is what makes the
       whole bare namespace legal (19 §4). This handler asked neither question before. */
    if (silenced(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'o' && view) {
      e.preventDefault();
      void goto(`/r/${view.register}`);
    }
  }
</script>

<svelte:head><title>{titleOf(view?.name, 'View')}</title></svelte:head>

<svelte:window {onkeydown} />

{#if !view || !decl}
  <div class="page">
    <!-- A URL NAMING SOMETHING THIS RECORD DOES NOT HAVE IS A REFUSAL, and the record already has
         the sentence for it. Nothing failed, so there is no request id to quote (`50 §13 D11`), and
         no filter ran, so "nothing matched" is about something that did not happen. It names the
         thing, says it is not here, and lists what is — `10 §7`'s fourth rule: the refusal is the
         teacher. -->
    <Empty
      kind="error"
      heading
      title={copy.noSuch('saved view', key)}
      body={copy.theseExist('Saved views', Object.values(VIEWS).map((v) => v.name))}
    >
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <PageHead icon={iconFor(decl.icon, 'rows')} kicker="{decl.name} · saved view" title={view.name} count={result.matched} total={result.total}>
    {#snippet actions()}
      <Button weight="bare" href="/r/{view.register}"><Icon name="external" size="s" />Open {decl.name}<Kbd keys="o" /></Button>
      <Button weight="quiet" onclick={() => (binding = true)}>{copy.bindBlock}<Kbd keys="⌥B" /></Button>
    {/snippet}
  </PageHead>

  <BindBlock
    bind:open={binding}
    register={view.register}
    predicate={view.name}
    says={whereOf(view.filters)}
    onbind={(target, kind) =>
      toasts.push(copy.bound(copy.kindNames[kind] ?? kind, PAGES[target]?.title ?? target), { intent: 'warn' })}
  />

  <div class="page">
    <p class="predicate">
      <span class="predicate-label">Filter</span>
      <code>{whereOf(view.filters)}</code>
    </p>

    <div class="table-slot">
      <Table
        {columns}
        {rows}
        total={result.matched}
        label={view.name}
        bind:focus
        onactivate={(row) => goto(`/r/${view.register}/${row.key.split('#')[1]}`)}
      />
    </div>

    <!-- THE SAME BODY A REGISTER HAS ON A PHONE. A saved view is that list with a different
         predicate, and it kept the desktop table with its own horizontal scrollbar — two surfaces,
         one device, two behaviours, because one of them was written second. -->
    <RowCards register={view.register} entries={result.entries} />
  </div>
{/if}

<style>
  /* One body at a time, and this is the other half of `RowCards`' own rule. */
  @media (width < 640px) {
    .table-slot {
      display: none;
    }
  }

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
