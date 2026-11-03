<!--
  The rows a proposal would change, field by field (`changes.ts`), each by its name and never its handle ("Kiln", not
  "Kiln #1": a person reads names, and the handle is the record's). A document or a long text is the
  render package's `Diff`; any other field is one line: its name, the value it had struck through, and
  the value it would have. The words `Before` and `After` are still read to a screen reader.

  A SHORT CHANGE WAS A TWO-ROW TABLE, "Before building / After earning", which is a form to read and
  not a change to see. One line with the old value struck is how Linear and GitHub
  say it, and the eye takes it in one fixation.

  `compact` IS THE QUEUE'S. There a long diff folds to its name and its count of lines, so the answer
  buttons for a proposal sit under its title and not a screen below it; the gate draws it whole.

  A MOVE OF WHERE A ROW APPLIES IS TWO CHIPS: "Where it applies: Kiln → Everywhere", each the project's
  mark and name or the globe, and never the two row ids the proposal carries. The projects are read once a list for
  the tab (`scope-move.ts` `placesIn`); until they arrive, and for a project this reader cannot see, a side reads
  "A project".

  A NOTE IS READ AS THE NOTE (`note` in `changes.ts`): one sentence that says the change ("Adds “and through two
  resellers”"), then each place it moves, under the heading it sits in, drawn by the app's own renderer as a project's
  page draws it, what it held there dimmed and struck and what it would hold on the held wash. Its source diff put
  "# Kiln" and "GBP 18,400.00" in front of the press. In the queue the place folds under its sentence.

  WHAT A CHANGE TAKES IN IS SAID BEFORE ITS DIFF (`takes` in `changes.ts`): under "Why: what was learned", each row
  the change adds to a list of refs by its own words, and under it what stands behind it (for a learning, the failure
  that taught it). A skill's next version was a long diff over a line of handles, and the press was taken without the
  reason. One you cannot open is a count. In the queue (`compact`) only the first line of each is drawn, so the answer
  buttons stay near the title; the gate draws both.

  EACH ROW SAYS WHY IT MOVES (`why` in `changes.ts`): the reason the question filed beside it, after its chips, muted.
  A scope question moving fifty keys was fifty chips and not one reason. In the queue only the first row's is drawn,
  with "and N more reasons".
-->
<script lang="ts">
  /* `Diff` is drawn here outside a declared page, so its kind's sheet comes with it (`kinds/diff.css`). */
  import '@braindog/skin/kinds/diff.css';
  /* AND A NOTE'S PARTS ARE ITS BLOCKS, as a declared page draws them (`PageView`), so a note's bar is bars here too. */
  import '@braindog/skin/blocks-kinds.css';
  import '@braindog/skin/blocks-charts.css';
  import { diffPlan, parse } from 'braindog-render';
  import { Block, Diff, Markdown } from 'braindog-render/svelte';
  import { apiBase } from '$lib/at.ts';
  import { homeCurrency } from '$lib/record/api.ts';
  import { recordZone } from '$lib/record/zone.ts';
  import { placeNamed, placesIn, words as scopeWords, type Place, type Scope } from '$lib/record/scope-move.ts';
  import ScopeChip from '$lib/ui/ScopeChip.svelte';
  import { closedSaid, moreReasons, noteWords, words, type NoteChange, type Updated } from './changes.ts';
  import { stateWord } from '$lib/decide/state-word.ts';

  let { updates, compact = false }: { updates: readonly Updated[]; compact?: boolean } = $props();

  /* THE PROJECTS EACH MOVE NAMES, by the list they are in, read only where a proposal moves a row. */
  let places = $state<Record<string, Place[] | null>>({});
  const lists = $derived([...new Set(updates.flatMap((u) => u.changes.flatMap((c) => (!c.long && c.scope ? [c.scope.to] : []))))]);
  $effect(() => {
    for (const to of lists)
      void placesIn(apiBase(), to).then((got) => {
        if (!Object.hasOwn(places, to)) places = { ...places, [to]: got };
      });
  });

  /* Two of these are on one screen (the queue's card and its tile), so a heading's id is this drawing's own. */
  const uid = $props.id();

  /* IN THE QUEUE, ONE REASON: the first row's, and how many more there are, so the answer buttons stay near the title. */
  const firstWhy = $derived(updates.findIndex((u) => u.why !== undefined));
  const moreWhy = $derived(firstWhy < 0 ? 0 : updates.filter((u) => u.why !== undefined).length - 1);

  /* A NOTE'S PART IS DRAWN AS A PROJECT'S PAGE DRAWS IT: the renderer's blocks, at the record's clock, zone and home
     currency. A fence the renderer could not read is left out, as the shared page leaves it. Nothing in it links. */
  const opts = { now: Date.now(), zone: recordZone(), home: homeCurrency() };
  const segmentsOf = (source: string) => parse(source, { page: true }).filter((s) => s.type !== 'degraded');

  /** One side of a move, as its chip: the project it names, or `null` for everywhere. */
  const sideOf = (to: string, said: string | null, named: string | null = null): Scope | null =>
    said === null
      ? null
      : (placeNamed(places[to] ?? null, said) ?? { spoken: said, name: named !== null && named !== said ? named : scopeWords.someProject, mark: null, hue: null });
</script>

{#snippet drawn(source: string)}
  {#each segmentsOf(source) as segment, n (n)}
    {#if segment.type === 'block'}<Block block={segment} {opts} />{:else if segment.type === 'markdown'}<Markdown {segment} {opts} />{/if}
  {/each}
{/snippet}

{#snippet noteParts(note: NoteChange)}
  <div class="note-parts">
    {#each note.parts as part, n (n)}
      <div class="note-part">
        {#if part.under}<p class="note-under">{noteWords.under(part.under)}</p>{/if}
        {#if part.before.length > 0}
          <del class="note-side note-was document"><span class="vh">{words.before}: </span>{#each part.before as source, k (k)}{@render drawn(source)}{/each}</del>
        {/if}
        {#if part.after.length > 0}
          <ins class="note-side note-now document"><span class="vh">{words.after}: </span>{#each part.after as source, k (k)}{@render drawn(source)}{/each}</ins>
        {/if}
      </div>
    {/each}
  </div>
{/snippet}

<ul class="changes">
  {#each updates as u, i (u.at)}
    <li class="change">
      <p class="change-row">
        <span class="change-title">{u.title}</span>
      </p>
      {#if u.takes}
        <div class="takes">
          <p class="change-label" id="takes-{uid}-{i}">{words.takes}</p>
          <ul class="takes-list" aria-labelledby="takes-{uid}-{i}">
            {#each u.takes.said as t, n (n)}
              <li class="take">
                <span class="take-title">{t.title}</span>
                {#if t.why && !compact}<span class="take-why">{t.why}</span>{/if}
              </li>
            {/each}
            {#if u.takes.closed > 0}
              <li class="take take-closed">{closedSaid(u.takes.closed, u.takes.said.length)}</li>
            {/if}
          </ul>
        </div>
      {/if}
      {#each u.changes as c (c.field)}
        {#if c.long && c.note && compact}
          <details class="change-fold">
            <summary class="change-line">
              <span class="change-label">{c.label}</span>
              <span class="change-sum">{c.note.said}</span>
            </summary>
            {@render noteParts(c.note)}
          </details>
        {:else if c.long && c.note}
          <div class="change-field">
            <p class="change-line">
              <span class="change-label">{c.label}</span>
              <span class="note-said">{c.note.said}</span>
            </p>
            {@render noteParts(c.note)}
          </div>
        {:else if c.long && compact}
          <details class="change-fold">
            <summary class="change-line">
              <span class="change-label">{c.label}</span>
              <span class="change-sum">{diffPlan(c.block.rows.map((r) => r.cells[0] ?? '')).summary}</span>
            </summary>
            <Diff block={c.block} />
          </details>
        {:else if c.long}
          <div class="change-field">
            <p class="change-label">{c.label}</p>
            <Diff block={c.block} />
          </div>
        {:else if c.scope}
          <p class="change-line">
            <span class="change-label">{c.label}</span>
            <span class="plain">
              <del class="was was-chip"><span class="vh">{words.before}: </span><ScopeChip scope={sideOf(c.scope.to, c.scope.before, c.scope.said?.before)} /></del>
              <span class="move-to" aria-hidden="true">→</span>
              <ins class="now"><span class="vh">{words.after}: </span><ScopeChip scope={sideOf(c.scope.to, c.scope.after, c.scope.said?.after)} /></ins>
            </span>
          </p>
        {:else if u.added}
          <!-- A NEW ROW HAS NO BEFORE: each field is what it would hold, with nothing struck through. -->
          <p class="change-line">
            <span class="change-label">{c.label}</span>
            <span class="plain"><span class="now">{stateWord(c.after) ?? words.empty}</span></span>
          </p>
        {:else}
          <p class="change-line">
            <span class="change-label">{c.label}</span>
            <span class="plain">
              <del class="was"><span class="vh">{words.before}: </span>{stateWord(c.before) ?? words.empty}</del>
              <!-- THE ARROW SAYS WHICH WAY IT GOES, as a move's chips have it: two words side by side read as a pair. -->
              <span class="move-to" aria-hidden="true">→</span>
              <ins class="now"><span class="vh">{words.after}: </span>{stateWord(c.after) ?? words.empty}</ins>
            </span>
          </p>
        {/if}
      {/each}
      {#if u.why && (!compact || i === firstWhy)}
        <p class="row-why">
          {u.why}{#if compact && moreWhy > 0}<span class="row-why-more">{' '}{moreReasons(moreWhy)}</span>{/if}
        </p>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .changes {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .change {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .change-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    font-size: var(--fs-body);
  }

  .change-title {
    color: var(--ink);
    font-weight: 500;
  }

  /* WHY, BEFORE WHAT: a short list in the tile's own text, with no box, rule or chip round it. */
  .takes {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
    margin-block-end: var(--sp-2);
  }

  .takes-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .take {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    font-size: var(--fs-body);
    overflow-wrap: anywhere;
  }

  .take-title {
    color: var(--ink);
  }

  .take-why,
  .take-closed,
  .row-why {
    color: var(--ink-2);
  }

  /* THE ROW'S OWN REASON, after its chips: the question's words for why this one moves, in the tile's text. */
  .row-why {
    margin: 0;
    font-size: var(--fs-body);
    overflow-wrap: anywhere;
  }

  .row-why-more {
    color: var(--ink-3);
  }

  .change-field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  /* ONE LINE A FIELD: the name in a column as wide as a short label, then what it was and what it
     would be. Wraps under itself on a phone rather than truncating a value. */
  .change-line {
    display: grid;
    grid-template-columns: minmax(8ch, max-content) minmax(0, 1fr);
    align-items: baseline;
    gap: var(--sp-3);
    margin: 0;
    font-size: var(--fs-body);
  }

  .change-label {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .plain {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-1) var(--sp-2);
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .was {
    color: var(--ink-2);
    text-decoration-line: line-through;
    text-decoration-color: var(--ink-3);
  }

  .now {
    color: var(--ink);
    font-weight: 500;
    text-decoration: none;
  }

  /* A CHIP IS NOT STRUCK THROUGH: a line across a pill reads as a broken pill. The arrow after it says which side was
     before, and a screen reader hears "Before" and "After" as it does for every other field. */
  .was-chip {
    text-decoration-line: none;
  }

  .move-to {
    color: var(--ink-3);
  }

  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* ── A NOTE'S CHANGE: the note's own blocks at a reading measure, what it held over what it would hold ── */

  .note-said {
    color: var(--ink);
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .note-parts {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .note-part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .note-under {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* EACH SIDE IS A BLOCK OF THE NOTE, not a run of text: `del` and `ins` keep their meaning for a screen reader and
     lose the browser's own line, which each side draws its own way. */
  .note-side {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-ctl);
    font-size: var(--fs-body);
    line-height: 1.55;
    text-decoration: none;
  }

  .note-side :global(:is(p, ul, ol)) {
    max-inline-size: 68ch;
    margin: 0;
  }

  .note-side :global(:is(h1, h2, h3, h4)) {
    margin: 0;
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    letter-spacing: 0;
    line-height: 22px;
  }

  /* WHAT IT HELD: its words dimmed and struck, as the diff strikes a line it takes out; a chart is only dimmed, since a
     line across a bar reads as a broken bar. */
  .note-was {
    color: var(--ink-2);
    opacity: 0.75;
  }

  .note-was :global(:is(p, li, h1, h2, h3, h4)) {
    text-decoration-line: line-through;
    text-decoration-color: var(--ink-3);
  }

  /* WHAT IT WOULD HOLD: in ink, on the held wash the diff puts a line it adds on. */
  .note-now {
    background: var(--tile-2);
    color: var(--ink);
  }

  .change-fold > summary {
    cursor: pointer;
    list-style: none;
  }

  /* THE FOLD IS A CONTROL, and a one-line field name was 21px tall under a thumb. The row keeps its baseline; the
     press is taken by the height round it. */
  @media (pointer: coarse) {
    .change-fold > summary {
      align-items: center;
      min-block-size: var(--tap);
    }
  }

  .change-fold > summary::-webkit-details-marker {
    display: none;
  }

  .change-sum {
    color: var(--ink-2);
    text-decoration: underline;
    text-decoration-color: var(--rule);
    text-underline-offset: 3px;
  }

  .change-fold[open] > summary {
    margin-block-end: var(--sp-2);
  }
</style>
