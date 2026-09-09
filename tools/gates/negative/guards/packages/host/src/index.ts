/** Cut down to the one list this gate reads: four routes, one per group. */
export const ROUTES: readonly Route[] = [
  { name: 'boot', group: 'READ+', writes: false, what: 'What this record holds.' },
  { name: 'list', group: 'DATA', writes: false, what: 'Rows of one register.' },
  { name: 'listGrants', group: 'VAULT', writes: false, what: 'What each credential opens.' },
  { name: 'members', group: 'ADMIN', writes: false, what: 'Who is on this record, at what level, and where.' },
];
