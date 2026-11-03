<!--
  The hub's Scheduled tab: every call, poll and pull the record makes on a clock, in the words "Runs on" uses.

  A TILE, THEN THE LIST ON THE GROUND. "Next up" is the next fourteen days with a dot on each day
  an action is due, from each one's next turn on its own clock (`hub.ts` `nextWeek`), and the line under it says which
  is next and when. A paused action has no turns to draw; it leads the list, in its own group, because it is the one
  that needs a look.

  ONE PRESS, AND NOTHING ELSE CHANGES HERE. Resuming a paused action belongs to "Runs on" on its project's page, and a
  key the action is missing is added in the Keychain, so a row whose sentence asks for a key carries the link that adds it.
  An action on its clock carries Run now under it (`run-now.ts`): the record moves its next turn to now, and the line
  under the button says what the record answered, a wait included. A paused one carries none, because its own sentence
  already says it will not run and where it is resumed. New opens the scheduled-action sheet through the address
  (`?new=action`), as any page may.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { untrack } from 'svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { WeekStrip } from '$lib/viz/index.ts';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';
  import { openActions, stateOf, whatOf, type ActionRow } from '$lib/record/actions.ts';
  import { humanize } from '$lib/record/names.ts';
  import HubRows from './HubRows.svelte';
  import { channelIcon, hubWords as w, nextReading, nextWeek, type HubRow } from './hub.ts';
  import { runNow, runNowSaid, runWords } from './run-now.ts';

  let from = $state<'reading' | 'ready' | 'absent' | 'refused'>('reading');
  let rows = $state<ActionRow[]>([]);
  let fix = $state('');

  async function load() {
    const at = opened();
    const out = await openActions((url, init) => fetch(url, init), apiBase());
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

  const now = Date.now();

  const rowOf = (r: ActionRow): HubRow => {
    const said = stateOf(r, now);
    /* THE LINK THAT PUTS A KEY RIGHT CARRIES WHAT THE KEYCHAIN SHOULD OPEN ON AS `state`, for the row list to navigate
       with: the address itself is the plain Keychain, with no key's name in it. */
    const mend = said.reconnect && { path: said.reconnect.href, label: said.reconnect.label, state: said.reconnect.state };
    return {
      key: r.ingest,
      /* ITS ID IN WORDS, NEVER THE ID. An action declares no title, and a slug in a list of named automations one
         tab over read as a different product. */
      name: humanize(r.ingest),
      what: whatOf(r),
      said: said.line,
      /* ONLY A PAUSE TAKES A DOT. A failed fetch retries on its own and its sentence says there is nothing to do, so
         a red dot beside it would ask for a look the sentence says is not needed. */
      dot: said.tone === 'warn' ? 'warn' : null,
      path: null,
      icon: channelIcon(r.channel),
      ...(mend ? { fix: mend } : {}),
    };
  };

  const paused = $derived(rows.filter((r) => r.state === 'paused').map(rowOf));
  const clocked = $derived(rows.filter((r) => r.state !== 'paused').map((r) => ({ row: rowOf(r), ingest: r.ingest })));

  /* ONE PRESS OUT AT A TIME FOR EACH ACTION, and its button waits while it is. The line it leaves stays under the
     row until the next press, so a second press reads the wait in place of the first line. */
  let pressing = $state<Record<string, true>>({});
  let pressed = $state<Record<string, string>>({});

  async function press(ingest: string) {
    if (pressing[ingest]) return;
    pressing = { ...pressing, [ingest]: true };
    const out = await runNow(apiBase(), ingest);
    pressed = { ...pressed, [ingest]: runNowSaid(out, Date.now()).line };
    const rest = { ...pressing };
    delete rest[ingest];
    pressing = rest;
  }
  const week = $derived(nextWeek(rows, now));
</script>

{#if from === 'refused'}
  <Empty kind="error" heading title={fix} />
{:else if from === 'absent'}
  <!-- NO BUTTON OF ITS OWN, EITHER WAY: the heading's "New scheduled action" is above it, and two read as two things. -->
  <Empty kind="no-data-yet" title={w.scheduledAbsent} body={w.scheduledAbsentHow} />
{:else if from === 'ready' && rows.length === 0}
  <Empty kind="no-data-yet" title={w.scheduledNone} body={w.scheduledWhy} agentPrompt={w.scheduledPrompt} />
{:else if from === 'ready'}
  {#if week.due.length > 0}
    <Tile icon="calendar" title={w.nextUp} meta={w.nextUpMeta(week.days.length)}>
      <WeekStrip days={week.days} today={week.today} subject={w.nextUpSubject} />
      <p class="reading">{nextReading(week.due, now, week.days.length)}</p>
    </Tile>
  {/if}
  {#if paused.length > 0}
    <Tile class="section" data-surface="tile" title={w.paused} count={paused.length || undefined}>
      <div class="section-body">
        <HubRows rows={paused} />
      </div>
    </Tile>
  {/if}
  {#if clocked.length > 0}
    <Tile class="section" data-surface="tile" title={w.onClock} count={clocked.length || undefined}>
      <div class="section-body">
        <ul class="clocked">
          {#each clocked as c (c.ingest)}
            <li>
              <HubRows rows={[c.row]} />
              <div class="press">
                <Button size="sm" disabled={pressing[c.ingest] === true} aria-label={runWords.aria(c.row.name)} onclick={() => void press(c.ingest)}>{runWords.press}</Button>
                <!-- THE STATUS IS THERE BEFORE ITS LINE, so a screen reader hears the line arrive: a live region drawn
                     with its words in it is often read as nothing. -->
                <p class="pressed" role="status">{pressed[c.ingest] ?? ''}</p>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    </Tile>
  {/if}
{/if}

<style>
  /* THE ONE LINE UNDER THE CHART that says what it means, at body size in ink. */
  .reading {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }

  /* EACH ACTION ON ITS CLOCK IS ITS OWN ROW AND ITS PRESS UNDER IT, with the ledger's hairline between two of them,
     so the list reads as the one list it was before the button. */
  .clocked {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .clocked > li + li {
    border-block-start: 1px solid var(--rule);
  }

  /* THE PRESS LINES UP WITH THE ROW'S WORDS, NOT ITS WELL, as the row's own link to the Keychain does. */
  .press {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    margin: 0 0 var(--sp-2) calc(var(--well-l) + var(--sp-3));
  }

  .pressed {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }
</style>
