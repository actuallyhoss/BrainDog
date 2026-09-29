<!--
  The Try panel: what to try the drawn automation on, and what it would do, before it is saved (EDT-1).

  SEE IT WORK BEFORE YOU TRUST IT. Zapier's Test and n8n's Execute step both put this at the centre of their editors,
  and before this the only way to learn whether "only when due before today" caught anything was to save it and wait.
  It writes nothing, here or on the record, and says so under the answer.

  A RUN IS TRIED BY THE REAL RUNNER OVER A SAMPLE (`tryAutomation`), and the sample is picked here: the latest row of
  its list, a row picked from the newest, the last arrival, or something pasted. Each card is painted with how its step
  went (`FlowDraft.paint`), so this panel says only what started it, the count of each outcome, and a refusal.

  AN INLINE RULE HAS NO RUN TO TRY, and the record refuses one (`flow-try.ts` `trialTrigger`), so it keeps the dry run:
  walked over its list by the kernel, it says how many rows match now and what the first few would get. A refusal is
  the record's sentence, in ink with a glyph and never a wash (DESIGN-SYSTEM 4.8).

  THE PICK IS THE PAGE'S, bound here, because the sticky bar's Try reads it as well as this panel.

  A TILE UNDER THE CANVAS (SYSTEM §6): the play glyph in its well and "If it ran now" as its heading, the pick as the
  tile's own segmented control, and once it has been tried, the answer drawn before it is said. A run's steps are one
  stacked bar by how each went, in the colours the cards are painted in; a dry run's rows are the share of the list it
  would act on now. The sentence under either is the chart's one written line.
-->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { Stacked } from '$lib/viz/index.ts';
  import { editWords, picksFor, type Answer, type Pick, type Pickable, type Tried, type TryRun, type TryState } from './source.ts';

  let {
    kind,
    path,
    owner,
    rows,
    arrivals,
    pick = $bindable(),
    inline,
    run,
  }: {
    /** What starts it: written, arrival, every, metric, decided or manual. */
    kind: string;
    path: 'inline' | 'run';
    owner: boolean;
    rows: readonly Pickable[];
    arrivals: readonly Pickable[];
    pick: Pick;
    /** The last dry run of an inline body, or `null`. */
    inline: Answer<Tried> | null;
    /** The last try of a run body, or `null`. */
    run: Answer<TryRun> | null;
  } = $props();

  /** How many walked rows are listed. The record hands back twenty, and a column of twenty under a column of cards buries it. */
  const SHOWN = 5;

  const said = {
    matches: (n: number, of: number | null) =>
      n === 0 ? 'No row matches it now.' : `${n === 1 ? 'One row matches' : `${n.toLocaleString('en')} rows match`} it now${of === null ? '' : `, of ${of.toLocaleString('en')}`}.`,
    more: (n: number) => `And ${n.toLocaleString('en')} more.`,
    nothing: 'Nothing, on this row.',
    match: 'Match',
    rest: 'Do not',
    of: 'Rows of the list it would act on now',
  };

  const FROM: Record<Pick['from'], string> = { latest: editWords.fromLatest, row: editWords.fromRow, json: editWords.fromJson };
  const choices = $derived(path === 'run' ? picksFor(kind, owner) : []);
  /* THE WORDS FOR "THE NEWEST ONE" DEPEND ON WHAT STARTS IT: a row, an arrival, or a decision as it would be taken. */
  const latestWord = $derived(kind === 'arrival' ? editWords.fromArrival : kind === 'decided' ? editWords.fromAsIs : editWords.fromLatest);
  const wordFor = (from: Pick['from']): string => (from === 'latest' ? latestWord : FROM[from]);

  /* A PICK THIS TRIGGER DOES NOT OFFER FALLS BACK TO ITS FIRST, so a switch from a change to an arrival does not leave
     "A row I pick" pressed over a picker that has no rows. */
  $effect(() => {
    if (choices.length > 0 && !choices.includes(pick.from)) pick = { ...pick, from: choices[0]! };
  });

  /** The count of each outcome in a try, in the order a run meets them, and only the outcomes it had. */
  const tally = (t: TryRun): string => {
    const order: TryState[] = ['done', 'would', 'waiting', 'failed', 'skipped'];
    return order
      .map((s) => [s, t.steps.filter((x) => x.state === s).length] as const)
      .filter(([, n]) => n > 0)
      .map(([s, n]) => `${editWords.tryState[s]}: ${n.toLocaleString('en')}`)
      .join(', ');
  };
  const failedStep = (t: TryRun) => t.steps.find((s) => s.state === 'failed');

  /* THE STEPS OF A TRY BY HOW EACH WENT, in the colours a card is painted in (`FlowCard.svelte`): done green, what it
     would do out in the world a grey, waiting amber, failed red, not reached the palest grey. */
  const TONE: Record<TryState, string> = { done: 'earn', would: 'g2', waiting: 'warn', failed: 'danger', skipped: 'g4' };
  const partsOf = (t: TryRun) =>
    (['done', 'would', 'waiting', 'failed', 'skipped'] as TryState[])
      .map((st) => ({ label: editWords.tryState[st], value: t.steps.filter((x) => x.state === st).length, tone: TONE[st] }))
      .filter((p) => p.value > 0);

  const cap = (s: string): string => (s === '' ? s : s[0]!.toUpperCase() + s.slice(1));
  /** A line's indent, two spaces a level as `automations.ts` `stepLines` writes it, and the line without it. */
  const depthOf = (line: string): number => Math.floor((line.length - line.trimStart().length) / 2);
</script>

<Tile icon="play" title={editWords.triedHeading}>

  {#if choices.length > 0}
    <div class="tried-pick">
      <div class="segmented tried-segments" role="group" aria-label={editWords.tryFrom}>
        {#each choices as from (from)}
          <button type="button" class="segment" aria-pressed={pick.from === from} data-on={pick.from === from ? '' : undefined} onclick={() => (pick = { ...pick, from })}>
            {wordFor(from)}
          </button>
        {/each}
      </div>

      {#if pick.from === 'latest' && kind === 'written'}
        <p class="tried-note">{rows[0]?.label ?? editWords.noRows}</p>
      {:else if pick.from === 'latest' && kind === 'arrival'}
        <p class="tried-note">{arrivals[0]?.label ?? editWords.noArrivals}</p>
      {:else if pick.from === 'row'}
        {#if rows.length === 0}
          <p class="tried-note">{editWords.noRows}</p>
        {:else}
          <!-- A LIST OF PRESSABLE ROWS AND NOT A <select>, which would draw the phone's own picker over the page
               (`loop/finish/design-brief.md` §11.10). -->
          <ul class="tried-choices" aria-label={editWords.pickRow}>
            {#each rows as r (r.id)}
              <li>
                <button type="button" class="tried-choice tap" aria-pressed={pick.row === r.id} data-on={pick.row === r.id ? '' : undefined} onclick={() => (pick = { ...pick, row: r.id })}>
                  {r.label}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {:else if pick.from === 'json'}
        <label class="tried-paste">
          <span class="tried-label">{editWords.pasteLabel}</span>
          <textarea class="field-input tried-json" rows="4" spellcheck="false" autocomplete="off" value={pick.json} oninput={(e) => (pick = { ...pick, json: e.currentTarget.value })}></textarea>
          <span class="tried-note">{editWords.pasteHint}</span>
        </label>
      {/if}
    </div>
  {/if}

  {#if run}
    {#if !run.ok}
      <p class="tried-refused"><span class="tried-glyph"><Icon name="alert" /></span><span>{run.refusal.fix}</span></p>
    {:else}
      {@const t = run.value}
      {@const bad = failedStep(t)}
      {#if editWords.startedBy[t.trigger]}<p class="tried-trigger">{editWords.startedBy[t.trigger]}</p>{/if}
      {#if t.steps.length > 0}<Stacked parts={partsOf(t)} subject={editWords.triedHeading} />{/if}
      <p class="tried-count">{tally(t)}</p>
      {#if bad}<p class="tried-refused"><span class="tried-glyph"><Icon name="alert" /></span><span>{bad.say}</span></p>{/if}
      <p class="tried-note">{editWords.triedWrote}</p>
    {/if}
  {:else if inline && !inline.ok}
    <p class="tried-refused"><span class="tried-glyph"><Icon name="alert" /></span><span>{inline.refusal.fix}</span></p>
  {:else if inline && inline.ok && inline.value.matches !== null}
    {@const t = inline.value}
    {#if t.rows !== null && t.rows > 0}
      <Stacked
        parts={[
          { label: said.match, value: Math.min(t.matches ?? 0, t.rows), tone: 'ink' },
          { label: said.rest, value: Math.max(0, t.rows - (t.matches ?? 0)), tone: 'g4' },
        ]}
        subject={said.of}
      />
    {/if}
    <p class="tried-count num">{said.matches(t.matches ?? 0, t.rows)}</p>
    {#if t.sample.length > 0}
      <ul class="tried-rows">
        {#each t.sample.slice(0, SHOWN) as r (r.spoken)}
          <li>
            <span class="tried-would">{r.would.length > 0 ? cap(r.would.join(', ')) : r.reason ? cap(r.reason) : said.nothing}</span>
            <span class="tried-id">{r.spoken}</span>
          </li>
        {/each}
      </ul>
      {#if (t.matches ?? 0) > SHOWN}<p class="tried-note num">{said.more((t.matches ?? 0) - SHOWN)}</p>{/if}
    {/if}
    <p class="tried-note">{editWords.triedWrote}</p>
  {:else if inline && inline.ok}
    {@const t = inline.value}
    <p class="tried-trigger">{t.trigger}</p>
    <ol class="tried-steps">
      {#each t.steps as line, i (i)}
        <!-- `style="--depth: …"` AND NOT `style:--depth`, because `css-rules` finds a custom property's declaration by the
             attribute's spelling and flagged the directive's as a property nobody declares. -->
        <li style="--depth: {depthOf(line)}">{line.trimStart()}</li>
      {/each}
    </ol>
    <p class="tried-note">{editWords.triedWrote}</p>
  {/if}
</Tile>

<style>
  .tried-pick {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  /* THE THREE WAYS WRAP RATHER THAN RUN OFF A 320px SCREEN: their words are wider together than a phone's column. In a
     tile the track is the tile's inner fill (`controls.css`). */
  .tried-segments {
    flex-wrap: wrap;
    align-self: flex-start;
    max-inline-size: 100%;
  }

  .tried-choices {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A ROW TO TRY IT ON: one line in the second ink, the tile's inner fill under the chosen one and the one pointed at,
     rounded as a row's wash is (SYSTEM §6, Rows). */
  .tried-choice {
    display: flex;
    align-items: center;
    inline-size: 100%;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-base);
    text-align: start;
    overflow-wrap: anywhere;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .tried-choice[data-on] {
    background: var(--s1);
    color: var(--ink);
    font-weight: 500;
  }

  @media (hover: hover) and (pointer: fine) {
    .tried-choice:hover {
      background: var(--s1);
    }
  }

  .tried-paste {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tried-label {
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  /* A FIELD FOR WHAT IS PASTED: the `--s1` well, no border, the field's corner, in Geist Mono because it is JSON, and
     16px in every input (`loop/finish/design-brief.md` §6), so a phone does not zoom the page on focus. */
  .tried-json {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: 6lh;
    padding: var(--sp-2) var(--sp-3);
    background: var(--s1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-md);
    resize: vertical;
  }

  .tried-json:focus-visible {
    outline: 2px solid var(--focus-in);
    outline-offset: 2px;
  }

  /* THE CHART'S ONE WRITTEN LINE (SYSTEM §6): body size in ink. */
  .tried-count,
  .tried-trigger {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 20px;
  }

  .tried-trigger {
    color: var(--ink2);
  }

  .tried-refused {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
  }

  /* THE GLYPH CARRIES THE INTENT AND THE SENTENCE STAYS INK (DESIGN-SYSTEM 1.2 and 4.8): red, since what it says is
     what stopped the run. */
  .tried-glyph {
    display: inline-flex;
    flex: none;
    margin-block-start: 2px;
    color: var(--danger);
  }

  .tried-rows,
  .tried-steps {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tried-rows li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--sp-2);
    padding: var(--sp-2) 0;
    font-size: var(--t-sm);
  }

  .tried-rows li + li {
    border-block-start: 1px solid var(--line);
  }

  .tried-would {
    flex: 1 1 16rem;
    min-inline-size: 0;
    color: var(--ink2);
    overflow-wrap: anywhere;
  }

  .tried-id {
    color: var(--dim);
    font-size: var(--t-sm);
    font-variant-numeric: tabular-nums;
  }

  .tried-steps {
    gap: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .tried-steps li {
    padding-inline-start: calc(var(--depth, 0) * var(--sp-4));
    overflow-wrap: anywhere;
  }

  .tried-note {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }
</style>
