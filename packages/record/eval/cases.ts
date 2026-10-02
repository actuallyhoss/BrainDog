/**
 * Twelve descriptions the owner would type on the Slash page, in his words, each drafted over a fresh copy of the seed.
 *
 * `page` IS THE PAGE A DESCRIPTION IS ABOUT, as the page head's Ask sends it: present, the model is handed that page as it
 * is declared and asked to change it rather than build a new one.
 *
 * `stub` IS FOR `--dry` ALONE: what the stub model builds for the case (`stub.ts`), so the dry run walks the same path a
 * real model's answer does. A real run never reads it.
 */

export type Case = {
  n: number;
  name: string;
  asked: string;
  page?: string;
  stub: { list: string; title: string; one: string; icon: string; mends?: true };
};

export const CASES: readonly Case[] = [
  {
    n: 1,
    name: 'launch desk',
    asked: 'A launch desk for the new site: the parts it is made of, the next step on each, and what is due this week.',
    stub: { list: 'parts', title: 'Launch', one: 'part', icon: 'board' },
  },
  {
    n: 2,
    name: 'shop stock',
    asked: 'My small online shop: what is in stock, what is running low, and the orders I still have to post.',
    stub: { list: 'stock', title: 'Shop', one: 'product', icon: 'archive', mends: true },
  },
  {
    n: 3,
    name: 'hsbc money',
    asked: 'Put the late bills first on my HSBC page, and say what is left in the current account once this month is paid.',
    page: 'money',
    stub: { list: 'bills', title: 'HSBC', one: 'bill', icon: 'wallet' },
  },
  {
    n: 4,
    name: 'reading list',
    asked: 'A reading list: the books I want to read, the one I am reading now, and how many I finished this year.',
    stub: { list: 'books', title: 'Reading', one: 'book', icon: 'book-open' },
  },
  {
    n: 5,
    name: 'client invoices',
    asked: 'Client invoices for my freelance work: who owes me what, what is overdue, and what I was paid this month.',
    stub: { list: 'invoices', title: 'Invoices', one: 'invoice', icon: 'money', mends: true },
  },
  {
    n: 6,
    name: 'hiring',
    asked: 'Hiring for two roles: the candidates at each stage, the interviews this week, and who is waiting to hear from me.',
    stub: { list: 'candidates', title: 'Hiring', one: 'candidate', icon: 'people' },
  },
  {
    n: 7,
    name: 'house move',
    asked: 'Our house move on 14 November: the boxes by room, the people to tell about the new address, and what is left to book.',
    stub: { list: 'moving', title: 'The move', one: 'job', icon: 'home' },
  },
  {
    n: 8,
    name: 'band gigs',
    asked: 'My band\'s gigs: the shows coming up with the venue and the fee, who is driving, and what each gig paid.',
    stub: { list: 'gigs', title: 'Gigs', one: 'gig', icon: 'calendar', mends: true },
  },
  {
    n: 9,
    name: 'newsletter',
    asked: 'My weekly newsletter: ideas for issues, the next issue and the day it goes out, and how many people read it.',
    stub: { list: 'issues', title: 'Newsletter', one: 'issue', icon: 'book' },
  },
  {
    n: 10,
    name: 'side project',
    asked: 'A roadmap for my side project: what ships next, what is stuck, and the ideas for later.',
    stub: { list: 'roadmap', title: 'Roadmap', one: 'item', icon: 'list-todo' },
  },
  {
    n: 11,
    name: 'family budget',
    asked: 'A family budget in pounds: what we spend each month by category, against what we planned to.',
    stub: { list: 'spending', title: 'Budget', one: 'spend', icon: 'chart-column', mends: true },
  },
  {
    n: 12,
    name: 'course',
    asked: 'The course I am taking: the modules, the assignment deadlines, and my marks so far.',
    stub: { list: 'modules', title: 'Course', one: 'module', icon: 'star' },
  },
];
