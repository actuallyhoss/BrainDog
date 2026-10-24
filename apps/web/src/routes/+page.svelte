<!--
  The record's front door: Today, a declared page (`lib/home/Home.svelte`), drawn by the one page reader. A use case's
  `home-<id>` page or the record's own `home` page is drawn in its place when the record holds one.

  OVERVIEW IS THE SAME PAGE NOW. `/?overview` was the house Home, a second front door beside Today; the two are one
  declared page, and the old address still opens it. Each is a word in the query and not a folder of its own, because
  every top-level folder is a word no record may be named (`APP_WORDS` in `lib/at.ts`), and a record somebody already
  called "overview" must still open.

  TODAY AS IT WAS IS GONE (C30, 24 October): the declared page does all it did, with who is working, for how long, as a
  tile of its own. `/?classic` is an address somebody kept, and it opens Today; nothing reads the word.

  THE WORK PAGE IS HERE TOO, at `/?work`, for the same reason: `lib/work/Work.svelte` draws the declared Work page
  (`page.work`); the screen as it was is gone (C32), and `/?work&classic` opens the page. The nav's Work row opens it on
  a record that holds tasks (`WORK` in `lib/nav.ts`).

  AN ADDRESS NAMING A RECORD THAT DID NOT ANSWER IS A PAGE THAT IS NOT HERE. `/nowhere` has the shape of a record's name,
  so it reached this door as the front door of a record called "nowhere", and the record behind the session answered
  instead: Today drew under an address that named nothing. Where `boot` says which record answered and the address names
  another, the word is read as what it almost always is, a page somebody mistyped, and the not-found screen says so with
  the nearest pages.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { slugOf } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { titleOf } from '$lib/title.ts';
  import Home from '$lib/home/Home.svelte';

  let { data } = $props();

  const named = $derived(slugOf(page.url.pathname));
  const answered = $derived(data.index?.slug ?? '');
  const elsewhere = $derived(named !== null && answered !== '' && named !== answered);
</script>

<svelte:head>{#if elsewhere && named !== null}<title>{titleOf(copy.noPageCalled(named))}</title>{/if}</svelte:head>

{#if elsewhere && named !== null}
  <div class="nowhere">
    <!-- BY `import()`, as Work is: a mistyped address is rare, and Today's first load is not the place for it. -->
    {#await Promise.all([import('$lib/ui/NotFound.svelte'), import('$lib/record/nearest.ts')]) then [{ default: NotFound }, { nearest, shellPlaces }]}
      <NotFound title={copy.noPageCalled(named)} near={nearest(named, shellPlaces(data.nav ?? [], data.index?.registers ?? []))} />
    {/await}
  </div>
{:else if page.url.searchParams.has('work')}
  {#await import('$lib/work/Work.svelte') then loaded}
    <loaded.default {data} />
  {/await}
{:else}
  <Home {data} />
{/if}

<style>
  /* AS `routes/[id]` DRAWS IT: on the ground, at the page's gutter, level with where a title would stand. */
  .nowhere {
    padding: var(--inset) var(--gutter) var(--sp-8);
  }
</style>
