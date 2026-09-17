/**
 * Small business: the first-party setup onboarding made before use cases existed (`loop/research-spark.md` §4).
 *
 * IT CARRIES NO PACK AND NO VOICE. Its modules are whichever first-party packs the sentence names, which
 * is what onboarding already did, and it speaks in the house voice. It is in the catalogue so the
 * arranger can say "this reads like a business" as plainly as it says "student".
 */

/** Money in minor units, as every example writes it. */
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

/**
 * THE EXAMPLE ROWS A SMALL BUSINESS GETS in the modules its sentence turned on, one per list at most and no refs
 * (`install.ts`). Without them a bakery's first day was every figure at £0.00 under "Nothing is due this week",
 * while setting up said it had added example rows.
 */
export const BUSINESS_EXAMPLES = [
  { register: 'accounts', fields: { name: 'Business current account', kind: 'bank', balance: gbp(412_000), as_of: '0d', liquid: true } },
  { register: 'obligations', fields: { what: 'Invoice 2026-014', direction: 'owed_to_me', amount: gbp(85_000), due: '+11d', state: 'open', category: 'client_work' } },
  { register: 'things', fields: { name: 'Wholesale orders', lane: 'earning', since: '-120d' } },
  { register: 'tasks', fields: { what: 'Send this month invoices', state: 'open', by: '+4d' } },
  { register: 'services', fields: { name: 'Accounting software', kind: 'saas', state: 'live', cost: gbp(2_400), cycle: 'monthly', renews: '+21d' } },
];

export const BUSINESS = {
  usecase: 'business',
  version: '1.1.0',
  title: 'Small business',
  summary: 'What you are owed and what you owe, what you run on, the people involved and the work.',
  author: 'BrainDog',
  license: 'MIT',
  audience: 'individual',
  tone: 'plain, the house voice',
  signals: [
    'business', 'small business', 'my business', 'studio', 'agency', 'shop', 'store', 'freelance', 'freelancer', 'freelancing',
    'consultancy', 'consulting', 'clients', 'client', 'customers', 'invoice', 'invoices', 'invoicing', 'domains',
    'hosting', 'subscriptions', 'contractors', 'accountant', 'vat', 'bookkeeping', 'retainer', 'foundry',
  ],
  modules: [],
  skills: [],
};
