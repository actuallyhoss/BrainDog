/** The rows under routes/, which the gate must read as it reads the rows of index.ts. */
export const ROUTES: readonly Route[] = [
  { name: 'usedBy', group: 'READ+', writes: false, what: 'Which runs used one key or one tool.' },
  { name: 'triage', group: 'DATA', writes: true, what: 'File one arrival from the inbox as a row, or set it aside.' },
];
