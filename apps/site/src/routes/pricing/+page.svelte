<script lang="ts">
  /**
   * Pricing, drawn as Bento tiles on the ground (the design system).
   *
   * TWO PLANS, WHAT EACH INCLUDES, AND WHAT MORE COSTS, on the owner's ask of 26 September:
   * "include the credits/usages offered on the plans, show extra usage pricings, add another extended plan". Every
   * figure is read from `plans.ts`, which is the one file to edit when a price or an allowance changes, and which
   * `plans.test.ts` holds to the Worker's own `HOSTED_PLANS` and `ALLOWANCE`. Every sentence is read from
   * `copy/pricing.ts`, and what a drawing works out (a ratio, a price a credit, a gap between prices) is worked out
   * here from those figures, so it moves when they do.
   *
   *   plans     the answer and the two plans: the same price for one person as for four, then a tile a plan.
   *   usage     every allowance as a pair of bars on one scale, Cloud against Cloud Plus.
   *   extra     what both plans include, the credit packs, and extra usage with its cap, drawn.
   *   faq       the questions a buyer asks before paying.
   *   close     one line and the button.
   *
   * NO PRE-LAUNCH VARIANT. The site describes the product as it is on launch day and is not deployed with this copy
   * before then, so the buttons go to sign-up and no line says what is not open yet.
   */
  import Icon from '$lib/Icon.svelte';
  import { SIGNUP, site } from '$lib/copy.ts';
  import { EXTRA, PACKS, PLANS, plan } from '$lib/plans.ts';
  import type { IconName } from '$lib/icons.ts';

  const p = site.pricing;
  const cloud = plan('cloud');
  const plus = plan('plus');

  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const word = (n: number): string => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? (WORDS[n] ?? String(n)) : String(n));
  const dollars = (price: string): number => Number.parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
  const usd = (n: number): string => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

  /** An allowance's name, for the extra-usage row that extends it, so the two lists say one name. */
  const nameOf = (key: string): string => p.usage.find((u) => u.key === key)?.name ?? '';

  /* THE PAIRED BARS: each meter on its own scale, the larger plan the whole track. */
  const meters = p.usage.map((u) => {
    const a = cloud.allowance[u.key];
    const b = plus.allowance[u.key];
    const top = Math.max(a, b, 1);
    return { ...u, a, b, wa: (a / top) * 100, wb: (b / top) * 100 };
  });
  const ratios = new Set(meters.map((m) => (m.a > 0 ? m.b / m.a : 0)));
  const times = ratios.size === 1 ? ([...ratios][0] ?? 0) : 0;
  const gap = usd(dollars(plus.price) - dollars(cloud.price));

  /* WHAT BOTH PLANS INCLUDE, once where the plans agree, and each plan's own where they do not. */
  const ROW_GLYPHS: IconName[] = ['people', 'server', 'refresh', 'inbox', 'download'];
  const kept = (text: string): number => Number.parseInt(text.match(/\d+/)?.[0] ?? '0', 10);

  /* THE PACKS: a price a credit, and each pack's size against the largest. */
  const packMax = Math.max(1, ...PACKS.map((x) => x.credits));
</script>

<svelte:head>
  <title>{site.meta.pricing.title}</title>
  <meta name="description" content={site.meta.pricing.description} />
  <link rel="canonical" href="https://brain.dog/pricing" />
  <meta property="og:url" content="https://brain.dog/pricing" />
  <meta property="og:title" content={site.meta.pricing.title} />
  <meta property="og:description" content={site.meta.pricing.description} />
</svelte:head>

<!-- ── The answer, and the two plans ── -->
<section class="band" aria-labelledby="pricing-h1">
  <div class="in">
    <div class="tiles">
      <div class="tile lead span-4 intro">
        <h1 class="h2" id="pricing-h1">{p.title}</h1>
        <p class="lede">{p.sub}</p>
        <div class="same">
          <div class="same-row">
            <span class="faces" aria-hidden="true"><span class="face you"><Icon name="person" size="s" /></span></span>
            <span class="same-who">{p.perRecord.alone}</span>
            <span class="same-price num">{cloud.price} {cloud.unit.replace(', per record', '')}</span>
          </div>
          <div class="same-row">
            <span class="faces" aria-hidden="true">
              <span class="face you"><Icon name="person" size="s" /></span>
              {#each p.perRecord.faces as f (f)}<span class="face">{f.slice(0, 1)}</span>{/each}
            </span>
            <span class="same-who">{p.perRecord.team}</span>
            <span class="same-price num">{cloud.price} {cloud.unit.replace(', per record', '')}</span>
          </div>
          <p class="reading">{p.perRecord.note}</p>
        </div>
      </div>

      {#each PLANS as pl (pl.id)}
        <article class="tile lead span-4 plan" aria-labelledby="plan-{pl.id}">
          <header class="tile-head">
            <span class="well"><Icon name="cloud" /></span>
            <h2 class="tile-title plan-name" id="plan-{pl.id}">{pl.name}</h2>
          </header>
          <p class="price"><span class="figure">{pl.price}</span><span class="meta">{pl.unit}</span></p>
          <p class="lede">{pl.for}</p>
          <p class="summary">
            <Icon name="coins" size="m" />
            <span>{p.summary(pl.allowance.credits.toLocaleString('en-US'), pl.allowance.runs.toLocaleString('en-US'))}</span>
          </p>
          <ul class="points">
            {#each p.plans[pl.id].points as point (point)}
              <li><Icon name="check" size="m" />{point}</li>
            {/each}
          </ul>
          <a
            class="btn btn-lg cta"
            class:btn-primary={pl.id === 'cloud'}
            href={pl.href}
            rel={pl.external ? 'external' : undefined}>{p.plans[pl.id].cta}<Icon name="arrow" size="s" /></a
          >
        </article>
      {/each}
    </div>
  </div>
</section>

<!-- ── Every allowance, Cloud against Cloud Plus ── -->
<section class="band" id="usage" aria-labelledby="usage-title">
  <div class="in">
    <div class="tiles">
      <article class="tile lead reveal">
        <header class="tile-head">
          <span class="well"><Icon name="bars" /></span>
          <h2 class="tile-title" id="usage-title">{p.usageTitle}</h2>
          <span class="legend" aria-hidden="true">
            <span><i class="key grey"></i>{cloud.name}, {cloud.price}</span>
            <span><i class="key"></i>{plus.name}, {plus.price}</span>
          </span>
        </header>
        <p class="lede">{p.usageLead}</p>
        <div class="compare" role="table" aria-labelledby="usage-title">
          <div class="sr" role="row">
            <span role="columnheader">{p.what}</span>
            <span role="columnheader">{cloud.name}</span>
            <span role="columnheader">{plus.name}</span>
          </div>
          {#each meters as m (m.key)}
            <div class="c-row" role="row">
              <span class="c-term" role="rowheader"><b>{m.name}</b><span>{m.said}</span></span>
              <span class="c-bar a" role="cell">
                <span class="track"><span class="fill grey" style="--w:{m.wa}%"></span></span>
                <span class="c-n num"><span class="sr">{cloud.name}: </span>{m.amount(m.a)}</span>
              </span>
              <span class="c-bar b" role="cell">
                <span class="track"><span class="fill" style="--w:{m.wb}%"></span></span>
                <span class="c-n num strong"><span class="sr">{plus.name}: </span>{m.amount(m.b)}</span>
              </span>
            </div>
          {/each}
        </div>
        {#if times > 0}<p class="reading">{p.compareReading(word(times), gap)}</p>{/if}
      </article>
    </div>
  </div>
</section>

<!-- ── What both include, and what more costs ── -->
<section class="band" id="extra" aria-label={p.extraTitle}>
  <div class="in">
    <div class="tiles">
      <article class="tile lead span-5 reveal" aria-labelledby="both-title">
        <header class="tile-head"><span class="well"><Icon name="check" /></span><h2 class="tile-title" id="both-title">{p.bothTitle}</h2></header>
        <ul class="both">
          {#each p.rows as row, i (row[0])}
            <li>
              <span class="well"><Icon name={ROW_GLYPHS[i] ?? 'check'} /></span>
              <span class="b-name">{row[0]}</span>
              {#if row[1] === row[2]}
                <span class="b-val">{row[1]}</span>
              {:else}
                <span class="b-val">{cloud.name}: {row[1]} · {plus.name}: {row[2]}</span>
              {/if}
              {#if row[0] === 'Backups' && kept(row[1]) > 0}
                <span class="copies" role="img" aria-label={p.backupsLabel(kept(row[1]))}>
                  {#each Array.from({ length: kept(row[1]) }, (_, n) => n) as n (n)}<i class:new={n === kept(row[1]) - 1}></i>{/each}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      </article>

      <article class="tile lead span-3 reveal" aria-labelledby="packs-title">
        <header class="tile-head"><span class="well"><Icon name="coins" /></span><h2 class="tile-title" id="packs-title">{p.packsTitle}</h2></header>
        <p class="lede">{p.packsLead}</p>
        <ul class="packs">
          {#each PACKS as pack (pack.credits)}
            <li>
              <span class="pk-top"><span class="pk-n">{p.packsPer(pack.credits)}</span><span class="pk-price num">{pack.price}</span></span>
              <span class="meta">{p.perCredit(usd(dollars(pack.price) / pack.credits))}</span>
              <span class="track thin" aria-hidden="true"><span class="fill" style="--w:{(pack.credits / packMax) * 100}%"></span></span>
            </li>
          {/each}
        </ul>
        <p class="reading">{p.packsFree}</p>
      </article>

      <article class="tile lead span-4 reveal" aria-labelledby="extra-title">
        <header class="tile-head"><span class="well"><Icon name="gauge" /></span><h2 class="tile-title" id="extra-title">{p.extraUsageTitle}</h2></header>
        <p class="lede">{p.extraLead}</p>
        <div class="cap" role="img" aria-label={p.cap.label}>
          <span class="cap-bar">
            <span class="cap-plan"></span>
            <span class="cap-extra"></span>
            <span class="cap-line"></span>
          </span>
          <span class="cap-legend">
            <span><i class="key"></i>{p.cap.plan}</span>
            <span><i class="key grey"></i>{p.cap.extra}</span>
            <span><i class="key dash"></i>{p.cap.cap}</span>
          </span>
        </div>
        <p class="reading">{p.cap.reading}</p>
        <ul class="extra-list">
          {#each EXTRA as e (e.key)}
            <li><span class="e-name">{nameOf(e.key)}</span><span class="e-price num">{e.price}</span><span class="meta">{e.per}</span></li>
          {/each}
        </ul>
      </article>
    </div>
  </div>
</section>

<!-- ── Questions ── -->
<section class="band" aria-labelledby="faq-title">
  <div class="in">
    <div class="tiles">
      <article class="tile lead reveal">
        <header class="tile-head"><span class="well"><Icon name="help" /></span><h2 class="tile-title" id="faq-title">{p.faqTitle}</h2></header>
        <dl class="faq">
          {#each p.faq as f (f.q)}
            <div>
              <dt>{f.q}</dt>
              <dd>{f.a}</dd>
            </div>
          {/each}
        </dl>
      </article>
    </div>
  </div>
</section>

<!-- ── The close ── -->
<section class="band" aria-labelledby="close-title">
  <div class="in">
    <div class="tiles">
      <div class="tile lead close reveal">
        <div class="close-words">
          <h2 class="h2" id="close-title">{site.closing.title}</h2>
          <p class="lede">{site.closing.body}</p>
        </div>
        <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{site.closing.primary}<Icon name="arrow" size="s" /></a>
      </div>
    </div>
  </div>
</section>

<style>
  /* ── The answer: the same price for one as for four ─────────────────── */

  .same {
    display: grid;
    gap: var(--sp-2);
    margin-block-start: auto;
  }

  .same-row {
    display: grid;
    grid-template-columns: 7.5em minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    padding-inline: var(--sp-3);
    background: var(--s1);
    border-radius: var(--r-md);
  }

  .faces {
    display: flex;
  }

  /* A person is a circle with an initial (the icon set's faces); they overlap as a group does. */
  .face {
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    margin-inline-end: -8px;
    background: var(--ink2);
    border: 2px solid var(--s1);
    border-radius: var(--r-pill);
    color: var(--on-ink);
    font-size: var(--t-app-xs);
    font-weight: 600;
  }

  .face.you {
    background: var(--ink);
  }

  .same-who {
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 500;
  }

  .same-price {
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 600;
  }

  /* ── A plan ──────────────────────────────────────────────────────────── */

  .plan-name {
    font-size: var(--t-group);
    line-height: 24px;
  }

  .price {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
  }

  .price .figure {
    font-size: var(--t-lead);
    line-height: 40px;
  }

  .summary {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    margin: 0;
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
    color: var(--ink);
    font-size: var(--t-site-small);
    line-height: 20px;
  }

  .summary :global(svg) {
    margin-block-start: 2px;
    color: var(--ink2);
  }

  .points {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .points li {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-site-small);
  }

  .points li :global(svg) {
    color: var(--ink);
  }

  .cta {
    align-self: flex-start;
    margin-block-start: auto;
  }

  /* ── The paired bars ─────────────────────────────────────────────────── */

  .legend,
  .cap-legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1) var(--sp-4);
    color: var(--ink2);
    font-size: var(--t-site-small);
  }

  .legend {
    margin-inline-start: auto;
  }

  .legend span,
  .cap-legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .key {
    display: inline-block;
    inline-size: 10px;
    block-size: 10px;
    background: var(--ink);
    border-radius: 3px;
  }

  .key.grey {
    background: var(--dim);
  }

  .key.dash {
    inline-size: 2px;
    block-size: 12px;
    background: none;
    border-inline-start: 2px dashed var(--ink);
    border-radius: 0;
  }

  .compare {
    display: grid;
  }

  .c-row {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    grid-template-areas:
      'term a'
      'term b';
    column-gap: var(--sp-5);
    row-gap: 6px;
    align-items: center;
    padding-block: var(--sp-3);
    border-block-start: 1px solid var(--line);
  }

  .c-term {
    grid-area: term;
    display: grid;
    gap: 2px;
  }

  .c-term b {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
  }

  .c-term span {
    color: var(--dim);
    font-size: var(--t-site-small);
  }

  .c-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 11em;
    align-items: center;
    gap: var(--sp-3);
  }

  .c-bar.a {
    grid-area: a;
  }

  .c-bar.b {
    grid-area: b;
  }

  .track {
    display: block;
    block-size: 12px;
    background: var(--s1);
    border-radius: var(--r-pill);
  }

  .track.thin {
    block-size: 8px;
  }

  .fill {
    display: block;
    inline-size: var(--w);
    min-inline-size: 6px;
    block-size: 100%;
    background: var(--ink);
    border-radius: var(--r-pill);
  }

  .fill.grey {
    background: var(--dim);
  }

  .c-n {
    color: var(--ink2);
    font-size: var(--t-site-small);
  }

  .c-n.strong {
    color: var(--ink);
    font-weight: 600;
  }

  /* ── Included, packs and extra usage ─────────────────────────────────── */

  .both,
  .packs,
  .extra-list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .both li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    padding-block: 10px;
    border-block-start: 1px solid var(--line);
  }

  .both li:first-child {
    border-block-start: 0;
  }

  .b-name {
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 500;
  }

  .b-val {
    margin-inline-start: auto;
    color: var(--ink2);
    font-size: var(--t-site-small);
    text-align: end;
  }

  /* The thirty nightly copies, the newest in ink at the right. */
  .copies {
    display: flex;
    flex-basis: 100%;
    gap: 2px;
    padding-inline-start: calc(var(--well) + var(--sp-3));
  }

  .copies i {
    flex: 1;
    max-inline-size: 8px;
    block-size: 12px;
    background: var(--line);
    border-radius: 2px;
  }

  .copies i.new {
    background: var(--ink);
  }

  .packs {
    margin-block-start: auto;
  }

  .packs li {
    display: grid;
    gap: 4px;
    padding-block: var(--sp-3);
    border-block-start: 1px solid var(--line);
  }

  .pk-top {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .pk-n {
    flex: 1;
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 500;
  }

  .pk-price {
    color: var(--ink);
    font-size: var(--t-lg);
    font-weight: 600;
  }

  /* The cap: the plan in ink, extra usage in grey up to a dashed cap, and nothing past it. */
  .cap {
    display: grid;
    gap: var(--sp-2);
  }

  .cap-bar {
    position: relative;
    display: flex;
    block-size: 14px;
    background: var(--s1);
    border-radius: var(--r-pill);
  }

  .cap-plan {
    inline-size: 52%;
    background: var(--ink);
    border-start-start-radius: var(--r-pill);
    border-end-start-radius: var(--r-pill);
  }

  .cap-extra {
    inline-size: 26%;
    background: var(--dim);
  }

  .cap-line {
    position: absolute;
    inset-block: -5px;
    inset-inline-start: 78%;
    border-inline-start: 2px dashed var(--ink);
  }

  .extra-list li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: var(--sp-3);
    padding-block: var(--sp-2);
    border-block-start: 1px solid var(--line);
  }

  .e-name {
    color: var(--ink);
    font-size: var(--t-site-small);
  }

  .e-price {
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 600;
    text-align: end;
  }

  .extra-list .meta {
    grid-column: 1 / -1;
  }

  /* ── Questions ───────────────────────────────────────────────────────── */

  .faq {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-5) var(--sp-6);
    margin: 0;
  }

  .faq dt {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    line-height: 24px;
  }

  .faq dd {
    margin: var(--sp-1) 0 0;
    color: var(--ink2);
    font-size: var(--t-site-small);
    line-height: 22px;
  }

  /* ── The close ───────────────────────────────────────────────────────── */

  .close {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
  }

  .close-words {
    display: grid;
    gap: var(--sp-3);
  }

  /* ── Narrower than a desk ────────────────────────────────────────────── */

  @media (width < 1100px) {
    .faq {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width < 900px) {
    .c-row {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'term'
        'a'
        'b';
    }
  }

  @media (width < 640px) {
    .faq {
      grid-template-columns: minmax(0, 1fr);
    }

    .c-bar {
      grid-template-columns: minmax(0, 1fr) 9em;
    }

    .same-row {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .same-price {
      grid-column: 2;
    }

    .cta {
      align-self: stretch;
    }
  }
</style>
