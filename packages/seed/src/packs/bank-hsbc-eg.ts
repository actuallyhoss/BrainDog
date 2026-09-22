/**
 * HSBC Egypt's text messages and alert mails, read into Money's `transactions`: an optional pack, not part of Money.
 *
 * ONE PERSON'S BANK IS NOT IN THE CORE (`loop/DIRECTION.md` section 22). These six wordings and their six webhook
 * twins were declared by money-core from 1.6.0 to 1.7.0, so every record set up as Personal, Founder or Small business
 * carried twelve patterns written against `From HSBC:`, InstaPay and a card that prints `*** 6180`, whether or not the
 * person had ever held an account in Egypt (`loop/research-shell-seed.md` M2). They are moved here unchanged, reading
 * for reading, so a record that had them reads the same messages the same way after the move; only `pack:` differs.
 *
 * NO STARTER USE CASE INSTALLS IT. Whoever banks with HSBC Egypt installs it, or an agent proposes it on Decide with
 * `{ install: 'bank-hsbc-eg' }`, which is also the road the the old tool import has to take.
 *
 * IT NEEDS money-core 1.8.0 AND NOT JUST money-core, because the order matters. At 1.7.0 the twelve ids are
 * money-core's, and this pack installed beside it was measured refused `PROVIDES_CONFLICT` on all twelve, a sentence
 * that says two packs cannot own one declaration and not what to do about it. With `^1.8.0` the same plan also carries
 * `money-core ^1.8.0, installed 1.7.0`, which is the step that is missing, and the refusal now says so: update
 * money-core first, then install this. The update hands the twelve to this pack (`MONEY_CORE_HANDS` below) and this
 * pack then takes them over; `test/bank-pack.test.ts` drives both steps on a record installed at 1.7.0.
 *
 * A PATH TOKEN MINTED BEFORE THE UPDATE WAS LOST ON THAT ROAD, measured through `@braindog/record` on 22 September:
 * the update retired the twelve and this pack declared them again, so `ingestVerify` answered `null` in between and a
 * door with no digest after. Handed rather than retired, the twin is never retired, and the token minted on 1.7.0
 * opens the door after both steps (`packages/declare/test/door-hold.test.ts`). What still does not survive is a pattern
 * the owner changed (an accepted `pattern` proposal is one): it is the owner's and not money-core's, so it is not
 * handed, and this pack's install is `PROVIDES_CONFLICT` on that id until the owner retires their copy.
 *
 * THE FALLBACK CURRENCY IS STILL money-core's `HOME_CURRENCY`, sterling, and that was left as it stood on purpose. Every
 * one of these wordings prints its code beside the figure, so `scanMoney` takes the bank's code and the fallback is
 * never read on a real message; changing it here would change the stored bodies and nothing a person sees.
 */

import { HOME_CURRENCY, NOT_A_MOVEMENT, SAME_MOVEMENT, smsTwins, type SeedIngest, type SmsIngest } from '../modules/money.ts';

/** The version of this pack, which moves by `first-party.ts`'s rule: a new wording is minor, one taken away major. */
export const BANK_HSBC_EG_VERSION = '1.0.0';

/* ── the `From HSBC:` line, shared by the pattern that writes it and the one that holds it ── */

/** The debit's sign: a hyphen against the last digit of the figure, then the balance. */
const SIGNED_DEBIT = [...'0123456789'].map((digit) => ({ field: 'body', contains: `${digit}- your available balance` }));

/** The credit's sign, in the same place: a `+` against the last digit of the figure (`bank-from-in`). */
const SIGNED_CREDIT = [...'0123456789'].map((digit) => ({ field: 'body', contains: `${digit}+ your available balance` }));

/** `NOT_A_MOVEMENT` without `balance is`, which every one of these lines prints (see `bank-from-out`). */
const FROM_HSBC_SKIP: SeedIngest['skip'] = [
  { when: { field: 'body', contains: 'refund' }, reason: 'A refund is money coming back, and this pattern reads a charge.' },
  { when: { field: 'body', contains: 'your pin' }, reason: 'A PIN reminder carries the card digits and moves no money.' },
];

const FROM_HSBC_WHAT = { text: { between: ['From HSBC: ', ' from '] } } as const;
const FROM_HSBC_DAY = { date: { format: 'DDMONYY', after: 'From HSBC: ' } } as const;
const FROM_HSBC_ACCOUNT = { lookup: { register: 'accounts', by: 'last4', between: ['***-', ' '] } } as const;

export const HSBC_EG_INGESTS: Record<string, SeedIngest> = {
  /**
   * HSBC'S CREDIT-CARD ALERT, AND IT WAS UNTRIAGED: `test/money-bank.test.ts` forwarded the shape
   * the old tool parses, with invented values, and it matched nothing. It says *"Your Credit Card
   * ending with *** 6180 has been used for EGP 1,284.50 on 14/08/2026 at CEDAR LANE BAKERY. Your
   * available limit is EGP 23,715.50"*: no `debited`, a four-digit year, and the merchant AFTER the
   * date and ended by a full stop, so not one of `bank-card-out`'s reads lands on it.
   *
   * A PATTERN OF ITS OWN AND NOT A `first:` ARM IN `bank-card-out`, because the amount cannot share an
   * anchor. `debited ` is nowhere in this wording, and every literal the two do share (`ending `,
   * ` on `) has the card digits or the date between it and the figure. Arms would also cost the
   * confidence: `first:` over two wordings that both happen to yield files at `chosen`, which writes
   * nothing. Patterns whose `match:` exclude each other keep every field a straight read.
   *
   * THE AMOUNT IS ANCHORED ON `used for ` AND THE ACCOUNT IS BOXED BETWEEN THE STARS AND ` has been`,
   * and both are about the two other numbers in this sentence. The available limit after the figure
   * is money too, and a lookup whose slice ran to the end of the message would try the year and the
   * amount against every account's digits.
   */
  'bank-card-used': {
    ingest: 'bank-card-used',
    pack: 'bank-hsbc-eg',
    channel: 'email',
    match: {
      all: [
        { field: 'body', contains: 'credit card ending' },
        { field: 'body', contains: 'has been used for' },
        { none: [{ field: 'body', contains: 'debited' }, { field: 'body', contains: 'credited' }] },
      ],
    },
    skip: NOT_A_MOVEMENT,
    extract: {
      what: { text: { between: [' at ', '. Your available'] } },
      direction: { enum: { map: { used: 'out' } } },
      on: { date: { format: 'DD/MM/YYYY', after: ' on ' } },
      amount: { money: { after: 'used for ', currency: HOME_CURRENCY } },
      account: { lookup: { register: 'accounts', by: 'last4', between: ['*** ', ' has been'] } },
    },
    writes: { register: 'transactions', confidence: 'exact' },
    dedupe: SAME_MOVEMENT,
    on_conflict: 'skip',
  },

  /**
   * AN INSTAPAY TRANSFER OUT, AND THE PURCHASE THAT IS WORDED THE SAME WAY. *"Your HSBC Account ***327
   * was debited with IPN outward transfer for EGP 3,250.00 on 07-08-2026 16:42 to MARLOW JOINERY with
   * reference 9c4e1f7a2b"*, and `IPN purchase` in place of `IPN outward transfer` for a shop. It says
   * `debited` and not `card ending`, which is why `bank-card-out` never claimed it.
   *
   * THE ACCOUNT IS THREE DIGITS. The bank prints `***327`, and `accounts.last4` is text, so the suffix
   * it prints is what a person types there; the lookup is boxed between the stars and ` was ` for the
   * same reason as the card's.
   *
   * THE DATE IS `DD-MM-YYYY`, WHICH A BARE KERNEL CANNOT READ. `ingest.ts`'s own `day` holds four
   * formats and this is not one; a record reads it through `@braindog/extract`'s `scanDates`, which
   * `@braindog/record` hands down. Measured in `test/money-bank.test.ts` on a bare kernel: the right
   * pattern claims the message and names `on` as the one field it could not read, which is `review`
   * and no row. The time after the date is not read at all, because `transactions.on` is a day.
   */
  'bank-ipn-out': {
    ingest: 'bank-ipn-out',
    pack: 'bank-hsbc-eg',
    channel: 'email',
    match: {
      all: [{ field: 'body', contains: 'hsbc account' }, { field: 'body', contains: 'debited with ipn' }, { none: [{ field: 'body', contains: 'credited' }] }],
    },
    skip: NOT_A_MOVEMENT,
    extract: {
      /**
       * TWO ARMS, BECAUSE THE PURCHASE NAMES ITS PAYEE AFTER `from` AND THE TRANSFER AFTER `to`. The real
       * purchase in `loop/research-bank-real.md` (*The three that did not read*, item 1) reads *"... on
       * DD-MM-YYYY HH:MM from <payee> with reference <hex>"*, and with ` to ` as the only opening anchor it was
       * claimed, read in every other field, and held with `what` unread. The fixtures had written it with `to`,
       * the transfer's word, so nothing here ever saw it.
       *
       * `first:` AND NOT TWO PATTERNS, because the payee is the only thing that moves. A message carrying both
       * words before its reference yields on both arms and files at `chosen`, which writes nothing and asks a
       * person; neither wording in the window does.
       *
       * THE CLOSING ANCHOR IS STILL ` with reference`, and that is measured rather than kept by default. The
       * inbox tool cuts a body at 180 characters and every InstaPay message was cut, but in the boilerplate
       * after the reference: the tightest had 14 characters between the end of ` with reference` and the cut.
       * The payee now opens earlier on neither arm, so that margin is what it was.
       */
      what: {
        first: [
          { text: { between: [' to ', ' with reference'] } },
          { text: { between: [' from ', ' with reference'] } },
        ],
      },
      direction: { enum: { map: { debited: 'out' } } },
      on: { date: { format: 'DD-MM-YYYY', after: ' on ' } },
      amount: { money: { after: ' for ', currency: HOME_CURRENCY } },
      account: { lookup: { register: 'accounts', by: 'last4', between: ['Account ***', ' was '] } },
    },
    writes: { register: 'transactions', confidence: 'exact' },
    dedupe: SAME_MOVEMENT,
    on_conflict: 'skip',
  },

  /* AN INSTAPAY TRANSFER IN, the same sentence with `credited` and `from` where the other has
     `debited` and `to`. The sender is often an InstaPay address rather than a name, and it is kept
     as written, because it is the only thing the message says about who paid. */
  'bank-ipn-in': {
    ingest: 'bank-ipn-in',
    pack: 'bank-hsbc-eg',
    channel: 'email',
    match: {
      all: [{ field: 'body', contains: 'hsbc account' }, { field: 'body', contains: 'credited with ipn' }, { none: [{ field: 'body', contains: 'debited' }] }],
    },
    skip: NOT_A_MOVEMENT,
    extract: {
      what: { text: { between: [' from ', ' with reference'] } },
      direction: { enum: { map: { credited: 'in' } } },
      on: { date: { format: 'DD-MM-YYYY', after: ' on ' } },
      amount: { money: { after: ' for ', currency: HOME_CURRENCY } },
      account: { lookup: { register: 'accounts', by: 'last4', between: ['Account ***', ' was '] } },
    },
    writes: { register: 'transactions', confidence: 'exact' },
    dedupe: SAME_MOVEMENT,
    on_conflict: 'skip',
  },

  /**
   * THE THIRD WORDING, AND ONLY ITS DEBIT. *"From HSBC: 16AUG26 ATM Cash Withdrawal from
   * 042-118***-327 EGP 2500.00- Your available balance is EGP 31,040.25"*. It had no pattern until
   * `43 §4.3` grew `MON`: `DDMMMYY` was two month tokens and refused at install, measured.
   *
   * THE SIGN IS A HYPHEN GLUED TO THE FIGURE, AND THE HYPHEN IS IN `match:` AND NOT IN `enum`. `enum`
   * reads a literal as a whole token, and the character before `-` is a digit, so no literal holding the
   * hyphen is ever a whole token here. `contains` is a plain substring, so the hyphen is matched there
   * (`SIGNED_DEBIT` above) and the enum states `out` off a phrase the match has already guaranteed, as
   * `bank-card-used` does with `used`.
   *
   * AND THE HYPHEN HAS TO TOUCH A DIGIT, which is ten literals because `contains` has no digit class. It
   * was the one substring `- your available balance`, and a hyphen with a space either side satisfies
   * that: `loop/research-batch-eighteen-audit.md` section 3 filed *"Transfer from ... EGP 418.62 - Your
   * available balance"* as money OUT at `exact`. A spaced hyphen may be the bank's sign or a separator,
   * and one line cannot say which, so that line is `bank-from-unsure`'s below, and a person's.
   *
   * THE CREDIT HALF IS `bank-from-in` BELOW, and this paragraph said it could not exist. It argued that a
   * credit is marked by the hyphen being ABSENT, so a credit `match:` could only be `none: [- your
   * available balance]`, which a debit whose hyphen arrived touching the next word (`2500.00-Your`)
   * would satisfy as money IN at `exact`. The argument was sound and its premise was not measured:
   * `loop/research-bank-real.md` (*The three that did not read*, item 2) found the one real credit in a
   * hundred arrivals carrying a `+` glued to the figure where the debit glues its `-`. A credit is marked
   * by a sign of its own, so its `match:` asks for that sign and never for an absence.
   *
   * THE AMOUNT IS THE SECOND FIGURE AFTER THE STARS, and it has to be counted. Between `***-` and the
   * hyphen sit the account's own digits and the code: `scanMoney` over `327 EGP 2500.00` answers EGP
   * 327.00 and then EGP 2,500.00, because `327 EGP` is a figure with a code after it. With the code
   * against the figure (`327 EGP2500.00`) it answered EGP 327.00 and then GBP 0.00, the tail after the
   * point in the fallback currency, until `scanMoney` read a code touching its figure as that figure's
   * code (`packages/extract/test/money-glued.test.ts`). No literal separates
   * the digits from the code except the code itself, and anchoring on `EGP` is the defect `movement`
   * above was written to remove. The slice ends BEFORE the hyphen so the record's reader, which takes a
   * trailing minus as a sign (measured: `-250000`), reads the figure as the size of a debit.
   *
   * `balance is` IS IN `NOT_A_MOVEMENT` AND IN EVERY ONE OF THESE LINES, so this pattern carries a skip
   * list without it. Measured with the shared one: the line was claimed and then skipped as *"A balance
   * alert is a position, not a movement"*, and no row was written.
   *
   * THE DESCRIPTION KEEPS THE DATE AT ITS FRONT (`16AUG26 ATM Cash Withdrawal`). The closed vocabulary
   * anchors on literals and the date is the only thing between `From HSBC: ` and the words, so there is
   * nothing to start the slice after. It is still what the bank said the movement was.
   */
  'bank-from-out': {
    ingest: 'bank-from-out',
    pack: 'bank-hsbc-eg',
    channel: 'email',
    match: {
      all: [
        { field: 'body', contains: 'from hsbc:' },
        { any: SIGNED_DEBIT },
        { none: [...SIGNED_CREDIT, { field: 'body', contains: 'debited' }, { field: 'body', contains: 'credited' }] },
      ],
    },
    skip: FROM_HSBC_SKIP,
    extract: {
      what: FROM_HSBC_WHAT,
      direction: { enum: { map: { 'your available balance': 'out' } } },
      on: FROM_HSBC_DAY,
      amount: { nth: { n: 2, of: { money: { between: ['***-', '- Your available balance'], currency: HOME_CURRENCY } } } },
      account: FROM_HSBC_ACCOUNT,
    },
    writes: { register: 'transactions', confidence: 'exact' },
    dedupe: SAME_MOVEMENT,
    on_conflict: 'skip',
  },

  /**
   * THE CREDIT HALF OF THE SAME LINE, OFF THE `+` THE BANK GLUES TO THE FIGURE. *"From HSBC: 01AUG26 Deposit
   * Interest 042-118***-327 EGP 418.62+ Your available balance is EGP 33,540.25"*, invented values in the shape
   * `loop/research-bank-real.md` measured. Before this pattern it landed `untriaged` with nothing claiming it,
   * so interest and deposits never reached the ledger however often he forwarded them.
   *
   * EXCLUSIVE BY A SIGN, NOT BY AN ABSENCE. `match:` asks for `SIGNED_CREDIT`, a `+` against a digit, and
   * refuses `SIGNED_DEBIT`, and `bank-from-out` refuses `SIGNED_CREDIT` back, so a line with both signs is
   * claimed by neither and goes to a person as `untriaged`. A debit whose hyphen drifted (`2500.00-Your`)
   * carries no `+` and cannot land here, which was the whole of the old argument against a credit pattern.
   *
   * THE DESCRIPTION ENDS AT THE STARS, AND KEEPS THE BRANCH CODE. The real credit has no `from` or `to` before
   * the account, so `FROM_HSBC_WHAT`'s closing ` from ` is not there and `what` would be unread. Nothing but
   * digits sits between the words and the account, so `***-` is the first literal after them and the value is
   * `01AUG26 Deposit Interest 042-118`: the date at the front as the debit has it, and the account's public
   * half at the back. Both are what the bank printed, and a person reading the row can still tell what it was.
   *
   * THE SKIP LIST HOLDS ONLY THE PIN REMINDER. `FROM_HSBC_SKIP`'s refund line says *"this pattern reads a
   * charge"*, which is false here: a refund on this line is money coming back, and money in is what this
   * pattern writes. The amount is counted to the second figure for the reason `bank-from-out` gives.
   */
  'bank-from-in': {
    ingest: 'bank-from-in',
    pack: 'bank-hsbc-eg',
    channel: 'email',
    match: {
      all: [
        { field: 'body', contains: 'from hsbc:' },
        { any: SIGNED_CREDIT },
        { none: [...SIGNED_DEBIT, { field: 'body', contains: 'debited' }, { field: 'body', contains: 'credited' }] },
      ],
    },
    skip: [{ when: { field: 'body', contains: 'your pin' }, reason: 'A PIN reminder carries the card digits and moves no money.' }],
    extract: {
      what: { text: { between: ['From HSBC: ', '***-'] } },
      direction: { enum: { map: { 'your available balance': 'in' } } },
      on: FROM_HSBC_DAY,
      amount: { nth: { n: 2, of: { money: { between: ['***-', '+ Your available balance'], currency: HOME_CURRENCY } } } },
      account: FROM_HSBC_ACCOUNT,
    },
    writes: { register: 'transactions', confidence: 'exact' },
    dedupe: SAME_MOVEMENT,
    on_conflict: 'skip',
  },

  /**
   * THE SAME LINE WITH A HYPHEN THAT DOES NOT TOUCH THE FIGURE, AND IT WRITES NOTHING. `EGP 418.62 - Your
   * available balance` and `EGP 2500.00 -Your available balance` carry a hyphen where the debit carries its
   * sign, and neither is the wording the bank was measured printing. Before `bank-from-out` asked for the
   * hyphen against a digit, the first was filed OUT at `exact`, and the audit's line was a transfer in.
   *
   * CLAIMED RATHER THAN LEFT `untriaged`, because everything but the sign reads: the figure, the day, the
   * account and the description sit where the debit has them. So the ceiling is `needs-review`, which stores
   * the bytes as `review` and puts the reading in front of a person as a suggestion, and there is NO
   * `direction` in it. A direction here could only be a guess, and a guess inside a suggestion is read as the
   * bank's word by whoever accepts it.
   *
   * THE AMOUNT'S SLICE ENDS AT `Your available balance`, WITHOUT THE HYPHEN, because the hyphen is on either
   * side of a space here and the debit's closing literal (`- Your`) is absent from `2500.00 -Your`. What the
   * slice ends with is a space and perhaps a hyphen after it, and `scanMoney` reads a minus as a sign only
   * when it touches the digits, so the figure is read as a size and never as a signed amount.
   *
   * `none:` HOLDS `SIGNED_DEBIT` AND `SIGNED_CREDIT`, so a line carrying a real glued sign as well as a stray
   * hyphen belongs to that sign's pattern and never to two. `test/money-bank.test.ts` asks every pattern of every wording.
   */
  'bank-from-unsure': {
    ingest: 'bank-from-unsure',
    pack: 'bank-hsbc-eg',
    channel: 'email',
    match: {
      all: [
        { field: 'body', contains: 'from hsbc:' },
        { any: [{ field: 'body', contains: ' - your available balance' }, { field: 'body', contains: ' -your available balance' }] },
        { none: [...SIGNED_DEBIT, ...SIGNED_CREDIT, { field: 'body', contains: 'debited' }, { field: 'body', contains: 'credited' }] },
      ],
    },
    skip: FROM_HSBC_SKIP,
    extract: {
      what: FROM_HSBC_WHAT,
      on: FROM_HSBC_DAY,
      amount: { nth: { n: 2, of: { money: { between: ['***-', 'Your available balance'], currency: HOME_CURRENCY } } } },
      account: FROM_HSBC_ACCOUNT,
    },
    writes: { register: 'transactions', confidence: 'needs-review' },
    dedupe: SAME_MOVEMENT,
    on_conflict: 'skip',
  },
};

/** The same six as webhook twins `<id>-sms`, built the way money-core builds its own (`smsTwins`), so the two cannot drift. */
export const HSBC_EG_SMS_INGESTS: Record<string, SmsIngest> = smsTwins(HSBC_EG_INGESTS);

/**
 * What money-core hands to this pack, as `hands:` in money-core's own document from 1.8.0: each of the twelve ids,
 * mapped to `bank-hsbc-eg`.
 *
 * WITHOUT IT THE SHORTCUT'S DOOR WAS SHUT BETWEEN THE TWO STEPS. Measured through `@braindog/record` on 22 September
 * (`loop/research-batch-thirty-two-audit.md` §3, and `packages/declare/test/door-hold.test.ts`, which drives it): a
 * record on 1.7.0 with a path token minted for `bank-from-out-sms` answered `ingestVerify` with the digest, the
 * update retired the twelve, and the door then answered `null`, which is a 404 that stores nothing, until this pack
 * was installed, and `{ kind: 'none' }` after it, so the owner had to mint again. The plan he approved said only that
 * twelve ingests retire and never named this pack.
 *
 * HANDED, NOT RETIRED. `declare`'s plan lists each of the twelve as a retire with `to: 'bank-hsbc-eg'`, and its
 * install stages them under this pack's name instead of retiring them, so the declarations never stop being live,
 * the digest's version walk sees no retire, and installing this pack afterwards takes over what is already its own.
 *
 * HERE AND NOT IN money-core's FILE, because the ids are this pack's keys, and a list written out twice drifts.
 */
export const MONEY_CORE_HANDS: Readonly<Record<string, string>> = Object.fromEntries(
  [...Object.values(HSBC_EG_INGESTS), ...Object.values(HSBC_EG_SMS_INGESTS)].map((i) => [`ingest.${i.ingest}`, 'bank-hsbc-eg']),
);

/** The pack document: twelve ingests, no list, no page, and money-core 1.8.0 or later underneath. */
export function bankHsbcEgPack(): Record<string, unknown> {
  return {
    pack: 'bank-hsbc-eg',
    version: BANK_HSBC_EG_VERSION,
    summary: 'Reads HSBC Egypt alert mails and text messages into Money as transactions.',
    author: 'BrainDog',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: { 'money-core': '^1.8.0' } },
    declarations: [...Object.values(HSBC_EG_INGESTS), ...Object.values(HSBC_EG_SMS_INGESTS)],
  };
}
