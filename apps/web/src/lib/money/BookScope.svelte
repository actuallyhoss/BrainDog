<!--
  WHICH BOOK MONEY IS SHOWING: "Everything", then each book the record keeps (Personal, and each business), as one row
  of links over Money's home and each book's own page. A record kept in one book draws nothing, so a person who never
  made a second book never sees the word.

  LINKS, NOT A FILTER: each book already has its own page (`money-book`, one per row of `books`), and Money's home is
  everything. So the row is a `nav` of addresses, and the back button walks it as a person would expect.

  It reads the books once, by name, through the record's ordinary `list`; a refusal or a slow read draws nothing.
-->
<script lang="ts">
  import { createClient } from '@braindog/client';

  import { at } from '../at.ts';
  import Segmented from '$lib/ui/Segmented.svelte';

  let { base, on }: { base: string; on: number | null } = $props();

  type Book = { seq: number; name: string };
  let books = $state<Book[]>([]);

  $effect(() => {
    const client = createClient({ base });
    let gone = false;
    void client
      .list({ register: 'books', limit: 12, order: [{ field: 'name', dir: 'asc' }] })
      .then((got) => {
        if (gone || !got.ok) return;
        const rows = ((got.value as { rows?: unknown } | null)?.rows ?? []) as { seq?: unknown; fields?: Record<string, unknown> }[];
        books = rows
          .filter((r) => typeof r.seq === 'number')
          .map((r) => ({ seq: r.seq as number, name: typeof r.fields?.name === 'string' && r.fields.name.trim() ? r.fields.name.trim() : `Book ${r.seq}` }));
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  });
</script>

{#if books.length >= 2}
  <div class="book-scope">
    <Segmented tag="nav" aria-label="Which book" full>
      <a class="segment" href={at('/p/money')} data-on={on === null ? '' : undefined} aria-current={on === null ? 'page' : undefined}>Everything</a>
      {#each books as b (b.seq)}
        <a class="segment" href={at(`/r/books/${b.seq}`)} data-on={on === b.seq ? '' : undefined} aria-current={on === b.seq ? 'page' : undefined}>{b.name}</a>
      {/each}
    </Segmented>
  </div>
{/if}

<style>
  .book-scope {
    display: flex;
    margin-block: var(--sp-2) 0;
  }

  /* A LINK DRAWN AS A SEGMENT CENTRES ITS WORD as a button does; an anchor's own line box left it at the top of a
     phone's taller segment. */
  .book-scope :global(a.segment) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: inherit;
    text-decoration: none;
  }
</style>
