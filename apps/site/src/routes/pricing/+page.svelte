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
  import Note from '$lib/Note.svelte';
  import { APP, BUILD, site } from '$lib/copy.ts';

  const p = site.pricing;
</script>

<svelte:head>
  <!-- ITS OWN SENTENCE, in `copy.ts`. The description was the page's lede, which says how the two
       plans differ and never what is being sold or for how much. -->
  <title>{site.meta.pricing.title}</title>
  <meta name="description" content={site.meta.pricing.description} />
  <!-- THE CANONICAL AND THE PREVIEW, from the same two sentences the page already has, so there is
       one description per page rather than two that can disagree. The canonical matters because
       `www` 301s here and a preview fetcher that followed the redirect would otherwise cite the
       hostname it started from. -->
  <link rel="canonical" href="https://brain.dog/pricing" />
  <meta property="og:url" content="https://brain.dog/pricing" />
  <meta property="og:title" content={site.meta.pricing.title} />
  <meta property="og:description" content={site.meta.pricing.description} />
</svelte:head>

<section class="wrap head">
  <div>
    <h1 class="title">{p.title}</h1>
    <p class="lede">{p.body}</p>
  </div>
  <!-- ABOVE THE PRICES, NOT UNDER THEM. A price on a page is an offer, and neither of these can be
       accepted today. Saying so once, before the cards, is what lets the cards describe the plans in
       the present tense without the page lying. BESIDE THE HEADING once there is room, so a wide
       window does not draw a headline down the left third and leave the rest of the fold empty. -->
  <div class="status">
    <span class="glyph" data-hue="warn"><Icon name="clock" /></span>
    <p>{p.status}</p>
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
          <li><span class="tick"><Icon name="check" /></span>{point}</li>
        {/each}
      </ul>
      <!--
        THE SELF-HOSTED CARD HAS NO ACTION WHILE THE REPOSITORY IS PRIVATE, and it had one that
        answered 404. It sent you to `BUILD.md`, which is not readable, so the free plan this page
        recommends had no route into it at all.

        AN ABSENT CONTROL AND NOT A DISABLED ONE. `19 §6`'s rule, applied to a marketing page: a
        control that cannot act is absent rather than greyed, and a greyed button under a price is a
        product telling you it does not want your business. The sentence above the cards already
        says neither plan is open yet, which is what a reader needs and is true of both.
      -->
      {#if i === 1}
        <a class="btn btn-primary btn-lg" href={APP}>{plan.cta}</a>
      {:else if BUILD}
        <a class="btn btn-lg" href={BUILD}>{plan.cta}</a>
      {/if}
    </article>
  {/each}
</section>

<section class="wrap honest">
  <Note text={p.honest} />
</section>

<style>
  .wrap {
    max-inline-size: 1000px;
    margin-inline: auto;
    padding-inline: var(--sp-5);
  }

  .head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 380px);
    align-items: end;
    gap: var(--sp-6) var(--sp-7);
    padding-block: clamp(48px, 7vw, 88px) var(--sp-7);
  }

  .title {
    font-size: clamp(36px, 3vw + 20px, 56px);
    line-height: 1.05;
    letter-spacing: -0.032em;
    text-wrap: balance;
  }

  .lede {
    max-inline-size: 44ch;
    margin-block-start: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-lg);
    line-height: 1.5;
    text-wrap: pretty;
  }

  /* A fact about the state of the product, not an alarm: a quiet card with a clock on it. It had a
     3px warn-coloured bar down its edge, which is how the page drew a quotation elsewhere. */
  .status {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.6;
    text-wrap: pretty;
  }

  /* `align-items: start` and the cards stop being the same height. The free plan has no action
     under it while the repository is private, so a stretched card put ninety pixels of nothing
     inside a box with a border round it. Two cards that each end where their content does say
     nothing at all, which is right. */
  .plans {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: var(--sp-4);
  }

  .plan {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-6);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
  }

  /* The recommended plan takes the ACCENT BORDER and a ground tinted towards the accent, and
     nothing else: no ribbon, no "most popular", no scale transform. A card that is physically
     larger than the one beside it is a card arguing with the reader about which one they came
     for. `--accent-ground` is the same ground the home page's closing card uses. */
  .plan[data-featured] {
    background: var(--accent-ground);
    border-color: var(--accent);
    box-shadow: var(--e2);
  }

  /* The plan's name is a sentence-case heading at the size every card title on the site is. The
     price under it is what the card is about, and it is more than twice the size. */
  .plan-name {
    font-size: var(--t-lg);
    letter-spacing: -0.018em;
  }

  .plan-price {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .plan-figure {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: clamp(var(--t-3xl), 3vw + 20px, 52px);
    font-weight: 600;
    letter-spacing: var(--tr-tight);
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

  /* A rule over the points, because the two halves of a plan card are what it costs and what you
     get, and a gap alone was not saying so. */
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
    padding-block: var(--sp-7) var(--sp-8);
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

    .plan {
      padding: var(--sp-5);
    }
  }
</style>
