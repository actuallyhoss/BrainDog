/**
 * Thirty questions a person asks of `record.ts`, each with the rows its answer must cite.
 *
 * `cite` IS WHAT A RIGHT ANSWER NAMES, AND EVERY ONE OF THEM. An answer passes when it cites each row in `cite` and no row
 * outside `cite` and `may`. `may` is for a row a careful reader could include either way: the cancelled Adobe plan when
 * asked what renews this month, the overdue electricity bill when asked what is due before the month ends. An empty
 * `cite` is a question the record has no row for, and the right answer cites nothing beyond its `may`.
 *
 * READ OFF `record.ts` BY HAND, at its clock of 14 November 2026. A row's spoken id is its list and its place there
 * counted from one.
 */

export type Question = { n: number; ask: string; cite: readonly string[]; may?: readonly string[] };

export const QUESTIONS: readonly Question[] = [
  { n: 1, ask: 'Which bills are overdue?', cite: ['bills#3'] },
  { n: 2, ask: 'What do I owe the accountant?', cite: ['bills#2'] },
  { n: 3, ask: 'When is the office rent due?', cite: ['bills#1'] },
  { n: 4, ask: 'Which bills are due before the end of November?', cite: ['bills#2', 'bills#6'], may: ['bills#3'] },
  { n: 5, ask: 'Which bills have I already paid?', cite: ['bills#5', 'bills#7'] },
  { n: 6, ask: 'What is the biggest open bill in pounds?', cite: ['bills#1'] },
  { n: 7, ask: 'Do I owe anything in dollars?', cite: ['bills#6'] },
  { n: 8, ask: 'How much is the insurance, and when is it due?', cite: ['bills#4'] },
  { n: 9, ask: 'Which subscriptions renew this month?', cite: ['subscriptions#1', 'subscriptions#2', 'subscriptions#6'], may: ['subscriptions#4'] },
  { n: 10, ask: 'What do I pay for GitHub?', cite: ['subscriptions#2'] },
  { n: 11, ask: 'Which subscriptions are billed yearly?', cite: ['subscriptions#3'] },
  { n: 12, ask: 'Which subscriptions have I cancelled?', cite: ['subscriptions#4'] },
  { n: 13, ask: 'Which software subscriptions are still active?', cite: ['subscriptions#2', 'subscriptions#3', 'subscriptions#5'] },
  { n: 14, ask: 'When does Spotify renew?', cite: ['subscriptions#6'] },
  { n: 15, ask: 'Which design tools am I still paying for?', cite: ['subscriptions#1'], may: ['subscriptions#4'] },
  { n: 16, ask: 'Who works at Acme Labs?', cite: ['people#2', 'people#3'] },
  { n: 17, ask: 'Who is my lawyer?', cite: ['people#4'] },
  { n: 18, ask: 'Who have I not spoken to since the start of October?', cite: ['people#2', 'people#4'] },
  { n: 19, ask: 'Who at Northwind did I speak to most recently?', cite: ['people#1'], may: ['people#5'] },
  { n: 20, ask: "What is Priya's role?", cite: ['people#3'] },
  { n: 21, ask: 'Which tasks are overdue?', cite: ['tasks#3'] },
  { n: 22, ask: 'What is left to do for Work?', cite: ['tasks#3', 'tasks#5', 'tasks#6'] },
  { n: 23, ask: 'What did I finish in Personal?', cite: ['tasks#4'] },
  { n: 24, ask: 'Which tasks are due in the next seven days?', cite: ['tasks#5'] },
  { n: 25, ask: 'When is the VAT return due?', cite: ['tasks#1'] },
  { n: 26, ask: 'Which domains renew before December?', cite: ['domains#3'] },
  { n: 27, ask: 'When does brain.dog renew?', cite: ['domains#1'] },
  { n: 28, ask: 'What renews on the first of December?', cite: ['subscriptions#5', 'domains#1'], may: ['bills#1'] },
  { n: 29, ask: 'Do I owe the dentist anything?', cite: [], may: ['tasks#4'] },
  { n: 30, ask: 'Which tasks are due in January?', cite: ['tasks#6'] },
];
