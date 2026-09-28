<!--
  One docs page: the section nav, the page drawn by the product's renderer, and the list of its parts.

  THE FRAME IS SITE.MD SIT-3's: at 1440 a 240px nav, a 720px page and a 200px list of the page's `##`
  headings; from 900px the nav and the page; below 900px the nav is a closed disclosure at the top and
  the list of parts is not drawn, because on a phone the page itself is the list. A code block scrolls
  inside itself (the skin's `.media`) and nothing else on the page moves sideways.

  THE PAGE IS ALSO TEXT FOR AN AGENT: "Open as text" is the `.md` address beside it, the head names
  that address as the page's alternate, and "Copy as text" puts the same text on the clipboard.
  "Edit on GitHub" appears once `LAUNCH.repo` says the repository is public, and not before, because
  until then the address answers 404 to everyone but the owner.
-->
<script lang="ts">
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

<div class="docs-frame">
  <div class="docs-nav">
    <Nav sections={data.sections} current={doc.path} index={data.index} />
  </div>

  <article class="doc" aria-labelledby="doc-title">
    <p class="doc-section">{section.label}</p>
    <h1 class="doc-title" id="doc-title">{doc.title}</h1>

    <div class="doc-tools">
      <CopyText text={doc.src} />
      <a class="btn btn-sm" href={`${doc.path}.md`} data-sveltekit-reload>{w.raw}</a>
      {#if edit}<a class="btn btn-sm" href={edit}>{w.edit}</a>{/if}
    </div>

    <Body src={doc.src} />

    {#if data.prev || data.next}
      <nav class="pager" aria-label={w.pager}>
        {#if data.prev}
          <a class="pager-link" rel="prev" href={data.prev.path}>
            <span class="pager-dir">{w.prev}</span>
            <span class="pager-title">{data.prev.title}</span>
          </a>
        {/if}
        {#if data.next}
          <a class="pager-link pager-next" rel="next" href={data.next.path}>
            <span class="pager-dir">{w.next}</span>
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
          <li><a class="contents-link" href={`#${heading.id}`}>{plainOf(heading.text)}</a></li>
        {/each}
      </ol>
    </aside>
  {/if}
</div>

<style>
  /* ONE COLUMN ON A PHONE, with the site's 16px gutters. The frame is wider than the site's 1200px
     column because SIT-3's three widths and their gaps need 1224px, and it is centred like the column. */
  .docs-frame {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-5);
    max-inline-size: calc(240px + 720px + 200px + 2 * var(--sp-6) + 2 * var(--sp-6));
    margin-inline: auto;
    padding-block: var(--sp-5) var(--sp-8);
    padding-inline: var(--sp-4);
  }

  .doc {
    min-inline-size: 0;
  }

  .contents {
    display: none;
  }

  .doc-section {
    margin-block: 0 var(--sp-2);
    color: var(--dim);
    font-size: var(--t-site-small);
  }

  .doc-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-site-h2);
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: -0.03em;
    text-wrap: balance;
  }

  .doc-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-block: var(--sp-4) var(--sp-7);
  }

  .pager {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-3);
    margin-block-start: var(--sp-8);
    padding-block-start: var(--sp-5);
    border-block-start: 1px solid var(--line);
  }

  .pager-link {
    display: grid;
    gap: 2px;
    min-block-size: var(--tap);
    padding: var(--sp-3) var(--sp-4);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    text-decoration: none;
  }

  .pager-link:hover {
    background: var(--s1);
  }

  .pager-dir {
    color: var(--dim);
    font-size: var(--t-site-small);
  }

  .pager-title {
    font-weight: 600;
  }

  .contents-title {
    margin-block: 0 var(--sp-2);
    color: var(--ink);
    font-size: var(--t-site-small);
    font-weight: 600;
  }

  .contents-list {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .contents-link {
    display: block;
    padding-block: 2px;
    color: var(--ink2);
    font-size: var(--t-site-small);
    line-height: 1.4;
    text-decoration: none;
  }

  .contents-link:hover {
    color: var(--ink);
    text-decoration: underline;
  }

  /* A tablet held wide draws the list too, and a thumb needs the site's 44px row there. */
  @media (pointer: coarse) {
    .contents-link {
      display: flex;
      align-items: center;
      min-block-size: var(--tap);
    }
  }

  @media (width >= 640px) {
    .docs-frame {
      padding-inline: var(--sp-6);
    }

    .pager {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .pager-next {
      grid-column: 2;
      text-align: end;
    }
  }

  @media (width >= 900px) {
    .docs-frame {
      grid-template-columns: 240px minmax(0, 720px);
      justify-content: center;
      gap: var(--sp-6);
      padding-block-start: var(--sp-7);
    }
  }

  /* THE LIST OF PARTS ONLY WHERE THERE IS ROOM FOR IT beside a page still wide enough to read, and it
     stays in view as the page scrolls, under the site's sticky bar. */
  @media (width >= 1180px) {
    .docs-frame {
      grid-template-columns: 240px minmax(0, 720px) 200px;
    }

    .contents {
      position: sticky;
      inset-block-start: calc(var(--sp-8) + var(--sp-4));
      display: block;
      align-self: start;
    }
  }
</style>
