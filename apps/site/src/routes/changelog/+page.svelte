<!--
  The changelog, and it opens with the state of the product.

  14 §5 calls this "the single highest-leverage community artefact for a solo product: proof of
  life". Proof of life is only proof if it is true, so the first thing on the page is the status.

  IT SAID "NOTHING HAS SHIPPED YET" FOR SIX DAYS AFTER SOMETHING DID. The app has been deployed from
  this repository on every push since 2026-09-08, from two hostnames, and the newest entry under that
  sentence was dated 2026-09-03. A changelog that is stale is worse than no changelog: the artefact
  whose entire job is to prove the thing is alive was the best evidence on the site that it was not.

  Entries are the repository's own, dated, in its own words, and drawn from its commit subjects,
  which are already written as release notes.

  THE TITLE IS THE ENTRY AND THE BODY IS THE EVIDENCE, at most three sentences of it. Measured on
  the built page, this page was 4,458 words against 389 for the home page and 131 for pricing: 87
  per cent of every word on brain.dog, all 75 of its sentences over 25 words, and a Flesch-Kincaid
  grade of 10.2. A stranger who opens a changelog is skimming for what shipped, and thirty-eight
  paragraphs averaging 103 words, the longest of them 238, is the wall of text he has rejected
  twice. The bodies now carry the number that was measured and stop: 1,893 words on the page, 36
  words to a body, a grade of 6.4, and no sentence over 25 words. Nothing was deleted from the
  history. Every entry, every date and every kind is still here.

  WHERE THE CUT WORDS WENT. Each body kept the fact and dropped the argument for it, because the
  argument is in the design documents and in the commit, where somebody who wants it will look. A
  reversal's earlier answer is one of those: worth a paragraph in a design document, not worth a
  paragraph on a page whose job is proof of life.

  NO LINK TO A RELEASES PAGE. This repository tags and does not publish GitHub Releases, so a link
  to one would be a 404 with a promise attached.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import type { Hue } from '$lib/icons.ts';
  import { APP, SOURCE, site } from '$lib/copy.ts';

  type Entry = { date: string; title: string; body: string; kind: 'shipped' | 'changed' | 'fixed' };

  const STATUS = {
    title: 'The app is live. Nothing is for sale yet.',
    /* TWO SENTENCES, AND IT WAS NINE, THEN THREE. The third said what this page is for, which the
       heading and the lede above it have already said twice. Measured on the built page: 50 words
       to 31. */
    /**
     * `For now it draws a made-up record` WAS FALSE, AND IT CONTRADICTED TWO OTHER PAGES OF THIS
     * SAME SITE.
     *
     * `loop/research-site-copy.md` settles it: `DEMO_RECORD` is empty in both environments
     * (`apps/worker/wrangler.jsonc:270` and the equivalent production line), so
     * `apps/worker/src/route.ts` never opens its anonymous-read door. That is the exact fact
     * `copy.ts` already cites on the home page to justify saying *there is no demo to open yet*,
     * and on the pricing page to say neither plan is open. This page was the one that had not been
     * brought along, so a reader who opened the app from here expected a populated demo and got
     * nothing to look at.
     *
     * It says the state instead, which is also the more interesting sentence: signing in works on
     * both hosts and there is nothing behind it yet (the 2026-09-16 entry below says so in its own
     * words), which is a real thing to know about a product that ships in slices.
     */
    body:
      'The record app deploys from this repository on every green build, and you can open it. ' +
      'Signing in works; there is no sign-up, no billing, and no record to look at yet.',
  };

  const ENTRIES: Entry[] = [
    {
      date: '2026-09-16',
      kind: 'shipped',
      title: 'Signing in works, and there is still nothing to sign in to',
      body:
        'The one secret sessions are built on is set on production, so passkeys and first run ' +
        'work. No record can be made yet, and a record is made by the operator rather than by a ' +
        'visitor.',
    },
    {
      date: '2026-09-16',
      kind: 'changed',
      title: 'The status report said the writing had not started, and six modules of it had landed',
      body:
        'The row for the app writing anything down read nothing started. Six write ' +
        'modules and their tests were already in the tree. The row is a count now: of 52 ' +
        'gestures that say nothing was saved, 15 still want a write path.',
    },
    {
      date: '2026-09-16',
      kind: 'shipped',
      title: 'A page is a file you can pull, edit and push back',
      body:
        'A .dog file is one page\'s source, and a .brain holds the whole record. The command ' +
        'line pulls a page, checks it against the grammar and pushes it back. A file carrying ' +
        'typed rows is refused, because the printed form keeps only how many there were.',
    },
    {
      date: '2026-09-16',
      kind: 'changed',
      title: 'The rail collapses to its glyphs instead of being taken away',
      body:
        'Collapsing used to remove every row and leave one button in an empty gutter. The rail ' +
        'narrows to its glyphs now, and each glyph hands its name back on hover and on focus. A ' +
        'top bar and a menu are shapes you can ask for.',
    },
    {
      date: '2026-09-16',
      kind: 'shipped',
      title: 'The record switcher lists every record you can reach',
      body:
        'It held the one record you were already inside. The directory is asked which records ' +
        'are open to you, then each of those records is asked about itself. A row is kept only ' +
        'where the record itself answers with a level.',
    },
    {
      date: '2026-09-16',
      kind: 'shipped',
      title: 'A row is edited a field at a time, and what points at it is read from the record',
      body:
        'Each field writes through on its own, rather than the whole row or nothing. What points ' +
        'at a row is read from the record too. A key goes into the vault from the browser now.',
    },
    {
      date: '2026-09-16',
      kind: 'changed',
      title: 'A saved view is a row the record holds, not a URL',
      body:
        'A view was a filter sitting in an address, lost when the tab closed. It is a row on a ' +
        'list now, with its filter, search, order, columns and who saved it. Saving one is an ' +
        'owner-level act, because everyone sees the list.',
    },
    {
      date: '2026-09-16',
      kind: 'fixed',
      title: 'The first row you type is written down, instead of being told it went nowhere',
      body:
        'The button that commits your first row had no live path at all: it printed that nothing ' +
        'was saved. On a record the row is written now, and pressing again corrects it rather ' +
        'than leaving a second one behind.',
    },
    {
      date: '2026-09-16',
      kind: 'shipped',
      title: 'The app deploys itself, and a gate checks that the deploy landed',
      body:
        'A pipeline deploys the commit the checks measured, once they finish, and queues rather ' +
        'than cancels. A gate then asks the running server which version it believes it is. This ' +
        'site is meant to follow in the same run and can be a day behind.',
    },
    {
      date: '2026-09-16',
      kind: 'fixed',
      title: 'Three screens drew invented rows under your own heading',
      body:
        'All three drew the built-in demo whatever record was open, with nothing saying so. The ' +
        'thread view asks the record now. The other two have no way to read at all, and each ' +
        'says so rather than inventing rows.',
    },
    {
      date: '2026-09-15',
      kind: 'shipped',
      title: 'The app writes to a real record, and most of its screens read one',
      body:
        'Until this week every screen drew a made-up business. Nine screens read the record now, ' +
        'and the app writes to it: rows, cells, states, decisions, arrivals, cards, levels, ' +
        'tokens and packs. Archiving offers an undo rather than a confirmation.',
    },
    {
      date: '2026-09-14',
      kind: 'changed',
      title: 'Everything is a module, and the first question is who are you',
      body:
        'On the owner\'s instruction: every module can be turned off and on again, People ' +
        'included. Setting up a record asks who you are first, and fills the first person in ' +
        'People with the answer.',
    },
    {
      date: '2026-09-11',
      kind: 'shipped',
      title: 'Agents reach the record, and a session can ask where it stands',
      body:
        'An agent gets the same typed surface a person does, over MCP, from the command line and ' +
        'from both hosts. One call returns its run, its project, the last handoff and what is ' +
        'waiting on the owner.',
    },
    {
      date: '2026-09-10',
      kind: 'changed',
      title: 'Seventeen renames, and not one of them an id',
      body:
        'The product says the word a reader would say and the API keeps its own. Track became ' +
        'Thread, Estate became Services, Thing became Project, State became Status. Nothing ' +
        'renamed is an id, a document or a format.',
    },
    {
      date: '2026-09-10',
      kind: 'fixed',
      title: 'A page made of figures named no register, and was handed to everybody',
      body:
        'A table block names the list it draws and a block of figures does not, so a page of ' +
        'figures was treated as prose. It was handed to every caller, including a read token ' +
        'whose reach is one list. Fifty-two requests on six routes answered 500 rather than a ' +
        'refusal.',
    },
    {
      date: '2026-09-10',
      kind: 'fixed',
      title: 'A sheet destroyed while open took the keyboard with it',
      body:
        'A sheet destroyed while open never gave the keyboard lock back, so every bare key in ' +
        'the product died for the rest of the session. Two clicks from the front page reach it. ' +
        'The audit log can be narrowed by when as well now.',
    },
    {
      date: '2026-09-10',
      kind: 'fixed',
      title: 'The two engines were asked the same questions and disagreed sixteen times',
      body:
        'Both engines were driven over the same record: 336 measurements, 3,563 filter ' +
        'sentences, 38 searches, 16 cash walks. Sixteen live disagreements, twelve of which the ' +
        'browser had right. A sum of sterling invoices declared in dollars was printed rather ' +
        'than refused.',
    },
    {
      date: '2026-09-10',
      kind: 'fixed',
      title: 'A money average was stored ten thousand times too large',
      body:
        'Two rows at 101 and 102 pounds averaged to 101.5 and were written as 1,015,000, which ' +
        'every surface renders as ten thousand pounds. The value and the currency are decided ' +
        'together now. Twenty-two findings in the same pass.',
    },
    {
      date: '2026-09-10',
      kind: 'fixed',
      title: 'Eight controls that drew, announced themselves and did nothing',
      body:
        'Every segmented control dropped the value you chose: the form held it in one place and ' +
        'read it from another. The drawer added the row twice on one press. A second edit of a ' +
        'cell opened on the original value, and the rail folded nothing.',
    },
    {
      date: '2026-09-09',
      kind: 'shipped',
      title: 'The app is deployed, from two hostnames and one build',
      body:
        'Every push to the main branch builds and deploys the record app. A second hostname ' +
        'takes the same build from a branch that only moves forward, and wears its own accent, ' +
        'badge and word in the tab.',
    },
    {
      date: '2026-09-09',
      kind: 'fixed',
      title: 'Four gates were asked what input would make them fire',
      body:
        'A gate that has never failed may not work. Each source gate was asked what input would ' +
        'make it fire. The answers were 1 of 7, 3 of 10, a check blind to its own file, and 2 ' +
        'of 16.',
    },
    {
      date: '2026-09-09',
      kind: 'fixed',
      title: 'Six dependency advisories to zero',
      body:
        'Three packages moved off version ranges with known holes, and the audit reports ' +
        'nothing. Nothing published inside the last twenty-four hours installs here.',
    },
    {
      date: '2026-09-08',
      kind: 'shipped',
      title: 'The empty record, which nothing had ever looked at',
      body:
        'The screen somebody sees the hour they install went six audits unmeasured. It called ' +
        'their finances healthy, four green ticks over four zeroes, under 996 pixels of the same ' +
        'three sentences repeated four times.',
    },
    {
      date: '2026-09-08',
      kind: 'fixed',
      title: 'No list renders more than it admits to',
      body:
        'On 2,614 rows the first paint was 4,001 rows and 102,681 nodes, and eight seconds to ' +
        'settle. It is 201 rows and 3,137 nodes now, paging to the cap as you scroll.',
    },
    {
      date: '2026-09-08',
      kind: 'fixed',
      title: 'The module that decides who can see your business had no test',
      body:
        'Nothing anywhere exercised the module every call checks, and it had already shipped two ' +
        'authorisation defects. Twenty-five mutations are caught now, and one found a last-owner ' +
        'guard that could never fire.',
    },
    {
      date: '2026-09-08',
      kind: 'shipped',
      title: 'Somewhere to type the code every machine prints',
      body:
        'The settings area a signing-in machine sends you to had no input in it at all. Its ' +
        'Approve button asked for a six-digit code no control on the page could take.',
    },
    {
      date: '2026-09-07',
      kind: 'changed',
      title: 'Usability is a lens every iteration, not a phase',
      body:
        'Twelve settings screens called themselves a mock-up, and a phone read a money page ' +
        'through a 356-pixel window onto a 450-pixel table. A gate measures every route on a ' +
        'phone now: no clipping, no sideways scroll, no target under 44 pixels.',
    },
    {
      date: '2026-09-06',
      kind: 'shipped',
      title: 'A record can create itself, and says who wrote it',
      body:
        'Nothing in this repository could make a new record until this week. A record file ' +
        'records which build wrote it, and refuses to open if it does not say.',
    },
    {
      date: '2026-09-05',
      kind: 'shipped',
      title: 'The backend, from the schema up',
      body:
        'Fourteen iterations: the schema, the ledger, the sixteen types, the write path, who may ' +
        'ask what, search, the vault, rules and the export.',
    },
    {
      date: '2026-09-04',
      kind: 'shipped',
      title: 'Order and span, and a page that is about one project',
      body:
        'Arranging a page is two operations and no more. The money page walks the runway to the ' +
        'first day the balance goes under, and names the row that crosses it.',
    },
    {
      date: '2026-09-04',
      kind: 'shipped',
      title: 'brain.dog, which is this site',
      body:
        'Prerendered, every page finished HTML on disk, and readable with scripting off. It ' +
        'imports the record app\'s design system rather than resembling it.',
    },
    {
      date: '2026-09-03',
      kind: 'changed',
      title: 'One skin, because there are two apps now',
      body:
        'Tokens, element defaults, the accessibility layer, the palette and the mark moved into ' +
        'one package both apps import. A second copy of a type scale is a type scale that ' +
        'drifts.',
    },
    {
      date: '2026-09-03',
      kind: 'shipped',
      title: 'The new-row form is generated from the declaration',
      body:
        'A register declares its fields, so the field type picks the control. A pack that adds a ' +
        'field gets a form field, and a secret field is absent rather than disabled.',
    },
    {
      date: '2026-09-03',
      kind: 'shipped',
      title: 'The toast stack, and the undo that is the reason for it',
      body:
        'A destructive action here is undone, not confirmed. A confirmation asks its question ' +
        'when the reader knows the least they ever will. Ten seconds, paused under the pointer.',
    },
    {
      date: '2026-09-03',
      kind: 'changed',
      title: 'The red is a third quieter, and it is the accent again',
      body:
        'The first house red read as an alarm going off on a screen where nothing was wrong. ' +
        'Same hue, a third less chroma. The old value is the band the overdue chip is struck ' +
        'from.',
    },
    {
      date: '2026-09-03',
      kind: 'fixed',
      title: 'A link and an overdue figure were the same colour',
      body:
        'The accent and the overdue red share a hue, and in the light scheme they landed one ' +
        'value apart. The generator walks the link until it is eight L* clear of body ink and of ' +
        'the overdue red.',
    },
    {
      date: '2026-09-03',
      kind: 'shipped',
      title: 'The theme generator, and a palette that had to argue for itself',
      body:
        'Themes are generated by solving for contrast rather than picking lightness, so most of ' +
        'the sixteen accessibility checks become tautologies. A theme that fails is refused, ' +
        'naming the pair and what to move.',
    },
    {
      date: '2026-09-02',
      kind: 'shipped',
      title: 'The design set closed, after an adversarial review changed it',
      body:
        'Four reviewers audited consistency, feasibility, usability and the thesis. The roadmap ' +
        'was roughly three times optimistic, and the index model would have failed at the ' +
        'twelfth installed pack.',
    },
  ];

  const LABEL = { shipped: 'shipped', changed: 'changed', fixed: 'fixed' } as const;

  /* The word is the meaning and the hue agrees with it: green for new work, blue for a repair, amber
     for a change of course. Three kinds and three hues, so the colour a reader learns from the first
     two is never contradicted by a grey third. */
  const HUE: Record<Entry['kind'], Hue> = { shipped: 'earn', fixed: 'info', changed: 'warn' };

  /**
   * GROUPED BY DAY, because twenty-two identical rows are not a list a person reads.
   *
   * Every entry carried its own date in its own 14ch gutter, and six of them say 2026-09-10. So
   * the column that exists to tell you WHEN was printing the same string six times in a row down
   * the left edge, and the page had no unit larger than one paragraph: no way to see that a day
   * happened, no way to skim to a day, nothing between the heading and the whole log.
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

  /** How many of each kind, counted from the list above so the numbers cannot drift from it. */
  const KINDS = ['shipped', 'fixed', 'changed'] as const;
  const COUNT: Record<Entry['kind'], number> = { shipped: 0, changed: 0, fixed: 0 };
  for (const entry of ENTRIES) COUNT[entry.kind] += 1;
</script>

<svelte:head>
  <!-- ITS OWN SENTENCE, in copy.ts. The description was STATUS.body at 522 characters, which a
       search result and a shared card both cut mid-paragraph. -->
  <title>{site.meta.changelog.title}</title>
  <meta name="description" content={site.meta.changelog.description} />
  <link rel="canonical" href="https://brain.dog/changelog" />
  <meta property="og:url" content="https://brain.dog/changelog" />
  <meta property="og:title" content={site.meta.changelog.title} />
  <meta property="og:description" content={site.meta.changelog.description} />
</svelte:head>

<!-- THE HEAD GETS ITS OWN GROUND, which is the same move the home and pricing pages make and for
     the same measured reason: with one surface for the whole document, nothing tells a reader
     where the standing state of the product stops and the history starts. Here the split is
     already in the content (one block about now, then eighteen days about the past), so it costs
     one attribute. -->
<section class="band" data-ground="sunk">
  <div class="head">
    <p class="band-mark">
      <span class="band-seq">0001</span>
      <span class="band-rule"></span>
      <span class="band-tag">Where it stands</span>
    </p>
    <h1 class="title">{site.nav.changelog}</h1>
  <p class="lede">{site.changelog.lede}</p>
  <!-- THE COUNTS ARE COUNTED, from the list below, so they cannot drift from it. -->
  <p class="counts">
    <span class="count-all">{site.changelog.count(ENTRIES.length, DAYS.length)}</span>
    {#each KINDS as kind}
      <span class="kind" data-hue={HUE[kind]}><span class="dot"></span>{COUNT[kind]} {LABEL[kind]}</span>
    {/each}
  </p>

  <div class="status">
    <div class="status-copy">
      <h2 class="status-title"><span class="live" aria-hidden="true"></span>{STATUS.title}</h2>
      <p class="status-body">{STATUS.body}</p>
      <!-- ONE ACTION WHILE THE REPOSITORY IS PRIVATE, and it is this page's filled primary: the
           status says the app is live, and this is how you see that it is. -->
      <p class="status-links">
        <a class="btn btn-primary" href={APP}>{site.nav.open}<Icon name="arrow" size="s" /></a>
        {#if SOURCE}<a class="btn" href={SOURCE}>{site.nav.source}</a>{/if}
      </p>
      </div>
    </div>
  </div>
</section>

<div class="band" data-ground="page">
  <div class="log">
    {#each DAYS as day}
    <section class="day">
      <!-- A machine-readable date beside a human one, as a heading, because it is what the entries
           under it belong to, and it holds its place while they scroll past. -->
      <h2 class="day-date"><time class="num" datetime={day.date}>{day.date}</time></h2>
      <ol class="entries">
        {#each day.entries as entry}
          <li class="entry" data-hue={HUE[entry.kind]}>
            <h3 class="entry-title">
              <span class="kind" data-hue={HUE[entry.kind]}><span class="dot"></span>{LABEL[entry.kind]}</span>{entry.title}
            </h3>
            <p class="entry-body">{entry.body}</p>
          </li>
        {/each}
      </ol>
    </section>
    {/each}
  </div>
</div>

<style>
  .head,
  .log {
    max-inline-size: 960px;
    margin-inline: auto;
    padding-inline: var(--sp-6);
  }

  /* The band pays for the air above and below; the column inside it pays for nothing. It was
     `clamp(56px, 7vw, 104px)` on the head alone, which put the standing state of the product a
     third of a screen further down than the home page's first band. */
  .band {
    padding-block: var(--sp-8);
  }

  /* The seam, as on the other two pages. */
  .band + .band {
    border-block-start: 1px solid var(--line);
  }

  .title {
    font-size: clamp(36px, 2.4vw + 22px, 56px);
    font-weight: 600;
    line-height: 1.04;
    letter-spacing: -0.04em;
  }

  .lede {
    max-inline-size: 46ch;
    margin-block-start: var(--sp-3);
    color: var(--ink2);
    font-size: clamp(17px, 0.4vw + 15px, 20px);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .counts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: var(--sp-5);
  }

  .count-all {
    margin-inline-end: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* The state of the product, as a plain block between two hairlines with one dot of state on
     it: it is the only thing here that is about now rather than a day in the past. */
  .status {
    margin-block-start: var(--sp-6);
    padding-block: var(--sp-5);
    border-block-start: 1px solid var(--line);
  }

  .live {
    flex: none;
    inline-size: var(--dot);
    block-size: var(--dot);
    background: var(--earn);
    border-radius: var(--r-pill);
  }

  .status-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .status-title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--t-base);
    font-weight: 600;
    letter-spacing: 0;
  }

  .status-body {
    max-inline-size: 66ch;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.6;
    text-wrap: pretty;
  }

  .status-links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
    margin-block-start: var(--sp-1);
  }

  .log {
    padding-block-end: var(--sp-8);
  }

  .day {
    display: grid;
    grid-template-columns: 14ch minmax(0, 1fr);
    gap: var(--sp-5);
    padding-block: var(--sp-6);
    border-block-start: 1px solid var(--line);
  }

  .day-date {
    position: sticky;
    inset-block-start: calc(var(--sticky) + var(--sp-4));
    align-self: start;
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }

  /* A RAIL DOWN THE DAY, and a quiet mark on it for each entry, so a day reads as a short run of
     things that happened rather than a stack of paragraphs. The kind's colour is on its label. */
  .entries {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    margin: 0;
    padding-inline: var(--sp-5) 0;
    border-inline-start: 1px solid var(--line);
    list-style: none;
  }

  .entry {
    position: relative;
  }

  .entry::before {
    content: '';
    position: absolute;
    inset-block-start: 0.6em;
    inset-inline-start: calc(var(--sp-5) * -1 - 3px);
    inline-size: 6px;
    block-size: 6px;
    /* THE KIND'S HUE ON THE RAIL, AND NOT A SECOND DOT BESIDE THE WORD. An entry drew a grey mark
       on the rail and a coloured dot sixty pixels right of it on the same line: two dots for one
       entry. The word still carries the kind for a reader who does not see the colour. */
    background: var(--hue);
    border-radius: var(--r-pill);
    box-shadow: 0 0 0 3px var(--bg);
  }

  .entry .dot {
    display: none;
  }

  /* A label on the title's own line: the word is in the ink and the hue is only a dot, so the kind
     reads the same to somebody who does not see green. */
  .kind {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-inline-end: var(--sp-3);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: 0;
    vertical-align: 0.1em;
  }

  .dot {
    inline-size: 6px;
    block-size: 6px;
    background: var(--hue);
    border-radius: var(--r-pill);
  }

  .entry-title {
    font-size: var(--t-md);
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: -0.01em;
    text-wrap: pretty;
  }

  .entry-body {
    max-inline-size: 74ch;
    margin-block-start: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.65;
    text-wrap: pretty;
  }

  @media (width < 760px) {
    .day {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-4);
      padding-block: var(--sp-5);
    }

    /* Not sticky on a phone: a pinned date on a 390px screen is a line of reading area spent on a
       string the reader can scroll back four inches to find. */
    .day-date {
      position: static;
    }
  }

  @media (width < 640px) {
    .head,
    .log {
      padding-inline: var(--sp-4);
    }

    .lede {
      font-size: var(--t-md);
    }

    .status-links {
      align-self: stretch;
      flex-direction: column;
    }

    .entries {
      padding-inline-start: var(--sp-4);
    }

    .entry::before {
      inset-inline-start: calc(var(--sp-4) * -1 - 3px);
    }
  }
</style>
