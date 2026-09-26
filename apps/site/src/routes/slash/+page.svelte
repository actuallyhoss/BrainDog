<script lang="ts">
  /**
   * /slash: the assistant inside every record, on a page of its own (the owner's ask of 26 September,
   * `loop/DIRECTION.md` §33).
   *
   *   hero        the name, what it is, and the palette drawn large.
   *   abilities   ask, draft, notice and learn, a row each, with things a person would type.
   *   rules       its ground rules, as a plain list on the turned-over ground.
   *   allowance   how many asks each plan includes, read from `plans.ts`.
   *   close       start a record.
   */
  import Icon from '$lib/Icon.svelte';
  import SlashPalette from '$lib/SlashPalette.svelte';
  import { SIGNUP, site } from '$lib/copy.ts';
  import { PACKS, plan } from '$lib/plans.ts';

  const s = site.slash;
  const cloud = plan('cloud');
  const plus = plan('plus');
</script>

<svelte:head>
  <title>{site.meta.slash.title}</title>
  <meta name="description" content={site.meta.slash.description} />
  <link rel="canonical" href="https://brain.dog/slash" />
  <meta property="og:url" content="https://brain.dog/slash" />
  <meta property="og:title" content={site.meta.slash.title} />
  <meta property="og:description" content={site.meta.slash.description} />
</svelte:head>

<section class="hero" data-ground="sunk" aria-labelledby="slash-h1">
  <div class="in hero-in">
    <h1 class="display" id="slash-h1">{s.title}</h1>
    <p class="sub">{s.sub}</p>
    <div class="actions">
      <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{s.primary}<Icon name="arrow" size="s" /></a>
      <a class="quiet" href="#allowance">{s.secondary}</a>
    </div>
  </div>
  <div class="in stage">
    <SlashPalette demo={s.demo} size="l" />
  </div>
</section>

<section class="sec" data-ground="page" aria-label={s.demo.label}>
  <div class="in">
    <ul class="abilities">
      {#each s.abilities as a (a.id)}
        <li class="ability reveal">
          <h2 class="ability-title">{a.title}</h2>
          <p class="ability-lead">{a.lead}</p>
          <ul class="examples" aria-label="For example">
            {#each a.examples as e (e)}
              <li><span class="k" aria-hidden="true">/</span>{e}</li>
            {/each}
          </ul>
        </li>
      {/each}
    </ul>
  </div>
</section>

<section class="sec" data-ground="flip" aria-labelledby="rules-title">
  <div class="in rules-in">
    <h2 class="h2 reveal" id="rules-title">{s.rulesTitle}</h2>
    <dl class="rules reveal">
      {#each s.rules as r (r.head)}
        <div>
          <dt>{r.head}</dt>
          <dd>{r.said}</dd>
        </div>
      {/each}
    </dl>
  </div>
</section>

<section class="sec" id="allowance" data-ground="page" aria-labelledby="allowance-title">
  <div class="in">
    <div class="sec-head reveal">
      <h2 class="h2" id="allowance-title">{s.allowance.title}</h2>
      <p class="lede">{s.allowance.lead}</p>
    </div>
    <ul class="allow reveal">
      <li>
        <span class="allow-plan">{cloud.name}</span>
        <span class="allow-n num">{cloud.allowance.credits}</span>
        <span class="allow-unit">{s.allowance.credits}</span>
      </li>
      <li>
        <span class="allow-plan">{plus.name}</span>
        <span class="allow-n num">{plus.allowance.credits}</span>
        <span class="allow-unit">{s.allowance.credits}</span>
      </li>
      <li>
        <span class="allow-plan">{s.allowance.packs}</span>
        <span class="allow-n num">{s.allowance.packsN(PACKS[0]?.credits ?? 0)}</span>
        <span class="allow-unit">{s.allowance.packsUnit(PACKS)}</span>
      </li>
    </ul>
    <a class="onward reveal" href="/pricing">{s.allowance.more}<Icon name="arrow" size="s" /></a>
  </div>
</section>

<section class="sec close" data-ground="page" aria-labelledby="slash-close">
  <div class="in close-in reveal">
    <h2 class="h2" id="slash-close">{s.closeTitle}</h2>
    <p class="lede">{s.closeBody}</p>
    <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{s.primary}<Icon name="arrow" size="s" /></a>
  </div>
</section>

<style>
  .hero {
    padding-block: clamp(56px, 7vw, 104px) clamp(64px, 8vw, 120px);
    background: var(--sunk);
  }

  .hero-in {
    display: grid;
    justify-items: center;
    gap: var(--sp-5);
    text-align: center;
  }

  .display {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: clamp(3rem, 7vw, 5.5rem);
    font-weight: 600;
    line-height: 1;
    letter-spacing: var(--tr-tight);
  }

  .sub {
    max-inline-size: 54ch;
    margin: 0;
    color: var(--ink2);
    font-size: clamp(1rem, 0.95rem + 0.3vw, 1.15rem);
    line-height: 1.6;
    text-wrap: pretty;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--sp-4);
  }

  .quiet {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    color: var(--ink2);
    font-size: var(--t-base);
  }

  .stage {
    max-inline-size: 880px;
    margin-block-start: var(--sp-8);
  }

  /* ── Ask, draft, notice, learn: one row each, no boxes ────────────────── */

  .abilities {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ability {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 5fr) minmax(0, 4fr);
    gap: var(--sp-4) var(--sp-7);
    align-items: start;
    padding-block: var(--sp-7);
    border-block-start: 1px solid var(--line);
  }

  .ability:first-child {
    padding-block-start: 0;
    border-block-start: 0;
  }

  .ability-title {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: clamp(1.5rem, 1.2rem + 0.8vw, 2rem);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }

  .ability-lead {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: 1.6;
    text-wrap: pretty;
  }

  .examples {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 1.5;
  }

  .examples li {
    display: flex;
    gap: var(--sp-2);
  }

  .k {
    flex: none;
    color: var(--accent-text);
    font-weight: 600;
  }

  /* ── Ground rules ──────────────────────────────────────────────────────── */

  .rules-in {
    display: grid;
    grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
    gap: var(--sp-6) var(--sp-8);
    align-items: start;
  }

  .rules {
    display: grid;
    margin: 0;
  }

  .rules div {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    gap: var(--sp-2) var(--sp-6);
    padding-block: var(--sp-5);
    border-block-start: 1px solid var(--line);
  }

  .rules div:first-child {
    padding-block-start: 0;
    border-block-start: 0;
  }

  .rules dt {
    color: var(--ink);
    font-weight: 600;
  }

  .rules dd {
    margin: 0;
    color: var(--ink2);
    line-height: 1.6;
  }

  /* ── Allowance ─────────────────────────────────────────────────────────── */

  .allow {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin: var(--sp-7) 0 var(--sp-5);
    padding: 0;
    list-style: none;
    border: 1px solid var(--line);
    border-radius: 16px;
    overflow: hidden;
  }

  .allow li {
    display: grid;
    align-content: start;
    gap: var(--sp-2);
    padding: var(--sp-6) var(--sp-5);
    background: var(--bg);
  }

  .allow li + li {
    border-inline-start: 1px solid var(--line);
  }

  .allow-plan {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .allow-n {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 44px;
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  .allow-unit {
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.5;
  }

  /* ── Close ─────────────────────────────────────────────────────────────── */

  .close-in {
    display: grid;
    justify-items: center;
    gap: var(--sp-5);
    text-align: center;
  }

  @media (width < 1000px) {
    .ability {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .ability-title {
      grid-column: 1 / -1;
    }

    .rules-in {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (width < 700px) {
    .ability,
    .rules div {
      grid-template-columns: minmax(0, 1fr);
    }

    .allow {
      grid-template-columns: minmax(0, 1fr);
    }

    .allow li + li {
      border-inline-start: 0;
      border-block-start: 1px solid var(--line);
    }

    .stage {
      margin-block-start: var(--sp-7);
    }
  }
</style>
