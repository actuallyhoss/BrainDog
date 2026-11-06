<!--
  Security: how a record is kept, one fact to a tile, each drawn, and how to report a weakness.

  THE NIGHT HEAD, THEN THE BOARD (Look B): the page's name and its one line in `PageHead`, then one flat
  board of tiles, a fact to each, flat and opaque with no edge and no shadow. Restyled, not redesigned: the facts, the
  drawings and the report are the ones this page has always had.

  EVERY FACT NAMES ITS SOURCE in a comment beside it in `copy/trust.ts`, and says only what is built. A fact that stops
  being true is fixed there, where the file it rests on is named. The drawings beside the facts say nothing the fact
  does not: a record beside records with nothing between them, a key sealed before it is stored, thirty sealed nights
  (the pricing table's own "last 30 kept"), the sign-in with no password field, and the export. What a token may do is the agents page's (plan F21), linked.

  THE REPORTING ADDRESS IS THE SUPPORT ADDRESS, `SUPPORT_EMAIL`. While it is empty the last tile says when it arrives,
  and neither the address nor the repository's promise about mail is drawn, because nobody would be reading it. The
  address is a plain outlined button and never red: the one solid red a page carries is "Start free".
-->
<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import { crumbsOf } from '$lib/site/seo.ts';
  import Icon from '$lib/Icon.svelte';
  import type { IconName } from '$lib/icons.ts';
  import { SUPPORT_EMAIL } from '$lib/links.ts';
  import { trust } from '$lib/copy/trust.ts';
  import PageHead from '$lib/site/PageHead.svelte';

  const s = trust.security;
  const d = s.drawn;
  const [db, keys, nights, passkey, token, exported] = s.kept.facts;

  /* Widened on purpose: the constant is a literal, and the page is written for both of its values. */
  const address: string = SUPPORT_EMAIL;

  const glyph = (name: string): IconName => name as IconName;
  const NIGHTS = Array.from({ length: 30 }, (_, i) => i);
</script>

<Seo title={s.meta.title} description={s.meta.description} path="/security" ld={[crumbsOf([{ name: 'BrainDog', path: '/' }, { name: 'Security', path: '/security' }])]} />
{#snippet head(id: string, name: string, title: string)}
  <h2 class="fact-head">
    <span class="glyph"><Icon name={glyph(name)} /></span>
    <span id={id}>{title}</span>
  </h2>
{/snippet}

<PageHead title={s.title} lead={s.lede} />

<section class="board" aria-label={s.kept.title}>
  <div class="wrap facts">
    <!-- ROWS OF TWO in the order the facts are told, the wide tile and the narrow one changing sides each row; one
         column of six on a phone, in the same order. -->
    {#if db}
      <section class="fact span-8 split" aria-labelledby="db-title">
        <div class="say-it">
          {@render head('db-title', db.glyph, db.title)}
          <p class="fact-text">{db.text}</p>
        </div>
        <div class="records" role="img" aria-label={d.records}>
          {#each [1, 2, 3, 4] as n}
            <span class="record" aria-hidden="true">
              <span class="glyph"><Icon name="server" /></span>
              <span class="record-name" class:mine={n === 1}>{d.recordName(n)}</span>
            </span>
          {/each}
        </div>
      </section>
    {/if}

    {#if keys}
      <section class="fact span-4" aria-labelledby="keys-title">
        {@render head('keys-title', keys.glyph, keys.title)}
        <p class="fact-text">{keys.text}</p>
        <div class="seal" role="img" aria-label={d.sealedLabel}>
          {#each d.sealed as step, i}
            {#if i > 0}<span class="seal-arrow" aria-hidden="true"><Icon name="arrow" size="m" /></span>{/if}
            <span class="seal-step" aria-hidden="true">
              <span class="glyph l" class:ink={i === 1}><Icon name={i === 0 ? 'key' : i === 1 ? 'lock' : 'server'} /></span>
              <span class="seal-word">{step}</span>
            </span>
          {/each}
        </div>
        <p class="note">{d.sealedNote}</p>
      </section>
    {/if}

    {#if nights}
      <section class="fact span-4" aria-labelledby="nights-title">
        {@render head('nights-title', nights.glyph, nights.title)}
        <p class="fact-text">{nights.text}</p>
        <div class="nights" role="img" aria-label={d.nights}>
          <span class="night-row" aria-hidden="true">
            {#each NIGHTS as i}<span class="night" class:last={i === NIGHTS.length - 1}></span>{/each}
          </span>
          <span class="night-ends" aria-hidden="true"><span>{d.nightsFrom}</span><span>{d.nightsTo}</span></span>
        </div>
        <p class="note ink">{d.nightsRead}</p>
      </section>
    {/if}

    {#if passkey}
      <section class="fact span-8 split" aria-labelledby="passkey-title">
        <div class="say-it">
          {@render head('passkey-title', passkey.glyph, passkey.title)}
          <p class="fact-text">{passkey.text}</p>
        </div>
        <div class="signin" role="img" aria-label={d.signinLabel}>
          {#each d.signin as way, i (way)}
            <span class="way" class:not={i === 3} aria-hidden="true">
              <span class="glyph" class:ink={i === 0}><Icon name={i === 0 ? 'mail' : i === 1 ? 'globe' : i === 2 ? 'key' : 'x'} /></span>{way}
            </span>
          {/each}
        </div>
      </section>
    {/if}

    {#if token}
      <section class="fact span-6" aria-labelledby="token-title">
        {@render head('token-title', token.glyph, token.title)}
        <p class="fact-text">{token.text}</p>
        <p class="on"><a class="onward" href={d.reachHref}>{d.reachLink}<Icon name="arrow-right" size="s" /></a></p>
      </section>
    {/if}

    {#if exported}
      <section class="fact span-6" aria-labelledby="export-title">
        {@render head('export-title', exported.glyph, exported.title)}
        <p class="fact-text">{exported.text}</p>
        <div class="export" role="img" aria-label={exported.text}>
          <span class="export-row" aria-hidden="true">
            <span class="glyph"><Icon name="download" /></span>
            <span class="export-words">
              <span class="export-name">{d.exportName}</span>
              <span class="export-note">{d.exportNote}</span>
            </span>
          </span>
        </div>
        <p class="on"><a class="onward" href={d.exportHref}>{d.exportLink}<Icon name="arrow-right" size="s" /></a></p>
      </section>
    {/if}

    <section class="fact span-12 split report" aria-labelledby="report-title">
      <div class="say-it">
        {@render head('report-title', 'shield', s.report.title)}
        {#if address === ''}
          <p class="fact-text">{s.report.pending}</p>
        {:else}
          <p class="fact-text">{s.report.body}</p>
          <p class="go"><a class="btn line" href="mailto:{address}"><Icon name="mail" size="m" />{address}</a></p>
        {/if}
      </div>
      {#if address !== ''}
        <div class="after">
          <h3 class="after-title" id="after-title">{s.report.after}</h3>
          <ol class="steps" aria-labelledby="after-title">
            {#each s.report.steps as step, i}
              <li class="step">
                <span class="step-n" aria-hidden="true">{i + 1}</span>
                <span class="step-what">{step.what}</span>
                <span class="step-when">{step.when}</span>
              </li>
            {/each}
          </ol>
        </div>
      {/if}
    </section>
  </div>
</section>

<style>
  /* ── The board and its tiles ─────────────────────────────────────────── */

  /* THE BOARD: one flat ground under the head, the tiles on it a gap apart, at the page's first step under the head and
     its band step at the end. It runs on to the footer with no strip of the page's white between. */
  .board {
    margin-block-end: 0;
    padding-block: var(--first-pad) var(--band-pad);
    background: var(--board);
  }

  /**
   * ROWS OF TWO ON TWELVE COLUMNS (polish, 2 November): the facts in the order they are told, eight and four, then four
   * and eight, then six and six, and the report across. Each row's tiles share its height, so every gutter runs
   * straight across the board. They were two stacks whose gaps never met, and on a phone the tiles were put back in
   * order by hand. One column below 900.
   */
  .facts {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }

  @media (width >= 900px) {
    .facts {
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }

    .span-4 {
      grid-column: span 4;
    }

    .span-6 {
      grid-column: span 6;
    }

    .span-8 {
      grid-column: span 8;
    }

    .span-12 {
      grid-column: span 12;
    }
  }

  /* A TILE: flat and opaque, radius 16, no edge and no shadow, padded as every tile is. */
  .fact {
    display: flex;
    flex-direction: column;
    gap: 20px;
    min-inline-size: 0;
    padding: var(--site-tile-pad);
    background: var(--tile);
    border-radius: 16px;
    color: var(--ink);
  }

  /* A TILE IN TWO HALVES at a desk: the words, and the drawing of what they say beside them, level with the middle of
     the tile. One column at 1200 and under. */
  .split {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
    align-content: start;
  }

  @media (width > 1200px) {
    .split {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: center;
      align-content: stretch;
    }

    .split > .say-it {
      align-self: start;
    }
  }

  /* THE WAY ON AT THE FOOT OF ITS TILE, so the two in a row sit on one line. */
  .on {
    margin: auto 0 0;
    padding-block-start: 4px;
  }

  .say-it {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-inline-size: 0;
  }

  .fact-head {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--ink);
    font-size: var(--t-card);
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .fact-text {
    margin: 0;
    max-inline-size: 34em;
    color: var(--ink2);
    font-size: var(--t-text);
    line-height: 1.6;
    text-wrap: pretty;
  }

  /* THE LINE UNDER A DRAWING that says what it means, in the second ink, or (`.ink`) the first. */
  .note {
    margin: 0;
    color: var(--muted);
    font-size: var(--t-label);
    line-height: 1.5;
  }

  .note.ink {
    color: var(--ink);
  }

  /* THE GLYPH'S SQUARE: 32 (or 40) on the board's own fill, the control radius every well takes; `ink` is the
     chosen form. */
  .glyph {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    background: var(--board);
    border-radius: var(--r-ctl);
    color: var(--ink2);
  }

  .glyph.l {
    inline-size: 40px;
    block-size: 40px;
  }

  .glyph.ink {
    background: var(--ink);
    color: var(--page);
  }

  /* ── One database per record ─────────────────────────────────────────── */

  /* FOUR RECORDS, EACH ITS OWN: a gap between every pair and no line across it, which is the whole of the claim. */
  .records {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .record {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
    background: var(--board);
    border-radius: 12px;
  }

  .record .glyph {
    background: var(--tile);
  }

  /* "Yours" in ink, the three "Someone else's" in the muted ink. */
  .record-name {
    color: var(--muted);
    font-size: var(--t-meta);
    font-weight: 500;
  }

  .record-name.mine {
    color: var(--ink);
    font-weight: 600;
  }

  /* ── Sealed keys ─────────────────────────────────────────────────────── */

  .seal {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: start;
    gap: 8px;
  }

  .seal-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    min-inline-size: 0;
    text-align: center;
  }

  .seal-word {
    color: var(--ink2);
    font-size: var(--t-meta);
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .seal-arrow {
    display: grid;
    place-items: center;
    block-size: 40px;
    color: var(--muted);
  }

  /* ── Nightly copies ──────────────────────────────────────────────────── */

  .nights {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* THIRTY NIGHTS, ONE MARK EACH, the newest in ink and the rest in the chart's quiet grey. */
  .night-row {
    display: grid;
    grid-template-columns: repeat(30, minmax(0, 1fr));
    gap: 3px;
    block-size: 40px;
  }

  .night {
    background: var(--bar);
    border-radius: 3px;
  }

  .night.last {
    background: var(--chart);
  }

  .night-ends {
    display: flex;
    justify-content: space-between;
    color: var(--muted);
    font-size: var(--t-meta);
  }

  /* ── A passkey ───────────────────────────────────────────────────────── */

  /* THE WAYS IN, AS LINES AND NOT BUTTONS: a drawn button nobody can press read as one
     that does nothing. Each way is its glyph and its words, the way the sealed keys are drawn beside it. */
  .signin {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .way {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--ink);
    font-size: var(--t-label);
    font-weight: 500;
  }

  .way.not {
    color: var(--muted);
    font-weight: 400;
  }

  /* ── Export ──────────────────────────────────────────────────────────── */

  .export {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    margin-block-start: auto;
  }

  /* THE FILE, AS A LINE BETWEEN RULES and not a filled box, so it reads as what export gives and not a button. */
  .export-row {
    display: flex;
    align-items: center;
    gap: 12px;
    align-self: stretch;
    padding-block: 12px;
    border-block: 1px solid var(--rule);
  }

  .export-words {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .export-name {
    color: var(--ink);
    font-size: var(--t-meta);
    font-weight: 600;
  }

  .export-note {
    color: var(--muted);
    font-size: var(--t-meta);
  }

  /* ── Report a vulnerability ──────────────────────────────────────────── */

  .report {
    align-items: start;
  }

  .go {
    margin: 4px 0 0;
  }

  /* The address can be long; on a narrow phone it wraps inside its button rather than pushing past the window. */
  .go .btn {
    max-inline-size: 100%;
    block-size: auto;
    min-block-size: 48px;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .after {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-inline-size: 0;
  }

  .after-title {
    color: var(--muted);
    font-family: var(--ui);
    font-size: var(--t-label);
    font-weight: 500;
  }

  /* THE FOUR STEPS IN ORDER, a numbered square each, with the time it is promised in under it. */
  .steps {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .step {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-inline-size: 0;
  }

  .step-n {
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    margin-block-end: 4px;
    background: var(--board);
    border-radius: 8px;
    color: var(--ink2);
    font-size: var(--t-meta);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .step-what {
    color: var(--ink);
    font-size: var(--t-label);
    font-weight: 600;
  }

  .step-when {
    color: var(--muted);
    font-size: var(--t-label);
  }

  @media (width >= 1100px) {
    .steps {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  /* ON A PHONE EACH STEP IS ONE LINE (plan F22): its number, what happens, and when, where four stacked squares made the
     report the page's tallest tile. */
  @media (width < 640px) {
    .steps {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }

    .step {
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr) auto;
      column-gap: 10px;
      align-items: center;
    }

    .step-n {
      inline-size: 24px;
      block-size: 24px;
      margin: 0;
      font-size: var(--t-meta);
    }

    .step-when {
      font-size: var(--t-meta);
      text-align: end;
    }

    .night-row {
      gap: 2px;
    }
  }
</style>
