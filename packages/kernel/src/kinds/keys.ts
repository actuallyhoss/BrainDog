/**
 * Each registered kind's own keys, by kind, with none of the kinds' code behind them.
 *
 * WHAT A SCREEN ASKS OF THE REGISTRY IS WHICH KINDS ARE IN IT AND WHAT THEY READ. `drawn.ts` asks whether a kind is a
 * registered one, and `block-keys.ts` which keys each reads, and both used to ask `index.ts`, which imports every kind's
 * module: the form's, the calendar's and the lanes' code reached the app's first open for a list of six names. So the
 * names and the keys are here, `index.ts`'s modules take their keys from this table, and `test/kind-keys.test.ts` holds
 * the two to the same kinds in the same order.
 */

export const KIND_KEYS = {
  calendar: ['back', 'ahead', 'weeks'],
  link: [],
  gallery: [],
  embed: [],
  lanes: ['hours', 'tones'],
  form: ['verb', 'register', 'fields', 'submit', 'after'],
  drawn: ['code', 'height', 'actions'],
  project: ['parts'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

/** Whether `kind` is one a module of its own reads (`index.ts`), never a name `Object.prototype` lends the table. */
export const isRegisteredKind = (kind: string): boolean => Object.hasOwn(KIND_KEYS, kind);
