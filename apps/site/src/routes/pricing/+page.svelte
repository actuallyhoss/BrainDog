<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import { application, faqOf } from '$lib/site/seo.ts';
  /**
   * Pricing. WHILE BILLING IS OFF it is the early access page (20 October, `copy/pricing.ts` `early`): the night
   * head, Free on the night with its $0 and what it holds, one line that paid plans come later and nothing made now is
   * lost (plan F20), and the questions people ask: this page's three and the home page's, which moved here (plan F12),
   * and no close. No paid plan's price is drawn.
   *
   * THE DAY `LAUNCH.billing` IS ON it is the plans page again: the three plans with Free first and black (§35), what
   * each plan holds, extra use and the questions people ask. Every figure is `TABLE`'s (`plans.ts`, held to
   * `PLAN_TABLE` by `plans.test.ts`) and every sentence is `copy/pricing.ts`'s; `lib/pricing/cards.ts` puts the one
   * into the other, so this page types neither.
   *
   * NO JAVASCRIPT IS NEEDED TO READ ANY OF IT: the cards, the tables and the answers are finished HTML.
   */
  import { site } from '$lib/copy.ts';
  import { LAUNCH } from '$lib/launch.ts';
  import { TABLE } from '$lib/plans.ts';
  import Plans from '$lib/pricing/Plans.svelte';
  import { columns, extra, faqFor, holds } from '$lib/pricing/cards.ts';
  import { home } from '$lib/copy/home.ts';
  import Questions from '$lib/home/Questions.svelte';
  import EarlyStrip from '$lib/site/EarlyStrip.svelte';
  import PageHead from '$lib/site/PageHead.svelte';
  import Start from '$lib/site/Start.svelte';

  const p = site.pricing;
  const e = p.early;
  const faq = faqFor(LAUNCH);
  /* THE QUESTIONS PEOPLE ASK, this page's first and then the home page's, less what this page itself answers. */
  const asked = [...e.faq.questions, ...home.faq.questions.filter((q) => !('link' in q) || q.link.href !== '/pricing')];
</script>

<Seo title={site.meta.pricing.title} description={site.meta.pricing.description} path="/pricing" ld={[application, faqOf(LAUNCH.billing ? faq : asked)]} />
{#if !LAUNCH.billing}
  <PageHead title={e.title} lead={e.lede} />

  <section class="wrap early cols">
    <article class="plan">
      <div class="ptop">
        <p class="pname">{e.plan.name} <b class="num">{e.plan.price}</b></p>
        <div class="go"><Start /></div>
      </div>
      <ul>
        {#each e.plan.lines(TABLE.free) as line (line)}<li>{line}</li>{/each}
      </ul>
    </article>
    <p class="later">{e.later.say}</p>
  </section>
  <div id="questions"><Questions questions={asked} title={e.faq.title} /></div>
{:else}
<PageHead title={p.title} lead={p.sub} />

<section class="wrap">
  <Plans />

  <div class="sec" id="holds">
    <h2>{p.holds.title}</h2>
    <p class="say">{p.holds.say}</p>
    <div class="tablebox">
      <table class="ptable">
        <thead>
          <tr>
            <th scope="col"><span class="vh">{p.holds.what}</span></th>
            {#each columns as name (name)}<th scope="col">{name}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each holds as row (row.key)}
            <tr>
              <td>{row.name}</td>
              {#each row.cells as cell, i (i)}<td>{cell}</td>{/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <div class="sec" id="extra">
    <h2>{p.extra.title}</h2>
    <!-- EXTRA USE IS SOLD THE DAY `LAUNCH.extra` IS ON, with billing: until then the section says it is coming soon. -->
    <p class="say">{#if LAUNCH.billing}{p.extra.say}{/if}{#if !(LAUNCH.billing && LAUNCH.extra)}{LAUNCH.billing ? ' ' : ''}{p.extra.soon}{/if}</p>
    <div class="tablebox">
      <table class="ptable">
        <thead>
          <tr><th scope="col">{p.extra.on}</th><th scope="col">{p.extra.price}</th></tr>
        </thead>
        <tbody>
          {#each extra as row (row.key)}
            <tr><td>{row.name}</td><td>{row.price}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <div class="sec" id="questions">
    <h2>{p.faq.title}</h2>
    <div class="faq">
      {#each faq as item (item.q)}
        <div><h3>{item.q}</h3><p>{item.a}</p></div>
      {/each}
    </div>
  </div>
</section>

<EarlyStrip />
{/if}

<style>
  /* The skin's own .sec is a group heading with a hairline under it; this one is a plain section, a band step apart. */
  .sec {
    display: block;
    padding-block: var(--band-pad) 0;
    border-block-end: 0;
  }

  /* THE QUESTIONS' BAND FOLLOWS ON THE SAME GROUND, so its own padding is the space between them. */
  .early {
    padding-block: var(--first-pad) 0;
  }

  /**
   * THE ONE PLAN, on the night and across the column (polish, 2 November): its name, $0 and the start button on the
   * left, what it holds on the right, on the same twelve columns as the questions under it, so what Free holds starts
   * where the questions do. At 640 wide it left half the page empty beside it.
   */
  .plan {
    display: grid;
    grid-template-columns: subgrid;
    row-gap: 24px;
    padding: var(--site-tile-pad);
    border-radius: 16px;
    background: var(--night);
    color: var(--on-night);
    --focus: var(--on-night);
  }

  .plan > * {
    grid-column: 1 / -1;
    min-inline-size: 0;
  }

  .ptop {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 24px;
  }

  .pname {
    margin: 0;
    font: 600 var(--t-feature) / 1.1 var(--head);
    letter-spacing: -0.03em;
  }

  .pname b {
    margin-inline-start: 8px;
    color: var(--on-night-2);
    font-weight: 600;
  }

  .plan ul {
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--t-say);
    line-height: 1.5;
  }

  .plan li::before {
    content: '';
    display: inline-block;
    inline-size: 6px;
    block-size: 6px;
    margin-inline-end: 12px;
    border-radius: 50%;
    background: var(--on-night-2);
    vertical-align: middle;
  }

  /* WHAT COMES LATER, one plain line under the plan. */
  .later {
    margin: 0;
    padding-block-start: 8px;
    color: var(--ink2);
    font-size: var(--t-text);
    line-height: 1.55;
  }

  @media (width >= 1060px) {
    .ptop {
      grid-column: 1 / span 4;
      justify-content: space-between;
    }

    .plan ul {
      grid-column: 5 / -1;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-content: start;
      column-gap: 16px;
    }
  }

  @media (max-width: 760px) {
    .plan .go,
    .plan .go :global(.btn) {
      inline-size: 100%;
    }

    .ptop {
      align-items: stretch;
    }
  }

  .sec .say {
    margin: 16px 0 0;
    font-size: var(--t-say);
    color: var(--ink2);
    max-width: 30em;
  }

  .vh {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
