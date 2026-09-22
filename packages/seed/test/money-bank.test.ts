/**
 * The three wordings HSBC Egypt actually sends, through the money pack's own arrival patterns.
 *
 * WHY THIS FILE EXISTS: every sentence `money.test.ts` forwarded was written in this tree
 * (`CHARGE` and `CREDIT` at :376-377), so whether the patterns read the bank the owner banks with
 * was never measured. the old tool has parsed his messages for months with three literal regexes, one
 * per wording, and the wordings below are those three SHAPES: the same words in the same order with
 * the same punctuation. Every amount, merchant, name, card digit, account number, reference and date
 * in them is invented. This repository is public, and none of his banking data may appear in it.
 *
 * MEASURED BEFORE ANY PATTERN WAS WRITTEN FOR THEM: all six messages below landed `untriaged`,
 * `ingest: null`, and wrote nothing. The card alert says `has been used for` where the patterns
 * wanted `debited`; the transfer says `HSBC Account ***327` where they wanted `card ending`. Not one
 * of the three wordings was readable, so the owner's own ledger would have stayed empty however
 * many alerts he forwarded.
 *
 * AND ON A RECORD WITH THE READERS WIRED THE TRANSFERS READ TOO. This file opens a bare kernel,
 * because this package may not import `@braindog/extract`. The same six messages were driven once
 * through `@braindog/record`'s `createRecordApi` over `installSeed`, outside this file: the card and
 * all three transfers came back `matched` at `exact` in EGP (128450, 325000, 1240000 and 61575
 * minor units), each on the account its digits name, and the two `From HSBC:` lines `untriaged`.
 *
 * THAT RECORD-LEVEL RUN IS NOW A TEST, `packages/record/test/money-ipn.test.ts`, because a run outside
 * the tree checks nothing the next day: the checker of `aeef01c5` flipped `bank-ipn-in`'s direction
 * and this file stayed green, since a bare kernel never writes a transfer's row. What each pattern
 * WRITES is asserted there; what each pattern CLAIMS is asserted here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Arrived, type Declaration, type Kernel } from '@braindog/kernel';
import type { Param, Row, Sql } from '@braindog/ports';
import { sayOf } from '@braindog/ports';

import { METRICS, NOW, day, installSeed } from '../src/index.ts';
import { MONEY_INGESTS } from '../src/modules/money.ts';

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).all(...(params as never[])) as T[],
    one: <T = Row>(text: string, ...params: Param[]) => db.prepare(text).get(...(params as never[])) as T | undefined,
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

const ingests = (): Declaration[] =>
  Object.values(MONEY_INGESTS).map((body) => ({ id: `ingest.${body.ingest}`, kind: 'ingest' as const, body: body as never }));

/**
 * A seeded record holding the patterns, and two accounts the invented digits name.
 *
 * THE TRANSFER NAMES THREE DIGITS AND NOT FOUR. HSBC Egypt prints an account as `***327`, and
 * `accounts.last4` is text rather than a four-digit pattern, so the suffix the bank prints is the
 * value a person types there.
 */
async function bank(): Promise<{ k: Kernel; card: string; current: string }> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  assert.ok((await k.install(ingests())).ok, 'the patterns do not install');
  const made = (fields: Record<string, unknown>): string => {
    const got = k.create('accounts', fields, { actor: 'p_seed' });
    assert.ok(got.ok, sayOf(got));
    return got.value.id;
  };
  const card = made({ name: 'Cairo credit card', kind: 'card', balance: { amount: 0, currency: 'EGP' }, as_of: day(0), liquid: false, last4: '6180' });
  const current = made({ name: 'Cairo current account', kind: 'bank', balance: { amount: 0, currency: 'EGP' }, as_of: day(0), liquid: true, last4: '327' });
  return { k, card, current };
}

const forward = (k: Kernel, body: string, sha256: string): Arrived => {
  const r = k.arrive({ channel: 'email', headers: { From: 'alerts@hsbc.example', Subject: 'HSBC' }, body, sha256 }) as {
    ok: boolean;
    value: Arrived;
    refusal?: { code: string; fix: string };
  };
  assert.ok(r.ok, r.ok ? '' : `${r.refusal?.code}: ${r.refusal?.fix}`);
  return r.value;
};

/* ── the three shapes, invented values in the bank's own words ───────────── */

/** Shape one: a credit-card purchase. The date is DD/MM/YYYY and the merchant ends at a full stop. */
const CARD = 'Your Credit Card ending with *** 6180 has been used for EGP 1,284.50 on 14/08/2026 at CEDAR LANE BAKERY. Your available limit is EGP 23,715.50';

/** Shape two: an InstaPay transfer, both directions and the purchase variant. DD-MM-YYYY, then a time. */
const IPN_OUT = 'Your HSBC Account ***327 was debited with IPN outward transfer for EGP 3,250.00 on 07-08-2026 16:42 to MARLOW JOINERY with reference 9c4e1f7a2b';
const IPN_IN = 'Your HSBC Account ***327 was credited with IPN inward transfer for EGP 12,400.00 on 11-08-2026 08:05 from quill.harbour@instapay with reference 5d0b33e8aa';
/* THE PURCHASE NAMES ITS PAYEE AFTER `from`. This said `to`, the transfer's word, and the one real purchase
   in `loop/research-bank-real.md` does not: it was claimed and held with `what` unread. */
const IPN_BUY = 'Your HSBC Account ***327 was debited with IPN purchase for EGP 615.75 on 19-08-2026 21:10 from GRANARY MARKET with reference 0f7d2c91e4';

/** Shape three: the general account line. A day like 16AUG26, and a debit marked only by a trailing hyphen. */
const FROM_OUT = 'From HSBC: 16AUG26 ATM Cash Withdrawal from 042-118***-327 EGP 2500.00- Your available balance is EGP 31,040.25';
const FROM_IN = 'From HSBC: 01AUG26 Deposit Interest to 042-118***-327 EGP 418.62 Your available balance is EGP 33,540.25';
/**
 * THE CREDIT AS THE BANK ACTUALLY PRINTS IT, and `FROM_IN` above is not that. `loop/research-bank-real.md` (*The three
 * that did not read*, item 2) measured the one real credit in a hundred arrivals: a `+` glued to the figure where the
 * debit glues its `-`, and no preposition before the account. `FROM_IN` has neither, which is why it was ever possible to
 * argue the credit had no sign to read. Values invented, the shape his.
 */
const FROM_PLUS = 'From HSBC: 01AUG26 Deposit Interest 042-118***-327 EGP 418.62+ Your available balance is EGP 33,540.25';
/** The audit's line (`loop/research-batch-eighteen-audit.md` section 3): a hyphen with a space either side, on a transfer in. */
const FROM_SPACED = 'From HSBC: 01AUG26 Transfer from NADIA FARID to 042-118***-327 EGP 418.62 - Your available balance is EGP 33,540.25';

test('HSBC\'S CARD ALERT BECOMES A ROW, at exact, with the merchant that sits after `at` and before the full stop', async () => {
  const { k, card } = await bank();
  const before = k.count('transactions');

  const out = forward(k, CARD, 'hsbc-card');
  assert.equal(out.state, 'matched', out.reason ?? `claimed by ${out.ingest}`);
  assert.equal(out.ingest, 'bank-card-used');
  assert.equal(out.confidence, 'exact', 'a field was chosen or defaulted, so nothing reached the ledger');
  assert.equal(k.count('transactions'), before + 1);

  const row = k.get(out.wrote[0]!)!;
  assert.equal(row.fields.what, 'CEDAR LANE BAKERY');
  assert.equal(row.fields.direction, 'out');
  assert.equal(row.fields.on, '2026-08-14');
  assert.equal(row.fields.account, card, 'the lookup did not land on the card the three stars and four digits name');
  /* THE FIGURE AND NOT THE CODE, for the reason `money.test.ts` gives at length: a bare kernel has
     no `scanMoney` wired, so the declared fallback is the code it writes, and the record that does
     wire it takes the `EGP` printed beside the figure. The figure is what can be wrong here: the
     limit after it, EGP 23,715.50, is also money, and the card digits before it are a number. */
  assert.equal((row.fields.amount as { amount: number }).amount, 128_450, 'the limit or the card digits were read as the amount');
});

test('AN INSTAPAY TRANSFER IS CLAIMED BY ITS OWN PATTERN IN EACH DIRECTION, and a bare kernel stops at the date it cannot read', async () => {
  const { k } = await bank();
  const before = k.count('transactions');

  /**
   * `DD-MM-YYYY` IS A FORMAT THE GRAMMAR ADMITS AND A BARE KERNEL DOES NOT READ. `ingest.ts`'s own
   * `day` holds four formats, and a record reads the rest only through `@braindog/extract`'s
   * `scanDates`, which `@braindog/record` hands down and this package may not import
   * (`tools/gates/graph.mjs`). So what is provable from here is the half that is not a date: the
   * right pattern claims each message, the sign is its own, and the date is the ONE field it names
   * as unread. A pattern that had claimed the wrong direction, or read the reference as the amount,
   * would name something else or write a row.
   */
  for (const [body, sha, ingest] of [
    [IPN_OUT, 'ipn-out', 'bank-ipn-out'],
    [IPN_IN, 'ipn-in', 'bank-ipn-in'],
    [IPN_BUY, 'ipn-buy', 'bank-ipn-out'],
  ] as const) {
    const out = forward(k, body, sha);
    assert.equal(out.ingest, ingest, `${sha} was claimed by ${out.ingest}`);
    assert.equal(out.state, 'review', `${sha}: ${out.reason}`);
    assert.match(out.reason ?? '', new RegExp(`^${ingest} could not read on,? `, 'u'), `${sha} named more than the date: ${out.reason}`);
  }
  assert.equal(k.count('transactions'), before, 'a transfer with no date wrote a row');
});

test('THE GENERAL `From HSBC:` DEBIT IS CLAIMED BY ITS OWN PATTERN, and a line with no sign at all by nothing', async () => {
  const { k } = await bank();
  const before = k.count('transactions');

  /**
   * CLAIMED SINCE `43 §4.3` GREW `MON`. Before it the wording could not be declared at all: `DDMMMYY`
   * is two month tokens and was refused at install as DATE_FORMAT_INVALID, which this test asserted
   * until the token landed. `DDMONYY` installs, because `installSeed` installed it above.
   *
   * A BARE KERNEL NAMES `amount` AND `on` AS UNREAD, and both are about this package having no reader
   * wired rather than about the pattern. The kernel's own date reader holds four named formats and
   * `DDMONYY` is not one; its own money reader finds no second figure in the slice `327 EGP 2500.00`
   * (measured: the reason names `amount`), where `@braindog/extract`'s finds the account digits and
   * then the figure, which is why the form counts to the second. What the row says is asserted where the readers are:
   * `packages/record/test/money-ipn.test.ts`.
   */
  const out = forward(k, FROM_OUT, 'from-out');
  assert.equal(out.ingest, 'bank-from-out', `from-out was claimed by ${out.ingest}`);
  assert.equal(out.state, 'review', out.reason ?? '');
  assert.match(out.reason ?? '', /^bank-from-out could not read amount, on /u, `from-out named something else: ${out.reason}`);

  /**
   * A LINE WITH NO SIGN HAS NO PATTERN. This was the credit, on the belief that a credit's only sign is the hyphen being
   * absent, and a `match:` that reads absence as money in would take a debit whose hyphen arrived touching the next word
   * (`2500.00-Your`) and file it IN at `exact`. The real credit carries a `+` and is `bank-from-in`'s, in the next test;
   * an unsigned line still says nothing about its direction, so it still goes to a person.
   */
  const credit = forward(k, FROM_IN, 'from-in');
  assert.equal(credit.state, 'untriaged', `from-in was claimed by ${credit.ingest}: ${credit.reason}`);
  assert.equal(credit.ingest, null);
  assert.equal(k.count('transactions'), before, 'a bare kernel wrote a row it could not read');

  /**
   * A HYPHEN THAT DOES NOT TOUCH THE FIGURE IS NOT THE DEBIT'S SIGN, and the line goes to a person. Measured red
   * here before `bank-from-out` asked for a digit against its hyphen: this line was claimed by `bank-from-out`,
   * and on a record with the readers wired it wrote a transfer in as money OUT at `exact`.
   */
  const spaced = forward(k, FROM_SPACED, 'from-spaced');
  assert.equal(spaced.ingest, 'bank-from-unsure', `from-spaced was claimed by ${spaced.ingest}: ${spaced.reason}`);
  assert.equal(spaced.state, 'review', spaced.reason ?? '');
  assert.equal(k.count('transactions'), before, 'a line whose sign could go either way wrote a row');

  /* AND `MMM` STILL MEANS `MM` THEN `M`. The month name is `MON`, and `43 §9.3`'s worked refusal for
     two month tokens is unchanged, so a pattern written the obvious way is still turned away at the
     door with the code that says why. */
  const mmm = await k.install([
    {
      id: 'ingest.hsbc-from',
      kind: 'ingest',
      body: {
        ingest: 'hsbc-from',
        channel: 'email',
        match: { all: [{ field: 'body', contains: 'from hsbc:' }] },
        extract: { what: { text: { after: 'From HSBC: ' } }, on: { date: { format: 'DDMMMYY', after: 'From HSBC: ' } } },
        writes: { register: 'transactions', confidence: 'exact' },
        on_conflict: 'skip',
      } as never,
    },
  ]);
  assert.equal(mmm.ok, false, 'DDMMMYY installed, so MMM has quietly become a token');
  assert.equal((mmm as { refusal?: { code: string } }).refusal?.code, 'DATE_FORMAT_INVALID');
});

test('THE `From HSBC:` CREDIT IS CLAIMED BY ITS OWN PATTERN, off the `+` the bank glues to the figure', async () => {
  const { k } = await bank();
  const before = k.count('transactions');

  /**
   * MEASURED RED FIRST: this line landed `untriaged` with `ingest: null`, because `bank-from-out` wants a `-` against a
   * digit and `bank-from-unsure` wants a spaced one, and nothing asked for a `+` at all. The one real credit in the
   * window was interest, which is money in and was never going to reach the ledger however often he forwarded it.
   *
   * A BARE KERNEL NAMES `amount` AND `on` AND NOTHING ELSE, for the reason the debit's test gives above: those are this
   * package having no reader wired. A pattern that could not read the description or the account, or that claimed the
   * line and read no direction, would name more than those two here.
   */
  const out = forward(k, FROM_PLUS, 'from-plus');
  assert.equal(out.ingest, 'bank-from-in', `from-plus was claimed by ${out.ingest}: ${out.reason}`);
  assert.equal(out.state, 'review', out.reason ?? '');
  assert.match(out.reason ?? '', /^bank-from-in could not read amount, on /u, `from-plus named something else: ${out.reason}`);
  assert.equal(k.count('transactions'), before, 'a bare kernel wrote a row it could not read');
});

test('NO WORDING IS CLAIMED BY TWO PATTERNS, so the order they are declared in decides nothing', async () => {
  /* EACH PATTERN ON A RECORD OF ITS OWN, because `arrive` takes the first pattern that matches and
     so can only ever report one. Asking every pattern separately is the only way to see a second
     claim, which is the defect `money.test.ts` measured once already: a payment out at `exact`
     with the credit half never read. The seed installs every pattern, so the others are retired and
     the record holds only the one under test. */
  const claimedBy = async (ingest: string, body: string): Promise<boolean> => {
    const one = await openRecord(openSqlite(), { now: () => NOW });
    assert.ok((await installSeed(one)).ok);
    const others = ingests().map((d) => d.id).filter((id) => id !== `ingest.${ingest}`);
    assert.ok((await one.retire(others) as { ok: boolean }).ok, `could not retire ${others.join(', ')}`);
    return forward(one, body, `alone-${ingest}`).ingest === ingest;
  };
  /* The two sentences `money.test.ts` forwards, copied, so the older patterns are held to it too. */
  const CHARGE = 'HSBC: Your card ending 4471 was debited GBP 42.99 at FENWICK CLOUD on 18/09/26. If this was not you, call us.';
  const CREDIT = 'HSBC: Your card ending 4471 was credited GBP 5,005.00 from NILE REALTY on 29/08/26.';
  for (const body of [CARD, IPN_OUT, IPN_IN, IPN_BUY, FROM_OUT, FROM_IN, FROM_PLUS, FROM_SPACED, CHARGE, CREDIT]) {
    const claims: string[] = [];
    for (const ingest of Object.keys(MONEY_INGESTS)) if (await claimedBy(ingest, body)) claims.push(ingest);
    assert.ok(claims.length <= 1, `${body.slice(0, 40)} is claimed by ${claims.join(' and ')}`);
  }

  /* A LINE CARRYING BOTH GLUED SIGNS IS CLAIMED BY NONE, and `<= 1` above cannot say so. Measured by the checker:
     with `SIGNED_DEBIT` taken out of `bank-from-in`'s `none:`, this line was claimed by `bank-from-in` alone, which is
     one claim, and every test in this file stayed green. One line that names two directions is a person's.
     A GLUED `+` BESIDE A SPACED HYPHEN IS THE CREDIT'S, as `bank-from-unsure`'s comment says a real glued sign wins over
     a stray hyphen. With `SIGNED_CREDIT` taken out of `bank-from-unsure`'s `none:`, the second line was claimed twice. */
  const claimsOf = async (body: string): Promise<string[]> => {
    const claims: string[] = [];
    for (const ingest of Object.keys(MONEY_INGESTS)) if (await claimedBy(ingest, body)) claims.push(ingest);
    return claims;
  };
  const BOTH = 'From HSBC: 01AUG26 Deposit Interest 042-118***-327 EGP 418.62+ Your available balance is EGP 2500.00- Your available balance is EGP 1.00';
  const PLUS_AND_SPACED = 'From HSBC: 01AUG26 Deposit Interest 042-118***-327 EGP 418.62+ Your available balance is EGP 2500.00 - Your available balance is EGP 1.00';
  assert.deepEqual(await claimsOf(BOTH), [], 'a line with both glued signs was claimed');
  assert.deepEqual(await claimsOf(PLUS_AND_SPACED), ['bank-from-in'], 'a glued `+` beside a spaced hyphen was not the credit\'s alone');
});

/* ── what `Spent, 30 days` counts ───────────────────────────────────────── */

test('SPENT, 30 DAYS COUNTS THIRTY DAYS, today and the twenty-nine before it', async () => {
  /**
   * `window: 30d` IS HOW FAR THE COMPARISON MOVES THE CLOCK (`metrics.ts`, `anchor - shift`), and the
   * window before is cut where the current one starts (`endedAt`). So the declared window is thirty
   * days whatever the sentence says, and the sentence has to say thirty too or the two figures
   * compared are different lengths: `on after -31d` is exclusive of its own day, so it began at day
   * -30 and ran to today, thirty-one days, beside a window before of thirty.
   */
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await installSeed(k)).ok);
  const read = (): number => {
    const got = k.metric(METRICS['spent-30d'] as never);
    assert.ok(got.ok, sayOf(got));
    return got.value.value as number;
  };
  const start = read();
  const spend = (offset: number, amount: number) => {
    const got = k.create(
      'transactions',
      { what: `BOUNDARY ${offset}`, on: day(offset), direction: 'out', amount: { amount, currency: 'GBP' }, account: k.get('accounts#1')!.id, state: 'cleared', transfer: false },
      { actor: 'p_seed' },
    );
    assert.ok(got.ok, sayOf(got));
  };
  spend(-29, 1_000);
  assert.equal(read() - start, 1_000, 'day -29 is the thirtieth day counting today, and it was not counted');
  spend(-30, 70_000);
  assert.equal(read() - start, 1_000, 'day -30 was counted, which is a thirty-first day under a thirty-day name');
});
