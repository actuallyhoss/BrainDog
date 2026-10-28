/**
 * The questions the walk asks, in order, on the seed. `after` continues the thread of an earlier question; `act` says
 * yes to the first action that question held. `want` is what a good answer does, for whoever reads the run.
 */
export const QUESTIONS = [
  { say: 'How much did I spend this month?', want: 'a figure in GBP from the record, short' },
  { say: 'and last month?', after: 1, want: 'reads last month without being told what "and" means' },
  { say: "What's late?", want: 'the late bills and tasks, named, a few at most' },
  { say: 'How much cash do I have, and how long will it last?', want: 'cash now in GBP and the runway in days' },
  { say: 'What changed on Kiln lately?', want: 'recent changes on the Kiln project, or says plainly there are none' },
  { say: 'Who is Ada Vine?', want: 'the accountant, from People' },
  { say: 'What waits on me?', want: 'the questions on Decide, summed up' },
  { say: 'Which invoices are overdue, and how much is owed in total?', want: 'the late invoices and a calc total' },
  { say: 'What did I spend on software last month?', want: 'a category figure, or says it cannot be split that way' },
  { say: 'Which subscriptions renew this month?', want: 'services renewing in September' },
  { say: 'Add a task to call the bank tomorrow', want: 'a task added at once, due tomorrow, with undo' },
  { say: 'mark that done', after: 11, want: 'the task just added changed to done' },
  { say: 'Draft a page showing my subscriptions', want: 'a draft filed to Decide' },
  { say: 'Set the Analytics subscription to 25 pounds a month', want: 'held for a yes, since it sets a money amount' },
  { act: 14, say: 'yes to the held money change' },
  { say: "What's my dog's name?", want: 'says the record does not hold it, no invention' },
  { say: 'Take me to Services', want: 'navigates' },
];
