<!--
  "Hand to": one press gives a row to a teammate or an agent (GAP-11).

  A SHORT SHEET, YOU FIRST: you, then the people on this record by face and name (the People rows that stand for them),
  then the agents that have run here by the name each signs with (`readHolders` in `lib/record/hand.ts`). One press
  files it and closes the sheet; there is no second confirmation, because the toast carries Put back and a hand is one
  write that one more write undoes, both fields and the state together.

  TWO WAYS IN. The row menu opens it by binding `open`, and the row page's head asks for `trigger`, which draws the
  "Hand to" button and, while an agent holds the row, the line saying so: the run working on it, or whose next session it
  waits for. Neither is drawn for somebody who may not change the row, or on a list that does not say who holds its rows.

  UNDER A THUMB IT IS A BOTTOM SHEET (`Sheet.svelte`), with one 44px row per person or agent and their face.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import {
    agentName,
    handFor,
    handPatch,
    heldBy,
    putBackPatch,
    readHolders,
    readRunFor,
    startFor,
    type Holder,
    type Offered,
  } from '$lib/record/hand.ts';
  import type { JobRow } from '$lib/record/jobs.ts';
  import { may } from '$lib/record/may.ts';
  import { rowWriter, type RowWriter } from '$lib/record/rows-write.ts';
  import type { Entry, Fields, RegisterDecl } from '$lib/record/schema.ts';
  import Button from './Button.svelte';
  import Face from './Face.svelte';
  import Sheet from './Sheet.svelte';
  import Waiting from './Waiting.svelte';
  import { toasts } from './toast.svelte.ts';

  let {
    open = $bindable(false),
    register,
    row,
    decl,
    trigger = false,
    onhanded,
  }: {
    open?: boolean | undefined;
    register: string;
    row: Entry;
    decl: RegisterDecl;
    /** Draw the "Hand to" button and the holder's line, as the row page's head does. */
    trigger?: boolean | undefined;
    /** The row as the hand, or its put back, left it, so the caller draws what the record now holds. */
    onhanded?: ((entry: Entry) => void) | undefined;
  } = $props();

  const hand = $derived(handFor(decl));
  const shell = $derived(page.data as unknown as Shell);
  /* SOMEBODY WHO MAY NOT CHANGE THE ROW DOES NOT SEE THE CONTROL, rather than pressing it into a refusal. */
  const allowed = $derived(hand !== null && may(shell, 'write', register));
  const me = $derived(String(shell.me?.person ?? ''));

  /* The list a person is handed a row by, and the field it names them with: the list `hand.person` links to, which the
     record refuses to be anything but a link (`handFault`). A list that hands to no person reads none. */
  const peopleList = $derived.by(() => {
    const to = decl.fields.find((f) => f.id === hand?.person)?.to ?? '';
    return { register: to, title: REGISTERS[to]?.title ?? 'name' };
  });

  let offered = $state<Offered | null>(null);
  let asking = false;

  async function ask() {
    if (!hand || asking) return;
    asking = true;
    offered = null;
    offered = await readHolders(apiBase(), hand, me, shell.names ?? {}, peopleList);
    asking = false;
  }

  /* READ WHEN IT OPENS, and each time, since who is on the record changes between two presses. */
  $effect(() => {
    if (open) void ask();
  });

  const holding = $derived(hand ? heldBy(hand, row) : { person: null, agent: null });
  const people = $derived(offered?.from === 'live' ? offered.holders.filter((h) => h.kind === 'person') : []);
  const agents = $derived(offered?.from === 'live' ? offered.holders.filter((h) => h.kind === 'agent') : []);

  let writer: RowWriter | undefined;
  /* ONE WRITE PER PRESS: a double press on a slow line hands the row once. */
  let writing = $state(false);
  /* THE LAST HAND THIS TAB MADE, which the head's Put back undoes for as long as the row is the one it wrote. */
  let last = $state<{ before: Entry; patch: Fields; after: Entry } | null>(null);

  async function give(holder: Holder) {
    if (!hand || writing) return;
    const patch = handPatch(hand, decl, holder);
    if (!patch) return;
    writing = true;
    writer ??= rowWriter(apiBase());
    const before = row;
    const out = await writer.update(register, row.seq, patch, row.version);
    writing = false;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'bad' });
      return;
    }
    open = false;
    const name = holder.kind === 'person' && holder.you ? copy.handYou : holder.name;
    /* THE EVENT SAYS WHO HANDED IT TO WHOM: the note is signed by whoever pressed, so the history reads "Sam handed this
       to Mona". A note that did not land leaves the hand made, which is the thing that was asked for. */
    void writer.note(register, row.seq, copy.handedNote(name));
    last = { before, patch, after: out.entry };
    toasts.push(copy.handedToast(name), { undo: () => void putBack() });
    onhanded?.(out.entry);
    if (holder.kind === 'agent') {
      const started = await startFor(apiBase(), register, row.seq, holder, Date.now());
      if (started !== null) void readRun();
    }
  }

  async function putBack() {
    const was = last;
    if (!was || writing) return;
    writing = true;
    writer ??= rowWriter(apiBase());
    const out = await writer.update(register, was.before.seq, putBackPatch(was.before, was.patch, decl), was.after.version);
    writing = false;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'bad' });
      return;
    }
    last = null;
    toasts.push(copy.handPutBackDone);
    onhanded?.(out.entry);
  }

  /* ── the holder's line on the row page ── */

  const agentHolds = $derived.by(() => {
    if (!hand?.agent) return null;
    const held = row.fields[hand.agent];
    const done = decl.state ? (decl.done ?? []).includes(String(row.fields[decl.state] ?? '')) : false;
    return typeof held === 'string' && held.trim() !== '' && !done ? agentName(held) : null;
  });

  let run = $state<JobRow | null>(null);
  async function readRun() {
    run = await readRunFor(apiBase(), register, row.seq);
  }
  $effect(() => {
    if (trigger && agentHolds !== null) void readRun();
  });
</script>

{#if allowed}
  {#if trigger}
    {#if agentHolds !== null}
      {#if run}
        <Button weight="quiet" href="/jobs/{run.id}">{copy.handRunning(agentHolds)}</Button>
      {:else}
        <span class="hand-waiting">{copy.handWaiting(agentHolds)}</span>
      {/if}
    {/if}
    {#if last && last.after.version === row.version}
      <Button weight="quiet" disabled={writing} onclick={() => void putBack()}>{copy.handPutBack}</Button>
    {/if}
    <Button weight="quiet" onclick={() => (open = true)}>{copy.handTo}</Button>
  {/if}

  <Sheet bind:open title={copy.handSheetTitle(String(row.fields[decl.title] ?? ''))}>
    {#if offered === null}
      <Waiting rows={3} />
    {:else if offered.from === 'refused'}
      <p class="hand-note">{offered.fix}</p>
      <Button weight="quiet" onclick={() => void ask()}>{copy.handRetry}</Button>
    {:else if people.length === 0 && agents.length === 0}
      <p class="hand-note">{copy.handNobody}</p>
    {:else}
      {#if people.length > 0}
        <h3 class="hand-head">{copy.handPeople}</h3>
        <ul class="hand-list">
          {#each people as h (h.key)}
            <li>
              <button type="button" class="hand-one" disabled={writing} onclick={() => void give(h)}>
                <Face name={h.name} you={h.kind === 'person' && h.you} kind="person" />
                <span class="hand-name">{h.kind === 'person' && h.you ? copy.handYou : h.name}</span>
                {#if holding.person === h.key}<span class="hand-holds">{copy.handHolding}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if agents.length > 0}
        <h3 class="hand-head">{copy.handAgents}</h3>
        <ul class="hand-list">
          {#each agents as h (h.key)}
            <li>
              <button type="button" class="hand-one" disabled={writing} onclick={() => void give(h)}>
                <Face name={h.name} kind="agent" />
                <span class="hand-name">{h.name}</span>
                {#if holding.agent === h.key}<span class="hand-holds">{copy.handHolding}</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </Sheet>
{/if}

<style>
  .hand-waiting {
    display: inline-flex;
    align-items: center;
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  .hand-note {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  /* A META HEADING over each group, as the palette's are (SYSTEM §6). */
  .hand-head {
    margin-block: var(--sp-4) var(--sp-1);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .hand-head:first-child {
    margin-block-start: 0;
  }

  .hand-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE ROW PER PERSON OR AGENT, 44px under a thumb and everywhere else, since the sheet is a list of people to press. */
  .hand-one {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: var(--tap);
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-row);
    font-weight: 500;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .hand-one:hover,
  .hand-one:focus-visible {
    background: var(--hover-wash);
  }

  /* SIXTEEN ON A PHONE, its row step (SYSTEM §3). */
  @media (width < 900px) {
    .hand-one {
      font-size: var(--t-md);
    }
  }

  .hand-one:disabled {
    cursor: default;
  }

  .hand-name {
    flex: 1;
  }

  .hand-holds {
    color: var(--dim);
    font-size: var(--t-sm);
  }
</style>
