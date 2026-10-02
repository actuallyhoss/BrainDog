<!--
  `cards` — one card per row after the first, which names what each column is on a card
  (`src/cards.ts`). Drawn to the same tree as `html.ts`'s `cards`; `src/parity.test.ts` compiles this
  file and compares the two.

  The host lays the cards out with `auto-fill` over a minimum width, so a narrow container is one
  column without a breakpoint, and a lane of one card keeps a card's width instead of stretching.
-->
<script lang="ts">
  import {
    CARDS_NONE,
    MISSING,
    TONES,
    TREND,
    agentMarkFill,
    cardLayout,
    cardsCount,
    initialOf,
    inline,
    isQuiet,
    headlineFigure,
    leadingCode,
    symbolFigure,
    markOf,
    ringDash,
    ringOf,
    text,
    trendOf,
    type AgentMark,
    type Block,
    type RenderOptions,
    type Row,
  } from '../src/index.ts';
  /* From the module and not the root, which does not export it: the word is this drawer's and `html.ts`'s alone. */
  import { CARDS_NEXT, RUN_OPEN, runFaceOf, type RunCell, type RunFace } from '../src/cards.ts';
  import { hueOf } from '../src/cards.ts';
  import { pictureSrc } from '../src/gallery.ts';
  import { hrefFor } from '../src/html.ts';
  import Text from './Text.svelte';

  /**
   * What a scope cell draws its chip from, as `p/Table.svelte` takes it, written out here for the reason given there.
   * The host hands it in `opts` beside the block, since a card grid reaches this file through `Block` and `Grid`, which
   * pass `opts` on whole.
   */
  type ScopeCells = { columns: readonly number[]; everywhere: string; glyph: string | null; marks: ReadonlyMap<string, { mark: string | null; hue: number | null }> };

  /* A BLOCK OF RUNS COMES WITH ITS RUNS: the host hands one a row, which the `who` face is drawn from. */
  let { block, opts = {} }: { block: Block; opts?: RenderOptions & { scope?: ScopeCells | undefined; runs?: readonly (RunCell | null)[] | undefined } } = $props();

  const L = $derived(cardLayout(block.rows[0]?.cells ?? []));
  const rows = $derived(block.rows.slice(1));

  /* WHERE A ROW APPLIES IS A FACT THAT IS DRAWN AS A CHIP: a fact in a column the host names as a scope. */
  const scoped = (i: number): boolean => opts.scope?.columns.includes(i) ?? false;

  const label = (i: number): string => L.labels[i] ?? '';
  const said = (r: Row, i: number): string => (i < 0 ? '' : text(inline(r.cells[i] ?? '', opts)));
  const nodes = (r: Row, i: number) => inline(r.cells[i] ?? '', opts);
  /** The mark the host draws for the name in a cell, or `null`, as `markFor` in `src/html.ts`. */
  const markFor = (name: string): AgentMark | null => (name.trim() && opts.agentMark ? opts.agentMark(name.trim()) : null);
</script>

<!-- AN AGENT'S FACE AS ITS MAKER'S MARK, as `agentFaceHtml` in `src/html.ts` draws one: the host's path, filled in the
     maker's tone, in the face slot a letter used to fill. Hidden, because the agent is named in words beside it. -->
{#snippet agentFace(m: AgentMark, cls: string)}{@const fill = agentMarkFill(m.tone)}<span class={cls} data-agent="" aria-hidden="true"
    ><svg class="agent-mark" data-tone={m.tone} viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" style={fill ?? undefined}
      ><path d={m.d} fill-rule={m.rule} clip-rule={m.rule}></path></svg
    ></span
  >{/snippet}

{#snippet labelled(i: number)}{#if label(i)}<span class="cards-label">{label(i)}</span>{/if}{/snippet}

<!-- A SCOPE CHIP, as `p/Table.svelte` draws one: the globe beside "Everywhere", or the project's mark in its own hue
     beside its name. The mark is hidden from a screen reader, which reads the name. -->
{#snippet scopeChip(cells: ScopeCells, said: string)}{@const everywhere = said === cells.everywhere}{@const m = everywhere ? undefined : cells.marks.get(said)}<span class="scope-chip" data-everywhere={everywhere ? '' : undefined}>{#if everywhere && cells.glyph}<svg class="scope-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={cells.glyph} /></svg>{:else if m?.mark}<span class="scope-mark" style={m.hue === null ? undefined : `--hue:${m.hue}`} aria-hidden="true">{m.mark}</span>{/if}<span class="scope-name">{said}</span></span>{/snippet}

<!-- A RUN'S FACE, as `apps/web`'s `AgentFace` draws one: the kind's glyph on a disc washed in the run's
     hue, ringed in that hue while the run is open, solid while it works and dashed once it has gone quiet, and a door to
     the run's page. The hue is written on the drawing alone, so the card's own `--hue` is left as it was. -->
{#snippet runFace(f: RunFace)}{@const d = f.glyph === 'slash' ? 'M15.5 4.5 8.5 19.5' : (opts.icon?.(f.glyph) ?? null)}<a
    class="cards-face cards-run"
    style="background:none"
    href={hrefFor(opts, `/r/session/${f.seq}`)}
    data-live={f.live}
    aria-label={RUN_OPEN}
    ><svg class="cards-run-mark" viewBox="0 0 36 36" width="100%" height="100%" aria-hidden="true" style="--run-hue:{f.hue}"
      ><circle class="cards-run-disc" cx="18" cy="18" r="14" style="fill:color-mix(in srgb, oklch(var(--mark-l) var(--mark-c) var(--run-hue)) 30%, var(--bg))"
      ></circle>{#if f.live !== 'stopped'}<circle
          class="cards-run-ring"
          cx="18"
          cy="18"
          r="16.5"
          fill="none"
          stroke-width="2.5"
          stroke-dasharray={f.live === 'quiet' ? '4 3' : undefined}
          style="stroke:oklch(var(--mark-l) var(--mark-c) var(--run-hue))"
        ></circle>{/if}{#if d}<path
          d={d}
          transform="translate(9 9) scale(0.75)"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        ></path>{/if}</svg
    ></a
  >{/snippet}

{#if rows.length === 0}
  <p class="cards-empty">{CARDS_NONE}</p>
{:else}
  <!-- AS MANY COLUMNS AS FIT, AND NEVER MORE THAN THERE ARE CARDS (`cardsCount`), so three cards fill the row. -->
  <ul class="cards-grid" data-cards={cardsCount(rows.length)}>
    {#each rows as r, n}
      {@const mark = L.mark >= 0 ? markOf(said(r, L.mark)) : null}
      {@const run = L.name >= 0 || L.who >= 0 ? runFaceOf(said(r, L.nameIsWho ? L.name : L.who), opts.runs?.[n], isQuiet(L, r.cells)) : null}
      {@const face = L.nameIsWho ? initialOf(said(r, L.name)) : null}
      {@const nameMark = L.nameIsWho ? markFor(said(r, L.name)) : null}
      <!-- A CARD'S FIGURE IS A TILE'S, said short as `amount(headlineFigure(...))` in the mirror says it: `£18,400`. -->
      {@const short = L.figure >= 0 ? headlineFigure(r.cells[L.figure] ?? '') : ''}
      {@const symbol = L.figure >= 0 ? symbolFigure(short) : null}
      {@const coded = L.figure >= 0 ? leadingCode(short) : null}
      {@const t = L.trend >= 0 ? trendOf(said(r, L.trend)) : null}
      {@const m = L.ring >= 0 ? ringOf(said(r, L.ring)) : null}
      {@const whoFace = L.who >= 0 ? initialOf(said(r, L.who)) : null}
      {@const whoMark = L.who >= 0 ? markFor(said(r, L.who)) : null}
      {@const hue = L.hue >= 0 ? hueOf(said(r, L.hue)) : null}
      {@const picture = L.picture >= 0 ? pictureSrc(r.cells[L.picture] ?? '', opts.file) : null}
      <!-- The lead is the first card of a `cards lead` block and no other, told rather than inferred (05 §4). The hue is a
           number the host draws the mark in, and a cell that is not one writes no style; the picture leads the card
           where the host serves the file, hidden from a screen reader because the title under it names the card. -->
      <li
        class="cards-item"
        data-lead={block.form === 'lead' && n === 0 ? '' : undefined}
        data-intent={r.tone}
        data-quiet={isQuiet(L, r.cells) ? '' : undefined}
        style={hue === null ? undefined : `--hue:${hue}`}
      >
        {#if picture}<img class="cards-picture" src={hrefFor(opts, picture)} alt="" loading="lazy" />{/if}
        <div class="cards-head">
          {#if mark}<span class="cards-mark" aria-hidden="true">{mark}</span>
          {:else if L.nameIsWho && run}{@render runFace(run)}
          {:else if nameMark}{@render agentFace(nameMark, 'cards-face')}
          {:else if face}<span class="cards-face" aria-hidden="true">{face}</span>{/if}
          {#if L.name >= 0}<h3 class="cards-title">{#if r.cells[L.name]}<Text nodes={nodes(r, L.name)} {opts} />{:else}{MISSING}{/if}</h3>{/if}
          {#if r.tone}<span class="glyph" role="img" aria-label={TONES[r.tone].label}>{TONES[r.tone].glyph}</span>{/if}
          {#if L.when >= 0 && r.cells[L.when]}<span class="cards-when"><Text nodes={nodes(r, L.when)} {opts} /></span>{/if}
        </div>
        <!-- The reply is the line under the head, and an empty one draws nothing, as in `toHTML`. -->
        {#if L.reply >= 0 && r.cells[L.reply]}<p class="cards-reply"><Text nodes={nodes(r, L.reply)} {opts} /></p>{/if}
        {#if L.figure >= 0 || t || (L.ring >= 0 && r.cells[L.ring])}
          <div class="cards-body">
            {#if L.figure >= 0}
              <span class="cards-figure"
                ><span class="cards-value num"
                  >{#if !r.cells[L.figure]}{MISSING}{:else if symbol}{symbol}{:else if coded}{coded.sign}<span class="amount-code">{coded.currency}</span>
                    <Text nodes={inline(coded.rest, opts)} {opts} />{:else}<Text nodes={inline(short, opts)} {opts} />{/if}</span
                >{@render labelled(L.figure)}</span
              >
            {/if}
            {#if t}
              <!-- A word-sized line, so it is named by its numbers and is not a tab stop. -->
              <svg
                class="cards-trend"
                viewBox="0 0 1000 100"
                preserveAspectRatio="none"
                role="img"
                aria-label="{label(L.trend) || TREND}: {t.said.join(', ')}"
              >
                <path class="cards-trend-line" d={t.d} vector-effect="non-scaling-stroke"></path>
                <path class="cards-trend-end" d={t.end} vector-effect="non-scaling-stroke"></path>
              </svg>
            {/if}
            {#if L.ring >= 0 && r.cells[L.ring]}
              <span class="cards-ring"
                >{#if m !== null}<svg class="cards-ring-mark" viewBox="0 0 36 36" aria-hidden="true"
                    ><circle class="cards-ring-track" cx="18" cy="18" r="16" pathLength="100"></circle><circle
                      class="cards-ring-fill"
                      cx="18"
                      cy="18"
                      r="16"
                      pathLength="100"
                      stroke-dasharray={ringDash(m)}
                      transform="rotate(-90 18 18)"
                    ></circle></svg
                  >{/if}<span class="cards-value num"><Text nodes={nodes(r, L.ring)} {opts} /></span
                >{@render labelled(L.ring)}</span
              >
            {/if}
          </div>
        {/if}
        <!-- A FACT NOBODY WROTE IS NOT DRAWN: "Met in —" on a person met in no project said a field was missing where
             there was nothing to say. A card with no fact written draws no list at all. -->
        {#if L.facts.some((i) => r.cells[i])}
          <dl class="cards-facts">
            {#each L.facts as i}
              {#if r.cells[i]}
                {@const scope = scoped(i) ? opts.scope : undefined}
                <div class="cards-fact">
                  <dt>{label(i)}</dt>
                  <dd>{#if scope}{@render scopeChip(scope, r.cells[i] ?? '')}{:else}<Text nodes={nodes(r, i)} {opts} />{/if}</dd>
                </div>
              {/if}
            {/each}
          </dl>
        {/if}
        <!-- "Next:" over nothing would say there is a step nobody wrote down, so an empty next draws no line. -->
        {#if L.next >= 0 && r.cells[L.next]}<p class="cards-next">{CARDS_NEXT}: <Text nodes={nodes(r, L.next)} {opts} /></p>{/if}
        {#if L.who >= 0 && r.cells[L.who]}
          <div class="cards-who">
            {#if run}{@render runFace(run)}{:else if whoMark}{@render agentFace(whoMark, 'cards-face')}{:else if whoFace}<span class="cards-face" aria-hidden="true">{whoFace}</span>{/if}
            <span class="cards-name"><Text nodes={nodes(r, L.who)} {opts} /></span>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}
