<!--
  Home. Two questions, answered without a filter: WHAT NEEDS YOU, and WHAT HAPPENED WHILE YOU WERE
  NOT LOOKING.

  The second half depends on one small piece of design that is easy to get wrong: the read mark is
  one value per person, written with MAX() only, and it advances when the person LEAVES the screen,
  never when it opens. The predecessor shipped it the other way round and found its own bug — For
  You had never once drawn its second half, because the screen advanced the mark on open and then
  asked for everything since it (19 §6).

  And the first screen is deliberately NOT a dashboard of dashes. A dashboard of — and flat charts
  teaches, in one glance, that the app is empty and none of it is for you.
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { parse, relative, since, TONES } from 'braindog-render';
  import { Block, Degraded } from 'braindog-render/svelte';
  import { copy } from '$lib/copy.ts';
  import * as pref from '$lib/pref.ts';
  import { NOW, ROWS, actorOf, metric } from '$lib/record/api.ts';
  import { amountOf, currencyOf } from '$lib/record/money.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { drew } from '../lib/ui/screen.svelte.ts';

  let { data } = $props();

  const today = new Date(NOW).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  const days = (iso: unknown) =>
    typeof iso === 'string' ? (Date.parse(`${iso}T12:00:00Z`) - NOW) / 86_400_000 : Infinity;

  const NEEDS_CAP = 6;

  /**
   * AND THE FEED HAS ONE TOO, for a different reason from every other cap in this commit.
   *
   * "Since you were away" grows with WRITES rather than with rows, so on a record anybody actually
   * uses it is unbounded — and Home is not the log. `19 §2` gives `/audit` that job, and the whole
   * shape of this screen is "what needs you", which a hundred events is the opposite of. So this cap
   * is small on purpose and its overflow is a door rather than a line: the same `.more` link the
   * needs-you list already uses, pointing at the surface that exists to hold the rest.
   */
  const NEWS_CAP = 8;

  /**
   * WHAT HAPPENED SINCE YOU LAST LOOKED — WHICH THIS SCREEN COULD NOT ANSWER.
   *
   * The feed read a module constant and nothing anywhere stored a mark, so the fifth session showed
   * the same six items as the first. `19 §6` calls this half of Home the answer to *"what happened
   * while you were not looking"*, and it was a heading making a claim about the reader's own history
   * that was the same claim for ever — beside a register head that is scrupulous about its count.
   *
   * `copy.markAllRead` had been in `copy.ts` with no call site, waiting for exactly this.
   *
   * THE MARK IS AN INSTANT, NOT A FLAG. A per-item read state is a second store to keep in step with
   * a log that only grows; a timestamp is one string, it survives a new arrival correctly, and it is
   * what the real record already uses — `33 §2`'s `whatsNew` takes a cursor and `member.seen_at` is
   * its account-wide default. This is the browser's half of the same idea.
   *
   * UNSET MEANS EVERYTHING IS NEW, which is what a first visit should be: nothing has been looked at
   * because there has been no visit to look during.
   */
  let seen = $state(pref.read().seen);

  const fresh = $derived(data.whatsNew.filter((item) => !seen || item.at > seen));

  function markRead() {
    /* The newest item's own instant, not the wall clock. Marking read means "I have seen these",
       and an arrival written a second later must not be swallowed by a mark taken a second after
       that — which is the race a `Date.now()` here would lose silently and rarely. */
    const newest = data.whatsNew.reduce((a, item) => (item.at > a ? item.at : a), '');
    if (!newest) return;
    seen = newest;
    pref.write({ seen: newest });
  }

  const dueSoon = $derived(
    (ROWS.obligations ?? [])
      .filter((e) => (e.fields.state === 'open' || e.fields.state === 'part') && days(e.fields.due) <= 7)
      .sort((a, b) => String(a.fields.due).localeCompare(String(b.fields.due))),
  );

  const lapsing = $derived((ROWS.services ?? []).filter((e) => e.fields.state === 'lapsing'));
  const shown = $derived(dueSoon.slice(0, NEEDS_CAP));
  const hidden = $derived(dueSoon.length - shown.length);

  /* Home writes the dialect and the renderer draws it, exactly as an agent would — one code path
     from the first `<figure>` down, and no bespoke chart component to keep in step. */
  const cells = $derived(['owed-to-you', 'due-30d', 'overdue'].map((id) => metric(id)));

  /* A FIGURE IS A DOOR. `hrefFor` derives a tile's address from the same predicate the figure is
     computed over, so the tile and the list it opens cannot disagree — and until now that
     derivation shipped behind a `div` nobody could press. */
  const stripOpts = $derived({ cellHref: (i: number) => cells[i]?.href ?? null });

  const strip = $derived.by(() => {
    const rows = cells.map((m) => `${m.label} | ${m.value} | ${m.note}${m.tone ? ` | ${m.tone}` : ''}`);
    // No heading in the fence: the section above it already names the band, and a block that
    // repeats its own section title is the same sentence twice.
    return parse(['```stat', ...rows, '```'].join('\n'));
  });

  /**
   * THIS SCREEN COMPUTES ITS CONTENT SYNCHRONOUSLY, and says so.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. Four browser gates waited on `#main` having a child,
   * with the wait swallowed by a `catch`, which is satisfied by a page heading and means nothing
   * the day a screen fetches. `Empty` says `empty` or `refused` for the states it draws; this is
   * the other claim, and it is true of this screen today.
   *
   * IT STOPS BEING AVAILABLE WHEN IT STOPS BEING TRUE. A screen that starts fetching brackets its
   * reads with `opened()` and `closed()`, and a call still out takes the attribute away whatever
   * this line says.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(copy.home)}</title></svelte:head>

<PageHead icon="home" kicker={data.index.name} title={today}>
  {#snippet actions()}
    <!-- AND NOTHING AT ALL WHEN THERE IS NOTHING TO DECIDE. This was unconditional, so a record
         with no open question printed `0 to decide` at the top of the screen named for what needs
         you, as a link to a page whose empty state is the same answer one navigation later.
         `USABILITY.md`'s second question is whether the product grows as the record grows, and a
         digest of nothing is its own example. `/decide` is still in the rail and still on `g d`, so
         nothing becomes unreachable: what goes is the count of nothing. -->
    {#if data.questions.length > 0}
      <a class="to-decide tap" href="/decide">
        <span class="to-decide-n num">{data.questions.length}</span>
        <span>to decide</span>
      </a>
    {/if}
  {/snippet}
</PageHead>

<!-- Two columns, not three stacked lists. What needs you is the reason the screen exists and gets
     the width; the figures and the activity are context and sit beside it. A single column of
     full-bleed groups gives every group the same weight, which is the same as giving none. -->
<div class="page">
  <div class="primary">
    <!--
      THE THREE FIGURES LEAD, AND THEY USED TO BE IN THE SIDEBAR.

      The comment below this one argued that What needs you is the reason the screen exists and so
      gets the width, and that the figures are context. Half of that is right. What it produced is
      a business record whose first screen leads with a date, and puts what the business is owed in
      a 340px column to the right of it at 24px, third in the reading order, and on a phone
      somewhere around the twelve hundredth pixel.

      A person opens this to find out where the money is. That is not context.

      So the strip is first and the strip is wide: three figures across the full column, the first
      of them at the top of the type scale. `What needs you` keeps everything else it had, and it
      is still the tallest thing on the screen, which is the honest way to say it matters: length,
      not position.
    -->
    <Section title={copy.rightNow}>
      <div class="strip">
        {#each strip as segment}
          {#if segment.type === 'block'}<Block block={segment} opts={stripOpts} />{:else if segment.type === 'degraded'}<Degraded {segment} />{/if}
        {/each}
      </div>
    </Section>

    <Section title={copy.needsYou}>
    <!--
      TWO NOTHINGS, AND THIS SCREEN COULD ONLY SAY ONE.

      `grep -c "<Empty"` on this file was 0. The one state it could draw was hand-rolled as a grey
      paragraph, OUTSIDE the component that exists to keep `19 §6`'s five apart — so an hour-old
      record, with nothing in any list, was told "Nothing needs you today", which is the sentence for
      a record you have worked through. It is the difference between finished and not started, on
      the first screen somebody lands on.

      `cleared` GETS NO ACTION, deliberately: there is nothing to do, which is the whole message.
      `no-data-yet` gets one, and it is the first-run path, because on a record holding nothing the
      thing to do is not "add an obligation" — it is to be shown what any of this is.
    -->
    {#if data.questions.length === 0 && shown.length === 0 && lapsing.length === 0}
      {@const anything = Object.values(ROWS).reduce((n, list) => n + list.length, 0) + data.questions.length}
      <Empty
        kind={anything === 0 ? 'no-data-yet' : 'cleared'}
        title={anything === 0 ? copy.recordEmpty : copy.nothingNeedsYou}
        body={anything === 0 ? copy.recordEmptyBody : undefined}
      >
        {#snippet actions()}
          {#if anything === 0}<Button weight="primary" href="/start">{copy.startHere}</Button>{/if}
        {/snippet}
      </Empty>
    {:else}
      <ul class="ledger">
        {#each data.questions as q}
          <li>
            <!--
              THREE ROW TYPES INTERLEAVE IN THIS ONE LIST: a question, a lapsing service and an
              obligation. A glyph per type says what each row IS before the eye reaches the words,
              which is what the id used to be doing badly.

              THE ID IS GONE FROM THE LEADING COLUMN, AND THE GLYPH IS WHY IT CAN BE. A friction
              pass counted ten opaque identifiers printed as the leftmost column of the screen whose
              whole job is "what needs me today": `SG34`, `SG31`, `services#2`, `obligations#20`.
              `SG` is expanded nowhere in the product, so a new person has no way to learn it, and
              seventy numbers on a screen that needs about three is what the pass measured this
              screen at.

              THE ARGUMENT THAT PUT IT THERE WAS ABOUT COLLISION: this is the one list that mixes
              registers, and a lapsing service and an overdue obligation both drew `#2`. That is a
              collision between two IDS, and it disappears with them. What tells the rows apart is
              the glyph and the sentence, which is what a reader was using anyway. The id has not
              gone anywhere: `y` copies it, the row's own screen prints it, and `/audit` still leads
              with it, because those are the three places somebody wants a number they can say.
            -->
            <a class="line line-tall" href="/decide/{q.id}">
              <span class="seq"><Icon name="decide" size="s" /></span>
              <span class="line-main">
                <span class="line-title">{q.title}</span>
                <span class="line-detail">{q.cost}</span>
                <!--
                  THE SCREEN SHOWS ITS ANSWER RATHER THAN ASKING, and it was only asking.

                  The record already carries a recommendation on one option of every open question,
                  and Home drew the question and the reason it matters and stopped there: a reader
                  scanning "what needs you" met four questions and no thinking, and had to open each
                  one to find that the record had already done it. The product this one is measured
                  against puts the recommendation on the row for exactly that reason.

                  IT IS NOT A SHORTCUT TO ANSWERING. The row is a link to the question's own screen,
                  where the reasoning and the other options are; there is no press here that
                  answers, so the recommendation costs a reader nothing and saves them an opening.
                  On `/decide`, where one press now answers, the mark is deliberately absent: it
                  would make rubber-stamping the machine the cheapest act on the screen.
                -->
                {#if q.options?.find((o) => o.recommended)}
                  <span class="line-pick">{copy.recommends} {q.options.find((o) => o.recommended)?.title}</span>
                {/if}
              </span>
              <span class="line-amount"></span>
              <span class="line-when">{since(q.opened, NOW)}</span>
            </a>
          </li>
        {/each}

        {#each lapsing as s}
          <li>
            <a class="line" href="/r/services/{s.seq}">
              <span class="seq"><Icon name="service" size="s" /></span>
              <span class="line-main">
                <span class="line-title">{s.fields.name} is lapsing</span>
              </span>
              <span class="line-amount"><Money minor={amountOf(s.fields.cost) ?? 0} currency={currencyOf(s.fields.cost) ?? ''} /></span>
              <span class="line-when" data-intent="bad">
                <span class="glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span>
                {relative(String(s.fields.renews), NOW)}
              </span>
            </a>
          </li>
        {/each}

        {#each shown as e}
          {@const late = days(e.fields.due) < 0}
          {@const owed = e.fields.direction === 'owed_to_me'}
          <li>
            <a class="line" href="/r/obligations/{e.seq}">
              <span class="seq"><Icon name="obligation" size="s" /></span>
              <span class="line-main">
                <span class="line-title">{e.fields.what}</span>
              </span>
              <span class="line-amount">
                <Money
                  minor={amountOf(e.fields.amount) ?? 0}
                  currency={currencyOf(e.fields.amount) ?? ''}
                  weight={owed ? 'strong' : 'normal'}
                />
              </span>
              <span class="line-when" data-intent={late ? 'bad' : undefined}>
                <!-- Colour never carries meaning alone, so the date that is red is also the date
                     that is glyphed. There is no API here that lets it be otherwise (13 §2.3). -->
                {#if late}<span class="glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span>{/if}
                {relative(String(e.fields.due), NOW)}
              </span>
            </a>
          </li>
        {/each}
      </ul>

      {#if hidden > 0}
        <a class="more" href="/r/obligations?f=state:in:open,part&f=due:before:today">
          {hidden} more past their date
          <Icon name="arrow" size="s" />
        </a>
      {/if}
      {/if}
    </Section>
  </div>

  <aside class="secondary">
    <Section title={copy.sinceAway} count={fresh.length}>
      {#snippet aside()}
        {#if fresh.length > 0}
          <button type="button" class="mark" onclick={markRead}>{copy.markAllRead}</button>
        {/if}
      {/snippet}
      <!-- NOTHING NEW IS A STATE, AND IT IS `cleared`. A feed that has been read is a feed you have
           worked through, which is the one empty state `19 §6` gives no action — there is nothing to
           do, and that is the message. -->
      {#if fresh.length === 0}
        <Empty kind="cleared" title={copy.nothingNew} />
      {:else}
      <ul class="feed">
        {#each fresh.slice(0, NEWS_CAP) as item}
          <li>
            <a class="event" href={item.href}>
              <!-- The agent that wrote it, named. Never a sparkle badge: across thirteen experiments
                   participants trusted people and organisations LESS when their use of AI was
                   disclosed, so the badge imposes the cost without buying anything (19 §6). -->
              <span class="event-by">{actorOf(item.by)}</span>
              <span class="event-text">{item.text}</span>
              <span class="event-when">{since(item.at, NOW)}</span>
            </a>
          </li>
        {/each}
      </ul>
      <!-- AND MORE IS A DOOR. The record's own `sinceCapped` said "and more" as a dead sentence: it
           tells you something is missing and gives you nowhere to go for it, on the one screen whose
           whole shape is "here is what happened". `19 §2` gives `/audit` that job, so the overflow
           points at it — and it now also fires for the rows this screen itself is not drawing, which
           the record's flag knew nothing about. -->
      {#if data.sinceCapped || fresh.length > NEWS_CAP}
        <a class="more" href="/audit">
          {data.sinceCapped ? copy.andMore : copy.moreInTheLog(fresh.length - NEWS_CAP)}
          <Icon name="arrow" size="s" />
        </a>
      {/if}
      {/if}
    </Section>
  </aside>
</div>

<style>
  /* A verb in a section head, not a button: it sits beside a heading and must not compete with the
     rows under it. Same shape as the `.more` link at the foot of the same section. */
  /* 70x18 ON A COARSE POINTER, on the one control that changes what the feed says. `13 §7` designs
     targets at 44 x 44 on BOTH axes, and `a11y.css` names the exact failure a height-only fix
     produces. The visible underline stays 18px tall; the target is the padding around it, which is
     what `.tap` does everywhere else in this product and what a text-styled button needs most. */
  .mark {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    min-inline-size: var(--ctl-h);
    justify-content: center;
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    color: var(--dim);
    font: inherit;
    font-size: var(--t-xs);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .mark:hover {
    color: var(--ink);
  }

  /* THE FIRST TRACK IS A GLYPH NOW, AND IT WAS SIXTEEN CHARACTERS OF ID. It held a qualified id,
     `obligations#12`, because this is the one list in the product that mixes registers and two rows
     from two lists both drew `#2`. Nothing carries the id here any more: the glyph tells the rows
     apart and the sentence beside it says which one this is, so sixteen characters of leading
     column become one drawing and the words start where the eye does.

     Scoped, and above 640px for the reason `/audit` and `/decide` carry the same guard: below it the
     row is a card, and a component `<style>` is unlayered and beats `@layer components`. */
  @media (width >= 640px) {
    .ledger :global(.line) {
      grid-template-columns: 2ch minmax(0, 1fr) auto 9ch;
    }
  }

  .page {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: var(--sp-8);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1360px;
  }

  .primary,
  .secondary {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
    min-inline-size: 0;
  }

  /**
   * THE FIGURE THE SCREEN LEADS WITH.
   *
   * `--t-3xl` is 34px, it has been in the token file since the token file was written, and until
   * this rule the app used it zero times. The largest type on any screen a person works in was
   * 24px, four occurrences, which is why the product reads like a settings pane: one size, a
   * little bold in it, and nothing that says look here first.
   *
   * ONE FIGURE AND NOT THREE. Three at 34px is three headlines, and a reader with three headlines
   * has none. The first cell is what the business is owed right now; the two beside it are the
   * shape of it, and they stay a step down.
   *
   * THE COLOUR IS STILL THE RECORD'S. `--tone` comes from the metric's own `tone`, and
   * `blocks.css` paints a figure only when the record calls it bad. Size is a fact about the
   * layout and a screen may decide it; whether a number is good news is a fact about the record
   * and this screen may not.
   */
  .strip :global(.cell:first-child .cell-figure) {
    font-size: var(--t-3xl);
    line-height: var(--lh-3xl);
    letter-spacing: var(--tr-tight);
    /* `GBP 28,320.00` is thirteen characters and needs about 230px at this size. An equal third
       of the column is 240px before padding, so it wrapped after the currency, which is the one
       thing a figure this size must not do: the reader sees GBP, a line break, and a number. */
    white-space: nowrap;
  }

  /* AND THE CELL IT SITS IN TAKES THE ROOM. Three equal thirds is the block's own default and it
     is the wrong split for a strip with a lead in it. */
  .strip :global(.grid) {
    grid-template-columns: 1.35fr 1fr 1fr;
  }

  .strip :global(.cell) {
    padding: var(--sp-5) var(--sp-4);
  }

  /* The activity feed is not a table. It has no columns worth aligning, so it gets a reading shape:
     who, what, when, on one line, with nothing drawn around it. */
  .feed {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .event {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px var(--sp-3);
    padding: var(--sp-3) 0;
    border-block-end: 1px solid var(--line);
    color: var(--ink2);
    font-size: var(--t-ui);
    text-decoration: none;
  }

  .feed li:last-child .event {
    border-block-end: 0;
  }

  .event:hover .event-text {
    color: var(--ink);
  }

  .event-by {
    grid-column: 1;
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .event-when {
    grid-column: 2;
    grid-row: 1;
    color: var(--dim);
    font-size: var(--t-xs);
    text-align: end;
    white-space: nowrap;
  }

  .event-text {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  /* The row shape is `$lib/ui/rows.css` — one contract, one file. Only what is Home's own is here.

     No margin rule per row, and that is a reversal: a leading edge is right when a FEW rows are
     marked and wrong when most of them are — eleven marked rows merge into one continuous stripe
     down the card, which reads as a rendering fault rather than as eleven warnings. The state lives
     in the date column instead: one place, one column, aligned. */

  .more {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
    color: var(--accent-text);
    font-size: var(--t-sm);
    text-decoration: none;
  }

  .to-decide {
    display: inline-flex;
    align-items: baseline;
    gap: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-sm);
    text-decoration: none;
  }

  .to-decide-n {
    color: var(--warn);
    font-size: var(--t-lg);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }

  /**
   * ONE COLUMN.
   *
   * The strip is already first, because it is first in the markup now rather than ordered here.
   * An earlier version of this rule put `display: contents` on the aside and moved its first
   * child with `order`, which worked and was the wrong shape: the reading order a phone gets is
   * the order the screen should have had all along, and expressing it in a media query left the
   * desktop with the old one and two layouts to keep in step.
   */
  @media (width < 1180px) {
    .page {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-7);
    }
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }
  }

  /**
   * AND ON A PHONE THE FIRST FIGURE TAKES THE WIDTH AND THE OTHER TWO SHARE THE LINE.
   *
   * Three across at 390px is three cells of about a hundred and ten pixels, and `GBP 28,320.00`
   * at 34px needs two hundred and thirty. The first cell spanning both tracks gives it three
   * hundred and fifty-eight, so the number the screen leads with is one line at full size on the
   * device most likely to be reading it, and the two that qualify it sit under it at a step down.
   *
   * A scroller was the other candidate and it is worse here: swiping is how you reach a fourth
   * thing, and this is the shape of one number with two beside it. Nothing should need reaching.
   */
  @media (width < 640px) {
    .strip :global(.grid) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .strip :global(.cell:first-child) {
      grid-column: 1 / -1;
      border-block-end: 1px solid var(--line);
    }

    /* The two below it come down a step so `GBP 26,690.00` stays on one line in half a phone. */
    .strip :global(.cell:not(:first-child) .cell-figure) {
      font-size: var(--t-lg);
      white-space: nowrap;
    }

    /* The divider between the pair, and none above the one that spans. `blocks.css` draws it on
       the inline start of every cell but the first, which on two rows puts one in mid-air. */
    .strip :global(.cell:nth-child(2)) {
      border-inline-start: 0;
    }
  }

</style>
