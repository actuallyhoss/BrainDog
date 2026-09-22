<!--
  Automations: `/automations`, the list (`loop/research-shell-automations.md` §6, Brief E).

  ONE ROW EACH: its name, what starts it, and where it stands, in the words the scheduled-actions list uses, so an
  automation and a scheduled action read alike on the two screens that show them. A row opens the canvas.

  EVERY RULE IS HERE, the ones an agent wrote and the ones a pack installed, because an automation is a rule that grew a
  trigger and steps rather than a kind of its own: a rule installed before this screen existed is an automation whose
  trigger is a change, and it opens on the same canvas.

  A RECORD WITHOUT THE READ STILL OFFERS NEW. Listing needs Brief D's `automations` method; drawing one and sending it
  needs only `propose`, which every record has. So a record that cannot list says so and keeps the button.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { titleOf } from '$lib/title.ts';
  import { NOW } from '$lib/record/api.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';
  import { words } from '$lib/flow/flow.ts';
  import { openAutomations, rowLine, rowTrigger, type AutomationRow } from '$lib/flow/source.ts';

  let from = $state<'reading' | 'ready' | 'absent' | 'refused'>('reading');
  let rows = $state<AutomationRow[]>([]);
  let sample = $state(false);
  let fix = $state('');

  async function load() {
    const at = opened();
    const out = await openAutomations((url, init) => fetch(url, init), '', () => NOW);
    closed(out.first.ok || out.absent, at);
    sample = out.source.sample;
    if (out.first.ok) {
      rows = out.first.value;
      from = 'ready';
    } else if (out.absent) from = 'absent';
    else {
      fix = out.first.refusal.fix;
      from = 'refused';
    }
  }

  $effect(() => {
    untrack(() => void load());
  });
  $effect(() => {
    if (from === 'ready' && rows.length > 0) drew('ready');
  });

  const now = $derived(sample ? NOW : Date.now());
</script>

<svelte:head><title>{titleOf(words.heading)}</title></svelte:head>

{#if from === 'refused'}
  <div class="page">
    <Empty kind="error" heading title={fix} />
  </div>
{:else if from !== 'reading'}
  <PageHead icon="refresh" title={words.heading} count={from === 'ready' ? rows.length : undefined}>
    {#snippet actions()}
      <Button weight="primary" href="/automations/new">{words.newOne}</Button>
    {/snippet}
  </PageHead>
  <div class="page">
    {#if sample}<p class="note">{words.sample}</p>{/if}
    {#if from === 'absent'}
      <Empty kind="no-data-yet" title={words.absent} />
    {:else if rows.length === 0}
      <Empty kind="no-data-yet" title={words.none} body={words.noneWhy} />
    {:else}
      <ul class="rows">
        {#each rows as r (r.id)}
          <li>
            <a class="row tap" href="/automations/{encodeURIComponent(r.id)}" data-off={r.enabled ? undefined : ''}>
              <span class="name">{r.name}</span>
              <span class="what">{rowTrigger(r)}</span>
              <span class="where">{rowLine(r, now)}</span>
              <span class="path">{r.path === 'inline' ? words.inline : words.asRun}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: 820px;
  }

  .note {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .rows {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
    border-block-start: 1px solid var(--line);
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
    padding: var(--sp-3) var(--sp-2);
    border-block-end: 1px solid var(--line);
    color: inherit;
    text-decoration: none;
  }

  .row:hover {
    background: var(--hover-wash);
  }

  .row[data-off] .name {
    color: var(--dim);
  }

  .name {
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 600;
  }

  .what {
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  .where,
  .path {
    color: var(--dim);
    font-size: var(--t-sm);
  }
</style>
