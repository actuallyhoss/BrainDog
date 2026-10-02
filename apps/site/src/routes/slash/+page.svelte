<script lang="ts">
  /**
   * /slash: the assistant inside every record, on a page of its own (the owner's ask of 26 September),
   * drawn as Bento tiles on the ground (the design system).
   *
   *   hero        the name, what it is, the action, and the palette drawn beside them.
   *   abilities   ask, draft, notice and learn, a tile each: what it does, things a person would type, and a
   *               drawing of it working on the Personal record the palette answers from.
   *   rules       its ground rules, each with its glyph, beside how credits work drawn as bars.
   *   close       start a record.
   *
   * EVERY FIGURE IN A DRAWING IS ONE THE PAGE ALREADY SAYS: the palette demo's rows (`copy/home.ts`), the home
   * page's inbox scene and `plans.ts`. What is worked out here (a share, a sum, a ratio) is worked out from them, so a
   * figure changed there is changed in the drawing too.
   */
  import Icon from '$lib/Icon.svelte';
  import SlashPalette from '$lib/SlashPalette.svelte';
  import { SIGNUP, site } from '$lib/copy.ts';
  import { isIconName } from '$lib/icons.ts';
  import { PACKS, plan } from '$lib/plans.ts';

  const s = site.slash;
  const d = s.drawn;
  const free = plan('free');
  const cloud = plan('cloud');
  const plus = plan('plus');

  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const word = (n: number): string => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? (WORDS[n] ?? String(n)) : String(n));

  /** `£1,240.56` as whole pence, and pence back in the palette's own spelling, its symbol and its pence. */
  const amount = (text: string): number => Math.round((Number.parseFloat(text.replace(/[^0-9.]/g, '')) || 0) * 100);
  const currency = (text: string): string => text.match(/^[^\d\s]+/)?.[0] ?? '';
  const money = (unit: string, pence: number): string =>
    `${unit}${(pence / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const [askMode, draftMode, noticeMode] = s.demo.modes;
  const byId = Object.fromEntries(s.abilities.map((a) => [a.id, a])) as Record<string, (typeof s.abilities)[number]>;

  /* ASK: the bills the palette answers with, as bars on one scale, the largest in ink. */
  const bills = (askMode?.rows ?? []).map((r) => ({ what: r[0] ?? '', value: amount(r[1] ?? ''), shown: r[1] ?? '', when: r[2] ?? '' }));
  const billMax = Math.max(1, ...bills.map((b) => b.value));
  const billSum = bills.reduce((t, b) => t + b.value, 0);
  const biggest = bills.reduce((a, b) => (b.value > a.value ? b : a), bills[0] ?? { what: '', value: 0, shown: '', when: '' });
  const biggestPct = billSum > 0 ? Math.round((biggest.value / billSum) * 100) : 0;

  /* DRAFT: the three blocks the draft would add, each with the glyph of what it is. */
  const DRAFT_GLYPHS = ['target', 'work', 'bars'] as const;

  /* NOTICE: the current account against the rent, and what is left. */
  const account = noticeMode?.rows[0];
  const rent = noticeMode?.rows[1];
  const accountValue = amount(account?.[1] ?? '');
  const rentValue = amount(rent?.[1] ?? '');
  const rentPct = accountValue > 0 ? Math.min(100, (rentValue / accountValue) * 100) : 0;
  const spare = money(currency(account?.[1] ?? ''), accountValue - rentValue);

  /* LEARN: the home page's three card alerts, learned once and filed. */
  const inbox = site.home.inbox;
  const merchants = inbox.rows.map((r) => r[0]);

  /* CREDITS: each plan's month and each pack, on one scale. FREE LEADS (DIRECTION §35): Free is first and the one bar
     in ink, and the paid plans follow as more. `PACKS` is empty until one is sold, so no pack bar is drawn and the
     meta line says they are coming later. */
  const credits = [
    { label: free.name, n: free.allowance.credits, shown: String(free.allowance.credits), ink: true },
    { label: cloud.name, n: cloud.allowance.credits, shown: String(cloud.allowance.credits), ink: false },
    { label: plus.name, n: plus.allowance.credits, shown: String(plus.allowance.credits), ink: false },
    ...PACKS.map((p) => ({ label: s.allowance.packs, n: p.credits, shown: `${s.allowance.packsN(p.credits)} · ${p.price}`, ink: false })),
  ];
  const creditMax = Math.max(1, ...credits.map((c) => c.n));

  const ruleGlyph = (i: number) => {
    const g = d.ruleGlyphs[i] ?? 'check';
    return isIconName(g) ? g : 'check';
  };
</script>

<svelte:head>
  <title>{site.meta.slash.title}</title>
  <meta name="description" content={site.meta.slash.description} />
  <link rel="canonical" href="https://brain.dog/slash" />
  <meta property="og:url" content="https://brain.dog/slash" />
  <meta property="og:title" content={site.meta.slash.title} />
  <meta property="og:description" content={site.meta.slash.description} />
</svelte:head>

{#snippet examples(list: readonly string[])}
  <ul class="examples" aria-label="For example">
    {#each list as e (e)}
      <li><span class="kbd" aria-hidden="true">/</span>{e}</li>
    {/each}
  </ul>
{/snippet}

<!-- ── What Slash is, the action, and the palette drawn beside it ── -->
<section class="band" aria-labelledby="slash-h1">
  <div class="in">
    <div class="tiles">
      <div class="tile lead span-5 intro">
        <h1 class="h2" id="slash-h1">{s.title}</h1>
        <p class="lede">{s.sub}</p>
        <div class="actions">
          <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{s.primary}<Icon name="arrow" size="s" /></a>
          <a class="btn btn-lg" href="#allowance">{s.secondary}</a>
        </div>
      </div>
      <div class="span-7 stage">
        <SlashPalette demo={s.demo} size="l" />
      </div>
    </div>
  </div>
</section>

<!-- ── The four things it does, each drawn working ── -->
<section class="band" aria-label={s.demo.label}>
  <div class="in">
    <div class="tiles">
      {#if byId.ask}
        <article class="tile lead span-5 reveal" aria-labelledby="ask-title">
          <header class="tile-head"><span class="well"><Icon name="search" /></span><h2 class="tile-title" id="ask-title">{byId.ask.title}</h2></header>
          <p class="lede">{byId.ask.lead}</p>
          {@render examples(byId.ask.examples)}
          <div class="drawn" role="img" aria-label="{askMode?.prompt} {askMode?.lead}">
            <p class="said">{askMode?.lead}</p>
            <ul class="hbars">
              {#each bills as b (b.what)}
                <li>
                  <span class="hb-what">{b.what}</span>
                  <span class="hb-track"><span class="hb-bar" class:ink={b === biggest} style="--w:{(b.value / billMax) * 100}%"></span></span>
                  <span class="hb-val num">{b.shown}</span>
                </li>
              {/each}
            </ul>
          </div>
          <p class="reading">{d.askReading(biggest.what, biggestPct)}</p>
        </article>
      {/if}

      {#if byId.draft}
        <article class="tile lead span-7 reveal" aria-labelledby="draft-title">
          <header class="tile-head">
            <span class="well"><Icon name="file" /></span><h2 class="tile-title" id="draft-title">{byId.draft.title}</h2>
            <span class="tile-meta">{draftMode?.source}</span>
          </header>
          <div class="pair">
            <div class="words">
              <p class="lede">{byId.draft.lead}</p>
              {@render examples(byId.draft.examples)}
            </div>
            <div class="drawn card" role="group" aria-label={draftMode?.source}>
              <p class="asked"><span class="kbd" aria-hidden="true">/</span>{draftMode?.prompt}</p>
              <p class="said">{draftMode?.lead}</p>
              <ul class="blocks">
                {#each draftMode?.rows ?? [] as r, i (r[0])}
                  <li>
                    <span class="well"><Icon name={DRAFT_GLYPHS[i] ?? 'bars'} /></span>
                    <span class="b-text"><b>{r[0]}</b><span>{r[1]}</span></span>
                  </li>
                {/each}
              </ul>
              <p class="verbs">
                <span class="pill ink">{s.demo.accept}<span class="kbd">1</span></span>
                <span class="pill">{s.demo.reject}<span class="kbd">2</span></span>
              </p>
            </div>
          </div>
          <p class="reading">{d.draftReading}</p>
        </article>
      {/if}

      {#if byId.notice}
        <article class="tile lead span-7 reveal" aria-labelledby="notice-title">
          <header class="tile-head"><span class="well"><Icon name="bell" /></span><h2 class="tile-title" id="notice-title">{byId.notice.title}</h2></header>
          <div class="pair">
            <div class="words">
              <p class="lede">{byId.notice.lead}</p>
              {@render examples(byId.notice.examples)}
            </div>
            <div class="drawn card" role="group" aria-label={noticeMode?.prompt}>
              <p class="asked"><Icon name="bell" size="s" />{noticeMode?.prompt}</p>
              <p class="said">{noticeMode?.lead}</p>
              <div class="meter" role="img" aria-label="{rent?.[0]} {rent?.[1]} of {account?.[0]} {account?.[1]}">
                <span class="m-fill" style="--w:{rentPct}%"></span>
              </div>
              <p class="m-legend">
                <span><i class="dot ink"></i>{rent?.[0]} <b class="num">{rent?.[1]}</b></span>
                <span><i class="dot"></i>{account?.[0]} <b class="num">{account?.[1]}</b></span>
              </p>
              <p class="source"><Icon name="check" size="s" />{noticeMode?.source}</p>
            </div>
          </div>
          <p class="reading">{d.noticeSpare(spare)}</p>
        </article>
      {/if}

      {#if byId.learn}
        <article class="tile lead span-5 reveal" aria-labelledby="learn-title">
          <header class="tile-head"><span class="well"><Icon name="zap" /></span><h2 class="tile-title" id="learn-title">{byId.learn.title}</h2></header>
          <p class="lede">{byId.learn.lead}</p>
          <div class="learn" role="img" aria-label={d.learnLabel(inbox.list)}>
            <ul class="alerts">
              {#each merchants as m (m)}<li><span class="well"><Icon name="mail" /></span><span>{m}</span></li>{/each}
            </ul>
            <Icon name="arrow" size="m" />
            <span class="step"><span class="well ink"><Icon name="check" /></span><span>{d.accept}</span></span>
            <Icon name="arrow" size="m" />
            <span class="step"><span class="well"><Icon name="inbox" /></span><span>{d.into(inbox.list)}</span></span>
          </div>
          <p class="reading">{d.learnReading}</p>
          {@render examples(byId.learn.examples)}
        </article>
      {/if}
    </div>
  </div>
</section>

<!-- ── Its ground rules, and how credits work ── -->
<section class="band" aria-labelledby="rules-title">
  <div class="in">
    <div class="tiles">
      <article class="tile lead span-7 reveal">
        <header class="tile-head"><span class="well"><Icon name="shield" /></span><h2 class="tile-title" id="rules-title">{s.rulesTitle}</h2></header>
        <dl class="rules">
          {#each s.rules as r, i (r.head)}
            <div>
              <dt><span class="well l"><Icon name={ruleGlyph(i)} /></span>{r.head}</dt>
              <dd>{r.said}</dd>
            </div>
          {/each}
        </dl>
      </article>

      <article class="tile lead span-5 reveal" id="allowance" aria-labelledby="allowance-title">
        <header class="tile-head">
          <span class="well"><Icon name="coins" /></span><h2 class="tile-title" id="allowance-title">{s.allowance.title}</h2>
          <a class="onward" href="/pricing">{s.allowance.more}<Icon name="arrow" size="s" /></a>
        </header>
        <p class="lede">{s.allowance.lead}</p>
        <!-- The picture is the wrapper, because a list cannot take the `img` role and keep its items. -->
        <div role="img" aria-label={d.creditsLabel}>
          <ul class="cbars">
            {#each credits as c, i (i)}
              <li>
                <span class="cb-label">{c.label}</span>
                <span class="hb-track"><span class="hb-bar" class:ink={c.ink} style="--w:{(c.n / creditMax) * 100}%"></span></span>
                <span class="cb-val num">{c.shown}</span>
              </li>
            {/each}
          </ul>
        </div>
        <p class="reading">{d.creditsReading(word(plus.allowance.credits / cloud.allowance.credits))}</p>
        <p class="meta">{s.allowance.packsN(PACKS[0]?.credits ?? 0)} {s.allowance.packsUnit(PACKS)}</p>
      </article>
    </div>
  </div>
</section>

<!-- ── The close ── -->
<section class="band" aria-labelledby="slash-close">
  <div class="in">
    <div class="tiles">
      <div class="tile lead close reveal">
        <div class="close-words">
          <h2 class="h2" id="slash-close">{s.closeTitle}</h2>
          <p class="lede">{s.closeBody}</p>
        </div>
        <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{s.primary}<Icon name="arrow" size="s" /></a>
      </div>
    </div>
  </div>
</section>

<style>
  /* ── The opening ─────────────────────────────────────────────────────── */

  .intro {
    justify-content: center;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .stage {
    display: grid;
    align-items: center;
  }

  /* ── The abilities ───────────────────────────────────────────────────── */

  .examples {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .examples li {
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: 32px;
    color: var(--ink);
    font-size: var(--t-site-small);
  }

  /* The drawing and the words beside it; they stack below a desk. */
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    gap: var(--sp-5);
    align-items: start;
  }

  .words {
    display: grid;
    gap: var(--sp-4);
  }

  /* A DRAWING OF THE PRODUCT'S OWN PARTS inside a tile: the tile's second fill, never a tile of its own. */
  .card {
    display: grid;
    gap: var(--sp-3);
    padding: var(--sp-4);
    background: var(--s1);
    border-radius: var(--r-md);
  }

  .drawn {
    min-inline-size: 0;
  }

  .said {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    line-height: 24px;
  }

  .asked {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* Horizontal bars on one scale: the label, the track, the figure. The largest is ink, the rest grey. */
  .hbars,
  .cbars {
    display: grid;
    gap: var(--sp-2);
    margin: var(--sp-3) 0 0;
    padding: 0;
    list-style: none;
  }

  .hbars li,
  .cbars li {
    display: grid;
    grid-template-columns: minmax(0, 11em) minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    font-size: var(--t-sm);
  }

  .hb-what,
  .cb-label {
    overflow: hidden;
    color: var(--ink2);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .hb-track {
    display: block;
    block-size: 10px;
    background: var(--s1);
    border-radius: var(--r-pill);
  }

  .hb-bar {
    display: block;
    inline-size: var(--w);
    min-inline-size: 6px;
    block-size: 100%;
    background: var(--dim);
    border-radius: var(--r-pill);
  }

  .hb-bar.ink {
    background: var(--ink);
  }

  .hb-val,
  .cb-val {
    color: var(--ink);
    font-weight: 600;
    text-align: end;
  }

  .blocks {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .blocks li {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2);
    background: var(--bg);
    border-radius: var(--r-md);
  }

  .blocks .well {
    background: var(--s1);
  }

  .b-text {
    display: grid;
    min-inline-size: 0;
    font-size: var(--t-sm);
  }

  .b-text b {
    color: var(--ink);
    font-weight: 600;
  }

  .b-text span {
    color: var(--dim);
  }

  /* Drawn, not pressed: a button on a page that does nothing when pressed is a broken control. */
  .verbs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 32px;
    padding-inline: 14px 8px;
    background: var(--bg);
    border-radius: var(--r-pill);
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .pill.ink {
    background: var(--ink);
    color: var(--on-ink);
  }

  .pill.ink .kbd {
    background: color-mix(in srgb, var(--on-ink) 18%, transparent);
    color: var(--on-ink);
  }

  /* The notice's meter: the account is the track and the rent the ink part of it. */
  .meter {
    block-size: 12px;
    background: var(--bg);
    border-radius: var(--r-pill);
  }

  .m-fill {
    display: block;
    inline-size: var(--w);
    block-size: 100%;
    background: var(--ink);
    border-radius: var(--r-pill);
  }

  .m-legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1) var(--sp-4);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .m-legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .m-legend b {
    color: var(--ink);
    font-weight: 600;
  }

  .dot {
    display: inline-block;
    inline-size: var(--dot);
    block-size: var(--dot);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
  }

  .dot.ink {
    background: var(--ink);
    border-color: var(--ink);
  }

  .source {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  /* Learn: three alerts, one yes, and the list they go into. */
  .learn {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-4);
    background: var(--s1);
    border-radius: var(--r-md);
    color: var(--dim);
  }

  .alerts {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .alerts li,
  .step {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink);
    font-size: var(--t-sm);
  }

  .learn .well:not(.ink) {
    background: var(--bg);
  }

  .step {
    font-weight: 600;
  }

  /* ── Rules and credits ───────────────────────────────────────────────── */

  .rules {
    display: grid;
    margin: 0;
  }

  /* THE WELL IS IN THE TERM, because a `dl`'s groups hold only terms and descriptions, and it is lifted out to
     the rule's start beside both lines, where a grid column of its own used to put it. */
  .rules div {
    --lead: calc(var(--well-l) + var(--sp-4));
    padding-block: var(--sp-4);
    padding-inline-start: var(--lead);
    border-block-start: 1px solid var(--line);
  }

  .rules div:first-child {
    border-block-start: 0;
    padding-block-start: 0;
  }

  .rules .well {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: calc(-1 * var(--lead));
  }

  .rules dt {
    position: relative;
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
  }

  .rules dd {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-small);
    line-height: 20px;
  }

  .cbars li {
    grid-template-columns: minmax(0, 7em) minmax(0, 1fr) auto;
  }

  /* ── The close ───────────────────────────────────────────────────────── */

  .close {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
  }

  .close-words {
    display: grid;
    gap: var(--sp-3);
  }

  @media (width < 1100px) {
    .pair {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (width < 640px) {
    .hbars li {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .hbars .hb-track {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .actions .btn {
      flex: 1;
    }
  }
</style>
