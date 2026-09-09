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
      'fifty-four documents in the open, and REPORT.md is the running account of what is built and ' +
      'what is not. This page exists so that is a fact you can check rather than one you have to ' +
      'ask about.',
  };

  const ENTRIES: Entry[] = [
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
        'no hand-written form for any register. A pack that adds a field gets a form field. `secret` is ' +
        'absent rather than disabled: a credential never goes in a row.',
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
        'it is the band the overdue chip is struck from, so the alarm is always a step louder than the brand.',
    },
    {
      date: '2026-09-03',
      kind: 'fixed',
      title: 'A link and an overdue figure were the same colour',
      body:
        'The accent and `danger` share a hue by construction and were being solved against the same ground, ' +
        'so in the light scheme they landed one value apart. The generator now solves the link last and walks ' +
        'until it is eight L* clear of body ink AND of `danger`; the validator measures both pairs.',
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
</script>

<svelte:head>
  <title>Changelog · BrainDog</title>
  <meta name="description" content={STATUS.body} />
</svelte:head>

<section class="head">
  <h1 class="title">{site.nav.changelog}</h1>
  <div class="status">
    <h2 class="status-title">{STATUS.title}</h2>
    <p class="status-body">{STATUS.body}</p>
    <!-- Two links, because the sentence above makes two checkable claims: that you can open it, and
         that the account of what is built is in the open. -->
    <p class="status-links">
      <a class="status-link" href={APP}>{site.nav.open}</a>
      <a class="status-link" href={SOURCE}>{site.nav.source}</a>
    </p>
  </div>
</section>

<ol class="log">
  {#each ENTRIES as entry}
    <li class="entry">
      <div class="meta">
        <!-- A machine-readable date beside a human one. The `datetime` is what a feed reader and a
             search engine read; the text is what a person reads, and they are the same day. -->
        <time class="date num" datetime={entry.date}>{entry.date}</time>
        <span class="kind" data-kind={entry.kind}>{LABEL[entry.kind]}</span>
      </div>
      <div class="body">
        <h3 class="entry-title">{entry.title}</h3>
        <p class="entry-body">{entry.body}</p>
      </div>
    </li>
  {/each}
</ol>

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
    display: flex;
    flex-direction: column;
    margin-block: 0;
    padding-block-end: var(--sp-6);
    list-style: none;
  }

  .entry {
    display: grid;
    grid-template-columns: 14ch minmax(0, 1fr);
    gap: var(--sp-5);
    padding-block: var(--sp-5);
    border-block-start: 1px solid var(--line);
  }

  .meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
  }

  .date {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  /* A tag, not a pill, and the same four-pixel corner every control in the product has. */
  .kind {
    padding: 2px 7px;
    background: color-mix(in srgb, var(--ink) 7%, transparent);
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 600;
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

  .entry-title {
    font-size: var(--t-md);
    letter-spacing: -0.014em;
    text-wrap: balance;
  }

  .entry-body {
    margin-block-start: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-ui);
    line-height: 1.6;
    text-wrap: pretty;
  }

  @media (width < 760px) {
    .entry {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-2);
    }

    .meta {
      flex-direction: row;
      align-items: center;
      gap: var(--sp-3);
    }

    .head,
    .log {
      padding-inline: var(--sp-4);
    }
  }
</style>
