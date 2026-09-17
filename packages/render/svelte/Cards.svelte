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
    cardLayout,
    initialOf,
    inline,
    isQuiet,
    leadingCode,
    symbolFigure,
    markOf,
    ringDash,
    ringOf,
    text,
    trendOf,
    type Block,
    type RenderOptions,
    type Row,
  } from '../src/index.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const L = $derived(cardLayout(block.rows[0]?.cells ?? []));
  const rows = $derived(block.rows.slice(1));

  const label = (i: number): string => L.labels[i] ?? '';
  const said = (r: Row, i: number): string => (i < 0 ? '' : text(inline(r.cells[i] ?? '', opts)));
  const nodes = (r: Row, i: number) => inline(r.cells[i] ?? '', opts);
</script>

{#snippet labelled(i: number)}{#if label(i)}<span class="cards-label">{label(i)}</span>{/if}{/snippet}

{#if rows.length === 0}
  <p class="cards-empty">{CARDS_NONE}</p>
{:else}
  <ul class="cards-grid">
    {#each rows as r}
      {@const mark = L.mark >= 0 ? markOf(said(r, L.mark)) : null}
      {@const face = L.nameIsWho ? initialOf(said(r, L.name)) : null}
      {@const symbol = L.figure >= 0 ? symbolFigure(r.cells[L.figure] ?? '') : null}
      {@const coded = L.figure >= 0 ? leadingCode(r.cells[L.figure] ?? '') : null}
      {@const t = L.trend >= 0 ? trendOf(said(r, L.trend)) : null}
      {@const m = L.ring >= 0 ? ringOf(said(r, L.ring)) : null}
      {@const whoFace = L.who >= 0 ? initialOf(said(r, L.who)) : null}
      <li class="cards-item" data-intent={r.tone} data-quiet={isQuiet(L, r.cells) ? '' : undefined}>
        <div class="cards-head">
          {#if mark}<span class="cards-mark" aria-hidden="true">{mark}</span>
          {:else if face}<span class="cards-face" aria-hidden="true">{face}</span>{/if}
          {#if L.name >= 0}<h3 class="cards-title">{#if r.cells[L.name]}<Text nodes={nodes(r, L.name)} {opts} />{:else}{MISSING}{/if}</h3>{/if}
          {#if r.tone}<span class="glyph" role="img" aria-label={TONES[r.tone].label}>{TONES[r.tone].glyph}</span>{/if}
          {#if L.when >= 0 && r.cells[L.when]}<span class="cards-when"><Text nodes={nodes(r, L.when)} {opts} /></span>{/if}
        </div>
        {#if L.figure >= 0 || t || (L.ring >= 0 && r.cells[L.ring])}
          <div class="cards-body">
            {#if L.figure >= 0}
              <span class="cards-figure"
                ><span class="cards-value num"
                  >{#if !r.cells[L.figure]}{MISSING}{:else if symbol}{symbol}{:else if coded}{coded.sign}<span class="amount-code">{coded.currency}</span>
                    <Text nodes={inline(coded.rest, opts)} {opts} />{:else}<Text nodes={nodes(r, L.figure)} {opts} />{/if}</span
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
        {#if L.facts.length}
          <dl class="cards-facts">
            {#each L.facts as i}
              <div class="cards-fact">
                <dt>{label(i)}</dt>
                <dd>{#if r.cells[i]}<Text nodes={nodes(r, i)} {opts} />{:else}{MISSING}{/if}</dd>
              </div>
            {/each}
          </dl>
        {/if}
        {#if L.who >= 0 && r.cells[L.who]}
          <div class="cards-who">
            {#if whoFace}<span class="cards-face" aria-hidden="true">{whoFace}</span>{/if}
            <span class="cards-name"><Text nodes={nodes(r, L.who)} {opts} /></span>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}
