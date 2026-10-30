<!--
  "Hand to": one press gives a row to a teammate or an agent.

  A SHORT SHEET, YOU FIRST: you, then the people on this record by face and name (the People rows that stand for them),
  then the agents that have run here by the name each signs with (`readHolders` in `lib/record/hand.ts`). One press
  files it and closes the sheet; there is no second confirmation, because the toast carries Put back and a hand is one
  write that one more write undoes, both fields and the state together.

  TWO WAYS IN, BOTH A MENU'S. The row menu and the row page's "…" open it by binding `open`. The row page's sentence asks
  for `line` too, a second copy that draws no sheet: while an agent holds the row, the words saying so, the run working on
  it as a link or whose next session it waits for. "Hand to" stood in the head beside the primary, one of five controls
  in a row at 1440 and off the edge at 390. Neither is drawn for somebody who may not change the row, or on a list that
  does not say who holds its rows.

  UNDER A THUMB IT IS A BOTTOM SHEET (`Sheet.svelte`), with one 44px row per person or agent and their face.

  WITH A NOTE (agents and MCP plan §7.2): under the agents, a line for what the agent should know first. Handed to an
  agent with something in it, the note goes to that agent as an instruction on the row (`noteFor`), which its next run
  on it is told before anything else.

  START ONE NOW (path E): beside Claude, only while a runner on one of his machines took a run within the day and an
  approved kind takes an instruction or a row (`startFor`). It hands the row, tells Claude the note (or to work on the
  row), and starts a run of that kind with the instruction as its argument. Otherwise it is not drawn, and the row
  waits for Claude's next session as it always did. Nothing starts by itself.

  ON A MACHINE, AS A PROFILE (migration 44): where runners are on two machines or more, "On" picks the one the run starts
  on, and where that machine's runs were under Claude Code profiles of his, "As" picks the profile, by name
  (`startWith`). The runner on that machine starts Claude Code under that profile's folder, which only it knows.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { apiBase, at } from '$lib/at.ts';
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
    startNow,
    startWith,
    startsOnARunner,
    type Holder,
    type Offered,
    type StartPlace,
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
    line = false,
    onhanded,
  }: {
    open?: boolean | undefined;
    register: string;
    row: Entry;
    decl: RegisterDecl;
    /** Draw the holder's line alone, in the row page's sentence, and no sheet. */
    line?: boolean | undefined;
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
  /* WHERE IT MAY START ONE, and where he picked: a machine and a profile by name, `''` for any runner and its own. */
  let startPlaces = $state.raw<StartPlace[]>([]);
  let startMachine = $state('');
  let startSeat = $state('');
  const startSeats = $derived([...new Set(startPlaces.filter((p) => startMachine === '' || p.machine === startMachine).flatMap((p) => p.seats))]);
  /* WHAT HE TYPED FOR THE AGENT, kept until the sheet hands the row. */
  let note = $state('');

  async function ask() {
    if (!hand || asking) return;
    asking = true;
    offered = null;
    startKind = null;
    startPlaces = [];
    const [holders, start] = await Promise.all([readHolders(apiBase(), hand, me, shell.names ?? {}, peopleList), hand.agent ? startWith(apiBase(), Date.now()) : Promise.resolve(null)]);
    offered = holders;
    startKind = start?.kind ?? null;
    startPlaces = start?.places ?? [];
    if (!startPlaces.some((p) => p.machine === startMachine)) startMachine = '';
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
  /* THE LAST HAND THIS TAB MADE, which the toast's Put back undoes. */
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
    const seat = startSeats.includes(startSeat) ? startSeat : '';
    const place = { ...(startMachine ? { machine: startMachine } : {}), ...(seat ? { seat } : {}) };
    const started = await startNow(apiBase(), kind, told.id, register, row.seq, undefined, place);
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
    if (line && agentHolds !== null) void readRun();
  });
</script>

{#if allowed && line}
  {#if agentHolds !== null}
    <!-- A SENTENCE OF THE HEAD'S, SO IT ENDS AS ONE. -->
    {#if run}<span class="hand-line"><a class="hand-run" href={at(`/jobs/${run.id}`)}>{copy.handRunning(agentHolds)}</a>.</span>{:else}<span class="hand-line">{copy.handWaiting(agentHolds)}.</span>{/if}
  {/if}
{:else if allowed}
  <Sheet bind:open title={copy.handSheetTitle(String(row.fields[decl.title] ?? ''))}>
    {#if offered === null}
      <!-- ONLY WHILE OPEN: a shut sheet's body is still in the page, and a busy placeholder there for good kept the row's
           page from ever being at rest (audit 31 Oct A30). -->
      {#if open}<Waiting rows={3} />{/if}
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
            {#if startKind !== null && startsOnARunner(h) && (startPlaces.length > 1 || startSeats.length > 0)}
              <li class="hand-start-at">
                {#if startPlaces.length > 1}
                  <label class="hand-start-pick">
                    <span class="hand-start-key">{copy.handStartOn}</span>
                    <select bind:value={startMachine}>
                      <option value="">{copy.handStartAnyMachine}</option>
                      {#each startPlaces as p (p.machine)}<option value={p.machine}>{p.machine}</option>{/each}
                    </select>
                  </label>
                {/if}
                {#if startSeats.length > 0}
                  <label class="hand-start-pick">
                    <span class="hand-start-key">{copy.handStartAs}</span>
                    <select bind:value={startSeat}>
                      <option value="">{copy.handStartOwnProfile}</option>
                      {#each startSeats as s (s)}<option value={s}>{s}</option>{/each}
                    </select>
                  </label>
                {/if}
              </li>
            {/if}
          {/each}
        </ul>
      {/if}
    {/if}
  </Sheet>
{/if}

<style>
  /* IN THE SENTENCE'S OWN WORDS, a quieter ink; the run's link says it goes somewhere when it is pointed at. */
  .hand-line {
    color: var(--ink-2);
  }

  .hand-run {
    color: inherit;
    text-decoration: underline;
    text-decoration-color: var(--rule);
    text-underline-offset: 3px;
  }

  @media (hover: hover) and (pointer: fine) {
    .hand-run:hover {
      color: var(--red);
      text-decoration-color: currentColor;
    }
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
  /* WHERE "START ONE NOW" STARTS: a line of its own under the agent, the platform's own selects, at the meta size. */
  .hand-start-at {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    padding: 0 var(--sp-2) var(--sp-2);
    font-size: var(--fs-meta);
  }
  .hand-start-pick {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
  }
  .hand-start-key {
    color: var(--ink-2);
  }
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
