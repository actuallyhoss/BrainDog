<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import { application, faqOf } from '$lib/site/seo.ts';
  /**
   * Pricing. WHILE BILLING IS OFF it is the early access page (20 October, `copy/pricing.ts` `early`): the night
   * head, Free on the night with its $0 and what it holds, a paper tile naming Cloud and Cloud Plus as coming soon and
   * priced at launch (his N2, 1 November), three questions, and no close. No paid plan's price is drawn.
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
  import EarlyStrip from '$lib/site/EarlyStrip.svelte';
  import PageHead from '$lib/site/PageHead.svelte';
  import Start from '$lib/site/Start.svelte';

  const p = site.pricing;
  const e = p.early;
  const faq = faqFor(LAUNCH);
</script>

<Seo title={site.meta.pricing.title} description={site.meta.pricing.description} path="/pricing" ld={[application, faqOf(LAUNCH.billing ? faq : e.faq.questions)]} />
{#if !LAUNCH.billing}
  <PageHead title={e.title} lead={e.lede} />

  <section class="wrap early">
    <div class="pair">
      <article class="plan">
        <p class="pname">{e.plan.name} <b class="num">{e.plan.price}</b></p>
        <ul>
          {#each e.plan.lines(TABLE.free) as line (line)}<li>{line}</li>{/each}
        </ul>
        <div class="go"><Start /></div>
      </article>
      <article class="later">
        <h2>{e.later.title}</h2>
        <p>{e.later.say}</p>
        <ul class="soonplans">
          {#each e.later.plans as plan (plan.name)}
            <li><b>{plan.name}</b><span>{plan.line}</span><em>{plan.soon}</em></li>
          {/each}
        </ul>
      </article>
    </div>

    <div class="sec" id="questions">
      <h2>{e.faq.title}</h2>
      <div class="faq">
        {#each e.faq.questions as item (item.q)}
          <div><h3>{item.q}</h3><p>{item.a}</p></div>
        {/each}
      </div>
    </div>
  </section>
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
  /* The skin's own .sec is a group heading with a hairline under it; this one is a plain section. */
  .sec {
    display: block;
    padding-block: 120px 0;
    border-block-end: 0;
  }

  .early {
    padding-block: 64px 96px;
  }

  .early .sec {
    padding-block-start: 96px;
  }

  .pair {
    display: grid;
    grid-template-columns: minmax(0, 480px) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }

  /* THE ONE PLAN, on the night: its name and $0, what it holds, and the start button. */
  .plan {
    padding: 32px;
    border-radius: 16px;
    background: var(--night);
    color: var(--on-night);
  }

  .pname {
    margin: 0;
    font: 600 28px/1.1 var(--head);
    letter-spacing: -0.035em;
  }

  .pname b {
    margin-inline-start: 8px;
    color: var(--on-night-2);
    font-weight: 600;
  }

  .plan ul {
    display: grid;
    gap: 12px;
    margin: 24px 0 0;
    padding: 0;
    list-style: none;
    font-size: var(--t-site-17);
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

  .plan .go {
    margin-block-start: 32px;
  }

  .later {
    padding: 32px;
    border-radius: 16px;
    background: var(--paper);
  }

  .later h2 {
    font-size: var(--t-site-28);
    letter-spacing: -0.035em;
  }

  .later p {
    max-inline-size: 30em;
    margin: 12px 0 0;
    color: var(--ink2);
    font-size: var(--t-site-17);
    line-height: 1.55;
  }

  /* THE TWO PAID PLANS, named and unpriced: a hairline list on the paper, "Coming soon" plain on the right. */
  .soonplans {
    display: grid;
    margin: 24px 0 0;
    padding: 0;
    list-style: none;
  }

  .soonplans li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 16px;
    row-gap: 2px;
    padding-block: 14px;
    border-block-start: 1px solid var(--rule);
  }

  .soonplans b {
    font: 600 17px/1.3 var(--head);
    letter-spacing: -0.02em;
  }

  .soonplans span {
    grid-column: 1;
    color: var(--ink2);
    font-size: var(--t-site-15);
    line-height: 1.45;
  }

  .soonplans em {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: center;
    font: 500 14px/1.2 var(--ui);
    font-style: normal;
    color: var(--muted);
  }

  .early .sec h2 {
    font-size: clamp(34px, 4.2vw, 48px);
    line-height: 1;
    letter-spacing: -0.045em;
  }

  @media (max-width: 900px) {
    .pair {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 760px) {
    .plan,
    .later {
      padding: 24px 20px;
    }

    .plan .go :global(.btn) {
      inline-size: 100%;
    }

    .early {
      padding-block: 40px 64px;
    }

    .early .sec {
      padding-block-start: 64px;
    }
  }

  .sec .say {
    margin: 16px 0 0;
    font-size: var(--t-site-19);
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

  @media (max-width: 760px) {
    .sec {
      padding-block-start: 96px;
    }
  }
</style>
