<script lang="ts">
  /**
   * Pricing, the prototype's `#pricing` (`loop/site-2026-10-17/src/site.html`, DIRECTION §47): the night head, the
   * three plans with Free first and black (§35), what each plan holds, extra use, the questions people ask, and the
   * close.
   *
   * EVERY FIGURE IS `TABLE`'S (`plans.ts`, held to `PLAN_TABLE` by `plans.test.ts`) and every sentence is
   * `copy/pricing.ts`'s; `lib/pricing/cards.ts` puts the one into the other, so this page types neither.
   *
   * HONEST AT LAUNCH. The paid buttons follow `LAUNCH.billing` (in `Plans.svelte`). Extra use is sold by no checkout,
   * so its section says it is coming soon and links nothing. "Can I cancel any time?" is asked only while billing is
   * on: nobody can cancel what nobody sells. Nothing here says a card is charged.
   *
   * NO JAVASCRIPT IS NEEDED TO READ ANY OF IT: the cards, the tables and the answers are finished HTML.
   */
  import { site } from '$lib/copy.ts';
  import { LAUNCH } from '$lib/launch.ts';
  import Plans from '$lib/pricing/Plans.svelte';
  import { columns, extra, faqFor, holds } from '$lib/pricing/cards.ts';
  import Close from '$lib/site/Close.svelte';
  import PageHead from '$lib/site/PageHead.svelte';

  const p = site.pricing;
  const faq = faqFor(LAUNCH);
</script>

<svelte:head>
  <title>{site.meta.pricing.title}</title>
  <meta name="description" content={site.meta.pricing.description} />
  <link rel="canonical" href="https://brain.dog/pricing" />
  <meta property="og:url" content="https://brain.dog/pricing" />
  <meta property="og:title" content={site.meta.pricing.title} />
  <meta property="og:description" content={site.meta.pricing.description} />
</svelte:head>

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
    <p class="say">{#if LAUNCH.billing}{p.extra.say} {/if}{p.extra.soon}</p>
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

<Close title={p.close.title} body={p.close.body} />

<style>
  .sec {
    padding-block-start: 140px;
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
