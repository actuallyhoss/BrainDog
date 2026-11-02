<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import { application, faqOf } from '$lib/site/seo.ts';
  /**
   * Pricing (the redo of 2 November). WHILE BILLING IS OFF it is the early access page (20 October, `copy/pricing.ts`
   * `early`): the page's head, then one row of the app's tiles, Free with its $0, what it holds and the start button
   * (the page's one red) with the one line that paid plans come later and nothing made now is lost, and beside it the
   * questions people ask: this page's three and the home page's. No paid plan's price is drawn.
   *
   * THE DAY `LAUNCH.billing` IS ON it is the plans page again: the three plans with Free first, what each plan holds,
   * extra use and the questions people ask. Every figure is `TABLE`'s (`plans.ts`, held to `PLAN_TABLE` by
   * `plans.test.ts`) and every sentence is `copy/pricing.ts`'s; `lib/pricing/cards.ts` puts the one into the other, so
   * this page types neither.
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
  import Icon from '$lib/Icon.svelte';
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

  <section class="section">
    <div class="wrap">
      <div class="tiles">
        <article class="tile lead span-5 plan reveal" aria-labelledby="plan-free">
          <p class="pname" id="plan-free">{e.plan.name}</p>
          <p class="figure big num">{e.plan.price}</p>
          <ul>
            {#each e.plan.lines(TABLE.free) as line (line)}<li><Icon name="check" size="m" /><span>{line}</span></li>{/each}
          </ul>
          <div class="go"><Start size="lg" /></div>
          <p class="later">{e.later.say}</p>
        </article>
        <div class="span-7 reveal" id="questions"><Questions questions={asked} title={e.faq.title} /></div>
      </div>
    </div>
  </section>
{:else}
<PageHead title={p.title} lead={p.sub} />

<section class="section wrap">
  <Plans />

  <div class="sec" id="holds">
    <h2 class="h2">{p.holds.title}</h2>
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
    <h2 class="h2">{p.extra.title}</h2>
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
    <h2 class="h2">{p.faq.title}</h2>
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
  /* ── Early access: the one plan ─────────────────────────────────────── */

  .plan {
    gap: var(--sp-3);
  }

  .pname {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--t-site-15);
    font-weight: 600;
  }

  .plan ul {
    display: grid;
    gap: 10px;
    margin: var(--sp-2) 0 0;
    padding: 0;
    list-style: none;
    color: var(--ink);
    font-size: var(--t-site-15);
  }

  .plan li {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .plan li :global(svg) {
    color: var(--good);
  }

  .go {
    margin-block-start: var(--sp-3);
  }

  /* WHAT COMES LATER, one plain line under the button. */
  .later {
    margin: var(--sp-2) 0 0;
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
    color: var(--ink-2);
    font-size: var(--t-site-small);
    line-height: 1.55;
  }

  @media (max-width: 640px) {
    .go,
    .go :global(.btn) {
      inline-size: 100%;
    }
  }

  /* ── Billing on: the plans page ─────────────────────────────────────── */

  .sec {
    display: block;
    padding-block: clamp(48px, 4vw + 32px, 96px) 0;
  }

  .sec .say {
    margin: var(--sp-3) 0 var(--sp-5);
    max-inline-size: 60ch;
    color: var(--ink-2);
    font-size: var(--t-lead);
  }

  .sec .tablebox {
    background: var(--tile);
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
