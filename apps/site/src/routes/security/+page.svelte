<!--
  Security: how a record is kept, one fact to a tile, each drawn, and how to report a weakness.

  EVERY FACT NAMES ITS SOURCE in a comment beside it in `copy/trust.ts`, and says only what is built. A fact that stops
  being true is fixed there, where the file it rests on is named. The drawings beside the facts say nothing the fact
  does not: a record beside records with nothing between them, a key sealed before it is stored, thirty sealed nights
  (the pricing table's own "last 30 kept"), the sign-in with no password field, what a token may do, and the export.

  THE REPORTING ADDRESS IS THE SUPPORT ADDRESS, `SUPPORT_EMAIL`. While it is empty the last tile says when it arrives,
  and neither the address nor the repository's promise about mail is drawn, because nobody would be reading it.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import type { IconName } from '$lib/icons.ts';
  import { SUPPORT_EMAIL } from '$lib/links.ts';
  import { trust } from '$lib/copy/trust.ts';

  const s = trust.security;
  const d = s.drawn;
  const [db, keys, nights, passkey, token, exported] = s.kept.facts;

  /* Widened on purpose: the constant is a literal, and the page is written for both of its values. */
  const address: string = SUPPORT_EMAIL;

  const glyph = (name: string): IconName => name as IconName;
  const NIGHTS = Array.from({ length: 30 }, (_, i) => i);
</script>

<svelte:head>
  <title>{s.meta.title}</title>
  <meta name="description" content={s.meta.description} />
  <link rel="canonical" href="https://brain.dog/security" />
  <meta property="og:url" content="https://brain.dog/security" />
  <meta property="og:title" content={s.meta.title} />
  <meta property="og:description" content={s.meta.description} />
</svelte:head>

{#snippet head(id: string, name: string, title: string)}
  <h2 class="tile-head">
    <span class="well"><Icon name={glyph(name)} /></span>
    <span class="tile-title" id={id}>{title}</span>
  </h2>
{/snippet}

<section class="band" aria-labelledby="security-title">
  <div class="in">
    <div class="tiles">
      <!-- THE OPENING TILE: the page's heading, and the first fact drawn beside it. -->
      <article class="tile lead split span-8">
        <div class="words">
          <h1 class="h2" id="security-title">{s.title}</h1>
          <p class="lede">{s.lede}</p>
          {#if db}
            <div class="fact">
              {@render head('db-title', db.glyph, db.title)}
              <p class="fact-text">{db.text}</p>
            </div>
          {/if}
        </div>
        <div class="records" role="img" aria-label={d.records}>
          {#each [1, 2, 3, 4] as n}
            <span class="record" aria-hidden="true">
              <span class="well"><Icon name="server" /></span>
              <span class="record-name">{d.recordName(n)}</span>
            </span>
          {/each}
        </div>
      </article>

      {#if keys}
        <section class="tile lead span-4" aria-labelledby="keys-title">
          {@render head('keys-title', keys.glyph, keys.title)}
          <p class="fact-text">{keys.text}</p>
          <div class="seal" role="img" aria-label={d.sealedLabel}>
            {#each d.sealed as step, i}
              {#if i > 0}<span class="seal-arrow" aria-hidden="true"><Icon name="arrow" size="m" /></span>{/if}
              <span class="seal-step" aria-hidden="true">
                <span class="well l" class:ink={i === 1}><Icon name={i === 0 ? 'key' : i === 1 ? 'lock' : 'server'} /></span>
                <span class="seal-word">{step}</span>
              </span>
            {/each}
          </div>
          <p class="meta">{d.sealedNote}</p>
        </section>
      {/if}

      {#if nights}
        <section class="tile lead span-5" aria-labelledby="nights-title">
          {@render head('nights-title', nights.glyph, nights.title)}
          <p class="fact-text">{nights.text}</p>
          <div class="nights" role="img" aria-label={d.nights}>
            <span class="night-row" aria-hidden="true">
              {#each NIGHTS as i}<span class="night" class:last={i === NIGHTS.length - 1}></span>{/each}
            </span>
            <span class="night-ends" aria-hidden="true"><span>{d.nightsFrom}</span><span>{d.nightsTo}</span></span>
          </div>
          <p class="reading">{d.nightsRead}</p>
        </section>
      {/if}

      {#if passkey}
        <section class="tile lead split span-7" aria-labelledby="passkey-title">
          <div class="words">
            {@render head('passkey-title', passkey.glyph, passkey.title)}
            <p class="fact-text">{passkey.text}</p>
          </div>
          <div class="signin" role="img" aria-label={d.signinLabel}>
            <span class="drawn ink" aria-hidden="true"><Icon name="key" size="m" />{d.signin[0]}</span>
            <span class="drawn" aria-hidden="true"><Icon name="mail" size="m" />{d.signin[1]}</span>
            <span class="no-password" aria-hidden="true"><Icon name="x" size="m" />{d.signin[2]}</span>
          </div>
        </section>
      {/if}

      {#if token}
        <section class="tile lead split span-8" aria-labelledby="token-title">
          <div class="words">
            {@render head('token-title', token.glyph, token.title)}
            <p class="fact-text">{token.text}</p>
          </div>
          <table class="reach">
            <thead>
              <tr>
                {#each d.reach.head as h}<th scope="col">{h}</th>{/each}
              </tr>
            </thead>
            <tbody>
              {#each d.reach.rows as [what, can]}
                <tr>
                  <th scope="row">{what}</th>
                  <td class:no={!can}>
                    <Icon name={can ? 'check' : 'x'} size="m" /><span class="sr">{can ? d.reach.can : d.reach.cannot}</span>
                  </td>
                  <td><Icon name="check" size="m" /><span class="sr">{d.reach.can}</span></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      {/if}

      {#if exported}
        <section class="tile lead span-4" aria-labelledby="export-title">
          {@render head('export-title', exported.glyph, exported.title)}
          <p class="fact-text">{exported.text}</p>
          <div class="export" role="img" aria-label={exported.text}>
            <span class="export-row" aria-hidden="true">
              <span class="well export-well"><Icon name="download" /></span>
              <span class="export-words">
                <span class="export-name">{d.exportName}</span>
                <span class="export-note">{d.exportNote}</span>
              </span>
            </span>
            <span class="drawn ink" aria-hidden="true">{d.exportVerb}</span>
          </div>
        </section>
      {/if}
    </div>
  </div>
</section>

<section class="band" aria-labelledby="report-title">
  <div class="in">
    <div class="tiles">
      <section class="tile lead split report">
        <div class="words">
          {@render head('report-title', 'shield', s.report.title)}
          {#if address === ''}
            <p class="fact-text">{s.report.pending}</p>
          {:else}
            <p class="fact-text">{s.report.body}</p>
            <p><a class="btn btn-primary btn-lg" href="mailto:{address}">{address}</a></p>
          {/if}
        </div>
        {#if address !== ''}
          <div class="after">
            <h3 class="after-title" id="after-title">{s.report.after}</h3>
            <ol class="steps" aria-labelledby="after-title">
              {#each s.report.steps as step, i}
                <li class="step">
                  <span class="step-n num" aria-hidden="true">{i + 1}</span>
                  <span class="step-what">{step.what}</span>
                  <span class="step-when">{step.when}</span>
                </li>
              {/each}
            </ol>
          </div>
        {/if}
      </section>
    </div>
  </div>
</section>

<style>
  /* ── The shared shapes ───────────────────────────────────────────────── */

  /* A TILE IN TWO HALVES at a desk: the words, and the drawing of what they say. One column below 900. */
  .split {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-5);
    align-content: start;
  }

  @media (width >= 900px) {
    .split {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: center;
    }
  }

  .words {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .words > p {
    margin: 0;
  }

  .fact {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding-block-start: var(--sp-5);
    border-block-start: 1px solid var(--line);
  }

  .fact-text {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-body);
    line-height: var(--lh-site-body);
    text-wrap: pretty;
  }

  /* A drawn button: the shape of the product's pill, pressed by nobody, because it is a picture. */
  .drawn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding-inline: 16px;
    background: var(--s1);
    border-radius: var(--r-pill);
    color: var(--ink);
    font-size: var(--t-app-sm);
    font-weight: 500;
  }

  .drawn.ink {
    background: var(--ink);
    color: var(--on-ink);
  }

  /* ── One database per record ─────────────────────────────────────────── */

  /* FOUR RECORDS, EACH ITS OWN: a gap between every pair and no line across it, which is the whole of the claim. */
  .records {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-4);
  }

  .record {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
    padding: var(--sp-4);
    background: var(--s1);
    border-radius: var(--r-md);
  }

  .record .well {
    background: var(--bg);
  }

  .record-name {
    color: var(--ink);
    font-size: var(--t-app-sm);
    font-weight: 600;
  }

  /* ── Sealed keys ─────────────────────────────────────────────────────── */

  .seal {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: start;
    gap: var(--sp-2);
  }

  .seal-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    text-align: center;
  }

  .seal-word {
    color: var(--ink2);
    font-size: var(--t-app-sm);
    line-height: 18px;
  }

  .seal-arrow {
    display: grid;
    place-items: center;
    block-size: var(--well-l);
    color: var(--dim);
  }

  /* ── Nightly copies ──────────────────────────────────────────────────── */

  .nights {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  /* THIRTY NIGHTS, ONE MARK EACH, the newest in ink and the rest in the chart's quiet grey (SYSTEM §7). */
  .night-row {
    display: grid;
    grid-template-columns: repeat(30, minmax(0, 1fr));
    gap: 3px;
    block-size: 40px;
  }

  .night {
    background: var(--s2);
    border-radius: 3px;
  }

  .night.last {
    background: var(--ink);
  }

  .night-ends {
    display: flex;
    justify-content: space-between;
    color: var(--dim);
    font-size: var(--t-app-xs);
  }

  /* ── A passkey ───────────────────────────────────────────────────────── */

  .signin {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-4);
    background: var(--s1);
    border-radius: var(--r-md);
  }

  .signin .drawn:not(.ink) {
    background: var(--bg);
  }

  .no-password {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    color: var(--dim);
    font-size: var(--t-app-sm);
  }

  /* ── What a token can do ─────────────────────────────────────────────── */

  .reach {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--t-site-small);
  }

  .reach th,
  .reach td {
    padding-block: 10px;
    border-block-end: 1px solid var(--line);
    text-align: start;
  }

  .reach thead th {
    color: var(--dim);
    font-weight: 500;
    vertical-align: bottom;
  }

  .reach tbody th {
    color: var(--ink);
    font-weight: 500;
  }

  .reach td {
    color: var(--ink);
    inline-size: 28%;
  }

  .reach td.no {
    color: var(--dim);
  }

  .reach tbody tr:last-child > * {
    border-block-end: 0;
  }

  /* ── Export ──────────────────────────────────────────────────────────── */

  .export {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
    margin-block-start: auto;
  }

  .export-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    align-self: stretch;
    padding: var(--sp-3);
    background: var(--s1);
    border-radius: var(--r-md);
  }

  .export-well {
    background: var(--bg);
  }

  .export-words {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .export-name {
    color: var(--ink);
    font-size: var(--t-app-sm);
    font-weight: 600;
  }

  .export-note {
    color: var(--dim);
    font-size: var(--t-app-sm);
  }

  /* ── Report a vulnerability ──────────────────────────────────────────── */

  .report {
    align-items: start;
  }

  .after {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .after-title {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-site-small);
    font-weight: 500;
  }

  /* THE FOUR STEPS IN ORDER, a numbered well each, with the time it is promised in under it. */
  .steps {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-5) var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .step {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .step-n {
    display: grid;
    place-items: center;
    inline-size: var(--well);
    block-size: var(--well);
    margin-block-end: var(--sp-1);
    background: var(--s1);
    border-radius: var(--r-well);
    color: var(--ink2);
    font-size: var(--t-site-small);
    font-weight: 600;
  }

  .step-what {
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 600;
  }

  .step-when {
    color: var(--dim);
    font-size: var(--t-site-small);
  }

  @media (width >= 1100px) {
    .steps {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @media (width < 640px) {
    .night-row {
      gap: 2px;
    }

    .seal-word {
      font-size: var(--t-app-xs);
    }
  }
</style>
