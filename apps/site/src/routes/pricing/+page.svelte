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

<section class="head">
  <div class="head-copy">
    <h1 class="title">{p.title}</h1>
    <p class="lede">{p.body}</p>
  </div>
  <!-- ABOVE THE PRICES, NOT UNDER THEM. A price on a page is an offer, and neither of these can be
       accepted today. Saying so once, before the cards, is what lets the cards describe the plans in
       the present tense without the page lying.

       BESIDE THE HEADING once there is room, and under it on a phone. It was stacked at every
       width, so a 1440px window drew a 52px headline, a lede and a box of small print down the
       left third and left the right two thirds of the fold empty. Reading order is unchanged:
       the heading, then what is being sold, then the state of both plans. -->
  <p class="status">{p.status}</p>
</section>

<!-- A BAND, so the cards sit on a different ground from the sentence that introduces them. The
     head was on `--bg` and the cards were `--s1` on `--bg`, which is one step of a five-step
     ladder doing the work of a section break on a page with two sections. -->
<div class="band">
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
      <!--
        THE SELF-HOSTED CARD HAS NO ACTION WHILE THE REPOSITORY IS PRIVATE, and it had one that
        answered 404. It sent you to `BUILD.md`, which is the thing it says it is and is not
        readable, so the free plan this page recommends had no route into it at all: the only
        outbound action on the card, dead, under the word Free.

        AN ABSENT CONTROL AND NOT A DISABLED ONE. `19 §6`'s rule, applied to a marketing page: a
        control that cannot act is absent rather than greyed, and a greyed button under a price is a
        product telling you it does not want your business. The sentence above the cards already
        says neither plan is open yet, which is what a reader needs and is true of both.
      -->
      {#if i === 1}
        <a class="btn btn-primary" href={APP}>{plan.cta}</a>
      {:else if BUILD}
        <a class="btn" href={BUILD}>{plan.cta}</a>
      {/if}
    </article>
  {/each}
</section>

<section class="honest">
  <p>{p.honest}</p>
</section>
</div>

<style>
  .head,
  .plans,
  .honest {
    max-inline-size: 1000px;
    margin-inline: auto;
    padding-inline: var(--sp-5);
  }

  .band {
    padding-block: var(--sp-7);
    background: var(--sunk);
    border-block-start: 1px solid var(--line);
  }

  .head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 400px);
    align-items: end;
    gap: var(--sp-6) var(--sp-7);
    padding-block: var(--sp-8);
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

  /* `align-items: start` and the cards stop being the same height. The free plan has no action
     under it while the repository is private, so a stretched card put ninety pixels of nothing
     inside a box with a border round it: an empty rectangle under the word Free, which reads as
     something missing rather than as something absent on purpose. Two cards that each end where
     their content does say nothing at all, which is right. */
  .plans {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
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
    box-shadow: var(--raise);
  }

  /* The recommended plan takes the ACCENT BORDER and a ground seven per cent towards the accent,
     and nothing else — no ribbon, no "most popular", no scale transform. A card that is
     physically larger than the one beside it is a card arguing with the reader about which one
     they came for. The tint is the same expression the home page's closing band uses, so the two
     places on this site where the accent is a GROUND rather than a control are the same colour. */
  .plan[data-featured] {
    background: var(--accent-ground);
    border-color: var(--accent);
  }

  /* The plan's name is a LABEL over its price, not a heading competing with it: the price is what
     the card is about and it is four times the size. Same treatment as the home page's section
     kickers, which is where a reader has already met it. */
  .plan-name {
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .plan-price {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
  }

  /* The price is the largest thing on the card and it was 42px on a page whose heading is 52 and
     whose scale tops out at 34. It reaches for the top of the ladder now and clamps, so it fits a
     360px card without the unit wrapping under it. */
  .plan-figure {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: clamp(var(--t-3xl), 5vw, 52px);
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
    /* `padding-inline: 0` is load-bearing: base.css resets a list's MARGIN and not its padding,
       so dropping the `padding: 0` shorthand for a logical one would hand every point back the
       user agent's 40px indent. */
    padding-inline: 0;
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
    list-style: none;
    color: var(--ink2);
    font-size: var(--t-base);
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
    font-size: var(--t-md);
    font-weight: 600;
    text-decoration: none;
    transition:
      transform var(--d-release) var(--ease-out),
      opacity var(--d-release) var(--ease-out),
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out);
  }

  .btn:hover {
    background: var(--s2);
    border-color: var(--edge);
  }

  /* The press, and this page had none. See the same rule on the home page and the paragraph in
     `tokens.css` about why it is a scale AND an opacity. */
  .btn:active {
    transform: scale(var(--press-scale));
    opacity: var(--press-dim);
    transition-duration: var(--d-press);
    transition-timing-function: var(--ease-push);
  }

  .btn-primary {
    background: var(--accent);
    border-color: var(--accent-edge);
    box-shadow: inset 0 -1px 0 0 color-mix(in srgb, var(--accent) 60%, var(--sunk));
    color: var(--accent-ink);
  }

  .btn-primary:hover {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }

  .btn-primary:active {
    background: var(--accent-press);
  }

  /* The band above pays for the bottom, now the shell no longer puts 96 pixels over the footer on
     every page regardless of what is above it. */
  .honest {
    padding-block: var(--sp-7) 0;
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

    .head,
    .plans,
    .honest {
      padding-inline: var(--sp-4);
    }
  }
</style>
