/**
 * Sixteen descriptions the owner would type on the Slash page, in his words, each drafted over a fresh copy of the seed.
 *
 * `page` IS THE PAGE A DESCRIPTION IS ABOUT, as the page head's Ask sends it: present, the model is handed that page as it
 * is declared and asked to change it rather than build a new one.
 *
 * `stub` IS FOR A RUN WITH NO MODEL ALONE: what the stub model builds for the case (`stub.ts`), so the dry run walks the
 * same path a real model's answer does. A real run never reads it.
 *
 * THE LAST FOUR ARE AT THE HIGHEST BAR, a page as fitted as one a person would have built for
 * themselves: each is three sentences that need a list with its own fields, two figures, a page with a lead line, a chart
 * and a form, and one rule. `stub.built` is what a good answer to one declares, whole, with the sample entries its chart
 * is drawn over, three at least because a chart with fewer says nothing. `tools/model-checks/describe-live.mjs --stub`
 * answers with it, so the record is shown to draw that much clean from one ask; `mends` there leaves out what each table
 * says when it is empty on the first ask, as `stub.ts` does, so the repair is walked at this level too.
 */

type Decl = { id: string; kind: string; body: Record<string, unknown> };
export type Built = { declarations: Decl[]; rows: Record<string, Record<string, unknown>[]> };

export type Case = {
  n: number;
  name: string;
  asked: string;
  page?: string;
  stub: { list: string; title: string; one: string; icon: string; mends?: true; built?: Built };
};

const gbp = (amount: number) => ({ amount, currency: 'GBP' });

const list = (id: string, name: string, one: string, title: string, fields: unknown[]): Decl => ({ id: `register.${id}`, kind: 'register', body: { id, name, one, title, fields } });
const figure = (id: string, name: string, source: string, value: unknown, format: string, where?: string): Decl => ({
  id: `metric.${id}`,
  kind: 'metric',
  body: { metric: id, name, source: `register.${source}`, ...(where === undefined ? {} : { where }), value, format, target: { gte: 0 }, window: '30d', compare: 'none' },
});
const pageOf = (id: string, title: string, icon: string, requires: string[], blocks: unknown[]): Decl => ({
  id: `page.${id}`,
  kind: 'page',
  body: { page: id, title, icon, requires: requires.map((r) => `register.${r}`), blocks },
});
const rule = (id: string, name: string, more: Record<string, unknown>): Decl => ({ id: `rule.${id}`, kind: 'rule', body: { rule: id, name, ...more } });

/** The four blocks every one of the four pages has: the lead line, the chart beside the form, and the list under them. */
const fitted = (lead: string, chart: Record<string, unknown>, form: Record<string, unknown>, table: Record<string, unknown>): unknown[] => [
  { kind: 'note', lead: true, span: 12, body: lead },
  { kind: 'lines', icon: 'chart-line', span: 8, ...chart },
  { kind: 'capture', icon: 'plus', span: 4, ...form },
  { kind: 'table', span: 12, limit: 20, ...table },
];

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
  {
    n: 13,
    name: 'market stall',
    asked:
      'I sell plants at a Saturday market and I want to write down every sale: the plant, what it went for, the day, and whether it was cash or card. ' +
      'Show me what I have taken and how many plants that was, with a chart of the takings day by day and a quick way to add a sale from the page. ' +
      'Tell me when the takings pass £500.',
    stub: {
      list: 'sales',
      title: 'Stall',
      one: 'sale',
      icon: 'wallet',
      built: {
        declarations: [
          list('sales', 'Sales', 'sale', 'plant', [
            { id: 'plant', type: 'text', required: true },
            { id: 'price', type: 'money', required: true },
            { id: 'sold', type: 'day', required: true },
            { id: 'paid_by', type: 'enum', values: ['cash', 'card'] },
          ]),
          figure('stall-takings', 'Stall takings', 'sales', { sum: 'price' }, 'money.GBP'),
          figure('stall-sold', 'Plants sold', 'sales', { count: 'id' }, 'int'),
          pageOf('stall', 'Stall', 'wallet', ['sales'], fitted(
            '{{stall-takings}} taken at the stall, from {{stall-sold}} plants sold.',
            { heading: 'Takings day by day', source: 'register.sales', columns: [{ field: 'sold' }, { field: 'price' }] },
            { heading: 'A sale', register: 'sales' },
            { heading: 'Sold', icon: 'calendar', source: 'register.sales', columns: [{ field: 'plant' }, { field: 'price' }, { field: 'sold' }, { field: 'paid_by' }], order: [{ field: 'sold', dir: 'desc' }], empty: 'Nothing sold yet.' },
          )),
          rule('stall-passed', 'The stall passed £500', { on: { metric: { id: 'stall-takings', crosses: { gte: 50_000 } } }, steps: [{ notify: { say: 'The stall has taken more than £500.' } }] }),
        ],
        rows: {
          sales: [
            { plant: 'Lavender', price: gbp(650), sold: '2026-09-19', paid_by: 'cash' },
            { plant: 'Rosemary', price: gbp(500), sold: '2026-09-26', paid_by: 'card' },
            { plant: 'Tomato seedlings', price: gbp(900), sold: '2026-09-26', paid_by: 'cash' },
            { plant: 'Hardy fuchsia', price: gbp(1_200), sold: '2026-10-01', paid_by: 'card' },
          ],
        },
      },
    },
  },
  {
    n: 14,
    name: 'tutoring',
    asked:
      'I tutor maths and physics in the evenings and I need to keep each lesson: the pupil, the subject, how many minutes, the fee and the day, and whether it has been paid. ' +
      'I want to see what I am still owed and how many lessons I gave, a chart of the minutes I taught day by day, and a form on the page to add a lesson. ' +
      'A week after any lesson, remind me to check it was paid.',
    stub: {
      list: 'lessons',
      title: 'Lessons',
      one: 'lesson',
      icon: 'book-open',
      mends: true,
      built: {
        declarations: [
          list('lessons', 'Lessons', 'lesson', 'pupil', [
            { id: 'pupil', type: 'text', required: true },
            { id: 'subject', type: 'enum', values: ['maths', 'physics'] },
            { id: 'minutes', type: 'int', min: 0 },
            { id: 'fee', type: 'money', required: true },
            { id: 'taught', type: 'day', required: true },
            { id: 'paid', type: 'enum', values: ['owed', 'paid'] },
          ]),
          figure('lessons-owed', 'Still owed', 'lessons', { sum: 'fee' }, 'money.GBP', 'paid is owed'),
          figure('lessons-given', 'Lessons given', 'lessons', { count: 'id' }, 'int'),
          pageOf('lessons', 'Lessons', 'book-open', ['lessons'], fitted(
            '{{lessons-owed}} still owed to you, over {{lessons-given}} lessons given.',
            { heading: 'Minutes taught', source: 'register.lessons', columns: [{ field: 'taught' }, { field: 'minutes' }] },
            { heading: 'A lesson', register: 'lessons', where: 'paid is owed' },
            { heading: 'Not paid yet', icon: 'wallet', source: 'register.lessons', where: 'paid is owed', columns: [{ field: 'pupil' }, { field: 'subject' }, { field: 'fee' }, { field: 'taught' }], order: [{ field: 'taught', dir: 'asc' }], empty: 'Every lesson is paid.' },
          )),
          rule('lesson-paid', 'Check a lesson was paid', { on: { written: { register: 'lessons', op: ['create'] } }, steps: [{ schedule: { in: '7d', note: 'Check this lesson was paid.' } }] }),
        ],
        rows: {
          lessons: [
            { pupil: 'Idris', subject: 'maths', minutes: 60, fee: gbp(3_500), taught: '2026-09-22', paid: 'paid' },
            { pupil: 'Noor', subject: 'physics', minutes: 90, fee: gbp(5_000), taught: '2026-09-24', paid: 'owed' },
            { pupil: 'Idris', subject: 'maths', minutes: 60, fee: gbp(3_500), taught: '2026-09-29', paid: 'owed' },
            { pupil: 'Wren', subject: 'maths', minutes: 45, fee: gbp(2_800), taught: '2026-10-01', paid: 'owed' },
          ],
        },
      },
    },
  },
  {
    n: 15,
    name: 'running log',
    asked:
      'I am training for a half marathon in the spring and I want to log every run: the route, the distance in kilometres, the minutes it took, the day and how it felt. ' +
      'Show me the kilometres I have run and how many runs that is, with a chart of the distance run by run and a box to add today\'s run. ' +
      'Every Sunday at six in the evening, tell me to plan next week\'s runs.',
    stub: {
      list: 'runs',
      title: 'Running',
      one: 'run',
      icon: 'chart-line',
      built: {
        declarations: [
          list('runs', 'Runs', 'run', 'route', [
            { id: 'route', type: 'text', required: true },
            { id: 'km', type: 'decimal', min: 0, required: true },
            { id: 'minutes', type: 'int', min: 0 },
            { id: 'ran', type: 'day', required: true },
            { id: 'felt', type: 'enum', values: ['easy', 'steady', 'hard'] },
          ]),
          figure('runs-km', 'Kilometres run', 'runs', { sum: 'km' }, 'decimal'),
          figure('runs-done', 'Runs', 'runs', { count: 'id' }, 'int'),
          pageOf('running', 'Running', 'chart-line', ['runs'], fitted(
            '{{runs-km}} kilometres run so far, over {{runs-done}} runs.',
            { heading: 'Distance, run by run', source: 'register.runs', columns: [{ field: 'ran' }, { field: 'km' }] },
            { heading: 'Today\'s run', register: 'runs' },
            { heading: 'Every run', icon: 'calendar', source: 'register.runs', columns: [{ field: 'route' }, { field: 'km' }, { field: 'minutes' }, { field: 'ran' }, { field: 'felt' }], order: [{ field: 'ran', dir: 'desc' }], empty: 'No runs logged yet.' },
          )),
          rule('runs-plan', 'Plan next week\'s runs', { on: { every: '1w', at: '18:00', day: 'sun' }, steps: [{ notify: { say: 'Plan next week\'s runs.' } }] }),
        ],
        rows: {
          runs: [
            { route: 'Canal towpath', km: 5.2, minutes: 31, ran: '2026-09-22', felt: 'easy' },
            { route: 'Park loops', km: 8, minutes: 49, ran: '2026-09-25', felt: 'steady' },
            { route: 'Hill road', km: 6.4, minutes: 43, ran: '2026-09-28', felt: 'hard' },
            { route: 'Canal towpath', km: 12, minutes: 76, ran: '2026-10-01', felt: 'steady' },
          ],
        },
      },
    },
  },
  {
    n: 16,
    name: 'baking costs',
    asked:
      'My baking is starting to cost more than I notice, so I want to write down what I buy for it: what it was, what it cost, the day, and whether it was flour, butter, packaging or something else. ' +
      'Put what I have spent beside what I have taken from orders, with a chart of the spending day by day and a form to add a cost. ' +
      'Tell me whenever I write down a cost of more than £50.',
    stub: {
      list: 'costs',
      title: 'Baking costs',
      one: 'cost',
      icon: 'money',
      built: {
        declarations: [
          list('costs', 'Baking costs', 'cost', 'what', [
            { id: 'what', type: 'text', required: true },
            { id: 'amount', type: 'money', required: true },
            { id: 'bought', type: 'day', required: true },
            { id: 'kind', type: 'enum', values: ['flour', 'butter', 'packaging', 'other'] },
          ]),
          figure('costs-spent', 'Spent on baking', 'costs', { sum: 'amount' }, 'money.GBP'),
          figure('costs-count', 'Things bought', 'costs', { count: 'id' }, 'int'),
          /* THE TAKINGS ARE THE SEED'S OWN FIGURE (`record.ts`), read here and not declared again: a good answer reuses
             what the record already says. */
          pageOf('baking-costs', 'Baking costs', 'money', ['costs', 'orders'], fitted(
            '{{costs-spent}} spent on baking across {{costs-count}} buys, against {{takings-month}} taken from orders.',
            { heading: 'Spending day by day', source: 'register.costs', columns: [{ field: 'bought' }, { field: 'amount' }] },
            { heading: 'A cost', register: 'costs' },
            { heading: 'Bought', icon: 'archive', source: 'register.costs', columns: [{ field: 'what' }, { field: 'kind' }, { field: 'amount' }, { field: 'bought' }], order: [{ field: 'bought', dir: 'desc' }], empty: 'Nothing bought yet.' },
          )),
          rule('costs-large', 'A large baking cost', {
            on: { written: { register: 'costs', op: ['create'] } },
            when: 'amount is more than GBP 50.00',
            steps: [{ notify: { say: 'You wrote down a baking cost of more than £50.' } }],
            once_per: ['entry'],
          }),
        ],
        rows: {
          costs: [
            { what: 'Strong white flour, 16 kg', amount: gbp(1_480), bought: '2026-09-21', kind: 'flour' },
            { what: 'Butter, 5 kg', amount: gbp(3_250), bought: '2026-09-25', kind: 'butter' },
            { what: 'Cake boxes', amount: gbp(2_100), bought: '2026-09-29', kind: 'packaging' },
            { what: 'Stand mixer bowl', amount: gbp(6_400), bought: '2026-10-01', kind: 'other' },
          ],
        },
      },
    },
  },
];
