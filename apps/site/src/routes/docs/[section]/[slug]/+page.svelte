<!--
  One docs page: the section nav, the page drawn by the product's renderer in tiles, and the list of its parts.

  THE LOOK IS THE DESIGN SYSTEM'S: at a desk the nav is a tile at the start, the page is a
  column of tiles (its opening, then one tile for each `##` part), and "On this page" is a tile at the end; the two
  side tiles stay in view as the page scrolls. From 900px the nav and the page; below 900px the nav is a closed
  disclosure at the top and the list of parts is not drawn, because on a phone the page itself is the list. A code
  block scrolls inside its well and nothing else on the page moves sideways.

  THE PAGE IS ALSO TEXT FOR AN AGENT: "Open as text" is the `.md` address beside it, the head names that address as
  the page's alternate, and "Copy as text" puts the same text on the clipboard. "Edit on GitHub" appears once
  `LAUNCH.repo` says the repository is public, and not before, because until then the address answers 404 to everyone
  but the owner.
-->
<script lang="ts">
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
  const description = $derived(plainOf(doc.summary) || w.meta.description);

  /* Widened on purpose: the flag is a literal, and the page is written for both of its values. */
  const repo: string | null = LAUNCH.repo ? SOURCE : null;
  const edit = $derived(repo === null ? null : `${repo}/edit/master/${DOCS_DIR}${doc.file}`);
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={address} />
  <link rel="alternate" type="text/markdown" href={`${doc.path}.md`} />
  <meta property="og:url" content={address} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
</svelte:head>

<div class="in">
  <div class="docs-frame">
    <div class="docs-nav">
      <Nav sections={data.sections} current={doc.path} index={data.index} />
    </div>

    <article class="doc" aria-labelledby="doc-title">
      <Body src={doc.src}>
        {#snippet head()}
          <p class="doc-where meta">
            <a class="doc-crumb" href="/docs">{w.nav.home}</a>
            <Icon name="chevron-right" size="s" />
            <span>{section.label}</span>
          </p>
          <h1 class="h2 doc-title" id="doc-title">{doc.title}</h1>
          <div class="doc-tools">
            <CopyText text={doc.src} />
            <a class="btn btn-sm" href={`${doc.path}.md`} data-sveltekit-reload>{w.raw}</a>
            {#if edit}<a class="btn btn-sm" href={edit}>{w.edit}</a>{/if}
          </div>
        {/snippet}
      </Body>

      {#if data.prev || data.next}
        <nav class="pager" aria-label={w.pager}>
          {#if data.prev}
            <a class="pager-link" rel="prev" href={data.prev.path}>
              <span class="well"><Icon name="arrow-left" /></span>
              <span class="pager-words">
                <span class="pager-dir">{w.prev}</span>
                <span class="pager-title">{data.prev.title}</span>
              </span>
            </a>
          {/if}
          {#if data.next}
            <a class="pager-link pager-next" rel="next" href={data.next.path}>
              <span class="pager-words">
                <span class="pager-dir">{w.next}</span>
                <span class="pager-title">{data.next.title}</span>
              </span>
              <span class="well"><Icon name="arrow-right" /></span>
            </a>
          {/if}
        </nav>
      {/if}
    </article>

    {#if doc.headings.length > 0}
      <aside class="contents tile" aria-labelledby="doc-contents">
        <div class="tile-head">
          <span class="well"><Icon name="rows" /></span>
          <h2 class="tile-title" id="doc-contents">{w.contents}</h2>
        </div>
        <ol class="contents-list">
          {#each doc.headings as heading (heading.id)}
            <li><a class="contents-link" href={`#${heading.id}`}>{plainOf(heading.text)}</a></li>
          {/each}
        </ol>
      </aside>
    {/if}
  </div>
</div>

<style>
  /* ONE COLUMN ON A PHONE, the nav's disclosure over the page. The frame is the site's column. */
  .docs-frame {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--inset);
    align-items: start;
  }

  .doc {
    display: grid;
    gap: var(--inset);
    min-inline-size: 0;
  }

  .contents {
    display: none;
  }

  .doc-where {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 0;
  }

  .doc-crumb {
    color: var(--ink2);
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
  }

  .doc-title {
    margin-block-start: calc(-1 * var(--sp-2));
  }

  .doc-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* THE PAGES BEFORE AND AFTER, as two tiles on the ground: a well with its arrow, the direction and the title. */
  .pager {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--inset);
  }

  .pager-link {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--tap);
    padding: var(--sp-4) 20px;
    background: var(--bg);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
    color: var(--ink);
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .pager-link:hover .pager-title {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .pager-words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .pager-dir {
    color: var(--dim);
    font-size: var(--t-site-small);
  }

  .pager-title {
    font-size: var(--t-row);
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
    min-block-size: var(--ctl-h);
    padding: 6px var(--sp-2);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-site-small);
    line-height: 20px;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .contents-link:hover {
    background: var(--hover-wash);
    color: var(--ink);
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
      justify-content: flex-end;
      text-align: end;
    }
  }

  @media (width >= 900px) {
    .docs-frame {
      grid-template-columns: 248px minmax(0, 1fr);
    }
  }

  /* THE LIST OF PARTS ONLY WHERE THERE IS ROOM FOR IT beside a page still wide enough to read, and it stays in view
     as the page scrolls, under the floating bar. */
  @media (width >= 1180px) {
    .docs-frame {
      grid-template-columns: 248px minmax(0, 1fr) 236px;
    }

    .contents {
      position: sticky;
      inset-block-start: calc(56px + 2 * var(--inset));
      display: flex;
    }
  }
</style>
