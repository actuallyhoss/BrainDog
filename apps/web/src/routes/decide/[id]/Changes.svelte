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

  WHAT A CHANGE TAKES IN IS SAID BEFORE ITS DIFF (`takes` in `changes.ts`): under "Why: what was learned", each row
  the change adds to a list of refs by its own words, and under it what stands behind it (for a learning, the failure
  that taught it). A skill's next version was a long diff over a line of handles, and the press was taken without the
  reason. One you cannot open is a count. In the queue (`compact`) only the first line of each is drawn, so the answer
  buttons stay near the title; the gate draws both.
-->
<script lang="ts">
  /* `Diff` is drawn here outside a declared page, so its kind's sheet comes with it (`kinds/diff.css`). */
  import '@braindog/skin/kinds/diff.css';
  import { diffPlan } from 'braindog-render';
  import { Diff } from 'braindog-render/svelte';
  import { apiBase } from '$lib/at.ts';
  import { placeNamed, placesIn, words as scopeWords, type Place, type Scope } from '$lib/record/scope-move.ts';
  import ScopeChip from '$lib/ui/ScopeChip.svelte';
  import { closedSaid, words, type Updated } from './changes.ts';

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

  /** One side of a move, as its chip: the project it names, or `null` for everywhere. */
  const sideOf = (to: string, said: string | null): Scope | null =>
    said === null ? null : (placeNamed(places[to] ?? null, said) ?? { spoken: said, name: scopeWords.someProject, mark: null, hue: null });
</script>

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
        {#if c.long && compact}
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
              <del class="was was-chip"><span class="vh">{words.before}: </span><ScopeChip scope={sideOf(c.scope.to, c.scope.before)} /></del>
              <span class="move-to" aria-hidden="true">→</span>
              <ins class="now"><span class="vh">{words.after}: </span><ScopeChip scope={sideOf(c.scope.to, c.scope.after)} /></ins>
            </span>
          </p>
        {:else}
          <p class="change-line">
            <span class="change-label">{c.label}</span>
            <span class="plain">
              <del class="was"><span class="vh">{words.before}: </span>{c.before ?? words.empty}</del>
              <ins class="now"><span class="vh">{words.after}: </span>{c.after ?? words.empty}</ins>
            </span>
          </p>
        {/if}
      {/each}
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
    font-size: var(--t-ui);
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
    font-size: var(--t-ui);
    overflow-wrap: anywhere;
  }

  .take-title {
    color: var(--ink);
  }

  .take-why,
  .take-closed {
    color: var(--ink2);
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
    font-size: var(--t-ui);
  }

  .change-label {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .plain {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-1) var(--sp-3);
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .was {
    color: var(--ink2);
    text-decoration-line: line-through;
    text-decoration-color: var(--dim);
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
    color: var(--dim);
  }

  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
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
    color: var(--ink2);
    text-decoration: underline;
    text-decoration-color: var(--line);
    text-underline-offset: 3px;
  }

  .change-fold[open] > summary {
    margin-block-end: var(--sp-2);
  }
</style>
