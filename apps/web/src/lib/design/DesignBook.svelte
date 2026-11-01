<!--
  The design book, read-only: the language BrainDog's own pages are written in, with every kind of block
  drawn live from invented data, the tokens as swatches and specimens, and the layout rules.

  GENERATED, NOT WRITTEN HERE. `designBook` (braindog-render) reads the kinds from the renderer's tables and the colours,
  type scale, spacing and radii from the declarations the skin is drawn from. The same book is what an agent reads at
  `braindog:design`, so the page and the resource cannot disagree. A swatch is drawn with its own token, so it follows the
  reader's theme, and the light and dark values are printed beside it.
-->
<script lang="ts">
  import { Block, Degraded } from 'braindog-render/svelte';
  import { SHEET_NOW, designBook, parse } from 'braindog-render';
  import { HOUSE_FRAME } from '@braindog/theme';
  import { SCALE_CSS } from '@braindog/theme/scale.ts';

  import Tile from '$lib/ui/Tile.svelte';
  import Fold from './Fold.svelte';

  /* THE APP'S OWN FRAME (SPEC 1.1), light and dark, written as the declarations the book reads: the board, the tiles,
     the inks and the two reds the app is drawn in. It read the site's palette before the redesign. */
  const frameCss = (scheme: 'light' | 'dark') => Object.entries(HOUSE_FRAME[scheme]).map(([k, v]) => `--${k}: ${v};`).join(' ');
  const APP_LOOK = `:root { ${frameCss('light')} } :root[data-theme="dark"] { ${frameCss('dark')} }`;
  const book = designBook({ look: APP_LOOK, scale: SCALE_CSS });
  const opts = { now: SHEET_NOW };
  const GROUPS = ['say', 'figure', 'list', 'plan', 'media'] as const;
  const words = {
    /* THE BOOK'S SECTIONS (L50): the rules, the tokens, how a page is made, the blocks. Closed when the book opens. */
    rulesGroup: 'The look and the voice',
    tokensGroup: 'Colour, type, space and corners',
    makeGroup: 'Composing and drawing',
    colours: 'Colour',
    type: 'Type scale',
    space: 'Space',
    radii: 'Corners',
    layout: 'Layout',
    look: 'The look',
    voice: 'Voice',
    kinds: 'Blocks and charts',
    compose: 'Composing',
    draw: 'Drawing a component',
    check: 'The design check',
    group: { say: 'To say something', figure: 'To show a figure', list: 'To list', plan: 'To plan', media: 'To show a picture or a link' },
    cells: 'Cells',
    reads: 'Reads',
    narrowest: (n: number) => `Narrowest: ${n} of 12`,
    pageOnly: 'Only on a page',
    none: 'Needs a list or a file, so there is no invented example. A page that has one draws it.',
    light: 'Light',
    dark: 'Dark',
  } as const;
</script>

<div class="book">
  <p class="book-lead">{book.about}</p>


  <!-- LOOK B FIRST (`loop/DESIGN-SYSTEM.md`): the rules every design follows, before the tables it uses. -->
  <Fold id="book-rules" name={words.rulesGroup} count={3}>
  <div class="book-tiles">
  <Tile title={words.look}>
    <ul class="plain">{#each book.look as line (line)}<li>{line}</li>{/each}</ul>
  </Tile>

  <Tile title={words.voice}>
    <ul class="plain">{#each book.voice as line (line)}<li>{line}</li>{/each}</ul>
  </Tile>

  <Tile title={words.layout}>
    <dl class="rules">
      {#each Object.entries(book.layout) as [name, rule] (name)}
        <dt>{name.replaceAll('_', ' ')}</dt>
        <dd>{rule}</dd>
      {/each}
    </dl>
  </Tile>
  </div>
  </Fold>

  <Fold id="book-tokens" name={words.tokensGroup} count={3}>
  <div class="book-tiles">
  <Tile title={words.colours}>
    <ul class="swatches">
      {#each book.tokens.colours as c (c.name)}
        <li class="swatch">
          <span class="chip" style:background="var({c.name})"></span>
          <span class="swatch-name"><code>{c.name}</code> {c.role}</span>
          <span class="swatch-values">{words.light} {c.light}, {words.dark} {c.dark}</span>
        </li>
      {/each}
    </ul>
    <p class="note">{book.tokens.hues}</p>
  </Tile>

  <Tile title={words.type}>
    <ul class="specimens">
      {#each book.tokens.type as t (t.name)}
        <li><code>{t.name}</code> {t.value}<span class="sample" style:font-size="var({t.name})">Pay the invoice by Friday</span></li>
      {/each}
    </ul>
  </Tile>

  <Tile title={`${words.space} and ${words.radii.toLowerCase()}`}>
    <ul class="specimens">
      {#each book.tokens.space as s (s.name)}
        <li><code>{s.name}</code> {s.value}<span class="gap" style:inline-size="var({s.name})"></span></li>
      {/each}
      {#each book.tokens.radii as r (r.name)}
        <li><code>{r.name}</code> {r.value}<span class="corner" style:border-radius="var({r.name})"></span></li>
      {/each}
    </ul>
  </Tile>

  </div>
  </Fold>

  <Fold id="book-make" name={words.makeGroup} count={3}>
  <div class="book-tiles">
  <Tile title={words.compose}>
    <ul class="plain">{#each book.compose as line (line)}<li>{line}</li>{/each}</ul>
    <ul class="plain">{#each book.reach_for as line (line)}<li>{line}</li>{/each}</ul>
  </Tile>

  <Tile title={words.draw}>
    <ul class="plain">{#each book.draw as line (line)}<li>{line}</li>{/each}</ul>
  </Tile>

  <Tile title={words.check}>
    <ul class="plain">{#each book.check as line (line)}<li>{line}</li>{/each}</ul>
  </Tile>

  </div>
  </Fold>

  <Fold id="book-kinds" name={words.kinds} count={book.kinds.length}>
  {#each GROUPS as g (g)}
    {#if book.kinds.some((k) => k.group === g)}
      <h3 class="book-g">{words.group[g]}</h3>
      <div class="kinds">
        {#each book.kinds.filter((k) => k.group === g) as k (k.kind)}
          <Tile title={k.kind}>
            <p class="for">{k.for}</p>
            <p class="meta">
              {words.cells}: {k.cells}{#if k.reads}{' · '}{words.reads}: {k.reads}{/if}{' · '}{words.narrowest(k.narrowest)}{#if k.pageOnly}{' · '}{words.pageOnly}{/if}
            </p>
            {#if k.example}
              <div class="example">
                {#each parse(k.example, { page: true }) as segment, i (i)}
                  {#if segment.type === 'block'}<Block block={segment} {opts} />{:else if segment.type === 'degraded'}<Degraded {segment} />{/if}
                {/each}
              </div>
            {:else}
              <p class="meta">{words.none}</p>
            {/if}
          </Tile>
        {/each}
      </div>
    {/if}
  {/each}
  </Fold>
</div>

<style>
  .book-tiles {
    display: grid;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .book {
    display: grid;
    gap: 0;
  }

  .book > .book-lead {
    margin-block-end: var(--sp-3);
    min-inline-size: 0;
  }

  .book-lead,
  .note,
  .for,
  .meta {
    margin: 0;
    color: var(--ink-2);
  }

  .meta,
  .note,
  .swatch-values {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .book-g {
    margin: var(--sp-4) 0 0;
    font-family: var(--font-display);
  }

  .book-g {
    font-size: var(--fs-head);
  }

  .swatches,
  .specimens,
  .plain {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .swatch {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0 var(--sp-3);
    align-items: center;
  }

  .chip {
    grid-row: span 2;
    inline-size: 32px;
    block-size: 32px;
    border: 1px solid var(--rule);
    border-radius: var(--r-pop);
  }

  .specimens li {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
    align-items: baseline;
  }

  .sample {
    color: var(--ink);
  }

  .gap {
    block-size: 8px;
    background: var(--ink-2);
  }

  .corner {
    inline-size: 32px;
    block-size: 32px;
    background: var(--board);
    border: 1px solid var(--rule);
  }

  .rules {
    display: grid;
    gap: var(--sp-1) var(--sp-4);
    margin: 0;
  }

  .rules dt {
    font-weight: 600;
    text-transform: capitalize;
  }

  .rules dd {
    margin: 0 0 var(--sp-3);
    color: var(--ink-2);
  }

  /* The desk grid itself: a tile per kind, three across where there is room, one on a phone. */
  .kinds {
    display: grid;
    gap: var(--sp-4);
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  }

  .example {
    margin-block-start: var(--sp-3);
    min-inline-size: 0;
    overflow-x: auto;
  }
</style>
