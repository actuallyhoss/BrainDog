<!--
  One docs page: a slim head with where the page sits and its title, then the section nav, the page drawn by the
  product's renderer, and the list of its parts.

  THE LOOK IS THE APP'S (the redo of 2 November): everything on the board, the page one of the app's tiles read at 68ch
  (`Body`); the nav and "On this page" are flat on the board with no tile round them, and stay in view under the bar
  as the page scrolls. From 900px the nav and the page; below 900px the nav is a closed
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

  /**
   * THE PART IN VIEW: the last `##` heading whose top has passed the line under the site's bar, by its anchor. NO
   * SCROLL LISTENER: an observer wakes only when a heading crosses into or out of the window under the bar, and the
   * headings are read then, so scrolling the page costs nothing between crossings.
   */
  let inView = $state<string | null>(null);
  $effect(() => {
    const heads = doc.headings;
    if (heads.length === 0) return void (inView = null);
    const els = heads.map((h) => document.getElementById(h.id)).filter((el): el is HTMLElement => el !== null);
    const bar = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-h')) || 64;
    const line = bar + 8;
    const read = (): void => {
      let at: string | null = null;
      for (const el of els) if (el.getBoundingClientRect().top <= line) at = el.id;
      inView = at;
    };
    read();
    if (typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver(read, { rootMargin: `-${line}px 0px 0px 0px`, threshold: [0, 1] });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
  const inViewText = $derived(inView === null ? null : plainOf(doc.headings.find((h) => h.id === inView)?.text ?? ''));
</script>

<Seo {title} {description} path={doc.path} type="article" ld={[crumbsOf([{ name: 'Docs', path: '/docs' }, { name: doc.title, path: doc.path }])]} />
<svelte:head>
  <link rel="alternate" type="text/markdown" href={`${doc.path}.md`} />
</svelte:head>
<!-- A header and not a named section: the article below is the region its title names, so a second would repeat it. -->
<header class="strip">
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
          <CopyText text={doc.src} />
          <a class="btn quiet sm" href={`${doc.path}.md`} data-sveltekit-reload>{w.raw}</a>
          {#if edit}<a class="btn quiet sm" href={edit}>{w.edit}</a>{/if}
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
  /* THE HEAD: slim, on the board, with where the page sits and its title. */
  .strip-in {
    display: grid;
    gap: var(--sp-3);
    padding-block: clamp(28px, 2vw + 16px, 48px) 0;
  }

  .doc-where {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--t-site-small);
  }

  .doc-crumb {
    color: var(--ink-2);
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

  .doc-crumb:hover {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .doc-title {
    max-inline-size: 24ch;
    margin: 0;
    color: var(--ink);
    font-size: clamp(30px, 1.2vw + 24px, 40px);
    line-height: 1.08;
    letter-spacing: -0.03em;
    text-wrap: balance;
  }

  /* THE PAGE under the head, on the same board, down to the footer. */
  .board {
    padding-block: var(--sp-6) clamp(48px, 4vw + 32px, 96px);
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

  /* THE PAGES BEFORE AND AFTER, flat on the paper: the direction with its arrow, then the title. */
  .pager {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-3);
  }

  .pager-link {
    display: grid;
    gap: 4px;
    min-block-size: var(--tap);
    padding: 18px 22px;
    background: var(--tile);
    border-radius: var(--r-tile);
    color: var(--ink);
    text-decoration: none;
  }

  .pager-link:hover .pager-title {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .pager-dir {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-3);
    font-size: var(--t-site-15);
  }

  .pager-title {
    font-size: var(--t-site-16-5);
    font-weight: 600;
  }

  /* "ON THIS PAGE", flat on the board: a small heading and the parts as quiet links. */
  .contents-title {
    margin: 0 0 var(--sp-2);
    padding-inline: 10px;
    color: var(--ink-3);
    font-family: var(--font-ui);
    font-size: var(--t-site-15);
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
    border-radius: 8px;
    color: var(--ink-2);
    font-size: var(--t-site-15);
    line-height: 20px;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .contents-link:hover {
    background: var(--tile);
    color: var(--ink);
  }

  /* THE PART IN VIEW: bold and in ink, with the tile's fill, so it is told by more than colour. */

  .contents-link[aria-current] {
    background: var(--tile);
    color: var(--ink);
    font-weight: 600;
  }

  /* THE PART IN VIEW ON A PHONE: one line on the board's ground, held under the site's bar, cut with an ellipsis.
     Fixed, so its arrival moves nothing under it. */
  .in-view {
    position: fixed;
    inset-block-start: var(--bar-h);
    inset-inline: 0;
    z-index: 2;
    display: block;
    padding: 12px var(--site-gutter, 16px);
    overflow: hidden;
    background: var(--board);
    border-block-end: 1px solid var(--rule);
    color: var(--ink);
    font-size: var(--t-site-15);
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
      inset-block-start: calc(var(--bar-h) + var(--sp-5));
      display: block;
    }
  }

  @media (max-width: 760px) {
    .board {
      padding-block: var(--sp-5) 48px;
    }
  }
</style>
