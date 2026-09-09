<!--
  Pricing.

  Two plans and no table of ticks. A feature matrix exists to make the cheaper column look
  incomplete, and there is nothing to make incomplete here: the self-hosted build is the same
  software with the same features. What is being sold is somebody else running it.

  The paragraph about there being no free hosted tier stays on the page. A price nobody explains
  reads as a price somebody is embarrassed by, and the reason is a good one.
-->
<script lang="ts">
  import { APP, BUILD, site } from '$lib/copy.ts';

  const p = site.pricing;
</script>

<svelte:head>
  <title>Pricing · BrainDog</title>
  <meta name="description" content={p.body} />
</svelte:head>

<section class="head">
  <h1 class="title">{p.title}</h1>
  <p class="lede">{p.body}</p>
  <!-- ABOVE THE PRICES, NOT UNDER THEM. A price on a page is an offer, and neither of these can be
       accepted today. Saying so once, before the cards, is what lets the cards describe the plans in
       the present tense without the page lying. -->
  <p class="status">{p.status}</p>
</section>

<section class="plans">
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
          <li><span class="tick" aria-hidden="true">✓</span>{point}</li>
        {/each}
      </ul>
      <!-- The self-hosted card sends you to BUILD.md, which is the thing it says it is. It used to
           send you to the whole `docs/` tree, which is fifty-four specification documents and not an
           install. -->
      <a class="btn" class:btn-primary={i === 1} href={i === 1 ? APP : BUILD}>{plan.cta}</a>
    </article>
  {/each}
</section>

<section class="honest">
  <p>{p.honest}</p>
</section>

<style>
  .head,
  .plans,
  .honest {
    max-inline-size: 1000px;
    margin-inline: auto;
    padding-inline: var(--sp-5);
  }

  .head {
    padding-block: var(--sp-8) var(--sp-6);
  }

  .title {
    font-size: clamp(34px, 5vw, 52px);
    letter-spacing: -0.03em;
    text-wrap: balance;
  }

  .lede {
    margin-block-start: var(--sp-3);
    max-inline-size: 56ch;
    color: var(--ink2);
    font-size: var(--t-lg);
    line-height: 1.5;
  }

  /* The same rule the changelog's status box uses: a warn-coloured edge, a quiet ground, and no
     icon. It is a fact about the state of the product, not an alarm. */
  .status {
    margin-block-start: var(--sp-5);
    max-inline-size: 68ch;
    padding: var(--sp-4) var(--sp-5);
    background: var(--s1);
    border: 1px solid var(--line);
    border-inline-start: 3px solid var(--warn);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-ui);
    line-height: 1.6;
    text-wrap: pretty;
  }

  .plans {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-5);
  }

  .plan {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-6);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
  }

  /* The recommended plan takes the ACCENT BORDER and nothing else — no ribbon, no "most popular",
     no scale transform. A card that is physically larger than the one beside it is a card arguing
     with the reader about which one they came for. */
  .plan[data-featured] {
    border-color: var(--accent);
  }

  .plan-name {
    font-size: var(--t-md);
    letter-spacing: -0.012em;
  }

  .plan-price {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .plan-figure {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 42px;
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1;
  }

  .plan-unit {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .plan-body {
    color: var(--ink2);
    font-size: var(--t-ui);
    line-height: 1.55;
  }

  .plan-points {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  .plan-points li {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .tick {
    color: var(--earn);
    font-size: var(--t-sm);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-block-size: 44px;
    margin-block-start: auto;
    padding: 0 var(--sp-5);
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: inset 0 -1px 0 0 color-mix(in srgb, var(--ink) 12%, transparent);
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 600;
    text-decoration: none;
  }

  .btn:hover {
    background: var(--s2);
    border-color: var(--edge);
  }

  .btn-primary {
    background: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 72%, var(--sunk));
    box-shadow: inset 0 -1px 0 0 color-mix(in srgb, var(--accent) 60%, var(--sunk));
    color: var(--accent-ink);
  }

  .btn-primary:hover {
    background: color-mix(in srgb, var(--accent) 90%, var(--sunk));
  }

  .honest {
    padding-block: var(--sp-6) var(--sp-4);
  }

  .honest p {
    max-inline-size: 68ch;
    padding-inline-start: var(--sp-4);
    border-inline-start: 2px solid var(--edge);
    color: var(--dim);
    font-size: var(--t-ui);
    line-height: 1.6;
    text-wrap: pretty;
  }

  @media (width < 760px) {
    .plans {
      grid-template-columns: minmax(0, 1fr);
    }

    .head,
    .plans,
    .honest {
      padding-inline: var(--sp-4);
    }
  }
</style>
