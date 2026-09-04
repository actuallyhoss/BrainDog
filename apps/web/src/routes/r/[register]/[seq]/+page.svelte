<!--
  One row.

  A label is VISIBLE, always. A placeholder is not a label — it disappears exactly when a user needs
  it, and it fails contrast in most themes (06 §8). Every field below carries its own label whether
  or not it has a value.

  `#125` is the number you can say out loud, and it is per-register, which is why renaming a register
  is refused: `register.obligations → register.bills` renames a spoken id, and `#125` in a note would
  stop resolving. Change the display name instead; it is free.
-->
<script lang="ts">
  import { relative } from 'braindog-render';
  import { Document } from 'braindog-render/svelte';
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import {
    AUDIT,
    CURRENCY,
    NOW,
    REGISTERS,
    display,
    dirOf,
    entry,
    identityOf,
    labelOf,
    values,
  } from '$lib/record/api.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import IdentityMark from '$lib/ui/IdentityMark.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';

  const id = $derived(page.params.register ?? '');
  const seq = $derived(Number(page.params.seq));
  const decl = $derived(REGISTERS[id]);
  const row = $derived(entry(id, seq));

  const history = $derived(AUDIT.filter((e) => e.target === `${id}#${seq}`));

  const state = $derived(decl?.state ? String(row?.fields[decl.state] ?? '') : '');
  const tone = $derived(decl?.done?.includes(state) ? ('good' as const) : undefined);

  /* A `document` is an argument, not a figure, so it never sits in the field list beside a date and
     a currency — it gets the room prose needs (05 §7.1). */
  const documents = $derived((decl?.fields ?? []).filter((f) => f.type === 'document'));
  const shortFields = $derived((decl?.fields ?? []).filter((f) => f.type !== 'document'));

  const resolved = values();
  const resolve = (path: string) => resolved[path] ?? null;
  /** A link the host cannot resolve is plain text, never a dead anchor (36 §13 D16). */
  const link = (spoken: string) => {
    const m = /^([a-z][a-z0-9_]*)#(\d+)$/.exec(spoken);
    return m && REGISTERS[m[1]!] ? `/r/${m[1]}/${m[2]}` : null;
  };
</script>

{#if !decl || !row}
  <div class="page">
    <!-- A URL naming a row that is not there is a MISS, not a failure: nothing broke, the address is
         just wrong. `error` is reserved for a call that did not come back. -->
    <Empty kind="no-results" title="Couldn't find {id}#{seq}." rid="r7k2m9qd4x">
      {#snippet actions()}<Button href="/r/{id}">Back to {decl?.name ?? id}</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <PageHead kicker={decl.name} title={String(row.fields[decl.title] ?? '')} id="#{row.seq}">
    {#snippet actions()}
      <Button weight="bare">{copy.copyId}<Kbd keys="y" /></Button>
      <Button weight="quiet" onclick={() => toasts.push(copy.notWritten('The row would open for editing'), { intent: 'warn' })}>Edit</Button>
    {/snippet}
  </PageHead>

  <div class="page">
    <div class="split">
      <section class="fields">
        <dl class="field-list">
          {#each shortFields as f}
            {@const value = row.fields[f.id]}
            <div class="field">
              <dt class="field-label">{labelOf(f)}</dt>
              <dd class="field-value" data-type={f.type} dir={dirOf(id, f.id)}>
                {#if value === null || value === undefined || value === ''}
                  <span class="missing">—</span>
                {:else if f.type === 'money'}
                  <Money minor={Number(value)} currency={CURRENCY} weight="strong" />
                {:else if f.id === decl.state}
                  <Chip label={String(value).replace(/_/g, ' ')} {tone} />
                {:else if identityOf(id, f.id, value)}
                  <IdentityMark identity={identityOf(id, f.id, value)!} size="md" />
                {:else if f.type === 'day'}
                  {display(id, f.id, value)}
                  <span class="rel">{relative(String(value), NOW)}</span>
                {:else}
                  {display(id, f.id, value)}
                {/if}
              </dd>
            </div>
          {/each}
        </dl>

        <!-- A `document` field is the dialect, drawn by the same interpreter a declared page uses.
             The read view IS the renderer, so what you are looking at is the artefact (22 §8). -->
        {#each documents as f}
          {#if row.fields[f.id]}
            <article class="document-slot">
              <h2 class="doc-label">{labelOf(f)}</h2>
              <Document src={String(row.fields[f.id])} opts={{ resolve, link }} />
            </article>
          {/if}
        {/each}
      </section>

      <aside class="side">
        <h2 class="side-title">This row</h2>
        <dl class="meta">
          <dt>Spoken id</dt>
          <dd class="mono">{id}#{row.seq}</dd>
          <dt>Version</dt>
          <dd class="mono">{row.version}</dd>
          <dt>Created</dt>
          <dd>{relative(row.created.slice(0, 10), NOW)} by {row.by}</dd>
        </dl>

        {#if history.length}
          <h2 class="side-title">History</h2>
          <ol class="history">
            {#each history as e}
              <li>
                <span class="history-by">{e.by}</span>
                <span class="history-note">{e.note}</span>
                <span class="history-when">{relative(e.at.slice(0, 10), NOW)}</span>
              </li>
            {/each}
          </ol>
        {/if}
      </aside>
    </div>
  </div>
{/if}

<style>
  .page {
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1140px;
  }

  .split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: var(--sp-5);
    align-items: start;
  }

  .field-list {
    margin: 0;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--raise);
    overflow: hidden;
  }

  .field {
    display: grid;
    grid-template-columns: minmax(0, 16ch) minmax(0, 1fr);
    gap: var(--sp-4);
    align-items: baseline;
    padding: var(--sp-3) var(--sp-4);
    border-block-end: 1px solid var(--line);
  }

  .field:last-child {
    border-block-end: 0;
  }

  /* Sentence case, at body size, at the same weight as a column header. A field label is a WORD
     YOU READ — "Direction", "Amount", "Due" — not a category stamp, and small letterspaced caps
     make eight of them in a column read as a form to be filled rather than a row to be understood.
     Same decision as the table header in blocks.css, held here so the two agree. */
  .field-label {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 600;
    letter-spacing: 0;
  }

  .field-value {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    overflow-wrap: anywhere;
  }

  .field-value[data-type='money'],
  .field-value[data-type='day'] {
    font-variant-numeric: tabular-nums;
  }

  .rel,
  .missing {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .document-slot {
    margin-block-start: var(--sp-6);
  }

  .doc-label {
    margin-block-end: var(--sp-3);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: 0.055em;
    text-transform: uppercase;
  }

  /* Prose gets a reading measure; a table, a grid and a ledger get the room. Width is a property of
     the block KIND, not of the page — the third time that family of bug was paid for (13 §4.1). */
  .document-slot :global(.document > h1) {
    margin-block: var(--sp-5) var(--sp-2);
    font-size: var(--t-xl);
    letter-spacing: -0.026em;
  }

  .document-slot :global(.document > h2) {
    margin-block: var(--sp-6) var(--sp-3);
    font-size: var(--t-md);
    letter-spacing: -0.012em;
  }

  .document-slot :global(.document > h1:first-child) {
    margin-block-start: 0;
  }

  .side-title {
    margin-block-end: var(--sp-2);
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  .side-title + * + .side-title {
    margin-block-start: var(--sp-5);
  }

  .meta {
    display: grid;
    grid-template-columns: minmax(0, 10ch) minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-3);
    margin: 0;
  }

  .meta dt {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .meta dd {
    margin: 0;
    font-size: var(--t-xs);
  }

  .mono {
    font-family: var(--font-id);
  }

  .history {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .history li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px var(--sp-2);
    padding-block-end: var(--sp-2);
    border-block-end: 1px solid var(--line);
  }

  .history-by {
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .history-note {
    grid-column: 1 / -1;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .history-when {
    color: var(--dim);
    font-size: var(--t-xs);
    text-align: end;
  }

  @media (width < 1000px) {
    .split {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }
  }
</style>
