<!--
  A shared page: signed, read-only, and A LANDING PAGE.

  That one requirement settles the whole routing question. A fragment never reaches the server, so a
  hash-routed share link can have no server-side token check, no preview and no crawlable title —
  which is why the app uses real paths and one catch-all route (19 §5).

  It renders `page(slug)` with `Authorization: Share <token>`, at `me.level = read`, with NO NAV AND
  NO PALETTE: a capability URL must not imply there is a record behind it. And unguessable is not
  authorised — RFC 9562 is explicit that UUIDv7 MUST NOT be used as a security capability. This is
  the ONE capability URL in the product, and it is signed, scoped to one page, and terminally
  revocable.
-->
<script lang="ts">
  import { Block, Table } from 'braindog-render/svelte';
  import { parse } from 'braindog-render';
  import { page as state } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { page as readPage, values } from '$lib/record/api.ts';
  import Mark from '$lib/ui/Mark.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';

  const result = readPage('money');
  const resolved = values();
  const opts = { resolve: (path: string) => resolved[path] ?? null };

  const token = $derived(state.params.token ?? '');
</script>

<div class="shared">
  <header class="bar">
    <a class="brand" href="/">
      <Mark height={22} />
      <span class="wordmark">{copy.product}</span>
    </a>
    <span class="chip">Shared · read only</span>
  </header>

  {#if !result}
    <Empty kind="no-permission" title="This link has been revoked." body="Whoever shared it can send a new one.">
      {#snippet actions()}<Button>{copy.requestAccess}</Button>{/snippet}
    </Empty>
  {:else}
    <main class="body">
      <h1 class="title">{result.page.title}</h1>
      <p class="from">Shared from The Studio · <code>{token.slice(0, 8)}…</code></p>

      {#each result.blocks as block}
        {#if block.drawn}
          <section class="block-slot">
            <h2 class="block-name">{block.heading ?? block.kind}</h2>
            {#if block.kind === 'table'}
              {#if block.rows.length === 0}
                <p class="block-empty">{block.empty}</p>
              {:else}
                <Table columns={block.columns} rows={block.rows} total={block.total} label={block.heading} />
              {/if}
            {:else if block.metrics}
              {#each parse(['```stat', ...block.metrics.map((m) => `${m.label} | ${m.value} | ${m.note}${m.tone ? ` | ${m.tone}` : ''}`), '```'].join('\n')) as segment}
                {#if segment.type === 'block'}<Block block={segment} {opts} />{/if}
              {/each}
            {/if}
          </section>
        {/if}
      {/each}
    </main>

    <footer class="foot">
      A read-only view of one page. The link is signed, scoped to this page, and can be revoked.
    </footer>
  {/if}
</div>

<style>
  .shared {
    max-inline-size: 1000px;
    margin-inline: auto;
    padding: var(--sp-5);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding-block-end: var(--sp-4);
    border-block-end: 1px solid var(--line);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    text-decoration: none;
  }

  .wordmark {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: -0.022em;
  }

  .chip {
    margin-inline-start: auto;
    padding: 2px var(--sp-3);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding-block: var(--sp-5);
  }

  .title {
    font-size: var(--t-2xl);
    letter-spacing: -0.028em;
  }

  .from {
    margin-block-start: calc(var(--sp-5) * -1 + var(--sp-1));
    color: var(--dim);
    font-size: var(--t-ui);
  }

  .from code {
    font-family: var(--font-id);
  }

  .block-name {
    margin-block-end: var(--sp-2);
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  .block-empty {
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--dim);
    font-size: var(--t-ui);
  }

  .foot {
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
    color: var(--dim);
    font-size: var(--t-xs);
  }
</style>
