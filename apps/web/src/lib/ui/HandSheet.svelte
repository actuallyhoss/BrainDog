<!--
  "Hand to": one press gives a row to a teammate or an agent.

  A SHORT SHEET, YOU FIRST: you, then the people on this record by face and name (the People rows that stand for them),
  then the agents that have run here by the name each signs with (`readHolders` in `lib/record/hand.ts`). One press
  files it and closes the sheet; there is no second confirmation, because the toast carries Put back and a hand is one
  write that one more write undoes, both fields and the state together.

  TWO WAYS IN. The row menu opens it by binding `open`, and the row page's head asks for `trigger`, which draws the
  "Hand to" button and, while an agent holds the row, the line saying so: the run working on it, or whose next session it
  waits for. Neither is drawn for somebody who may not change the row, or on a list that does not say who holds its rows.

  UNDER A THUMB IT IS A BOTTOM SHEET (`Sheet.svelte`), with one 44px row per person or agent and their face.

  WITH A NOTE (agents and MCP plan §7.2): under the agents, a line for what the agent should know first. Handed to an
  agent with something in it, the note goes to that agent as an instruction on the row (`noteFor`), which its next run
  on it is told before anything else.

  START ONE NOW (path E): beside Claude, only while a runner on one of his machines took a run within the day and an
  approved kind takes an instruction or a row (`startFor`). It hands the row, tells Claude the note (or to work on the
  row), and starts a run of that kind with the instruction as its argument. Otherwise it is not drawn, and the row
  waits for Claude's next session as it always did. Nothing starts by itself.
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
    noteFor,
    readHolders,
    readRunFor,
    startFor,
    startNow,
    startsOnARunner,
    type Holder,
    type Offered,
  } from '$lib/record/hand.ts';
  import type { JobKind, JobRow } from '$lib/record/jobs.ts';
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
  /* THE KIND "START ONE NOW" WOULD START, read as the sheet opens; `null` draws no press. */
  let startKind = $state.raw<JobKind | null>(null);
  /* WHAT HE TYPED FOR THE AGENT, kept until the sheet hands the row. */
  let note = $state('');

  async function ask() {
    if (!hand || asking) return;
    asking = true;
    offered = null;
    startKind = null;
    const [holders, kind] = await Promise.all([readHolders(apiBase(), hand, me, shell.names ?? {}, peopleList), hand.agent ? startFor(apiBase(), Date.now()) : Promise.resolve(null)]);
    offered = holders;
    startKind = kind;
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

  async function give(holder: Holder, start = false) {
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
    /* THE EVENT SAYS WHO HANDED IT TO WHOM: the note is signed by whoever pressed, so the history reads "Sami handed this
       to Mona". A note that did not land leaves the hand made, which is the thing that was asked for. */
    void writer.note(register, row.seq, copy.handedNote(name));
    last = { before, patch, after: out.entry };
    toasts.push(copy.handedToast(name), { undo: () => void putBack() });
    onhanded?.(out.entry);
    if (holder.kind !== 'agent') return;
    /* THE NOTE, AND FOR "START ONE NOW" THE INSTRUCTION THE RUN IS STARTED WITH: his words, or to work on the row. */
    const said = note.trim() || (start ? copy.handStartSaid(String(row.fields[decl.title] ?? '')) : '');
    note = '';
    if (said === '') return;
    const told = await noteFor(apiBase(), register, row.seq, said);
    if (!told.ok) {
      toasts.push(told.fix, { intent: 'warn' });
      return;
    }
    const kind = startKind;
    if (!start || kind === null) return;
    const started = await startNow(apiBase(), kind, told.id, register, row.seq);
    if (started === null) toasts.push(copy.handStartFailed, { intent: 'warn' });
    else {
      toasts.push(copy.handStarted(holder.name));
      void readRun();
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
        <label class="hand-with">
          <span class="hand-with-label">{copy.handNote}</span>
          <textarea class="hand-with-field" rows="2" maxlength="2000" placeholder={copy.handNoteHint} bind:value={note}></textarea>
        </label>
        <ul class="hand-list">
          {#each agents as h (h.key)}
            <li class="hand-agent">
              <button type="button" class="hand-one" disabled={writing} onclick={() => void give(h)}>
                <Face name={h.name} kind="agent" />
                <span class="hand-name">{h.name}</span>
                {#if holding.agent === h.key}<span class="hand-holds">{copy.handHolding}</span>{/if}
              </button>
              {#if startKind !== null && startsOnARunner(h)}
                <Button weight="quiet" disabled={writing} onclick={() => void give(h, true)}>{copy.handStartNow}</Button>
              {/if}
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
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .hand-note {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  /* A META HEADING over each group, as the palette's are. */
  .hand-head {
    margin-block: var(--sp-4) var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
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
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    font-weight: 500;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .hand-one:hover,
  .hand-one:focus-visible {
    background: var(--hover);
  }

  /* SIXTEEN ON A PHONE, its row step. */
  @media (width < 900px) {
    .hand-one {
      font-size: var(--fs-body);
    }
  }

  .hand-one:disabled {
    cursor: default;
  }

  .hand-name {
    flex: 1;
  }

  /* AN AGENT'S ROW: the hand itself, and "Start one now" at its end where a runner can start one. */
  .hand-agent {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .hand-agent > .hand-one {
    flex: 1 1 auto;
    min-inline-size: 0;
  }

  /* THE NOTE: a label at meta size over a two-line field. */
  .hand-with {
    display: grid;
    gap: var(--sp-1);
    margin-block-end: var(--sp-2);
  }

  .hand-with-label {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .hand-with-field {
    inline-size: 100%;
    min-block-size: 64px;
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    resize: vertical;
  }

  .hand-holds {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }
</style>
