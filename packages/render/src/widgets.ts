/**
 * THE WIDGET CATALOGUE (widgets plan §3.7, §7.2): every widget the sheet offers, as a block with blanks, the sizes it
 * draws at, the one it starts at, what it needs and an example to draw before the record holds anything.
 *
 * A WIDGET IS A BLOCK ON A BOARD, NOT A NEW TYPE. Each entry's `block` is a page block in the grammar every page is
 * written in (docs/06), drawn by the same renderer and read through the same `previewPage`, so the gallery, Today and a
 * page say one number for one figure. What a board adds, a `size` and a `key`, is the board's to write (`widgetBlock`).
 *
 * PERSONAL AND BUSINESS ARE BOTH FIRST-CLASS. Each entry says who it is for, and the two starter boards
 * (`STARTER_BOARDS`) open on six widgets each: a person's money and life, or a business's queue, money and work.
 *
 * ADD-ONS SHIP TEMPLATES, NEVER PLACEMENTS (§6.5). An entry over an add-on's lists names it in `needs.addon`, so the
 * sheet shows it in that add-on's group and, on a record without it, offers the add-on in its place. Nothing here
 * places a widget anywhere: a press does.
 *
 * PURE AND ISOMORPHIC: the record reads it to answer `widgetGallery`, the web to draw the sheet, the design book to
 * print it. `distill` turns a block as `previewPage` answers it into the few figures or rows a preview draws, so the
 * gallery's answer is small (a reading, never a page).
 */

import { TRIP_COUNTDOWN } from './trip-countdown.ts';
import { kpiView, type KpiInput } from './kpis.ts';
import { moneySet, moneyWhole } from './money.ts';
import { exponentOf } from './format.ts';

import { FIGURES_AT, ROWS_AT, SIZE_SAID, WIDGET_SIZES, isWidgetSize, type WidgetSize } from './widget-sizes.ts';
export { FIGURES_AT, ROWS_AT, SIZE_SAID, WIDGET_SIZES, isWidgetSize, type WidgetSize };

/** The sheet's groups, in the order it draws them (§5.6). */
export const WIDGET_GROUPS = ['money', 'work', 'people', 'projects', 'agents', 'numbers', 'life'] as const;
export type WidgetGroup = (typeof WIDGET_GROUPS)[number];
export const GROUP_NAMES: Readonly<Record<WidgetGroup, string>> = {
  money: 'Money',
  work: 'Work',
  people: 'People',
  projects: 'Projects',
  agents: 'Agents',
  numbers: 'Numbers',
  life: 'Life',
};

/** Who a widget is for. Both is both, and the sheet never hides one from the other. */
export type WidgetFor = 'personal' | 'business' | 'both';

/**
 * A blank a widget asks of the record, filled from the record's own things: a project by its name, a currency by its
 * code. The record picks the first that draws something (`widgetGallery`), and the inspector (W4) offers the rest.
 */
export type WidgetBlank = { id: 'project' | 'currency' | 'trip'; asks: string };

/**
 * What a widget needs before it draws anything: lists the record keeps, figures it declares, an add-on that brings both.
 * Missing, the sheet draws the example and says what would fill it.
 */
export type WidgetNeeds = { lists?: readonly string[]; figures?: readonly string[]; addon?: string };

/** Which fields of a list widget's rows a preview reads: the title, the day, an amount, a line under it. */
export type RowsRead = { title: string; day?: string; amount?: string; meta?: string };

/**
 * An example for the gallery: figures or rows a widget shows before the record holds any. Never stored. Money in it is
 * written `¤1,240`, and said in the record's own currency when drawn (`exampleMoney`): an add-on's sample in EGP on a
 * GBP record read as somebody else's money (the validator's audit of 30 October, 12).
 */
export type WidgetExample = { figures?: readonly { label: string; said: string }[]; rows?: readonly { title: string; meta?: string }[] };

export type WidgetTemplate = {
  id: string;
  title: string;
  /** One line saying what it shows, in the sheet under its name. */
  says: string;
  group: WidgetGroup;
  for: WidgetFor;
  icon: string;
  /** The block, with `{{project}}` and the like for its blanks, never a size, a key or a span. */
  block: Readonly<Record<string, unknown>>;
  blanks?: readonly WidgetBlank[];
  sizes: readonly WidgetSize[];
  size: WidgetSize;
  needs: WidgetNeeds;
  /** For a list widget, the fields its preview reads. */
  rows?: RowsRead;
  example: WidgetExample;
  /** Words a search matches besides its title and line ("bank", "balance"). */
  words?: readonly string[];
  /**
   * The keys of Today's own tiles that show the same thing in other words (`coming-up` for Bills coming up), so the sheet
   * and the suggestions count it as on Today. Read beside the exact match on list, filter and figure.
   */
  alike?: readonly string[];
};

/** The add-ons a template can name, by catalogue id, with the name the sheet says. */
export const WIDGET_ADDONS: Readonly<Record<string, string>> = {
  'money-core': 'Money',
  goals: 'Goals',
  holdings: 'Investments',
  'rates-open-er-api-com': 'Daily exchange rates',
  trips: 'Trips',
  weather: 'Weather',
  calendar: 'Calendar',
  subscriptions: 'Subscriptions',
  splits: 'Splits',
  'tax-set-aside': 'Tax set aside',
  receipts: 'Receipts',
  'savings-circle': 'Savings circle',
  people: 'People',
  portfolio: 'Projects',
  work: 'Work',
};

const ALL: readonly WidgetSize[] = WIDGET_SIZES;
const LISTS: readonly WidgetSize[] = ['small', 'wide', 'tall', 'large', 'full'];
const FIGURE: readonly WidgetSize[] = ['small', 'wide', 'tall', 'large'];
const OPEN_TASK = 'state is not done or dropped';

const stat = (heading: string, icon: string, cells: readonly Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({ kind: 'stat', heading, icon, cells, ...extra });

/**
 * THE CATALOGUE. Money first, since it is what both a person and a business open Today for; then work, people,
 * projects, agents, numbers and the rest of a life. Each block is the one its page or Today already draws where there is
 * one, so the widget and the page agree (risk 4).
 */
export const WIDGETS: readonly WidgetTemplate[] = [
  /* ── money ── */
  /* CASH AHEAD, ONE WIDGET FOR THE CASH (the validator's audit of 30 October, 33): what was Cash today and Runway, said as
     Today's own Cash ahead says it, the cash now with the day it lasts to, and what comes in and goes out in 30 days. The
     id stays `cash-today`, so what a person turned down or kept of it still counts. */
  {
    id: 'cash-today',
    alike: ['cash'],
    title: 'Cash ahead',
    says: 'The cash you have now, how long it lasts, and what comes in and goes out in the next 30 days.',
    group: 'money',
    for: 'both',
    icon: 'wallet',
    block: stat('Cash ahead', 'wallet', [
      { metric: 'cash-now', label: 'Cash now', trend: '12w', ahead: 'cash-now', note: 'Lasts to {{runs-out-on}}' },
      { metric: 'arriving-30d', label: 'Coming in, 30 days' },
      { metric: 'leaving-30d', label: 'Going out, 30 days' },
    ]),
    sizes: ALL,
    size: 'wide',
    needs: { figures: ['cash-now'], addon: 'money-core' },
    example: { figures: [{ label: 'Cash now', said: '¤42,000' }, { label: 'Coming in, 30 days', said: '¤14,500' }] },
    words: ['bank', 'balance', 'money', 'accounts', 'cash today', 'runway', 'burn', 'lasts', 'run out'],
  },
  {
    id: 'spending',
    title: 'Spending',
    says: 'What went out in the last 30 days, beside last month.',
    group: 'money',
    for: 'personal',
    icon: 'trending-down',
    block: stat('Spending', 'trending-down', [
      { metric: 'spent-30d', label: 'Spent, 30 days' },
      { metric: 'spent-last-month', label: 'Last month' },
    ]),
    sizes: FIGURE,
    size: 'wide',
    needs: { figures: ['spent-30d'], addon: 'money-core' },
    example: { figures: [{ label: 'Spent, 30 days', said: '¤2,700' }, { label: 'Last month', said: '¤3,000' }] },
    words: ['spent', 'expenses', 'outgoings'],
  },
  {
    id: 'budget-left',
    title: 'Budget left',
    says: 'Each category you set a budget on, against what it spent this month.',
    group: 'money',
    for: 'personal',
    icon: 'target',
    block: {
      kind: 'progress',
      heading: 'Budget left',
      icon: 'target',
      source: 'register.categories',
      where: 'state is live, direction is out, budget is set',
      columns: [{ field: 'name' }, { field: 'budget' }],
      spent: 'spent-by-category-month',
      order: [{ field: 'seq', dir: 'asc' }],
      limit: 8,
      empty: 'No budget yet. Give a category the most you mean to spend in a month.',
    },
    sizes: ['wide', 'tall', 'large', 'full'],
    size: 'large',
    needs: { lists: ['categories'], figures: ['spent-by-category-month'], addon: 'money-core' },
    rows: { title: 'name', amount: 'budget' },
    example: { rows: [{ title: 'Food', meta: '¤230 left of ¤500' }, { title: 'Transport', meta: '¤50 left of ¤150' }, { title: 'Going out', meta: '¤120 left of ¤190' }] },
    words: ['budgets', 'categories', 'limit'],
  },
  /* COMING UP, ONE WIDGET FOR WHAT FALLS DUE WITH MONEY ON IT (audit of 30 October, 33): Bills coming up folded in, and
     read as Today's Coming up reads it (`default-home.ts`, `amount is set` over the next 14 days), so the two are one. */
  {
    id: 'coming-up',
    alike: ['coming-up'],
    title: 'Coming up',
    says: 'Bills and other money due in the next two weeks, soonest first.',
    group: 'money',
    for: 'both',
    icon: 'calendar',
    block: {
      kind: 'timeline',
      heading: 'Coming up',
      icon: 'calendar',
      source: 'deadlines',
      where: 'amount is set, day after -1d',
      horizon: 14,
      columns: [{ field: 'day' }, { field: 'title' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }],
      limit: 8,
      empty: 'Nothing falls due in the next two weeks.',
    },
    sizes: LISTS,
    size: 'tall',
    needs: { addon: 'money-core', figures: ['cash-now'] },
    rows: { title: 'title', day: 'day', amount: 'amount' },
    example: { rows: [{ title: 'Rent', meta: '1 Nov' }, { title: 'Phone', meta: '3 Nov' }, { title: 'Paycheck', meta: '5 Nov' }] },
    words: ['bills', 'bills coming up', 'due', 'payments', 'upcoming', 'pay', 'deadlines'],
  },
  {
    id: 'late',
    title: 'Late payments',
    says: 'What fell due and was not paid, oldest first.',
    group: 'money',
    for: 'both',
    icon: 'clock',
    block: {
      kind: 'timeline',
      heading: 'Late',
      icon: 'clock',
      source: 'deadlines',
      where: 'day before today',
      columns: [{ field: 'day' }, { field: 'title' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }],
      limit: 8,
      empty: 'Nothing is late.',
    },
    sizes: LISTS,
    size: 'wide',
    needs: { addon: 'money-core', figures: ['cash-now'] },
    rows: { title: 'title', day: 'day', amount: 'amount' },
    example: { rows: [{ title: 'Studio rent', meta: '12 Oct' }, { title: 'Invoice 2026-031', meta: '20 Oct' }] },
    words: ['overdue', 'unpaid'],
  },
  {
    id: 'owed-to-you',
    title: 'Owed to you',
    says: 'What people and clients still owe you.',
    group: 'money',
    for: 'business',
    icon: 'hand-coins',
    block: stat('Owed to you', 'hand-coins', [{ metric: 'owed-to-you', label: 'Owed to you' }, { metric: 'owed-by-you', label: 'You owe' }]),
    sizes: FIGURE,
    size: 'small',
    needs: { figures: ['owed-to-you'], addon: 'money-core' },
    example: { figures: [{ label: 'Owed to you', said: '¤36,000' }] },
    words: ['invoices', 'receivables', 'clients'],
  },
  {
    id: 'net-worth',
    title: 'Net worth',
    says: 'Your cash and what you hold, less what you owe.',
    group: 'money',
    for: 'personal',
    icon: 'scale',
    block: stat('Net worth', 'scale', [{ metric: 'net-worth', label: 'Net worth' }, { metric: 'cash-now', label: 'Cash' }, { metric: 'held-beyond-cash', label: 'Held' }]),
    sizes: FIGURE,
    size: 'small',
    needs: { figures: ['net-worth'], addon: 'money-core' },
    example: { figures: [{ label: 'Net worth', said: '¤240,000' }] },
    words: ['wealth', 'assets', 'total'],
  },
  {
    id: 'savings-goal',
    title: 'Savings goals',
    says: 'How far each thing you are saving for has come.',
    group: 'money',
    for: 'personal',
    icon: 'piggy-bank',
    block: {
      kind: 'progress',
      heading: 'Savings goals',
      icon: 'piggy-bank',
      source: 'register.money_goals',
      where: 'state is not paused',
      columns: [{ field: 'name' }, { field: 'target' }, { field: 'by' }],
      spent: 'goals-have-by-name',
      order: [{ field: 'seq', dir: 'asc' }],
      limit: 6,
      empty: 'No goal yet. Add what you are saving for.',
    },
    sizes: LISTS,
    size: 'small',
    needs: { lists: ['money_goals'], addon: 'goals' },
    rows: { title: 'name', amount: 'target', day: 'by' },
    example: { rows: [{ title: 'Car', meta: '62% of ¤25,000' }, { title: 'Summer trip', meta: '30% of ¤4,000' }] },
    words: ['save', 'saving', 'goal'],
  },
  {
    id: 'subscriptions',
    title: 'Subscriptions',
    says: 'What your subscriptions cost a month, and what renews in 30 days.',
    group: 'money',
    for: 'both',
    icon: 'repeat',
    block: stat('Subscriptions', 'repeat', [{ metric: 'subs-month', label: 'A month' }, { metric: 'subs-renew-30d', label: 'Renew in 30 days' }, { metric: 'subs-unused', label: 'Unused' }]),
    sizes: FIGURE,
    size: 'small',
    needs: { figures: ['subs-month'], addon: 'subscriptions' },
    example: { figures: [{ label: 'A month', said: '¤110' }, { label: 'Renew in 30 days', said: '4' }] },
    words: ['subs', 'renewals', 'netflix', 'spotify'],
  },
  {
    id: 'splits',
    title: 'Splits',
    says: 'Who owes you for shared costs, and who you owe.',
    group: 'money',
    for: 'personal',
    icon: 'split',
    block: stat('Splits', 'split', [{ metric: 'splits-to-me', label: 'Friends owe you' }, { metric: 'splits-to-them', label: 'You owe friends' }]),
    sizes: FIGURE,
    size: 'small',
    needs: { figures: ['splits-to-me'], addon: 'splits' },
    example: { figures: [{ label: 'Friends owe you', said: '¤180' }] },
    words: ['shared', 'friends', 'iou'],
  },
  {
    id: 'tax-aside',
    title: 'Tax set aside',
    says: 'What you have put by for tax this year, and what is due.',
    group: 'money',
    for: 'business',
    icon: 'percent',
    block: stat('Tax set aside', 'percent', [{ metric: 'tax-aside-year', label: 'Set aside this year' }, { metric: 'tax-due', label: 'Due' }]),
    sizes: FIGURE,
    size: 'small',
    needs: { figures: ['tax-aside-year'], addon: 'tax-set-aside' },
    example: { figures: [{ label: 'Set aside this year', said: '¤7,900' }] },
    words: ['tax', 'vat', 'self assessment'],
  },
  {
    id: 'receipts',
    title: 'Receipts',
    says: 'Payments still missing a receipt, and receipts waiting to be matched.',
    group: 'money',
    for: 'business',
    icon: 'receipt',
    block: stat('Receipts', 'receipt', [{ metric: 'receipts-missing', label: 'Missing a receipt' }, { metric: 'receipts-waiting', label: 'To match' }]),
    sizes: FIGURE,
    size: 'small',
    needs: { figures: ['receipts-missing'], addon: 'receipts' },
    example: { figures: [{ label: 'Missing a receipt', said: '3' }] },
    words: ['expenses', 'paperwork'],
  },
  {
    id: 'savings-circle',
    title: 'Savings circle',
    says: 'What you pay into your circles a month, and the payouts to come.',
    group: 'money',
    for: 'personal',
    icon: 'coins',
    block: stat('Savings circle', 'coins', [{ metric: 'circles-month', label: 'A month' }, { metric: 'circles-payouts', label: 'Payouts to come' }]),
    sizes: FIGURE,
    size: 'small',
    needs: { figures: ['circles-month'], addon: 'savings-circle' },
    example: { figures: [{ label: 'A month', said: '¤250' }] },
    words: ['gameya', 'jameya', 'circle', 'rosca'],
  },
  {
    id: 'gold-price',
    title: 'Gold price',
    says: 'Today’s gold rate for a gram, each karat.',
    group: 'money',
    for: 'personal',
    icon: 'vault',
    block: {
      kind: 'table',
      heading: 'Gold price',
      icon: 'vault',
      source: 'register.gold_rates',
      where: 'live is true',
      columns: [{ field: 'karat', label: 'Karat' }, { field: 'per_gram', label: 'A gram', align: 'end' }],
      order: [{ field: 'karat', dir: 'asc' }],
      limit: 3,
      empty: 'No gold rate yet.',
    },
    sizes: ['small', 'wide', 'tall'],
    size: 'small',
    needs: { lists: ['gold_rates'], addon: 'holdings' },
    rows: { title: 'karat', amount: 'per_gram' },
    example: { rows: [{ title: '24k', meta: '¤110 a gram' }, { title: '21k', meta: '¤96 a gram' }] },
    words: ['gold', 'karat', 'grams'],
  },
  {
    id: 'exchange-rate',
    title: 'Exchange rate',
    says: 'What a dollar is worth in your money today.',
    group: 'money',
    for: 'personal',
    icon: 'globe',
    block: {
      kind: 'table',
      heading: 'Exchange rate',
      icon: 'globe',
      source: 'register.fx',
      where: 'currency is {{currency}}',
      columns: [{ field: 'currency' }, { field: 'rate', align: 'end' }, { field: 'as_of' }],
      order: [{ field: 'as_of', dir: 'desc' }],
      limit: 1,
      empty: 'No rate yet.',
    },
    blanks: [{ id: 'currency', asks: 'Which currency?' }],
    sizes: ['small', 'wide'],
    size: 'small',
    needs: { lists: ['fx'], addon: 'rates-open-er-api-com' },
    rows: { title: 'currency', meta: 'rate', day: 'as_of' },
    example: { figures: [{ label: 'Against the US dollar', said: '¤fx' }] },
    words: ['rate', 'dollar', 'usd', 'fx', 'currency'],
  },

  /* ── work ── */
  {
    id: 'needs-you',
    alike: ['needs-you'],
    title: 'Needs you',
    says: 'The questions waiting on your answer, answered where they are.',
    group: 'work',
    for: 'both',
    icon: 'inbox',
    block: { kind: 'queue', heading: 'Needs you', icon: 'inbox', source: 'governance.open', limit: 8, empty: 'Nothing is waiting on you.', tiles: true },
    sizes: ['wide', 'tall', 'large', 'full'],
    size: 'wide',
    needs: {},
    rows: { title: 'question' },
    example: { rows: [{ title: 'Does Tallow get retired, or parked for another year?' }] },
    words: ['questions', 'decide', 'inbox', 'approve'],
  },
  {
    id: 'next-up',
    alike: ['work-due'],
    title: 'Next up',
    says: 'Tasks due in the next seven days, soonest first. Tick one where it is.',
    group: 'work',
    for: 'both',
    icon: 'check',
    block: {
      kind: 'todo',
      heading: 'Next up',
      icon: 'check',
      source: 'register.tasks',
      where: `${OPEN_TASK}, by before +8d`,
      columns: [{ field: 'what' }, { field: 'by' }],
      order: [{ field: 'by', dir: 'asc' }],
      limit: 8,
      empty: 'Nothing due this week.',
    },
    sizes: LISTS,
    size: 'tall',
    needs: { lists: ['tasks'], addon: 'work' },
    rows: { title: 'what', day: 'by' },
    example: { rows: [{ title: 'Send the specimen proofs', meta: 'Today' }, { title: 'Book the accountant', meta: '31 Oct' }] },
    words: ['tasks', 'todo', 'to do', 'due'],
  },
  {
    id: 'since-last',
    alike: ['arrivals'],
    title: 'Since you were last here',
    says: 'What changed while you were away, and who changed it.',
    group: 'work',
    for: 'both',
    icon: 'activity',
    block: { kind: 'feed', heading: 'Since you were last here', icon: 'activity', source: 'activity', since: 'seen', first: 8, empty: 'Nothing new since you looked.' },
    sizes: ['wide', 'tall', 'large', 'full'],
    size: 'tall',
    needs: {},
    rows: { title: 'thing' },
    example: { rows: [{ title: 'Kiln', meta: 'Claude edited it' }, { title: 'Filed 2 payments under Software' }] },
    words: ['activity', 'changes', 'feed', 'news'],
  },

  /* ── people ── */
  {
    id: 'people-back',
    title: 'People to get back to',
    says: 'People you have not been in touch with for three months.',
    group: 'people',
    for: 'both',
    icon: 'users',
    block: {
      kind: 'cards',
      heading: 'People to get back to',
      icon: 'users',
      source: 'register.people',
      where: 'merged_into is empty, self is not true, in_touch before -90d',
      columns: [{ field: 'name', as: 'who' }, { field: 'in_touch', as: 'fact', label: 'Last in touch' }],
      order: [{ field: 'in_touch', dir: 'asc' }],
      limit: 6,
      empty: 'You are in touch with everyone.',
    },
    sizes: ['wide', 'tall', 'large', 'full'],
    size: 'tall',
    needs: { lists: ['people'], addon: 'people' },
    rows: { title: 'name', day: 'in_touch' },
    example: { rows: [{ title: 'Priya Shah', meta: 'Last in touch 2 Jul' }, { title: 'Omar Fathy', meta: 'Last in touch 14 Jun' }] },
    words: ['contacts', 'friends', 'clients', 'catch up', 'in touch'],
  },

  /* ── projects ── */
  {
    id: 'projects',
    alike: ['projects'],
    title: 'Projects in play',
    says: 'Each project you are working on, with when it was last worked on.',
    group: 'projects',
    for: 'business',
    icon: 'grid',
    block: {
      kind: 'cards',
      heading: 'Projects',
      icon: 'grid',
      source: 'register.things',
      /* IN PLAY, AS THE SIDEBAR COUNTS THEM: a parked or retired project is not one (audit of 30 October, 12). */
      where: 'lane is not parked or retired',
      columns: [{ field: 'name', as: 'title' }, { metric: 'project-worked:{{name}}', as: 'when', label: 'Worked on' }],
      limit: 8,
    },
    sizes: ['wide', 'large', 'full'],
    size: 'full',
    needs: { lists: ['things'], addon: 'portfolio' },
    rows: { title: 'name', meta: 'next' },
    example: { rows: [{ title: 'Kiln', meta: 'Worked on today' }, { title: 'Marlow & Co', meta: 'Worked on 2 days ago' }, { title: 'Portage' }] },
    words: ['projects', 'portfolio', 'clients'],
  },
  {
    id: 'project-pulse',
    title: 'Project pulse',
    says: 'One project: its open work, what is due soon and when it was last worked on.',
    group: 'projects',
    for: 'business',
    icon: 'briefcase',
    block: stat('{{project}}', 'briefcase', [
      { metric: 'project-open:{{project}}', label: 'Open' },
      { metric: 'project-due-soon:{{project}}', label: 'Due soon' },
      { metric: 'project-done-7d:{{project}}', label: 'Done this week' },
    ]),
    blanks: [{ id: 'project', asks: 'Which project?' }],
    sizes: FIGURE,
    size: 'wide',
    needs: { lists: ['things', 'tasks'], figures: ['project-open'], addon: 'work' },
    example: { figures: [{ label: 'Open', said: '12' }, { label: 'Due soon', said: '3' }] },
    words: ['project', 'pulse', 'status'],
  },

  /* ── agents ── */
  {
    id: 'agents-working',
    alike: ['working'],
    title: 'Agents at work',
    says: 'Which agents are working now, on what, and for which project.',
    group: 'agents',
    for: 'business',
    icon: 'session',
    block: {
      kind: 'table',
      heading: 'Working now',
      icon: 'session',
      source: 'sessions.working',
      columns: [{ field: 'agent' }, { field: 'doing' }, { field: 'project' }, { field: 'last_seen' }],
      limit: 6,
    },
    sizes: ['wide', 'tall', 'large', 'full'],
    size: 'wide',
    needs: {},
    rows: { title: 'doing', meta: 'agent' },
    example: { rows: [{ title: 'Variable axis QA, instances 3 of 9', meta: 'Claude' }, { title: 'Drafting the specimen page copy', meta: 'Codex' }] },
    words: ['claude', 'codex', 'cursor', 'runs', 'sessions', 'working'],
  },

  /* ── numbers ── */
  {
    id: 'numbers',
    alike: ['numbers'],
    title: 'Key numbers',
    says: 'The few numbers that lead, your pinned ones first, each with its line.',
    group: 'numbers',
    for: 'business',
    icon: 'gauge',
    block: { kind: 'kpis', heading: 'Key numbers', icon: 'gauge', source: 'kpis', for: 'today', empty: 'No key numbers yet.' },
    sizes: ['small', 'wide', 'tall', 'large', 'full'],
    size: 'wide',
    needs: { lists: ['kpis'], addon: 'portfolio' },
    example: { figures: [{ label: 'Subscribers', said: '486' }, { label: 'Hours billed', said: '32' }] },
    words: ['kpi', 'kpis', 'metrics', 'revenue'],
  },

  /* ── life ── */
  {
    id: 'habits',
    title: 'Habits this week',
    says: 'Each habit, against what you set out to do this week.',
    group: 'life',
    for: 'personal',
    icon: 'repeat',
    block: {
      kind: 'progress',
      heading: 'Habits this week',
      icon: 'repeat',
      source: 'register.goals',
      where: 'state is active, kind is habit',
      columns: [{ field: 'what' }, { field: 'target' }, { field: 'unit' }],
      toward: 'logged-this-week-by-goal',
      order: [{ field: 'seq', dir: 'asc' }],
      limit: 6,
      empty: 'No habits yet. Add one, like running three times a week.',
    },
    sizes: LISTS,
    size: 'small',
    needs: { lists: ['goals', 'goal_log'] },
    rows: { title: 'what', meta: 'unit' },
    example: { rows: [{ title: 'Run', meta: '2 of 3 times' }, { title: 'Read', meta: '4 of 7 days' }] },
    words: ['habit', 'routine', 'run', 'read'],
  },
  /* THE WEATHER AND THE CALENDAR, AS THEIR ADD-ONS SHIP THEM (the validator's recheck of 30 October, 27): the same blocks
     and ids as `packs/weather` and `packs/calendar` declare, so the sheet shows them as "Comes with Weather" on a record
     without the add-on, and an installed add-on's own copy is folded into this one (`withShipped`). */
  {
    id: 'weather-today',
    title: 'Weather',
    says: 'Today’s weather where you are: the sky, the high and the low, and the chance of rain.',
    group: 'life',
    for: 'personal',
    icon: 'cloud',
    block: {
      kind: 'cards',
      heading: 'Weather',
      icon: 'cloud',
      source: 'register.weather',
      where: 'day is today',
      columns: [
        { field: 'what', as: 'title' },
        { field: 'high', label: 'High', as: 'figure' },
        { field: 'low', label: 'Low', as: 'fact' },
        { field: 'rain', label: 'Chance of rain %', as: 'fact' },
        { field: 'place', label: 'Where', as: 'fact' },
      ],
      limit: 1,
      empty: 'Set your town on the Weather page.',
    },
    sizes: ['small', 'wide'],
    size: 'small',
    needs: { lists: ['weather'], addon: 'weather' },
    example: { figures: [{ label: 'Partly cloudy · low 14°', said: '22°' }] },
    words: ['weather', 'rain', 'temperature', 'forecast', 'sun'],
  },
  {
    id: 'calendar-next',
    title: 'Next meetings',
    says: 'What is in your calendar next, soonest first.',
    group: 'life',
    for: 'both',
    icon: 'calendar-days',
    block: {
      kind: 'table',
      heading: 'Next meetings',
      icon: 'calendar-days',
      source: 'register.events',
      where: 'gone is not true, day after yesterday',
      columns: [{ field: 'day', label: 'Day' }, { field: 'time', label: 'At' }, { field: 'what', label: 'What' }],
      order: [{ field: 'day', dir: 'asc' }, { field: 'time', dir: 'asc' }],
      limit: 6,
      empty: 'Nothing coming up.',
    },
    sizes: ['wide', 'tall', 'large'],
    size: 'tall',
    needs: { lists: ['events'], addon: 'calendar' },
    rows: { title: 'what', day: 'day', meta: 'time' },
    example: { rows: [{ title: 'Call with the accountant', meta: 'Tomorrow · 10:00' }, { title: 'Studio walk-through', meta: 'Tomorrow · 14:00' }] },
    words: ['calendar', 'meetings', 'events', 'schedule', 'appointments'],
  },
  /* ONE TRIP, COUNTED DOWN, AND GONE AFTER IT (Call 18): `until` is the trip's last day, filled with the trip as
     `{{trip_until}}`, so the board stops drawing it once he is back. Drawn, since no kind counts days to one row. */
  {
    id: 'trip-countdown',
    title: 'Trip countdown',
    says: 'The days until your next trip, or the one you pick. It leaves the board on its own once you are back.',
    group: 'life',
    for: 'personal',
    icon: 'plane',
    block: {
      kind: 'drawn',
      heading: '{{trip}}',
      icon: 'plane',
      source: 'register.trips',
      where: 'name is "{{trip}}"',
      columns: [{ field: 'name' }, { field: 'from' }, { field: 'to' }],
      order: [{ field: 'from', dir: 'asc' }],
      limit: 1,
      until: '{{trip_until}}',
      code: TRIP_COUNTDOWN,
    },
    blanks: [{ id: 'trip', asks: 'Which trip?' }],
    sizes: ['small', 'wide', 'tall'],
    size: 'small',
    needs: { lists: ['trips'], addon: 'trips' },
    rows: { title: 'name', day: 'from' },
    example: { figures: [{ label: 'until Lisbon', said: '16 days' }] },
    words: ['travel', 'holiday', 'countdown', 'flight', 'days until', 'next trip', 'trip'],
  },
];

/** A template by its id, or `undefined`. */
export const widgetById = (id: string): WidgetTemplate | undefined => WIDGETS.find((w) => w.id === id);

/** Whether a template draws at a size. */
export const widgetFits = (t: Pick<WidgetTemplate, 'sizes'>, size: WidgetSize): boolean => t.sizes.includes(size);


/**
 * THE TWO STARTER BOARDS (§3.7, Call 17): six widgets each, small enough to read on one phone screen and a laptop's
 * first glance (risk 2, "nine phone screens of tiles"). Everyone can add any other.
 */
export const STARTER_BOARDS: Readonly<Record<'personal' | 'business', readonly { id: string; size: WidgetSize }[]>> = {
  personal: [
    { id: 'cash-today', size: 'wide' },
    { id: 'spending', size: 'wide' },
    { id: 'coming-up', size: 'tall' },
    { id: 'savings-goal', size: 'small' },
    { id: 'habits', size: 'small' },
    { id: 'people-back', size: 'tall' },
  ],
  business: [
    { id: 'needs-you', size: 'wide' },
    { id: 'late', size: 'wide' },
    { id: 'agents-working', size: 'wide' },
    { id: 'cash-today', size: 'wide' },
    { id: 'numbers', size: 'wide' },
    { id: 'projects', size: 'full' },
  ],
};

/** Every `{{blank}}` in a block filled from `values`; a blank with no value is left as it is written. Deep, and pure. */
export function fillBlanks<T>(block: T, values: Readonly<Record<string, string>>): T {
  const fill = (v: unknown): unknown => {
    if (typeof v === 'string') return v.replace(/\{\{([a-z_]+)\}\}/gu, (all, name: string) => (Object.hasOwn(values, name) ? values[name]! : all));
    if (Array.isArray(v)) return v.map(fill);
    if (v !== null && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, fill(x)]));
    return v;
  };
  return fill(block) as T;
}

/**
 * The blanks a template's blanks name, which `fillBlanks` leaves alone unless asked: `{{name}}` inside a card is the row's.
 * Each blank may bring its last day with it, `{{<blank>_until}}`, filled from the same choice (a trip and the day it ends).
 */
const OWN_BLANKS = (t: Pick<WidgetTemplate, 'blanks'>): string[] => (t.blanks ?? []).flatMap((b) => [b.id, `${b.id}_until`]);

/**
 * A template as a block a board can hold: its blanks filled, its rows capped to what the size shows, and nothing a
 * board writes for itself (the size and the key are the board's). The board's `onadd({ block, size })` takes this.
 */
export function widgetBlock(t: WidgetTemplate, size: WidgetSize = t.size, values: Readonly<Record<string, string>> = {}): Record<string, unknown> {
  const own = Object.fromEntries(Object.entries(values).filter(([k]) => OWN_BLANKS(t).includes(k)));
  const block = fillBlanks({ ...t.block }, own) as Record<string, unknown>;
  /* AN `until` NOTHING FILLED IS LEFT OUT: the widget then stays until it is taken away, rather than being refused. */
  if (typeof block.until === 'string' && block.until.includes('{{')) delete block.until;
  if (typeof block.limit === 'number' && block.kind !== 'kpis') block.limit = Math.min(block.limit, ROWS_AT[size]);
  if (block.kind === 'feed' && typeof block.first === 'number') block.first = Math.min(block.first, ROWS_AT[size]);
  return block;
}

/**
 * The blanks as picked once one changed: the new choice, and where the blank brings a last day (a trip), that choice's
 * day as `<blank>_until`, so the widget leaves after the trip picked and not after the first one offered.
 */
export function chosenWith(w: Pick<GalleryWidget, 'untils'>, chosen: Readonly<Record<string, string>>, id: string, value: string): Record<string, string> {
  const next: Record<string, string> = { ...chosen, [id]: value };
  const day = w.untils?.[id]?.[value];
  if (day !== undefined) next[`${id}_until`] = day;
  else delete next[`${id}_until`];
  return next;
}

/** Whether a template matches what was typed in the sheet's search: its name, its line, its group or its own words. */
export function widgetMatches(t: WidgetTemplate, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/u).filter((w) => w !== '');
  if (words.length === 0) return true;
  const hay = [t.title, t.says, GROUP_NAMES[t.group], t.for, ...(t.words ?? []), t.needs.addon ? (WIDGET_ADDONS[t.needs.addon] ?? '') : ''].join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

/* ── a reading, as a preview draws it ─────────────────────────────────────────────────────────────────────────── */

/** One figure as a preview draws it: its label, its value in minor units or a number, its unit and format. */
export type ReadFigure = { label: string; value: number | null; unit: string | null; format: string; met: boolean | null; line?: (number | null)[]; said?: string };
/** One row as a preview draws it: its title, a day, an amount in minor units, and a short line under it. */
export type ReadRow = { title: string; day?: string; amount?: { amount: number; currency: string }; meta?: string; done?: number; of?: number };

/**
 * WHAT A WIDGET SHOWS IN THE GALLERY, distilled from its block as `previewPage` answered it: a few figures or a few rows,
 * how many there are in all, and the block's own empty words when it holds nothing. `fix` is the record's sentence when
 * it refused the block. Small on purpose: the sheet asks for two dozen at once.
 */
export type WidgetReading = { figures?: ReadFigure[]; rows?: ReadRow[]; count: number; empty: string | null; fix?: string };

const isBag = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const textOf = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : typeof v === 'number' ? String(v) : undefined);
const amountOf = (v: unknown): { amount: number; currency: string } | undefined =>
  isBag(v) && typeof v.amount === 'number' && typeof v.currency === 'string' ? { amount: v.amount, currency: v.currency } : undefined;

/** How many rows a preview keeps: enough for the largest size's first glance. */
export const PREVIEW_ROWS = 6;
/** How many points of a figure's line a preview keeps, the newest. */
export const PREVIEW_POINTS = 28;

/** A block as `previewPage` answered it, distilled to what a widget's preview draws (`WidgetReading`). */
export function distill(t: Pick<WidgetTemplate, 'rows' | 'block'>, drawn: unknown, opts: { now?: number } = {}): WidgetReading {
  const b = isBag(drawn) ? drawn : {};
  const empty = textOf(t.block.empty) ?? null;
  const refusals = Array.isArray(b.refusals) ? (b.refusals as unknown[]) : [];
  const fix = refusals.length > 0 && isBag(refusals[0]) ? textOf(refusals[0].fix) : undefined;
  const matched = typeof b.matched === 'number' ? b.matched : 0;
  /* FIGURES: a stat's readings, each by its cell's label. A progress block carries the figure it sets its rows against
     as a reading too, and is a list. */
  if (Array.isArray(b.readings) && t.block.kind !== 'progress') {
    const figures = (b.readings as unknown[]).flatMap((r): ReadFigure[] => {
      if (!isBag(r)) return [];
      const reading = isBag(r.reading) ? r.reading : null;
      if (reading === null) return [];
      const line = Array.isArray(r.trend) ? (r.trend as unknown[]).map((p) => (typeof p === 'number' ? p : null)).slice(-PREVIEW_POINTS) : undefined;
      const value = typeof reading.value === 'number' ? reading.value : null;
      return [
        {
          label: textOf(r.label) ?? textOf(r.metric) ?? '',
          value,
          unit: typeof reading.unit === 'string' ? reading.unit : null,
          format: typeof r.format === 'string' ? r.format : 'int',
          met: typeof reading.met === 'boolean' ? reading.met : null,
          ...(line && line.some((p) => p !== null) ? { line } : {}),
        },
      ];
    });
    const any = figures.some((f) => f.value !== null);
    return { figures, count: figures.length, empty: any ? null : empty, ...(fix && !any ? { fix } : {}) };
  }
  /* BARS BY WEEK OR MONTH (a `series` over a figure that sums by bucket): the period now, the one before, and the line. */
  if (isBag(b.bars) && Array.isArray(b.bars.values) && Array.isArray(b.bars.values[0])) {
    const now = (b.bars.values[0] as unknown[]).map((v) => (typeof v === 'number' ? v : null));
    const unit = typeof b.bars.unit === 'string' && /^[A-Z]{3}$/u.test(b.bars.unit) ? b.bars.unit : null;
    const per = b.bars.bucket === 'month' ? 'month' : 'week';
    const at = (i: number): number => now.at(i) ?? 0;
    const format = unit !== null ? 'money' : 'decimal';
    const figures: ReadFigure[] = [
      { label: `This ${per}`, value: at(-1), unit, format, met: null, ...(now.filter((v) => v !== null).length > 1 ? { line: now.map((v) => v ?? 0).slice(-PREVIEW_POINTS) } : {}) },
      { label: `Last ${per}`, value: at(-2), unit, format, met: null },
    ];
    return { figures, count: now.length, empty: now.some((v) => v !== null) ? null : empty, ...(fix ? { fix } : {}) };
  }
  /* A LINE OF TOTALS BY WEEK OR MONTH (`lines` over a list): the period now, the one before, and the line. */
  if (Array.isArray(b.measures) && b.measures.length > 0 && isBag(b.measures[0])) {
    const m = b.measures[0] as Record<string, unknown>;
    const now = Array.isArray(m.now) ? (m.now as unknown[]).map((v) => (typeof v === 'number' ? v : null)) : [];
    const cols = Array.isArray(t.block.columns) ? (t.block.columns as unknown[]) : [];
    const money = cols.some((c) => isBag(c) && typeof c.field === 'string' && /amount|paid|value|total|price/u.test(c.field));
    const per = m.bucket === 'month' ? 'month' : 'week';
    const at = (i: number): number => now.at(i) ?? 0;
    const figures: ReadFigure[] = [
      { label: `This ${per}`, value: at(-1), unit: null, format: money ? 'money' : 'decimal', met: null, ...(now.filter((v) => v !== null).length > 2 ? { line: now.slice(-PREVIEW_POINTS) } : {}) },
      { label: `Last ${per}`, value: at(-2), unit: null, format: money ? 'money' : 'decimal', met: null },
    ];
    return { figures, count: now.length, empty: now.some((v) => v !== null) ? null : empty, ...(fix ? { fix } : {}) };
  }
  /* KEY NUMBERS: each with its latest point and its line. */
  if (Array.isArray(b.kpis)) {
    const figures = (b.kpis as unknown[]).slice(0, 5).flatMap((k): ReadFigure[] => {
      if (!isBag(k)) return [];
      const latest = isBag(k.latest) && typeof k.latest.value === 'number' ? k.latest.value : null;
      const points = Array.isArray(k.points) ? (k.points as unknown[]).map((p) => (isBag(p) && typeof p.value === 'number' ? p.value : null)).slice(-PREVIEW_POINTS) : [];
      /* SAID AS TODAY'S CARD SAYS IT (`kpiView`): a flow is its last whole month, not its latest reading, so the sheet and
         Today name one number (the validator's audit of 30 October, 12). */
      let said: string | undefined;
      try {
        /* ON THE RECORD'S OWN CLOCK, as Today reads it: on the machine's, a record whose day is not today counted another
           month as its last whole one ("32 hours" against Today's 28, the validator's recheck of 30 October, 12). */
        const v = kpiView(k as unknown as KpiInput, opts.now !== undefined ? { now: opts.now } : {});
        if (v.figure) said = v.figure.after === '' || /^[A-Z]{3}$/u.test(v.figure.after) ? v.figure.text : v.figure.main;
      } catch {
        said = undefined;
      }
      return [{ label: textOf(k.name) ?? '', value: latest, unit: textOf(k.unit) ?? null, format: 'decimal', met: null, ...(said ? { said } : {}), ...(points.length > 1 ? { line: points } : {}) }];
    });
    return { figures, count: (b.kpis as unknown[]).length, empty: figures.length > 0 ? null : empty, ...(fix ? { fix } : {}) };
  }
  /* THE QUEUE: each question. */
  if (Array.isArray(b.queue)) {
    const rows = (b.queue as unknown[]).slice(0, PREVIEW_ROWS).flatMap((q): ReadRow[] => (isBag(q) && textOf(q.question) ? [{ title: textOf(q.question)! }] : []));
    return { rows, count: Math.max(matched, rows.length), empty: rows.length > 0 ? null : empty, ...(fix ? { fix } : {}) };
  }
  /* THE FEED: what changed. */
  if (Array.isArray(b.feed)) {
    /* EACH THING ONCE, IN PLAIN WORDS: the same filing twice in a row read as a stutter, and a bank's shouted payee as a
       code (the validator's recheck of 30 October, 33). */
    const seen = new Set<string>();
    const rows = (b.feed as unknown[])
      .flatMap((f): ReadRow[] => {
        if (!isBag(f)) return [];
        const title = plainName(textOf(f.thing));
        if (title === undefined || seen.has(title)) return [];
        seen.add(title);
        return [{ title, ...(textOf(f.at) ? { day: textOf(f.at)!.slice(0, 10) } : {}) }];
      })
      .slice(0, PREVIEW_ROWS);
    return { rows, count: Math.max(matched, rows.length), empty: rows.length > 0 ? null : empty };
  }
  /* A LIST: its rows by the fields the template names. */
  const read = t.rows;
  const raw = Array.isArray(b.rows) ? (b.rows as unknown[]) : [];
  const scopes = Array.isArray(b.scopes) ? (b.scopes as unknown[]) : [];
  /* A PROGRESS BLOCK SETS EACH ROW AGAINST ITS FIGURE'S PART FOR THAT ROW: the reading's groups, keyed by the row. */
  const groups = new Map<string, number>();
  if (t.block.kind === 'progress' && Array.isArray(b.readings))
    for (const r of b.readings as unknown[])
      if (isBag(r) && isBag(r.reading) && Array.isArray(r.reading.groups))
        for (const g of r.reading.groups as unknown[]) if (isBag(g) && typeof g.key === 'string' && typeof g.value === 'number') groups.set(g.key, g.value);
  const progressOf = (r: Record<string, unknown>, title: string): { done: number; of: number } | null => {
    if (t.block.kind !== 'progress' || read === undefined) return null;
    const f = r.fields as Record<string, unknown>;
    const target = read.amount ? f[read.amount] : undefined;
    const of = amountOf(target)?.amount ?? (typeof target === 'number' ? target : null);
    if (of === null || of <= 0) return null;
    const spoken = typeof r.register === 'string' && typeof r.seq === 'number' ? `${r.register}#${r.seq}` : '';
    const done = groups.get(String(r.id)) ?? groups.get(spoken) ?? groups.get(title) ?? 0;
    return { done, of };
  };
  const rows = raw.slice(0, PREVIEW_ROWS).flatMap((r, i): ReadRow[] => {
    if (!isBag(r) || !isBag(r.fields) || read === undefined) return [];
    const f = r.fields;
    /* A NAME IN A PERSON'S WORDS WHERE THE ROW KEEPS ONE (a payment's payee), else its title tidied: a bank's capitals
       ("FENWICK CLOUD") said as a name is said (audit of 30 October, 13). */
    const title = plainName(textOf(f.payee) ?? textOf(f[read.title]));
    if (title === undefined) return [];
    const day = read.day ? textOf(f[read.day]) : undefined;
    const amount = read.amount ? amountOf(f[read.amount]) : undefined;
    const meta = read.meta ? (textOf(f[read.meta]) ?? (typeof scopes[i] === 'string' ? (scopes[i] as string) : undefined)) : undefined;
    const p = progressOf(r, title);
    return [{ title, ...(day ? { day: day.slice(0, 10) } : {}), ...(amount ? { amount } : {}), ...(meta ? { meta } : {}), ...(p ? p : {}) }];
  });
  return { rows, count: Math.max(matched, rows.length), empty: rows.length > 0 ? null : empty, ...(fix && rows.length === 0 ? { fix } : {}) };
}

/* ── the gallery's answer ─────────────────────────────────────────────────────────────────────────────────────── */

/** What the record says of one widget for the sheet: the template's parts, its block filled, and a reading or a need. */
export type GalleryWidget = {
  id: string;
  title: string;
  says: string;
  group: WidgetGroup;
  for: WidgetFor;
  icon: string;
  sizes: WidgetSize[];
  size: WidgetSize;
  /** The block filled from the record, at its own size: what `onadd` hands the board. */
  block: Record<string, unknown>;
  /** The blanks as filled, by id, and the other things the record could fill each with, by name. */
  filled: Record<string, string>;
  choices: Record<string, string[]>;
  /** For a blank that brings its last day (a trip), that day by choice: what `chosenWith` fills `<blank>_until` from. */
  untils?: Record<string, Record<string, string>>;
  /** The add-on it comes with, by id and name, or `null` for one of the core's. */
  addon: { id: string; name: string } | null;
  /** True when the record holds what it reads; false and `need` says what would fill it. */
  ready: boolean;
  need: string | null;
  reading: WidgetReading | null;
  example: WidgetExample;
  /** True when Today already has a widget reading the same thing: the sheet says so, and suggests it nowhere. */
  onBoard?: boolean;
  /** The heading Today shows it under, where that is not the widget's own name ("Work this week" for Next up). */
  onBoardAs?: string;
};

/** A widget offered from use, with its reason (§6): what `widgetGallery`'s `suggested` and Today's cell carry. */
export type WidgetOffer = {
  /** Stable across readings, `widget:<template>[:<blank>]`, and the id `pen.dismissed` keeps for Forget. */
  key: string;
  widget: string;
  title: string;
  why: string;
  size: WidgetSize;
  block: Record<string, unknown>;
  /** The signal it rests on (S1 to S6), and its score. */
  signal: 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';
  score: number;
  /** On S6, the board key of the widget it suggests taking away, and no block to add. */
  remove?: string;
  /** On S1, how many times the question was asked: the palette says "you've asked this 3 times". */
  asked?: number;
  /** The widget drawn small on the record's own data, so the cell shows the real thing; absent where it was not read. */
  reading?: WidgetReading;
};

export type GalleryAnswer = { widgets: GalleryWidget[]; suggested: WidgetOffer[] };

/* ── a question asked again ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * WHICH WIDGET ANSWERS A QUESTION (signal S1, widgets plan §6.1): the words a question to Slash is matched to a widget by,
 * the first that matches winning, so the narrower come first. The record counts the days each was asked on; the palette
 * reads the same words to say "you've asked this 3 times" under an answer. Rules, never a model.
 */
export const ASKED: readonly { widget: string; re: RegExp; about: string }[] = [
  { widget: 'net-worth', re: /\bnet ?worth\b/iu, about: 'your net worth' },
  { widget: 'budget-left', re: /\bbudgets?\b/iu, about: 'your budgets' },
  { widget: 'cash-today', re: /\b(runway|run out|how long (will|does|would) (the |my |our )?(cash|money) last)\b/iu, about: 'how long the cash lasts' },
  { widget: 'owed-to-you', re: /\b(owe[sd]? (me|us)|owed to (me|us)|unpaid invoices?|outstanding)\b/iu, about: 'what is owed to you' },
  { widget: 'late', re: /\b(late|overdue)\b/iu, about: 'what is late' },
  { widget: 'coming-up', re: /\b(bills?|what (do i|have i got to) pay)\b/iu, about: 'bills coming up' },
  { widget: 'spending', re: /\b(spen[dt]|spending|expenses?|went on)\b/iu, about: 'what you spent' },
  { widget: 'cash-today', re: /\b(cash|balance|in the bank|how much (money )?(do|have) (i|we) (have|got))\b/iu, about: 'your cash' },
  { widget: 'subscriptions', re: /\bsubscriptions?\b/iu, about: 'your subscriptions' },
  { widget: 'gold-price', re: /\bgold\b/iu, about: 'gold' },
  { widget: 'exchange-rate', re: /\b(exchange rate|dollar rate|usd|the rate)\b/iu, about: 'the exchange rate' },
  { widget: 'savings-goal', re: /\b(savings?|saving for|goal)\b/iu, about: 'your savings' },
  { widget: 'trip-countdown', re: /\b(trip|travel|flight|holiday)\b/iu, about: 'your trip' },
  { widget: 'habits', re: /\b(habits?|streak)\b/iu, about: 'your habits' },
  { widget: 'people-back', re: /\b(get back to|in touch|haven'?t (talked|spoken|heard))\b/iu, about: 'who to get back to' },
  { widget: 'agents-working', re: /\b(agents?|claude|codex|cursor) (are |is )?(working|doing|on)\b/iu, about: 'what the agents are doing' },
  { widget: 'numbers', re: /\b(kpis?|key numbers|metrics)\b/iu, about: 'your key numbers' },
  { widget: 'next-up', re: /\b(tasks?|to ?do|what('s| is) (due|next)|due this week)\b/iu, about: 'what is due' },
];

/** The widget a question asks about, by its words, or `null`. */
export const askedWidget = (text: string): string | null => ASKED.find((a) => a.re.test(text))?.widget ?? null;

/**
 * ABOUT WHAT A UNIT OF EACH CURRENCY IS WORTH IN US DOLLARS, for the exchange rate's example only: the gallery says the
 * record's own money against the dollar ("£1 = $1.27" on a GBP record), never somebody else's rate (the coordinator's
 * word of 30 October, after "USD 48.62", an EGP rate, showed on a GBP record). Never a rate anything is worked out from.
 */
const SAMPLE_DOLLARS: Readonly<Record<string, number>> = {
  GBP: 1.27, EUR: 1.08, CHF: 1.13, CAD: 0.73, AUD: 0.66, NZD: 0.6, AED: 0.27, SAR: 0.27, QAR: 0.27, KWD: 3.26, BHD: 2.65,
  OMR: 2.6, JOD: 1.41, EGP: 0.0206, INR: 0.012, PKR: 0.0036, JPY: 0.0067, CNY: 0.14, TRY: 0.029, MAD: 0.1, NGN: 0.00065,
  ZAR: 0.055, KES: 0.0077, SEK: 0.095, NOK: 0.093, DKK: 0.145, PLN: 0.25, BRL: 0.18, MXN: 0.055, SGD: 0.75, HKD: 0.128,
};

/** The sample rate as the record says it: its unit against a dollar, or a dollar against it where its unit is small. */
function sampleRate(home: string | null): string {
  const write = (major: number, currency: string): string =>
    moneySet([Math.round(major * 10 ** exponentOf(currency))], currency, currency).written[0]?.text ?? `${currency} ${major}`;
  if (home === null || home === 'USD') return `${write(1, 'USD')} = ${write(0.92, 'EUR')}`;
  const dollars = SAMPLE_DOLLARS[home];
  if (dollars === undefined) return `${write(1, home)} in dollars`;
  return dollars >= 0.5 ? `${write(1, home)} = ${write(dollars, 'USD')}` : `${write(1, 'USD')} = ${write(1 / dollars, home)}`;
}

/**
 * A sample figure rounded as a person would say it, and plainly a round one: two figures at most (live check of 30
 * October, 4), so "EGP 1,210,000" and "EGP 383,000" read as his own numbers where "EGP 1,200,000" and "EGP 380,000" do not.
 */
const sampleRound = (n: number): number => {
  if (n < 10) return Math.max(1, Math.round(n));
  const keep = 2;
  const step = 10 ** (Math.floor(Math.log10(n)) + 1 - keep);
  return Math.round(n / step) * step;
};

/**
 * An example's money said in the record's currency. Each `¤1,240` is written in US dollars and said as about that much
 * of the record's own money (`SAMPLE_DOLLARS`), so a gram of gold is about £87 on a GBP record and about EGP 5,300 on
 * an EGP one, never an EGP figure with a £ in front of it (the validator's recheck of 30 October, 12). A currency the
 * table does not know says the dollars as dollars. `¤fx` is the record's money against the dollar (`sampleRate`). Pure.
 */
export function exampleMoney(text: string, home: string | null): string {
  if (text.includes('¤fx')) text = text.replace(/¤fx/gu, () => sampleRate(home));
  return text.replace(/¤([0-9][0-9,]*)/gu, (_all, n: string) => {
    const dollars = Number(n.replace(/,/gu, ''));
    if (!Number.isFinite(dollars)) return n;
    if (home === null) return dollars.toLocaleString('en');
    const rate = home === 'USD' ? 1 : SAMPLE_DOLLARS[home];
    const currency = rate === undefined ? 'USD' : home;
    const whole = rate === undefined ? dollars : sampleRound(dollars / rate);
    return moneyWhole(whole * 10 ** exponentOf(currency), currency, currency)?.text ?? `${currency} ${whole.toLocaleString('en')}`;
  });
}

/** A line a bank shouted, said as a name: "FENWICK CLOUD" as "Fenwick Cloud". Anything already in mixed case is left. */
export function plainName(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  if (!/[A-Z]{3}/u.test(text) || /[a-z]/u.test(text)) return text;
  /* THREE LETTERS OR FEWER ARE INITIALS, as `readable` keeps them: the exchange rate's "USD" read "Usd" (live check of
     30 October, 19). */
  if ((text.match(/\p{L}/gu) ?? []).length <= 3) return text;
  return text.toLowerCase().replace(/(^|[\s/&(-])(\p{L})/gu, (_a, pre: string, ch: string) => pre + ch.toUpperCase());
}
