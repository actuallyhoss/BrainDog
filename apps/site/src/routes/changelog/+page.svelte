<!--
  The changelog, and it opens with the state of the product.

  14 §5 calls this "the single highest-leverage community artefact for a solo product: proof of
  life". Proof of life is only proof if it is true, so the first thing on the page is the status.

  IT SAID "NOTHING HAS SHIPPED YET" FOR SIX DAYS AFTER SOMETHING DID. The app has been deployed from
  this repository on every push since 2026-09-08, from two hostnames, and the newest entry under that
  sentence was dated 2026-09-03. A changelog that is stale is worse than no changelog: the artefact
  whose entire job is to prove the thing is alive was the best evidence on the site that it was not.

  Entries are the repository's own, dated, in its own words, and drawn from its commit subjects,
  which are already written as release notes. Each says what changed and, where the change was a
  reversal, what the earlier answer was and why it was wrong. That is the same rule the design
  documents follow and the reason they are worth reading.

  NO LINK TO A RELEASES PAGE. This repository tags and does not publish GitHub Releases, so a link
  to one would be a 404 with a promise attached.
-->
<script lang="ts">
  import { APP, SOURCE, site } from '$lib/copy.ts';

  type Entry = { date: string; title: string; body: string; kind: 'shipped' | 'changed' | 'fixed' };

  const STATUS = {
    title: 'The app is live. Nothing is for sale yet.',
    body:
      'The record app is deployed from this repository on every push, and you can open it and use ' +
      'it. It draws a synthetic record rather than yours: the kernel behind it is about a third ' +
      'built, and there is no sign-up, no billing and no release to install. The design is ' +
      'fifty-four documents, written before the code and still the only thing it is built from, ' +
      'and they open with the source. This page is what there is to read until then, and it is ' +
      'written the same way: what is built, what is not, and what is wrong with what is.',
  };

  const ENTRIES: Entry[] = [
    {
      date: '2026-09-10',
      kind: 'changed',
      title: 'Seventeen renames, and not one of them an id',
      body:
        'The product says the word a reader would say and the API keeps its own, which is the rule ' +
        'Slack follows: a channel is a channel for life while the API says conversations. Track ' +
        'became Thread, Estate became Services, Thing became Project, State became Status on five ' +
        'lists and on the board, and the word register itself came out of four places a reader ' +
        'meets it, three of them messages typed into routes rather than into the copy file, which ' +
        'is why a sweep of visible text could not see them. Nothing renamed is an id, a document ' +
        'or a format. The plan was wrong about seven of the seventeen, every time in the same ' +
        'direction: an occurrence it had missed rather than one it invented.',
    },
    {
      date: '2026-09-10',
      kind: 'fixed',
      title: 'A page made of figures named no register, and was handed to everybody',
      body:
        'A table block names the list it draws; a block of figures does not, because each of its ' +
        'cells names a measurement whose own declaration carries the list. Both the listing filter ' +
        'and the per-block blanking read the block alone, so a page of figures was treated as ' +
        'prose, offered to every caller and handed its readings over, including to a read token ' +
        'whose reach is one list. The money page the synthetic record ships is exactly that shape. ' +
        'Fifty-two requests on six routes answered 500 rather than a refusal, because every query ' +
        'value is JSON-decoded and the caller therefore chooses its shape as well as its contents.',
    },
    {
      date: '2026-09-10',
      kind: 'fixed',
      title: 'A sheet destroyed while open took the keyboard with it',
      body:
        'Overlays are a depth, and the shell only answers an unmodified key while that depth is ' +
        'zero. The count went up when a sheet opened and came back down in the same effect, which ' +
        'needs the component to still be alive, so a sheet that was destroyed while open never ' +
        'gave the lock back and every bare key in the product died for the rest of the session. ' +
        'Two clicks from the front page reach it. The audit log answers the question it is sent ' +
        'for now as well: the restore setting links to it with the words find the moment, and what ' +
        'arrived was a list filtered by person and by kind with no way to narrow by when at all.',
    },
    {
      date: '2026-09-10',
      kind: 'fixed',
      title: 'The two engines were asked the same questions and disagreed sixteen times',
      body:
        'A differential pass drove the typed kernel and the browser copy of it over the same ' +
        'shipped record: 336 measurements, 3,563 filter sentences, 38 searches, 16 cash walks and ' +
        '8 block declarations, comparing answers rather than reading source. Sixteen live ' +
        'disagreements, twelve of which the browser had right. A sum of sterling invoices declared ' +
        'in dollars was printed rather than refused. A stored moment compared against a date ' +
        'matched nothing while its negation matched everything. Seven of the eleven filters the ' +
        'shipped pages print were refused by the record that printed them, because a page prints ' +
        'its filter back using each column heading rather than each field id.',
    },
    {
      date: '2026-09-10',
      kind: 'fixed',
      title: 'A money average was stored ten thousand times too large',
      body:
        'One function took a value and nothing else, so any fractional figure became hundredths of ' +
        'a percent, while each of its three callers wrote the currency from a separate expression ' +
        'that correctly kept a real one. Two rows at 101 and 102 pounds read 101.5 and were ' +
        'written as 1,015,000, which every surface in this product renders as ten thousand pounds. ' +
        'The value and the currency are decided together now. Twenty-two findings in the same ' +
        'pass: a record twelve hours ahead of UTC stamped today on yesterday, a cash walk added a ' +
        'string as though it were money, and a caller allowed only to append to one list could ' +
        'read its rows through search.',
    },
    {
      date: '2026-09-10',
      kind: 'fixed',
      title: 'Eight controls that drew, announced themselves and did nothing',
      body:
        'Every segmented control dropped the value somebody chose: the form held it in one place ' +
        'and read it from another, so on nearly every form in the product a press was a drawing of ' +
        'a press, and a row added from the money list arrived with two required fields empty under ' +
        'a live submit button. The drawer added the row twice on one press. Opening a row you had ' +
        'just typed said it did not exist. The cell editor read the record rather than the screen, ' +
        'so a second edit of one cell opened on the original value and Enter reverted your own ' +
        'change. And the rail folded nothing, because hidden is a browser default and every ' +
        'section in it sets a display of its own.',
    },
    {
      date: '2026-09-09',
      kind: 'shipped',
      title: 'The app is deployed, from two hostnames and one build',
      body:
        'Every push to the main branch builds and deploys the record app; a second hostname takes ' +
        'the same two packages from a branch that only moves forward from a green build. The ' +
        'staging one wears its own accent, its own badge and its own word in the tab, because two ' +
        'windows of the same product open beside each other is the confusion the whole mechanism ' +
        'exists to prevent. All four halves of that mechanism had a paragraph beside them asserting ' +
        'they were whole, and none of them was connected: nothing defined the variable the accent ' +
        'hung on, one component was imported by no file but its own, and the stylesheet loaded the ' +
        'other deployment\'s palette on everybody\'s behalf.',
    },
    {
      date: '2026-09-09',
      kind: 'fixed',
      title: 'Four gates were asked what input would make them fire',
      body:
        'A gate that has never failed may not work. Each source gate was asked what input would ' +
        'produce its report and whether such an input reaches it, and the answers were 1 of 7, 3 of ' +
        '10, a check that could not see the file it was about, and the worst at 2 of 16. That last ' +
        'one could not see the function every refusal in the codebase is built by, and could not see ' +
        'a ternary, which was hiding a code that appears nowhere else in the tree.',
    },
    {
      date: '2026-09-09',
      kind: 'fixed',
      title: 'Six dependency advisories to zero',
      body:
        'Three packages moved off version ranges with known holes in them, and the audit reports ' +
        'nothing. Nothing published inside the last twenty-four hours installs here, because the ' +
        'newest version of anything is exactly what an attacker who has just taken a maintainer\'s ' +
        'account publishes. Taking the newest release that satisfies that policy is a decision. ' +
        'Taking the newest release is the absence of one.',
    },
    {
      date: '2026-09-08',
      kind: 'shipped',
      title: 'The empty record, which nothing had ever looked at',
      body:
        'The screen somebody sees the hour they install went six audits unmeasured, because two ' +
        'usability passes could not reach it in a browser and a verification pass recorded it as ' +
        'unreachable. It was telling them their finances were healthy, four green ticks over four ' +
        'zeroes, because zero is under every target. That was under 996 pixels of the same three ' +
        'sentences repeated four times, on a home screen reading "Nothing needs you today", which is ' +
        'the sentence for a record you have worked through.',
    },
    {
      date: '2026-09-08',
      kind: 'fixed',
      title: 'No list renders more than it admits to',
      body:
        'On 2,614 rows the first paint was 4,001 rows and 102,681 nodes, and eight seconds to ' +
        'settle. Every list drew every row it held, and "one body at a time" was enforced with a ' +
        'display rule, which hides one body and builds both. It is 201 rows and 3,137 nodes now, ' +
        'paging to the cap as you scroll, with the head reading 200+ of 2,614 while it does.',
    },
    {
      date: '2026-09-08',
      kind: 'fixed',
      title: 'The module that decides who can see your business had no test',
      body:
        'One function is what every call checks, one method is behind grant, raise, lower and ' +
        'remove, and a last-owner check in three places prevents a state nobody inside the product ' +
        'can get out of. Nothing anywhere exercised any of it, on a module that has already shipped ' +
        'two authorisation defects in opposite directions. Twenty-five mutations are caught now, and ' +
        'one of them found a last-owner guard that could never fire, because the check above it had ' +
        'already refused every case that reached it.',
    },
    {
      date: '2026-09-08',
      kind: 'shipped',
      title: 'Somewhere to type the code every machine prints',
      body:
        'Four documents make one settings area the address a signing-in machine sends you to, and ' +
        'that area had a read-only list with no input in it at all, under an Approve button whose ' +
        'own message mentioned a six-digit code no control on the page could accept. Two of the six ' +
        'states the schema defines had no word either, including the one a request sits in between ' +
        'your click and the machine noticing.',
    },
    {
      date: '2026-09-07',
      kind: 'changed',
      title: 'Usability is a lens every iteration, not a phase',
      body:
        'Twelve settings screens called themselves a mock-up, and seven of them said the same ' +
        'sentence, which was about the build rather than about the setting. A phone read a money ' +
        'page through a 356-pixel window onto a 450-pixel table. Every route is measured on a phone ' +
        'by a gate now rather than by hand: no clipping, no sideways scroll, and no target under 44 ' +
        'pixels under a thumb.',
    },
    {
      date: '2026-09-06',
      kind: 'shipped',
      title: 'A record can create itself, and says who wrote it',
      body:
        'Nothing in this repository could make a new record until this week. It can now, with the ' +
        'key hierarchy a record was previously created without, and a record file records which ' +
        'build wrote it and refuses to open if it does not say.',
    },
    {
      date: '2026-09-05',
      kind: 'shipped',
      title: 'The backend, from the schema up',
      body:
        'Fourteen iterations: the schema and the ledger that keeps it honest, then the sixteen types ' +
        'in and out, then the write path, which is the only thing that changes a record. Then who ' +
        'may ask what, in one place. Then search, the vault, rules, the outbox, and the file a ' +
        'customer can take with them.',
    },
    {
      date: '2026-09-04',
      kind: 'shipped',
      title: 'Order and span, and a page that is about one project',
      body:
        'Arranging a page is two operations and no more. The block picker draws every tile rather ' +
        'than naming it. A page can be pointed at one project, a session can be pinned to a track, ' +
        'and the money page walks the runway to the first day the balance goes under and names the ' +
        'row that crosses it.',
    },
    {
      date: '2026-09-04',
      kind: 'shipped',
      title: 'brain.dog, which is this site',
      body:
        'Prerendered, every page finished HTML on disk, and readable with scripting off. It imports ' +
        'the record app\'s design system rather than resembling it, so a token that changes there ' +
        'changes here.',
    },
    {
      date: '2026-09-03',
      kind: 'changed',
      title: 'One skin, because there are two apps now',
      body:
        'The token layer, the element defaults, the accessibility layer, the generated palette and the mark ' +
        'moved into a package both apps import. A second copy of a type scale is a type scale that drifts, ' +
        'and this site is not a different brand with a similar palette. It is the same system with fewer ' +
        'screens. The mark became data at the same time: it lived in three files, and a brand in three files ' +
        'is a brand two files behind.',
    },
    {
      date: '2026-09-03',
      kind: 'shipped',
      title: 'The new-row form is generated from the declaration',
      body:
        'A register declares its fields and their types, so the field type picks the control. One table, ' +
        'no hand-written form for any register. A pack that adds a field gets a form field. A secret ' +
        'field is absent rather than disabled: a credential never goes in a row.',
    },
    {
      date: '2026-09-03',
      kind: 'shipped',
      title: 'The toast stack, and the undo that is the reason for it',
      body:
        'A destructive action here is undone, not confirmed. A confirmation dialog asks its question before ' +
        'anything has happened, when the reader knows the least they ever will, and the answer is always ' +
        'yes, which is why people stop reading them. Ten seconds, paused while the pointer is over it.',
    },
    {
      date: '2026-09-03',
      kind: 'changed',
      title: 'The red is a third quieter, and it is the accent again',
      body:
        'The first house red was the most saturated red sRGB has at that lightness. Across a rail, a primary ' +
        'button, every link and every selected row it did not read as a brand; it read as an alarm going off ' +
        'on a screen where nothing was wrong. Same hue, a third less chroma. The old value did not go away. ' +
        'It is the band the overdue chip is struck from, so the alarm is always a step louder than the brand.',
    },
    {
      date: '2026-09-03',
      kind: 'fixed',
      title: 'A link and an overdue figure were the same colour',
      body:
        'The accent and the overdue red share a hue by construction and were being solved against the same ' +
        'ground, so in the light scheme they landed one value apart. The generator now solves the link last ' +
        'and walks until it is eight L* clear of body ink AND of the overdue red; the validator measures ' +
        'both pairs.',
    },
    {
      date: '2026-09-03',
      kind: 'shipped',
      title: 'The theme generator, and a palette that had to argue for itself',
      body:
        'Themes are generated by solving for contrast rather than picking lightness, so most of the sixteen ' +
        'accessibility checks become tautologies and only the ones arithmetic cannot drive can fail: separability ' +
        'under simulated colour blindness, ladder monotonicity. A theme that fails is refused, ' +
        'naming the pair and what to move.',
    },
    {
      date: '2026-09-02',
      kind: 'shipped',
      title: 'The design set closed, after an adversarial review changed it',
      body:
        'Four reviewers audited internal consistency, feasibility, usability and the thesis. The two largest ' +
        'findings are in the documents where they landed: the roadmap was roughly three times optimistic, and ' +
        'the index model would have failed at the twelfth installed pack. Every correction says what an ' +
        'earlier draft claimed and why it was wrong, because a design document that quietly fixes itself ' +
        'teaches nobody.',
    },
  ];

  const LABEL = { shipped: 'shipped', changed: 'changed', fixed: 'fixed' } as const;

  /**
   * GROUPED BY DAY, because twenty-two identical rows are not a list a person reads.
   *
   * Every entry carried its own date in its own 14ch gutter, and six of them say 2026-09-10. So
   * the column that exists to tell you WHEN was printing the same string six times in a row down
   * the left edge, and the page had no unit larger than one paragraph: no way to see that a day
   * happened, no way to skim to a day, nothing between the heading and five thousand words.
   *
   * The entries are already in date order in the array above and this preserves that order
   * exactly rather than sorting: the order is editorial, most-important-first inside a day, and a
   * sort by date would silently reshuffle it.
   */
  const DAYS: { date: string; entries: Entry[] }[] = [];
  for (const entry of ENTRIES) {
    const last = DAYS.at(-1);
    if (last?.date === entry.date) last.entries.push(entry);
    else DAYS.push({ date: entry.date, entries: [entry] });
  }
</script>

<svelte:head>
  <!-- ITS OWN SENTENCE, in `copy.ts`. The description was `STATUS.body` at 522 characters, which
       a search result and a shared card both cut mid-paragraph. -->
  <title>{site.meta.changelog.title}</title>
  <meta name="description" content={site.meta.changelog.description} />
  <!-- THE CANONICAL AND THE PREVIEW, from the same two sentences the page already has, so there is
       one description per page rather than two that can disagree. The canonical matters because
       `www` 301s here and a preview fetcher that followed the redirect would otherwise cite the
       hostname it started from. -->
  <link rel="canonical" href="https://brain.dog/changelog" />
  <meta property="og:url" content="https://brain.dog/changelog" />
  <meta property="og:title" content={site.meta.changelog.title} />
  <meta property="og:description" content={site.meta.changelog.description} />
</svelte:head>

<section class="head">
  <h1 class="title">{site.nav.changelog}</h1>
  <div class="status">
    <h2 class="status-title">{STATUS.title}</h2>
    <p class="status-body">{STATUS.body}</p>
    <!-- ONE LINK WHILE THE REPOSITORY IS PRIVATE, and it was two. The second offered the source as
         the check on the sentence above it, and answered 404: the only outbound action in the block
         whose entire subject is that its claims are checkable. -->
    <p class="status-links">
      <a class="status-link" href={APP}>{site.nav.open}</a>
      {#if SOURCE}<a class="status-link" href={SOURCE}>{site.nav.source}</a>{/if}
    </p>
  </div>
</section>

<div class="log">
  {#each DAYS as day}
    <section class="day">
      <!-- A machine-readable date beside a human one. The `datetime` is what a feed reader and a
           search engine read; the text is what a person reads, and they are the same day. It is
           a heading now rather than a caption, because it is what the entries under it belong
           to, and it holds its place at the top of the window while they scroll past. -->
      <h2 class="day-date"><time class="num" datetime={day.date}>{day.date}</time></h2>
      <ol class="entries">
        {#each day.entries as entry}
          <li class="entry">
            <h3 class="entry-title">
              <span class="kind" data-kind={entry.kind}>{LABEL[entry.kind]}</span>{entry.title}
            </h3>
            <p class="entry-body">{entry.body}</p>
          </li>
        {/each}
      </ol>
    </section>
  {/each}
</div>

<style>
  .head,
  .log {
    max-inline-size: 900px;
    margin-inline: auto;
    padding-inline: var(--sp-5);
  }

  .head {
    padding-block: var(--sp-8) var(--sp-6);
  }

  .title {
    font-size: clamp(34px, 5vw, 52px);
    letter-spacing: -0.03em;
  }

  .status {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
    margin-block-start: var(--sp-5);
    padding: var(--sp-5);
    background: var(--s1);
    border: 1px solid var(--line);
    border-inline-start: 3px solid var(--warn);
    border-radius: var(--r-md);
  }

  .status-title {
    font-size: var(--t-lg);
    letter-spacing: -0.018em;
  }

  .status-body {
    max-inline-size: 66ch;
    color: var(--ink2);
    font-size: var(--t-ui);
    line-height: 1.6;
    text-wrap: pretty;
  }

  .status-links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-5);
  }

  /* 48x23 beside a status line. Small because it reads as an aside, and it is still a link
     somebody presses with a thumb. */
  .status-link {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap, 44px);
    font-size: var(--t-ui);
    font-weight: 600;
  }

  /**
   * `margin-block`, NOT `margin`.
   *
   * The rule above gives `.head, .log` a 900px measure and `margin-inline: auto` to centre it, and
   * this block then set `margin: 0` at the same specificity and later in the file, so the shorthand
   * reset the inline margins the rule above had just set. The heading was centred in the viewport
   * and the entries under it were flush against the left edge: on a 1440px window the dates sat 245
   * pixels to the left of the title they belonged to, on a page whose entire content is that one
   * column. The list has been off-axis since the page was written.
   */
  .log {
    /* The page's own bottom, now the shell no longer puts 96 pixels over the footer on every page
       regardless of what is above it. */
    padding-block-end: var(--sp-8);
  }

  .day {
    display: grid;
    grid-template-columns: 14ch minmax(0, 1fr);
    gap: var(--sp-5);
    padding-block: var(--sp-6);
    border-block-start: 1px solid var(--line);
  }

  /**
   * THE DATE HOLDS ITS PLACE WHILE ITS OWN ENTRIES GO PAST.
   *
   * Six entries share 2026-09-10, so the gutter printed one string six times and then stopped
   * saying anything at all. One heading per day, stuck under the bar, and by the time you are
   * four paragraphs into a day you can still see which day it is. `--sticky` is the token the
   * base stylesheet already reserves for exactly this height, and `scroll-padding` upstream
   * means a keyboard user landing on an entry does not land under the bar either.
   */
  .day-date {
    position: sticky;
    inset-block-start: calc(var(--sticky) + var(--sp-3));
    align-self: start;
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    font-weight: 400;
    letter-spacing: 0;
  }

  .entries {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    margin: 0;
    padding-inline: 0;
    list-style: none;
  }

  /* A tag, not a pill, and the same four-pixel corner every control in the product has. It sits
     on the title's own line now: it is what KIND of change the title describes, and a badge in a
     column two inches away from the sentence it qualifies is a badge nobody reads. */
  .kind {
    display: inline-block;
    margin-inline-end: var(--sp-3);
    padding: 2px 7px;
    background: color-mix(in srgb, var(--ink) 7%, transparent);
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 600;
    letter-spacing: 0;
    vertical-align: 0.14em;
  }

  .kind[data-kind='shipped'] {
    background: color-mix(in srgb, var(--earn) 12%, transparent);
    border-color: color-mix(in srgb, var(--earn) 28%, transparent);
    color: var(--earn);
  }

  .kind[data-kind='fixed'] {
    background: color-mix(in srgb, var(--info) 12%, transparent);
    border-color: color-mix(in srgb, var(--info) 28%, transparent);
    color: var(--info);
  }

  /* THE THIRD KIND HAD NO COLOUR AND THE OTHER TWO DID. `shipped` was green and `fixed` was blue,
     so a reader scanning the page learned that colour means something and then met a grey badge
     that means the third thing. `--warn` is the watch role and a change that is neither new work
     nor a repair is exactly that: something to notice. */
  .kind[data-kind='changed'] {
    background: color-mix(in srgb, var(--warn) 14%, transparent);
    border-color: color-mix(in srgb, var(--warn) 30%, transparent);
    color: var(--warn);
  }

  .entry-title {
    font-size: var(--t-lg);
    letter-spacing: -0.018em;
    text-wrap: pretty;
  }

  .entry-body {
    margin-block-start: var(--sp-3);
    max-inline-size: 74ch;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.7;
    text-wrap: pretty;
  }

  @media (width < 760px) {
    .day {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-4);
      padding-block: var(--sp-5);
    }

    /* Not sticky on a phone: a date pinned under the bar on a 390px screen is a line of the
       reading area spent on a string the reader can scroll back four inches to find. */
    .day-date {
      position: static;
    }

    .head,
    .log {
      padding-inline: var(--sp-4);
    }
  }
</style>
