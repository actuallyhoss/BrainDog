<!--
  WHICH BOOK MONEY IS SHOWING: each book the record keeps (Personal, then each business), as one row of links over each
  book's own page. A record kept in one book draws nothing.

  NO "EVERYTHING", SINCE 9 NOV (the owner: "i nede the personal page to show first and then quartz. i dont want
  evereything page"): Money's home added a company's money to a person's own. With two books or more, Money's home opens
  the first book in its place (`replaceState`, so Back does not land on it again).

  LINKS, NOT A FILTER: each book already has its own page (`money-book`, one per row of `books`), and Money's home is
  everything. So the row is a `nav` of addresses, and the back button walks it as a person would expect.

  It reads the books once through the record's ordinary `list` (`books.ts`), asked with Money's own first read where it
  can be; a refusal or a slow read draws nothing. WHICH LIST THE
  BOOKS ARE IS THE LEDGER'S TO SAY (`ledger.ts` `book`), handed by the page, never named here.
-->
<script module lang="ts">
  type Book = { seq: number; name: string };
  /* THE BOOKS LAST READ, BY RECORD AND LIST, so the next book's page draws its row with the page and the row the reader
     just pressed is there to hold still (skills pass follow-up, 2 Nov): it was missing for a frame on every press while
     the next page read the books again. Read again each time; this is only what is drawn until the answer lands. */
  const kept = new Map<string, Book[]>();
</script>

<script lang="ts">

  import { goto } from '$app/navigation';

  import { at } from '../at.ts';
  import { readBooks, takeBooks } from './books.ts';
  import Segmented from '$lib/ui/Segmented.svelte';
  import type { SideList } from './ledger.ts';

  let { base, book, on }: { base: string; book: SideList; on: number | null } = $props();

  // svelte-ignore state_referenced_locally
  let books = $state<Book[]>(kept.get(`${base} ${book.list}`) ?? []);

  /* ON MONEY'S HOME WITH TWO BOOKS OR MORE, THE FIRST BOOK IN ITS PLACE. */
  function leaveHome() {
    if (on === null && books.length >= 2) void goto(at(`/r/${book.list}/${books[0]!.seq}`), { replaceState: true });
  }

  /* AT ONCE WHEN THE BOOKS ARE ALREADY KNOWN from the last read, before they are read again. */
  // svelte-ignore state_referenced_locally
  leaveHome();

  $effect(() => {
    let gone = false;
    const key = `${base} ${book.list}`;
    /* ASKED WITH MONEY'S OWN FIRST READ WHERE THE LEDGER WAS KNOWN BY THEN (`books.ts`), else now. */
    void (takeBooks(base, book) ?? readBooks(base, book))
      .then((got) => {
        if (gone || !got?.ok) return;
        const rows = ((got.value as { rows?: unknown } | null)?.rows ?? []) as { seq?: unknown; fields?: Record<string, unknown> }[];
        books = rows
          .filter((r) => typeof r.seq === 'number')
          .map((r) => {
            const name = r.fields?.[book.title];
            return { seq: r.seq as number, name: typeof name === 'string' && name.trim() ? name.trim() : `Book ${r.seq}` };
          });
        kept.set(key, books);
        leaveHome();
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
      {#each books as b (b.seq)}
        <a class="segment" href={at(`/r/${book.list}/${b.seq}`)} data-on={on === b.seq ? '' : undefined} aria-current={on === b.seq ? 'page' : undefined}>{b.name}</a>
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
