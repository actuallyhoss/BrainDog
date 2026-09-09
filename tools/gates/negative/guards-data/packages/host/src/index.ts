/** Cut down to the one list this gate reads: six routes, and four of them DATA or READ+. */
export const ROUTES: readonly Route[] = [
  { name: 'boot', group: 'READ+', writes: false, what: 'What this record holds.' },
  { name: 'version', group: 'READ+', writes: false, what: "The record's version." },
  { name: 'search', group: 'DATA', writes: false, what: 'Rows whose text matches, across every register you can see.' },
  { name: 'list', group: 'DATA', writes: false, what: 'Rows of one register.' },
  { name: 'create', group: 'DATA', writes: true, what: 'Add a row. The record allocates its number.' },
  { name: 'members', group: 'ADMIN', writes: false, what: 'Who is on this record, at what level, and where.' },
];
