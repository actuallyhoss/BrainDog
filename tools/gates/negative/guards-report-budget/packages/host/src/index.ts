/** Cut down to the one list this gate reads: the one route a report key calls. */
export const ROUTES: readonly Route[] = [
  { name: 'report', group: 'DATA', writes: true, what: 'Rows a project sends with its report key.' },
];
