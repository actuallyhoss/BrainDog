/**
 * Mercury, pulled: the company's bank balances arriving on their own, instead of being typed in.
 *
 * WHY A BANK AND WHY THIS ONE. `loop/research-switch.md` lists *Company cash: Mercury and Stripe
 * pulls* as the one money figure the record cannot answer without a person retyping it, and a
 * balance somebody retypes is a balance that is right on the day they did it and wrong every day
 * after. Mercury was picked over Stripe because a bank answers the question the Money page actually
 * asks (*what is in the account today*) in one request with no pagination, where Stripe answers a
 * ledger of charges whose direction this record cannot yet read. The reason for that second half is
 * written out below, because it is the thing standing between this pack and a transactions feed.
 *
 * ONE REQUEST AN HOUR AND NO PAGE LOOP. `GET /api/v1/accounts` answers every account on the profile
 * in one body, `{"accounts":[{ "name": …, "currentBalance": 1234.56, … }]}`, so `read.rows` is
 * `accounts` and there is no `page:`. Mercury publishes a limit of 100 requests a minute; hourly is
 * four orders of magnitude inside it, and the connector floor `25 §9` puts at fifteen minutes is
 * not reached either. The six-hour floor in that section is the open-banking one and Mercury's API
 * is a direct one, so it is not declared here and the reason is said rather than left to be guessed.
 *
 * THE KEY IS NAMED AND NEVER CARRIED. `fetch.auth` is `bearer` against a grant LABEL, which is the
 * only thing about a credential a pack may hold (`42 §4.7`, `SECRET_IN_PACK`). Nothing in this file
 * is a token, and the one place in the tree that sets `Authorization` is
 * `packages/connect/src/auth.ts`. With no grant behind that label the run refuses before a single
 * byte leaves: `packages/connect/src/run.ts` throws `PULL_AUTH_REJECTED` at `grant` when the job
 * carries no sealed credential, the outcome is `paused` rather than `failed`, and no retry ladder
 * runs against a bank's auth endpoint. `packages/connect/test/mercury.test.ts` asserts both halves,
 * including that the `Http` port was never called.
 *
 * IDEMPOTENCE IS THE `dedupe:` AND NOTHING ELSE. `dedupe: ['name']` with `on_conflict: 'update'`
 * means the second run of the same hour finds the row it wrote in the first and writes over it, so
 * a balance that moved moves the row rather than adding one. Mercury's account `name` carries the
 * last four digits of the account number (`Mercury Checking ••1234`), which is what makes it a key
 * rather than a guess. The honest key would be Mercury's own account id, and `accounts` has no
 * field to put one in; that limit is measured in `packages/seed/test/mercury.test.ts` rather than
 * asserted here.
 *
 * WHAT THIS PACK DOES NOT DO, AND IT IS NOT AN OVERSIGHT. It does not write `transactions`. A
 * transaction's `direction` is a required enum of `in` and `out` (`packages/seed/src/modules/
 * money.ts`), and no provider sends that word: Mercury, like Stripe and like every bank API read
 * for this, carries the direction as the SIGN of `amount`. A `map:` cannot turn a sign into a word.
 * `mapField`'s `enum` arm writes the provider's own value through verbatim when it is in `values:`
 * and otherwise falls back to `other:` (`packages/kernel/src/map.ts`), so the only two reachable
 * answers are *the field is unreadable and the whole row goes to `needs-review`* and *every row is
 * filed the same way*. The translation table that would do it, `{ enum: { map: { literal: value } } }`,
 * exists only in the `extract:` grammar, and `42 §4.7` forbids `extract:` on a `pull`. The
 * measurement is in `packages/seed/test/mercury.test.ts`, and it is worse than it sounds: the
 * declaration installs clean, the page is fetched and paid for, and `applyPage` answers
 * `{ wrote: 0, kept: 1 }`, so a ledger connector would look like a working connector for ever.
 */

/** Mercury's own host. Overridable so a test can point at a host that is not a bank. */
export const MERCURY_BASE = 'https://api.mercury.com';

/** Mercury settles in United States dollars only, so the amount path carries no currency of its own. */
export const MERCURY_CURRENCY = 'USD';

export type MercurySpec = {
  /** Names the pack, `mercury-<id>`, and its pull. Lower case, digits and hyphens. */
  id: string;
  /** The label of the key in the vault the request sends. A label, never a value. */
  grant: string;
  /** `1h` is the default and is four orders of magnitude inside Mercury's published limit. */
  every?: string;
  /** The origin, for a test. A literal `https://` host, never computed. */
  base?: string;
};

/** A spec's id as an identifier: lower case, digits, and underscores for everything else. */
const ident = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .replace(/_+/gu, '_');

const hostOf = (base: string): string => {
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
};

/**
 * The pack document for one Mercury profile: one pull, one row per account.
 *
 * `kind` AND `liquid` ARE STATED AND NOT READ, because they are facts about Mercury rather than
 * about the answer. Every Mercury account is a bank account a person can spend from today, so
 * reading Mercury's own `kind` (`checking`, `savings`) into this record's `kind` (`bank`, `cash`,
 * `card`) would be a translation with one possible result, written as though it had several.
 *
 * `as_of` IS THE ARRIVAL AND NOT A FIELD OF THE ANSWER. Mercury's accounts carry `createdAt`, which
 * is when the account was opened, and nothing saying when the balance was last true. The instant
 * the answer arrived is the honest date for it, and it is the record's own clock rather than the
 * connector's (`43 §4.5`'s `{ arrived: true }`).
 */
export function mercuryPack(spec: MercurySpec): Record<string, unknown> {
  const base = spec.base ?? MERCURY_BASE;
  const every = spec.every ?? '1h';
  const grant = spec.grant.trim();
  const ingest = `mercury_${ident(spec.id)}`.slice(0, 32).replace(/_+$/u, '');
  return {
    pack: `mercury-${spec.id}`,
    version: '1.0.0',
    summary: `Reads the balance of every Mercury account from ${hostOf(base)} every ${every}, into Money's accounts.`,
    author: 'BrainDog',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: { 'money-core': '^1.0.0' } },
    declarations: [
      {
        ingest,
        channel: 'pull',
        /* BOTH INTERVALS, BECAUSE TWO THINGS READ THEM. The record arms the `pull` schedule row off
           the top-level `every` (`packages/kernel/src/index.ts`, `arm('pull', …)`) and refuses it
           below the floor at install; `@braindog/connect` computes the next slot off
           `fetch.schedule.every`. A declaration carrying one of them fires on a cadence nothing
           else agrees with. */
        every,
        fetch: {
          base,
          path: '/api/v1/accounts',
          method: 'GET',
          auth: { kind: 'bearer', grant },
          schedule: { every },
          /* THE LIST IS UNDER `accounts`, and saying so is what makes a body that changed shape a
             refusal rather than an empty successful run: `run.ts` answers `PULL_SHAPE_MISMATCH`
             when this path reaches something that is not a list. */
          read: { rows: 'accounts' },
          /* ONE REQUEST, AND THE DECLARATION SAYS SO. Mercury answers every account in one body, so
             a page loop would be a second request against a bank for a page that cannot exist. */
          page: { kind: 'none' },
          /* A PROFILE WITH NO ACCOUNTS IS AN ANSWER THIS RECORD SHOULD NOT WRITE. The default
             `on_fail` is `review`, so a body with no `accounts` key at all keeps its bytes and goes
             in front of a person instead of clearing the balances the last run wrote. */
          expect: [{ path: 'accounts', present: true }],
          limits: { rows_per_run: 200, max_pages: 1, timeout: '10s' },
        },
        map: {
          name: { path: 'name', type: 'text' },
          kind: { value: 'bank' },
          balance: { path: 'currentBalance', type: 'money', currency: MERCURY_CURRENCY },
          as_of: { arrived: true },
          liquid: { value: true },
        },
        writes: { register: 'accounts', confidence: 'exact' },
        /* THE NAME CARRIES THE LAST FOUR DIGITS, which is what makes it a key. See the header. */
        dedupe: ['name'],
        /* A BALANCE THAT MOVED MOVES THE ROW. `skip` would keep the first hour's figure for ever and
           report every hour after it as a run that wrote nothing, which reads as a working connector. */
        on_conflict: 'update',
      },
    ],
  };
}
