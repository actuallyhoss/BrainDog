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
  <h1 class="title">{p.title}</h1>
  <!-- ABOVE THE PRICES, NOT UNDER THEM. A price on a page is an offer, and neither of these can be
       accepted today. Saying so once, before the plans, is what lets the plans describe themselves
       in the present tense without the page lying. -->
  <div class="status">
    <h2 class="status-title"><span class="dot" aria-hidden="true"></span>{p.statusTitle}</h2>
    <p class="status-body">{p.status}</p>
  </div>
</section>

<section class="wrap plans">
  {#each [p.self, p.hosted] as plan, i}
    <article class="plan" data-featured={i === 1 ? '' : undefined}>
      <h2 class="plan-name">{plan.name}</h2>
      <p class="plan-price">
        <span class="plan-figure num">{plan.price}</span>
        <span class="plan-unit">{plan.unit}</span>
      </p>
      <p class="plan-body">{plan.body}</p>
      <ul class="plan-points">
        {#each plan.points as point}
          <li><span class="tick"><Icon name="check" size="s" /></span>{point}</li>
        {/each}
      </ul>
      <!--
        THE SELF-HOSTED PLAN HAS NO ACTION WHILE THE REPOSITORY IS PRIVATE: its action sent you to
        build instructions nobody can read. An absent control and not a disabled one, because a
        greyed button under a price is a product telling you it does not want your business. The
        sentence above the plans already says neither plan is open yet.
      -->
      {#if i === 1}
        <a class="btn btn-primary btn-lg" href={APP}>{plan.cta}<Icon name="arrow" size="s" /></a>
      {:else if BUILD}
        <a class="btn btn-lg" href={BUILD}>{plan.cta}</a>
      {/if}
    </article>
  {/each}
</section>

<section class="wrap honest">
  <h2 class="honest-title">{p.honestTitle}</h2>
  <p class="honest-body">{p.honest}</p>
</section>

<style>
  .wrap {
    max-inline-size: 960px;
    margin-inline: auto;
    padding-inline: var(--sp-6);
  }

  .head {
    padding-block: clamp(56px, 7vw, 104px) var(--sp-7);
  }

  .title {
    font-size: clamp(36px, 2.4vw + 22px, 56px);
    font-weight: 600;
    line-height: 1.04;
    letter-spacing: -0.04em;
    text-wrap: balance;
  }

  /* A fact about the state of the product, not an alarm: a line of text with one dot of state. */
  .status {
    max-inline-size: 68ch;
    margin-block-start: var(--sp-6);
    padding-block-start: var(--sp-5);
    border-block-start: 1px solid var(--line);
  }

  .status-title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--t-base);
    font-weight: 600;
    letter-spacing: 0;
  }

  .dot {
    inline-size: var(--dot);
    block-size: var(--dot);
    background: var(--warn);
    border-radius: var(--r-pill);
  }

  .status-body {
    margin-block-start: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.6;
    text-wrap: pretty;
  }

  /* THE SAME HEIGHT, SIDE BY SIDE. `align-items: start` kept the free plan short because it has no
     action under it while the repository is private, and two cards ending 50px apart read as a
     layout that did not finish. The space under the free plan's list is quieter than a ragged
     edge, and on a phone, where they stack, height does not apply. */
  .plans {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
    gap: var(--sp-3);
  }

  .plan {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-6);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  /* The hosted plan takes a firmer edge and nothing else: no tint, no glow, no ribbon, no "most
     popular", no scale transform. */
  .plan[data-featured] {
    border-color: var(--edge);
  }

  .plan-name {
    font-size: var(--t-base);
    font-weight: 600;
    letter-spacing: 0;
  }

  .plan-price {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .plan-figure {
    color: var(--ink);
    font-size: clamp(40px, 2vw + 28px, 52px);
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  .plan-unit {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .plan-body {
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.55;
    text-wrap: pretty;
  }

  .plan-points {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
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
    color: var(--dim);
  }

  .plan .btn {
    align-self: flex-start;
    margin-block-start: var(--sp-3);
  }

  /* The page's own bottom: the shell puts no margin over the footer. */
  .honest {
    padding-block: var(--sp-7) var(--sp-8);
  }

  .honest-title {
    font-size: var(--t-base);
    font-weight: 600;
    letter-spacing: 0;
  }

  .honest-body {
    max-inline-size: 68ch;
    margin-block-start: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.6;
    text-wrap: pretty;
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

    .plan {
      padding: var(--sp-5);
    }

    .plan .btn {
      align-self: stretch;
    }
  }
</style>
