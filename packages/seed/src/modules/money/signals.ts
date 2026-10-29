/**
 * THE WORDS A PERSON USES FOR WHAT THIS PACK KEEPS, which the first run listens for in the sentence it is told
 * (`apps/web/src/lib/shape.ts`), carried in its manifest as `signals` (`firstPartyManifest`). Kept with the pack's own
 * declarations, as an add-on's are in its file: they are its words, and a word one of them shares with an add-on's id
 * ("subscriptions") is the pack's to say and not the code's that reads it. Lower-case words and short phrases, each
 * inflection written out, because the reader matches whole words and never stems.
 */
export const MONEY_SIGNALS: readonly string[] = [
  'freelance', 'freelances', 'freelanced', 'freelancing', 'freelancer', 'invoice', 'invoices', 'invoiced', 'invoicing', 'bill',
  'bills', 'billed', 'billing', 'retainer', 'retainers', 'owe', 'owes', 'owed', 'owing', 'payment', 'payments', 'paid', 'vat',
  'tax', 'taxes', 'money', 'cash', 'fee', 'fees', 'charge', 'charges', 'charged', 'charging',
];
