<!--
  Pricing.

  Two plans and no table of ticks. A feature matrix exists to make the cheaper column look
  incomplete, and there is nothing to make incomplete here: the self-hosted build is the same
  software with the same features. What is being sold is somebody else running it.

  The paragraph about there being no free hosted tier stays on the page. A price nobody explains
  reads as a price somebody is embarrassed by, and the reason is a good one.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import Tag from '$lib/Tag.svelte';
  import { APP, BUILD, site } from '$lib/copy.ts';

  const p = site.pricing;
</script>

<svelte:head>
  <title>{site.meta.pricing.title}</title>
  <meta name="description" content={site.meta.pricing.description} />
  <link rel="canonical" href="https://brain.dog/pricing" />
  <meta property="og:url" content="https://brain.dog/pricing" />
  <meta property="og:title" content={site.meta.pricing.title} />
  <meta property="og:description" content={site.meta.pricing.description} />
</svelte:head>

<section class="wrap head">
  <div class="head-copy">
    <Tag icon="money" hue="earn" label={p.kicker} />
    <h1 class="title">{p.title}</h1>
    <p class="lede">{p.body}</p>
  </div>
  <!-- ABOVE THE PRICES, NOT UNDER THEM. A price on a page is an offer, and neither of these can be
       accepted today. Saying so once, before the cards, is what lets the cards describe the plans in
       the present tense without the page lying. -->
  <div class="status">
    <span class="glyph" data-hue="warn"><Icon name="clock" /></span>
    <div class="status-copy">
      <h2 class="status-title">{p.statusTitle}</h2>
      <p class="status-body">{p.status}</p>
    </div>
  </div>
</section>

<section class="wrap plans">
  {#each [p.self, p.hosted] as plan, i}
    <article class="plan" data-featured={i === 1 ? '' : undefined}>
      <div class="plan-top">
        <span class="glyph" data-hue={i === 1 ? 'accent' : 'info'}><Icon name={i === 1 ? 'thing' : 'home'} /></span>
        <h2 class="plan-name">{plan.name}</h2>
      </div>
      <p class="plan-price">
        <span class="plan-figure num">{plan.price}</span>
        <span class="plan-unit">{plan.unit}</span>
      </p>
      <p class="plan-body">{plan.body}</p>
      <ul class="plan-points">
        {#each plan.points as point}
          <li><span class="tick"><Icon name="check" /></span>{point}</li>
        {/each}
      </ul>
      <!--
        THE SELF-HOSTED CARD HAS NO ACTION WHILE THE REPOSITORY IS PRIVATE: its action sent you to
        build instructions nobody can read. An absent control and not a disabled one, because a
        greyed button under a price is a product telling you it does not want your business. The
        sentence above the cards already says neither plan is open yet.
      -->
      {#if i === 1}
        <a class="btn btn-primary btn-lg" href={APP}>{plan.cta}<Icon name="arrow" /></a>
      {:else if BUILD}
        <a class="btn btn-lg" href={BUILD}>{plan.cta}</a>
      {/if}
    </article>
  {/each}
</section>

<section class="wrap honest">
  <div class="honest-card">
    <span class="glyph" data-hue="accent"><Icon name="info" /></span>
    <div>
      <h2 class="honest-title">{p.honestTitle}</h2>
      <p class="honest-body">{p.honest}</p>
    </div>
  </div>
</section>

<style>
  .wrap {
    max-inline-size: 1000px;
    margin-inline: auto;
    padding-inline: var(--sp-5);
  }

  .head {
    position: relative;
    isolation: isolate;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 380px);
    align-items: end;
    gap: var(--sp-6) var(--sp-7);
    padding-block: clamp(48px, 7vw, 96px) var(--sp-7);
  }

  .title {
    margin-block-start: var(--sp-4);
    font-size: clamp(40px, 3.4vw + 22px, 68px);
    line-height: 1.02;
    letter-spacing: -0.04em;
    text-wrap: balance;
  }

  .lede {
    max-inline-size: 40ch;
    margin-block-start: var(--sp-4);
    color: var(--ink2);
    font-size: var(--t-lg);
    line-height: 1.5;
    text-wrap: pretty;
  }

  /* A fact about the state of the product, not an alarm: a quiet card with a clock on it. */
  .status {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
  }

  .status-copy {
    min-inline-size: 0;
  }

  .status-title {
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 600;
    letter-spacing: 0;
  }

  .status-body {
    margin-block-start: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.6;
    text-wrap: pretty;
  }

  /* `align-items: start` and the cards stop being the same height, because the free plan has no
     action under it while the repository is private. */
  .plans {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: var(--sp-4);
  }

  .plan {
    position: relative;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    overflow: hidden;
    padding: var(--sp-6);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: calc(var(--r-lg) + 4px);
    box-shadow: var(--e1);
  }

  /* The hosted plan takes the ACCENT EDGE, a ground tinted towards it and a light from above, and
     nothing else: no ribbon, no "most popular", no scale transform. */
  .plan[data-featured] {
    background: var(--accent-ground);
    border-color: var(--accent);
    box-shadow: var(--e2);
  }

  .plan[data-featured]::before {
    content: '';
    position: absolute;
    z-index: -1;
    inset-block: -50% 50%;
    inset-inline: 0;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 18%, transparent), transparent);
  }

  .plan-top {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .plan-name {
    font-size: var(--t-lg);
    letter-spacing: -0.018em;
  }

  .plan-price {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  .plan-figure {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: clamp(44px, 3vw + 24px, 64px);
    font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1;
  }

  .plan-unit {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .plan-body {
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .plan-points {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    /* `padding-inline: 0` is load-bearing: base.css resets a list's MARGIN and not its padding. */
    padding-inline: 0;
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
    list-style: none;
    color: var(--ink);
    font-size: var(--t-base);
  }

  .plan-points li {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    line-height: 1.45;
  }

  /* One line-box tall, so the tick centres on the first line of a point that wraps. */
  .tick {
    display: flex;
    align-items: center;
    block-size: 1.45em;
    color: var(--earn);
  }

  .plan .btn {
    margin-block-start: var(--sp-3);
  }

  /* The page's own bottom: the shell puts no margin over the footer. */
  .honest {
    padding-block: var(--sp-6) var(--sp-8);
  }

  .honest-card {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-4);
    padding: var(--sp-5);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  .honest-title {
    font-size: var(--t-md);
    letter-spacing: -0.014em;
  }

  .honest-body {
    max-inline-size: 70ch;
    margin-block-start: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.6;
    text-wrap: pretty;
  }

  @media (width < 900px) {
    .head {
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
    }
  }

  @media (width < 760px) {
    .plans {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (width < 640px) {
    .wrap {
      padding-inline: var(--sp-4);
    }

    .lede {
      font-size: var(--t-md);
    }

    .plan {
      padding: var(--sp-5);
    }

    .plan .btn {
      align-self: stretch;
    }

    .honest-card {
      flex-direction: column;
      gap: var(--sp-3);
      padding: var(--sp-4);
    }
  }
</style>
