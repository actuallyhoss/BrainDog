<!--
  One docs page: a slim night strip with where the page sits and its title, then the section nav, the page drawn by the
  product's renderer, and the list of its parts.

  THE LOOK IS LOOK B'S (LAUNCH 103 job 7): the strip carries on from the header's night, then the board.
  The page is one sheet read at 68ch (`Body`); the nav and "On this page" are flat on the board with no tile
  round them, and stay in view as the page scrolls. From 900px the nav and the page; below 900px the nav is a closed
  disclosure at the top and the list of parts is not drawn, because on a phone the page itself is the list; there the
  part in view is named in one line that stays at the top as the page scrolls (plan F24), and on a desk the list marks
  the part in view. A code
  block scrolls inside its well and nothing else on the page moves sideways.

  THE PAGE IS ALSO TEXT FOR AN AGENT: "Open as text" is the `.md` address beside it, the head names that address as
  the page's alternate, and "Copy as text" puts the same text on the clipboard. "Edit on GitHub" appears once
  `LAUNCH.repo` says the repository is public, and not before, because until then the address answers 404 to everyone
  but the owner.
-->
<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import { crumbsOf, snippetOf } from '$lib/site/seo.ts';
  import Icon from '$lib/Icon.svelte';
  import Body from '$lib/docs/Body.svelte';
  import CopyText from '$lib/docs/CopyText.svelte';
  import Nav from '$lib/docs/Nav.svelte';
  import { DOCS_DIR, plainOf } from '$lib/docs/pages.ts';
  import { docsWords } from '$lib/docs/words.ts';
  import { LAUNCH } from '$lib/launch.ts';
  import { SOURCE } from '$lib/links.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const w = docsWords;

  const doc = $derived(data.doc);
  const section = $derived(w.sections[doc.section]);
  const address = $derived(`https://brain.dog${doc.path}`);
  const title = $derived(w.meta.page(doc.title));
  const description = $derived(snippetOf(plainOf(doc.summary) || w.meta.description));

  /* Widened on purpose: the flag is a literal, and the page is written for both of its values. */
  const repo: string | null = LAUNCH.repo ? SOURCE : null;
  const edit = $derived(repo === null ? null : `${repo}/edit/master/${DOCS_DIR}${doc.file}`);

  /* THE PART IN VIEW: the last `##` heading whose top has passed the top of the window, by its anchor. */
  let inView = $state<string | null>(null);
  $effect(() => {
    const heads = doc.headings;
    if (heads.length === 0) return void (inView = null);
    let frame = 0;
    const spy = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let at: string | null = null;
        for (const h of heads) {
          const el = document.getElementById(h.id);
          if (el && el.getBoundingClientRect().top <= 72) at = h.id;
        }
        inView = at;
      });
    };
    spy();
    addEventListener('scroll', spy, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('scroll', spy);
    };
  });
  const inViewText = $derived(inView === null ? null : plainOf(doc.headings.find((h) => h.id === inView)?.text ?? ''));
</script>

<Seo {title} {description} path={doc.path} type="article" ld={[crumbsOf([{ name: 'Docs', path: '/docs' }, { name: doc.title, path: doc.path }])]} />
<svelte:head>
  <link rel="alternate" type="text/markdown" href={`${doc.path}.md`} />
</svelte:head>
<!-- A header and not a named section: the article below is the region its title names, so a second would repeat it. -->
<header class="night strip">
  <div class="wrap strip-in">
    <p class="doc-where">
      <a class="doc-crumb" href="/docs">{w.nav.home}</a>
      <Icon name="chevron-right" size="s" />
      <span>{section.label}</span>
    </p>
    <h1 class="doc-title" id="doc-title">{doc.title}</h1>
  </div>
</header>

<div class="board">
  <div class="wrap docs-frame">
    <div class="docs-nav">
      <Nav sections={data.sections} current={doc.path} index={data.index} />
    </div>

    <article class="doc" aria-labelledby="doc-title">
      <!-- THE PART IN VIEW, ON A PHONE: one line held at the top; a link back to it. Drawn only once one is passed. -->
      {#if inViewText}<a class="in-view" href={`#${inView}`} aria-label={`${w.inView}: ${inViewText}`}>{inViewText}</a>{/if}
      <Body src={doc.src}>
        {#snippet head()}
          <CopyText text={doc.src}>
            <a class="btn quiet sm" href={`${doc.path}.md`} data-sveltekit-reload>{w.raw}</a>
            {#if edit}<a class="btn quiet sm" href={edit}>{w.edit}</a>{/if}
          </CopyText>
        {/snippet}
      </Body>

      {#if data.prev || data.next}
        <nav class="pager" aria-label={w.pager}>
          {#if data.prev}
            <a class="pager-link" rel="prev" href={data.prev.path}>
              <span class="pager-dir"><Icon name="arrow-left" size="s" />{w.prev}</span>
              <span class="pager-title">{data.prev.title}</span>
            </a>
          {/if}
          {#if data.next}
            <a class="pager-link pager-next" rel="next" href={data.next.path}>
              <span class="pager-dir">{w.next}<Icon name="arrow-right" size="s" /></span>
              <span class="pager-title">{data.next.title}</span>
            </a>
          {/if}
        </nav>
      {/if}
    </article>

    {#if doc.headings.length > 0}
      <aside class="contents" aria-labelledby="doc-contents">
        <h2 class="contents-title" id="doc-contents">{w.contents}</h2>
        <ol class="contents-list">
          {#each doc.headings as heading (heading.id)}
            <li><a class="contents-link" href={`#${heading.id}`} aria-current={inView === heading.id ? 'location' : undefined}>{plainOf(heading.text)}</a></li>
          {/each}
        </ol>
      </aside>
    {/if}
  </div>
</div>

<style>
  /* THE NIGHT STRIP: slim, carrying on from the header's night, with where the page sits and its title. */
  .strip-in {
    display: grid;
    gap: 14px;
    padding-block: 28px 44px;
  }

  .doc-where {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--on-night-2);
    font-size: var(--t-label);
  }

  .doc-crumb {
    color: var(--on-night-2);
    text-decoration: none;
  }

  /* A THUMB'S TARGET WITHOUT MOVING A LINE: 13px above and below takes a 19px link past 44, and the negative margin
     gives it back, so the words sit where they did and the press lands on a 44px box. */
  @media (pointer: coarse) {
    .doc-crumb {
      padding-block: 13px;
      margin-block: -13px;
    }
  }

  @media (hover: hover) {
    .doc-crumb:hover {
      color: var(--on-night);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  /* A DOC'S NAME AT THE SECTION STEP: the strip is slimmer than a page's head, so its title is a step under a page's. */
  .doc-title {
    max-inline-size: 22ch;
    margin: 0;
    font-size: var(--t-section);
    line-height: 1.02;
    letter-spacing: -0.04em;
    text-wrap: balance;
  }

  /* THE BOARD under the strip, flat and full width, down to the footer with no gap above it: a section's head gap over
     the sheet, and the band step under it. */
  .board {
    padding-block: var(--head-gap) var(--band-pad);
    margin-block-end: 0;
    background: var(--board);
  }

  /* ONE COLUMN ON A PHONE, the nav's disclosure over the page. */
  .docs-frame {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-5);
    align-items: start;
  }

  .doc {
    display: grid;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  .contents {
    display: none;
  }

  /* THE PAGES BEFORE AND AFTER: the direction with its arrow, then the title. */
  .pager {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-3);
  }

  /* THE PAGES BEFORE AND AFTER are tiles as the sheet is, so they are seen on the board (the paper grey was not). */
  .pager-link {
    display: grid;
    gap: 4px;
    min-block-size: var(--tap);
    padding: 18px 22px;
    background: var(--tile);
    border-radius: 16px;
    color: var(--ink);
    text-decoration: none;
  }

  @media (hover: hover) {
    .pager-link:hover .pager-title {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  .pager-dir {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: var(--t-label);
  }

  .pager-title {
    font-size: var(--t-text);
    font-weight: 600;
  }

  /* "ON THIS PAGE", flat on the board: a small heading and the parts as quiet links. */
  .contents-title {
    margin: 0 0 var(--sp-2);
    padding-inline: 10px;
    color: var(--muted);
    font-family: var(--ui);
    font-size: var(--t-label);
    font-weight: 600;
  }

  .contents-list {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .contents-link {
    display: flex;
    align-items: center;
    min-block-size: 36px;
    padding: 6px 10px;
    border-radius: var(--r-ctl);
    color: var(--ink2);
    font-size: var(--t-label);
    line-height: 20px;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) {
    .contents-link:hover {
      background: var(--tile);
      color: var(--ink);
    }
  }

  .contents-link[aria-current] {
    color: var(--ink);
    font-weight: 600;
  }

  /* THE PART IN VIEW ON A PHONE: one line on the board's ground, held at the window's top once the header has scrolled
     away, cut with an ellipsis. Fixed, so its arrival moves nothing under it. */
  .in-view {
    position: fixed;
    inset-block-start: 0;
    inset-inline: 0;
    z-index: 2;
    display: block;
    padding: 12px var(--site-gutter, 16px);
    overflow: hidden;
    background: var(--board);
    border-block-end: 1px solid var(--rule);
    color: var(--ink);
    font-size: var(--t-label);
    font-weight: 600;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (width >= 900px) {
    .in-view {
      display: none;
    }
  }

  /* A tablet held wide draws the list too, and a thumb needs the site's 44px row there. */
  @media (pointer: coarse) {
    .contents-link {
      min-block-size: var(--tap);
    }
  }

  @media (width >= 640px) {
    .pager {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .pager-next {
      grid-column: 2;
      justify-items: end;
      text-align: end;
    }
  }

  @media (width >= 900px) {
    .docs-frame {
      grid-template-columns: 232px minmax(0, 1fr);
      gap: var(--sp-6);
    }
  }

  /* THE LIST OF PARTS ONLY WHERE THERE IS ROOM FOR IT beside a page still wide enough to read, and it stays in view
     as the page scrolls. */
  @media (width >= 1180px) {
    .docs-frame {
      grid-template-columns: 220px minmax(0, 1fr) 208px;
    }

    .contents {
      position: sticky;
      inset-block-start: var(--sp-5);
      display: block;
    }
  }

  @media (max-width: 760px) {
    .strip-in {
      padding-block: 20px 32px;
    }
  }
</style>
