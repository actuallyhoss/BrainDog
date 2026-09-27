/** Cut down to the one list this gate reads: one row here, and two more under routes/. */
export const ROUTES: readonly Route[] = [
  { name: 'boot', group: 'READ+', writes: false, what: 'What this record holds.' },
];
