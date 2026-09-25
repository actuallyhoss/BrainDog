<!--
  Automations: `/automations`, the list (`loop/research-shell-automations.md` §6, Brief E).

  ONE ROW EACH, TWO LINES: its name, then what starts it and where it stands, in the words the scheduled-actions list
  uses, so an automation and a scheduled action read alike on the two screens that show them. A row opens the canvas.
  It was four lines (name, trigger, runs, and whether it runs inside the change or after it), boxed by full rules
  above the list and under every row, with the name at 600; DESIGN-SYSTEM 4.4 is a subject and one line of detail,
  `--line-soft` between rows and nothing round the list. The inside-or-after line is the kernel's path, which matters
  to the record's timing and to nobody choosing what to automate, and it is said once, in the trigger's sheet.

  A DOT FOR WHAT NEEDS A LOOK, AND ONLY THAT. A failed last run takes the danger dot and a turned-off automation a
  neutral one, each leading the sentence that says it ("Last run 2h ago, failed.", "Turned off."), so the dot never
  stands alone (DESIGN-SYSTEM 1.2). A failed run was a sentence in `dim` with nothing to find it by, and a turned-off
  one only a greyer name.

  EVERY RULE IS HERE, the ones an agent wrote and the ones a pack installed, because an automation is a rule that grew a
  trigger and steps rather than a kind of its own: a rule installed before this screen existed is an automation whose
  trigger is a change, and it opens on the same canvas.

  A RECORD WITHOUT THE READ STILL OFFERS NEW. Listing needs Brief D's `automations` method; drawing one and sending it
  needs only `propose`, which every record has. So a record that cannot list says so and keeps the button.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { untrack } from 'svelte';
  import { titleOf } from '$lib/title.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';
  import { words } from '$lib/flow/flow.ts';
  import { openAutomations, rowLine, rowTrigger, type AutomationRow } from '$lib/flow/source.ts';

  let from = $state<'reading' | 'ready' | 'absent' | 'refused'>('reading');
  let rows = $state<AutomationRow[]>([]);
  let fix = $state('');

  async function load() {
    const at = opened();
    const out = await openAutomations((url, init) => fetch(url, init), apiBase());
    closed(out.first.ok || out.absent, at);
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

  /* THIS BROWSER'S CLOCK. It was the seed's 3 September 2026 whenever the list was drawn from the sample. */
  const now = Date.now();

  /* AN AGENT SETS THESE UP AS READILY AS A PERSON (DIRECTION §22), so the empty list says what to ask one, in the form
     every other empty state's prompt takes. An example a person reads and replaces, not a feature the code ships. */
  const agentPrompt = 'read my record, then propose an automation that fetches the US dollar in euros from api.example.com every hour and tells me when it is over 0.95';

  /** The one row state worth a dot. Off first: a turned-off automation's last run is history, and its line says "Turned off." */
  const dotOf = (r: AutomationRow): 'off' | 'failed' | null => (!r.enabled ? 'off' : r.last?.state === 'failed' ? 'failed' : null);
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
    {#if from === 'absent'}
      <Empty kind="no-data-yet" title={words.absent} />
    {:else if rows.length === 0}
      <Empty kind="no-data-yet" title={words.none} body={words.noneWhy} {agentPrompt}>
        {#snippet actions()}<Button href="/automations/new">{words.newOne}</Button>{/snippet}
      </Empty>
    {:else}
      <ul class="rows">
        {#each rows as r (r.id)}
          {@const dot = dotOf(r)}
          <li>
            <a class="row tap" href={at(`/automations/${encodeURIComponent(r.id)}`)}>
              <span class="name">{r.name}</span>
              <span class="detail">
                <span class="what">{rowTrigger(r)}</span>
                <span class="sep" aria-hidden="true">·</span>
                <span class="where" data-dot={dot ?? undefined}>{rowLine(r, now)}</span>
              </span>
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

  .rows {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li + li {
    border-block-start: 1px solid var(--line-soft);
  }

  /* THE HOVER WASH BLEEDS 8PX PAST THE GUTTER AND THE TEXT DOES NOT (DESIGN-SYSTEM 3.1), so the names sit on the
     heading's edge. */
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
    margin-inline: calc(-1 * var(--sp-2));
    padding: var(--sp-3) var(--sp-2);
    border-radius: var(--r-sm);
    color: inherit;
    text-decoration: none;
  }

  .row:hover {
    background: var(--hover-wash);
  }

  .name,
  .what,
  .where {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  /* ONE LINE, AND THE STATE KEEPS ITS ROOM. What starts it gives way first, down to a few words, so on a phone a
     failed run's dot and its sentence are not the part the ellipsis takes. */
  .detail {
    display: flex;
    gap: var(--sp-2);
    min-inline-size: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .what {
    flex: 0 1 auto;
    min-inline-size: 6ch;
  }

  .where {
    flex: 0 0 auto;
    max-inline-size: 65%;
  }

  .sep {
    flex: none;
  }

  .where[data-dot]::before {
    content: '';
    display: inline-block;
    inline-size: var(--dot);
    block-size: var(--dot);
    margin-inline-end: var(--sp-1);
    border-radius: var(--r-pill);
    background: var(--faint);
    vertical-align: middle;
  }

  .where[data-dot='failed']::before {
    background: var(--danger-fill);
  }
</style>
