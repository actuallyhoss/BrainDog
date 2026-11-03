<!--
  The hub's Automations tab: every rule, the ones an agent wrote and the ones a pack installed, one row each.

  AN AUTOMATION IS A RULE THAT GREW A TRIGGER AND STEPS rather than a kind of its own, so a rule installed before this
  screen existed is an automation whose trigger is a change, and it opens on the same canvas.

  TWO TILES, THEN THE LIST ON THE GROUND. "Runs this month" is a bar per automation and "How
  runs ended" a ring of the month's runs that finished, each with the one line that says what it means. Both are drawn
  from the month the list read already carries (`AutomationRow.month`), and neither is drawn when there is no month to
  draw from: a tile without a chart is a number nobody can check.

  THE LIST IS GROUPED ON AND OFF, the turned-off ones quieter and never red. Each row leads with the icon of what
  starts it (a list's own glyph for a change to that list), says when it last ran and how that went, and puts its next
  turn in the right-hand column.

  AN OWNER'S ROW ENDS IN A SWITCH. Turning one on or off is `setAutomation`, which the record keeps to an owner, so the
  switch is drawn for an owner and for nobody else: a switch the record would refuse is a control that is not one. The
  press answers at once and is put back with the record's own sentence if it is refused. A ROW STAYS IN THE GROUP IT
  WAS READ IN until the list is read again, so nothing jumps out from under the pointer that just pressed it; its
  switch and its line say how it stands now.

  WHEN IT LAST RAN IS READ FROM THE LOG for the ones the record keeps no runs of (`openAutomations`, `acted`), and a
  list is said by the name the rail gives it, never its id.

  A RECORD WITHOUT THE READ STILL OFFERS NEW. Listing needs the `automations` method; drawing one and sending it needs
  only `propose`, which every record has. So a record that cannot list says so, and the heading keeps its button.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import { iconFor } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { listName, ruleNameSaid } from '$lib/record/names.ts';
  import type { IconName } from '$lib/ui/icons.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { Bars, Ring } from '$lib/viz/index.ts';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';
  import { learnScripts, words } from '$lib/flow/flow.ts';
  import { plainFail } from '$lib/flow/plain-fail.ts';
  import { createClient } from '@braindog/client';
  import { editWords, openAutomations, rowTrigger, type AutomationRow, type Source } from '$lib/flow/source.ts';
  import AutomationSentence from './AutomationSentence.svelte';
  import HubRows from './HubRows.svelte';
  import {
    endedReading,
    endedSplit,
    hubSentence,
    hubWords as w,
    isUpkeep,
    rowSaid,
    rowWhat,
    monthBars,
    monthReading,
    nextOf,
    ruleSaid,
    triggerIcon,
    type HubRow,
    type Sentence,
  } from './hub.ts';

  let {
    oncount,
    onsentence,
    owner = false,
  }: {
    oncount: (n: number) => void;
    onsentence?: ((s: Sentence | null) => void) | undefined;
    /** Whether the reader owns the record, which is who may turn an automation on and off. */
    owner?: boolean;
  } = $props();

  let from = $state<'reading' | 'ready' | 'absent' | 'refused'>('reading');
  let rows = $state<AutomationRow[]>([]);
  let fix = $state('');
  let source: Source | null = null;
  /* THE GROUP EACH ROW WAS READ IN, by id, so a press of its switch does not move it (the file's head says why). */
  let placed = $state.raw<ReadonlyMap<string, boolean>>(new Map());

  async function load() {
    const at = opened();
    const out = await openAutomations((url, init) => fetch(url, init), apiBase(), { acted: true });
    closed(out.first.ok || out.absent, at);
    source = out.source;
    if (out.first.ok) {
      rows = out.first.value;
      placed = new Map(rows.map((r) => [r.id, r.enabled]));
      from = 'ready';
      oncount(rows.length);
      onsentence?.(hubSentence(rows, listSaid));
      void readWhy(out.source, rows);
    } else if (out.absent) from = 'absent';
    else {
      fix = out.first.refusal.fix;
      from = 'refused';
    }
  }

  /**
   * WHY EACH OF THE MONTH'S FAILED RUNS FAILED, in the run's own words (Q30): read from the few rules that failed this
   * month, their newest runs, so the tile says the reason and not only a count. A read that fails leaves the count alone.
   */
  let why = $state.raw<readonly { name: string; say: string; raw: string }[]>([]);
  async function readWhy(s: Source | null, all: readonly AutomationRow[]) {
    if (s === null) return;
    const failing = all.filter((r) => (r.month?.failures ?? 0) > 0).slice(0, 4);
    if (failing.length === 0) return;
    /* THE SCRIPTS' TITLES FIRST (L46), so a reason names a script as its step does and not by its id. */
    const titles = await createClient({ base: apiBase() })
      .scripts()
      .catch(() => null);
    if (titles?.ok) learnScripts(titles.value);
    const month = new Date().toISOString().slice(0, 7);
    const out: { name: string; say: string; raw: string }[] = [];
    for (const r of failing) {
      const one = await s.automation(r.id, { limit: 20 }).catch(() => null);
      if (!one?.ok) continue;
      const said = new Set<string>();
      for (const run of one.value.runs) {
        if (run.state !== 'failed' || !run.started.startsWith(month)) continue;
        /* IN PLAIN WORDS (L46): "Its script, …, hit its 100 runs a day." The record's own sentence opens under it. */
        const plain = plainFail(run.say, r.name);
        const say = plain?.plain ?? w.noReason;
        if (said.has(say)) continue;
        said.add(say);
        out.push({ name: r.name, say, raw: plain && plain.raw !== plain.plain ? plain.raw : '' });
      }
    }
    why = out;
  }

  $effect(() => {
    untrack(() => void load());
  });
  $effect(() => {
    if (from === 'ready' && rows.length > 0) drew('ready');
  });

  /* THIS BROWSER'S CLOCK, read once when the tab is drawn. */
  const now = Date.now();

  /* AN AGENT SETS THESE UP AS READILY AS A PERSON, so the empty list says what to ask one. An example a
     person reads and replaces, not a feature the code ships. */
  const agentPrompt = 'read my BrainDog, then propose an automation that fetches the US dollar in euros from api.example.com every hour and tells me when it is over 0.95';

  /* A LIST AS THE RAIL NAMES IT AND DRAWS IT: the shell's own name and glyph for it, else what its declaration says. */
  type Listed = { id: string; name: string; icon?: IconName };
  const listed = $derived(new Map<string, Listed>(((page.data.index?.registers ?? []) as Listed[]).map((l) => [l.id, l])));
  const named = $derived(new Map<string, string>(((page.data.lists ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name])));
  const listSaid = (id: string): string => listed.get(id)?.name ?? named.get(id) ?? listName(id);
  const listIcon = (id: string | null): IconName | undefined =>
    id === null ? undefined : (listed.get(id)?.icon ?? iconFor(Object.hasOwn(REGISTERS, id) ? REGISTERS[id]?.icon : undefined, 'rows'));

  const rowOf = (r: AutomationRow): HubRow => ({
    key: r.id,
    /* A FILING RULE NAMED "Gifts: holds AMAZON" IS SHOWN AS "File Amazon under Gifts" (`ruleNameSaid`); it keeps its name. */
    name: ruleNameSaid(r.name),
    what: rowWhat(rowTrigger(r, listSaid)),
    said: rowSaid(r, now),
    dot: !r.enabled ? 'off' : r.last?.state === 'failed' ? 'bad' : null,
    path: `/automations/${encodeURIComponent(r.id)}`,
    icon: triggerIcon(r.trigger, listIcon(r.register)),
    aside: nextOf(r, now),
    toggle: owner ? { on: r.enabled, label: w.switchOf(ruleNameSaid(r.name)) } : undefined,
    ...ruleSaid(r, listSaid),
  });

  /* BRAINDOG'S OWN UPKEEP IS LEFT OUT UNTIL ASKED FOR (`isUpkeep`), so the list is the rules that do his work. */
  let upkeepShown = $state(false);
  const upkeep = $derived(rows.filter((r) => isUpkeep(r)).length);
  const listedRows = $derived(upkeepShown ? rows : rows.filter((r) => !isUpkeep(r)));
  const on = $derived(listedRows.filter((r) => placed.get(r.id) ?? r.enabled).map(rowOf));
  const off = $derived(listedRows.filter((r) => !(placed.get(r.id) ?? r.enabled)).map(rowOf));
  /* A GROUP COUNTS WHAT IS IN IT NOW (agents F11c): a row switched off keeps its place until the next visit, and the
     heading says "30" and "1 off" rather than "31". */
  const onCount = $derived(listedRows.filter((r) => (placed.get(r.id) ?? r.enabled) && r.enabled).length);
  const onMoved = $derived(on.length - onCount);
  const offCount = $derived(listedRows.filter((r) => !(placed.get(r.id) ?? r.enabled) && !r.enabled).length);
  const offMoved = $derived(off.length - offCount);

  /**
   * One press of a row's switch. THE ROW ANSWERS AT ONCE and the record is asked after; a refusal puts the switch back
   * and says the record's own sentence. One at a time, as every write here is: a second press while the first is out
   * would be a second version.
   */
  let turning = $state<string | null>(null);
  async function turn(id: string, enabled: boolean) {
    const s = source;
    if (s === null || turning !== null) return;
    const before = rows;
    turning = id;
    rows = rows.map((r) => (r.id === id ? { ...r, enabled } : r));
    const out = await s.setEnabled(id, enabled);
    turning = null;
    if (!out.ok) {
      rows = before;
      return void toasts.push(out.refusal.fix, { intent: 'warn' });
    }
    rows = rows.map((r) => (r.id === id ? { ...r, enabled: out.value.enabled, version: out.value.version || r.version } : r));
    onsentence?.(hubSentence(rows, listSaid));
    toasts.push(out.value.enabled ? editWords.turnedOn : editWords.turnedOff, { undo: () => void turn(id, !out.value.enabled) });
  }

  /* THE TILES, ONLY FROM A MONTH THE RECORD SENT. */
  const bars = $derived(monthBars(rows));
  const split = $derived(endedSplit(rows));
</script>

{#if from === 'ready'}
  <!-- SAID AS A SENTENCE FIRST: the box is above the list, empty or not, and a kept one lists by its sentence. -->
  <AutomationSentence {source} {owner} onkept={() => void load()} />
{/if}

{#if from === 'refused'}
  <Empty kind="error" heading title={fix} />
{:else if from === 'absent'}
  <Empty kind="no-data-yet" title={words.absent} body={words.absentHow} />
{:else if from === 'ready' && rows.length === 0}
  <!-- NO BUTTON OF ITS OWN. The heading's "New automation" is above it on every width, and a second one under it read as
       two different things to press. -->
  <Empty kind="no-data-yet" title={words.none} body={words.noneWhy} {agentPrompt} />
{:else if from === 'ready'}
  {#if split && bars.length > 0}
    <div class="tiles">
      <Tile icon="refresh" title={w.runsMonth} meta={w.runsMonthMeta(split.runs)}>
        <Bars items={bars} subject={w.runsMonthSubject} />
        {#if bars.some((b) => (b.part ?? 0) > 0)}<p class="key">The red part of a bar is its failed runs.</p>{/if}
        <p class="reading">{monthReading(rows, now)}</p>
        <!-- WHY THEY FAILED, ONE PRESS AWAY (1 Nov): the run's own words, three paragraphs of them, stood open under the
             chart and made the tile twice the height of its neighbour. The count and the reading say what is true; the
             reasons open under them. -->
        {#if why.length > 0}
          <details class="why-fold">
            <summary class="why-open"><span>{w.whyFailed}</span><span class="why-n num">{why.length}</span><Icon name="chevronDown" size="s" /></summary>
            <ul class="why" aria-label={w.whyFailed}>
              {#each why as f, i (i)}
                <li>
                  <span class="why-name">{f.name}</span> {f.say}
                  {#if f.raw}<details class="why-raw"><summary>{w.asWritten}</summary><p>{f.raw}</p></details>{/if}
                </li>
              {/each}
            </ul>
          </details>
        {/if}
      </Tile>
      <Tile icon="check" title={w.endedTitle}>
        <div class="ring">
          <Ring value={split.ok} max={split.runs} tone="earn" size={112} label={w.endedOf(split.runs)} subject={w.endedSubject} />
        </div>
        <p class="reading">{endedReading(rows)}</p>
      </Tile>
    </div>
  {/if}

  {#if on.length > 0}
    <Tile class="section" data-surface="tile" title={w.on} count={onCount || undefined} meta={onMoved > 0 ? w.turnedOff(onMoved) : undefined}>
      <HubRows rows={on} ontoggle={turn} busy={turning} />
    </Tile>
  {/if}
  {#if off.length > 0}
    <Tile class="section" data-surface="tile" title={w.off} count={offCount || undefined} meta={offMoved > 0 ? w.turnedOn(offMoved) : undefined}>
      <HubRows rows={off} dim ontoggle={turn} busy={turning} />
    </Tile>
  {/if}
  {#if upkeep > 0}
    <p class="upkeep"><Button weight="bare" size="sm" onclick={() => (upkeepShown = !upkeepShown)}>{upkeepShown ? w.upkeepHide : w.upkeepShow(upkeep)}</Button></p>
  {/if}
{/if}

<style>
  /* TWO TILES SIDE BY SIDE WHERE THEY FIT, 12 apart, and one over the other on a phone. The bars take the
     wider share, since their labels are names. */
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
    gap: var(--inset);
  }

  @media (width >= 900px) {
    .tiles {
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    }
  }

  .ring {
    display: flex;
    justify-content: center;
  }

  .why {
    display: grid;
    gap: var(--sp-1);
    margin: var(--sp-2) 0 0;
    padding: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    list-style: none;
  }

  .why-fold {
    margin-block-start: var(--sp-2);
    interpolate-size: allow-keywords;
  }

  /* THE FOLD OPENS ON ITS HEIGHT, 180ms on the house curve, and at once under reduced motion. */
  .why-fold::details-content {
    block-size: 0;
    overflow: clip;
    transition:
      block-size var(--d-state, 180ms) var(--ease-out),
      content-visibility var(--d-state, 180ms) allow-discrete;
  }

  .why-fold[open]::details-content {
    block-size: auto;
  }

  .why-open {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 32px;
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    list-style: none;
    cursor: pointer;
  }

  .why-open::-webkit-details-marker {
    display: none;
  }

  .why-open :global(.icon) {
    transition: rotate var(--d-state, 180ms) var(--ease-out);
  }

  .why-fold[open] .why-open :global(.icon) {
    rotate: 180deg;
  }

  .why-n {
    color: var(--ink-3);
  }

  @media (hover: hover) and (pointer: fine) {
    .why-open:hover {
      color: var(--ink);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .why-fold::details-content,
    .why-open :global(.icon) {
      transition: none;
    }
  }

  .why-name {
    color: var(--ink);
    font-weight: var(--fw-medium);
  }
  /* THE RECORD'S OWN WORDS, ONE PRESS UNDER THE PLAIN ONES (L46). */
  .why-raw summary {
    width: fit-content;
    color: var(--ink-3);
    cursor: pointer;
  }
  .why-raw p {
    margin: 2px 0 0;
    color: var(--ink-3);
    overflow-wrap: anywhere;
  }

  .upkeep {
    margin: 0;
  }

  .key {
    margin: var(--sp-2) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* THE ONE LINE UNDER EACH CHART that says what it means, at body size in ink, at the tile's foot. */
  .reading {
    margin: 0;
    margin-block-start: auto;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }
</style>
