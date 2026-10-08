/** What you have, by book, on a record that keeps more than one. */

export const BY_BOOK: Record<string, unknown>[] = [
  {
    /* WHAT YOU HAVE IN EACH BOOK, once there are two: Cash now rolled per book, the same arithmetic as the figure it
       stands in for (`cash-by-book`), in the line's place, since a line over two books would add a company's money
       to a person's own. An account in no book is a part of its own, named, so no money leaves the picture because
       nobody filed it. THE WHOLE WIDTH SINCE money-core 3.4.0, as Cash ahead under it is. */
    kind: 'bar',
    heading: 'What you have, by book',
    icon: 'book',
    span: 12,
    source: 'metric.cash-by-book',
    unset: 'In no book',
    when: { metric: 'books-held', gte: 2 },
    empty: 'No account counts as cash yet.',
  },
];
