/* A row is how the database holds a bill: this comment says row and is not read. */
export const seeded = {
  id: 'rows',
  source: 'rows',
  pages: [
    {
      title: 'Bills',
      blocks: [
        { heading: 'Each row you pay', source: 'rows', body: 'Paid {{bills.rows}} so far, [all of them](/r/rows).', empty: 'Nothing to pay yet.' },
        { heading: 'What is next', note: 'a row', label: 'Due soon', body: 'Kept as `row` in a Map<string, Row> for the next bill.' },
      ],
    },
  ],
};
