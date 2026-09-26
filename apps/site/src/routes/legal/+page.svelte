<!--
  Legal.

  THE LICENCE LIVES HERE AND IN THE READMES, not on the marketing pages. A licence is a disclaimer
  somebody looks up, not a selling point somebody is sold, so the pages that sell say "open source"
  and point at the code, and this page says which licence and what it does not promise.

  NO INVENTED TERMS. The Terms of Service and the Privacy policy are not written yet, and the page
  says that in one sentence rather than drawing headings that read like a policy.

  IT IS BANDS NOW, AND IT WAS THE LAST ROUTE THAT WAS NOT. The redesign left this page and the 404
  on the old 960px document layout on purpose, and the purpose was sound as far as it went: a
  licence is read, not sold, so it keeps a reading measure and gets no picture, no ledger and no
  brand field. What did not survive a second look is that it also kept a DIFFERENT SKELETON. Every
  other route opens each section with a hairline that runs the width of
  the column, and changes ground where one idea stops; this one had neither, so a reader arriving
  from the footer met a page that looked like somebody else's.

  So the three sections are bands on the site's own two grounds with a hairline at each seam, and
  the PROSE keeps its 68ch measure inside them. They carried the site's opener too, a sequence
  number and a rule with no word after it, because here the heading is the label; when the numbers
  went on 22 September a bare rule over a heading was all that was left, so it went with them. The document layout was right about the words and
  wrong about the frame around them.
-->
<script lang="ts">
  import { site } from '$lib/copy.ts';

  const l = site.legal;
</script>

<svelte:head>
  <title>{site.meta.legal.title}</title>
  <meta name="description" content={site.meta.legal.description} />
  <link rel="canonical" href="https://brain.dog/legal" />
  <meta property="og:url" content="https://brain.dog/legal" />
  <meta property="og:title" content={site.meta.legal.title} />
  <meta property="og:description" content={site.meta.legal.description} />
</svelte:head>

<section class="band head" data-ground="sunk">
  <div class="in">
    <h1 class="title">{l.title}</h1>
  </div>
</section>

<section class="band" data-ground="page" aria-labelledby="licence-title">
  <div class="in part">
    <h2 class="part-title" id="licence-title">{l.licence.title}</h2>
    {#each l.licence.body as paragraph}
      <p class="part-body">{paragraph}</p>
    {/each}
    <ul class="part-links">
      {#each l.licence.links as link}
        <li><a href={link.href}>{link.label}</a></li>
      {/each}
    </ul>
  </div>
</section>

<section class="band" data-ground="sunk" aria-labelledby="terms-title">
  <div class="in part">
    <h2 class="part-title" id="terms-title">{l.terms.title}</h2>
    <p class="part-body">{l.terms.body}</p>
  </div>
</section>

<style>
  /* The same air the other pages' bands carry, which `research-site-reference.md` measured at
     192px between band bodies and found already right. The head takes less at the top because the
     header above it already has its own. */
  .band {
    padding-block: var(--sp-8);
  }

  .band + .band {
    border-block-start: 1px solid var(--line);
  }

  .head {
    padding-block: var(--sp-7) var(--sp-8);
  }

  .title {
    font-family: var(--font-display);
    font-size: clamp(2.375rem, 4.7vw, 4.25rem);
    font-weight: 600;
    line-height: 1.04;
    letter-spacing: -0.04em;
    text-wrap: balance;
  }

  /* The measure stays where it was. A licence is read left to right and 68 characters is inside
     the 45-to-75 band every typographic reference agrees on; the band around it is what changed,
     not the line length inside it. */
  .part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .part > * {
    max-inline-size: 68ch;
  }

  .part-title {
    max-inline-size: none;
    font-size: var(--t-lg);
    font-weight: 600;
    line-height: var(--lh-tight);
    letter-spacing: var(--tr-tight);
  }

  .part-body {
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.6;
    text-wrap: pretty;
  }

  .part-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--sp-5);
    margin: 0;
    /* `padding-inline: 0` is load-bearing: base.css resets a list's MARGIN and not its padding. */
    padding-inline: 0;
    list-style: none;
  }

  /* 36 under a mouse and 44 under a thumb, like every other row of links on this site. */
  .part-links a {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h);
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .part-links a:active {
    opacity: var(--press-dim);
  }

  @media (width < 640px) {
    .band {
      padding-block: var(--sp-7);
    }
  }
</style>
