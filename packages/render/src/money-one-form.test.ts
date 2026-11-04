/**
 * ONE SPELLING A CURRENCY, PER SETTING, ON ONE RECORD.
 *
 * A record with a home of EGP and an account in dollars wrote the dollar two ways: `$3.63 USD` in a cell and
 * `US$4,012.46` on a bar. The cause was the reader, not the writer: a figure reaches a drawer as `money()` stored it
 * (`USD 3.63`), as a sentence stored it before figures were grouped (`USD 4012.46`), or already drawn by its host
 * (`$3.63 USD`), and only the first was read by the one writer. The other two fell to the older path, which says
 * `US$`. These hold that all three are read as one amount and written by the one table in `money.ts`.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { axisFigure, barFigure, headlineFigure, leadingCode, symbolFigure, symbolText } from './format.ts';
import { AMOUNT_SPACE, readFigure, writeFigure } from './money.ts';

const S = AMOUNT_SPACE;

/** The same three dollars and sixty-three cents, each way a host hands it on. */
const SMALL = ['USD 3.63', `$3.63${S}USD`, '$3.63 USD'];
/** And four thousand and thirty-eight, the last as a sentence stored before figures were grouped. */
const LARGE = ['USD 4,012.46', `$4,012.46${S}USD`, 'USD 4012.46'];

const exact = (text: string, home: string | null): string | null => symbolFigure(text, home);
const read = (text: string, home: string | null): string => headlineFigure(text, home);
const bar = (text: string, home: string | null): string => barFigure(text, home);

/* BY ITS OWN SIGN ALONE SINCE AM15 (audit 31 Oct m): "$1,950" on Today, "+$1,950 USD" on Bills and "+US$1,950" in its table. */
test('A DOLLAR ON A RECORD THAT IS NOT IN DOLLARS IS `$3.63`: in a table, on a tile and on a bar, however it came', () => {
  for (const home of ['EGP', 'GBP', null]) {
    for (const text of SMALL) {
      assert.equal(exact(text, home), '$3.63', `exact, ${text}, home ${home}`);
      assert.equal(read(text, home), '$3.63', `read, ${text}, home ${home}`);
      assert.equal(bar(text, home), '$3.63', `bar, ${text}, home ${home}`);
    }
    for (const text of LARGE) {
      assert.equal(exact(text, home), '$4,012.46', `exact, ${text}, home ${home}`);
      assert.equal(read(text, home), '$4,012', `read, whole from a thousand up (d9bab2403), ${text}, home ${home}`);
      assert.equal(bar(text, home), '$4,012.46', `bar, ${text}, home ${home}`);
      assert.equal(axisFigure(text, home), '$4k', `axis, ${text}, home ${home}`);
    }
  }
});

test('NO PATH SAYS `US$` ONCE THE HOME IS TOLD, and none says a sign and a code where the sign is the home one', () => {
  for (const home of ['EGP', 'USD', null]) {
    for (const text of [...SMALL, ...LARGE, '+USD 4,012.46', 'USD −12.00', '−$12.00 USD', 'USD -12.00']) {
      for (const said of [exact(text, home), read(text, home), bar(text, home), axisFigure(text, home), leadingCode(text, home)?.text]) {
        assert.ok(said && !said.includes('US$'), `${text} was said ${said} with home ${home}`);
        if (home === 'USD') assert.ok(!said.includes('USD'), `${text} was said ${said} at home`);
      }
    }
  }
  /* At home the same six are the sign alone. */
  for (const text of SMALL) assert.equal(read(text, 'USD'), '$3.63');
  for (const text of LARGE) assert.equal(bar(text, 'USD'), '$4,012.46');
});

test('THE HOME CURRENCY OF AN EGP RECORD IS `EGP 700` EVERYWHERE, and never `E£`', () => {
  const ways = ['EGP 700.00', `EGP${S}700.00`, `EGP${S}700`, 'E£700.00 EGP', 'EGP 700.00'];
  for (const home of ['EGP', 'USD', null]) {
    for (const text of ways) {
      assert.equal(exact(text, home), `EGP${S}700.00`, `exact, ${text}`);
      assert.equal(read(text, home), `EGP${S}700`, `read, ${text}`);
      assert.equal(bar(text, home), `EGP${S}700`, `bar, ${text}`);
    }
  }
  /* The minus is in front of everything, wherever the figure it came from had it. */
  for (const text of ['EGP −73,615.27', `−EGP${S}73,615.27`, 'EGP -73615.27']) {
    assert.equal(exact(text, 'EGP'), `−EGP${S}73,615.27`);
    assert.equal(bar(text, 'EGP'), `−EGP${S}73,615.27`);
  }
});

test('A CELL, A TILE AND A SENTENCE OF ONE RECORD AGREE, the two currencies side by side', () => {
  const home = 'EGP';
  const cell = leadingCode('USD 2,947.95', home);
  assert.deepEqual(cell, { currency: '', rest: '$2,947.95', sign: '', place: null, text: '$2,947.95' });
  assert.equal(read(`$2,947.95${S}USD`, home), '$2,948', 'a tile handed the drawn figure, said as a total');
  assert.equal(symbolText('Harbour holds USD 2,947.95 today', false, home), `Harbour holds ${cell.text} today`);
  assert.equal(read(`EGP 702,318.00 · $2,947.95${S}USD`, home), `EGP${S}702,318 · $2,948`, 'two figures on one tile');
});

test('MONEY COMING IN KEEPS ITS PLUS, in front of everything, and nought has no sign', () => {
  assert.equal(bar('+USD 850.00', 'EGP'), '+$850');
  /* A DOLLAR ON A CANADIAN RECORD KEEPS ITS CODE: there `$` is the home's own sign. */
  assert.equal(bar('USD 850.00', 'CAD'), `$850${S}USD`);
  assert.equal(bar('+GBP 850.00', 'GBP'), '+£850');
  assert.equal(exact('+EGP 850.00', 'EGP'), `+EGP${S}850.00`);
  assert.equal(leadingCode('+EGP 850.00', 'EGP')?.sign, '+');
  assert.equal(writeFigure('+GBP 0.00', 'GBP', 'read')?.text, '£0');
  assert.equal(writeFigure('−GBP 0.00', 'GBP', 'read')?.text, '£0');
});

test('ONLY A WHOLE FIGURE WITH EVERY DIGIT IN IT IS READ: a compact one, a bare sign and a word are left alone', () => {
  assert.deepEqual(readFigure('USD 4012.46'), { minor: 401_246n, currency: 'USD', plus: false });
  assert.deepEqual(readFigure('$4,800 USD'), { minor: 480_000n, currency: 'USD', plus: false });
  assert.deepEqual(readFigure('−$12.50 USD'), { minor: -1_250n, currency: 'USD', plus: false });
  assert.deepEqual(readFigure('JPY 1,299'), { minor: 1_299n, currency: 'JPY', plus: false });
  for (const not of ['$31k USD', '$4,800.00', '4012.46', 'TOP 10', 'USD 20', 'USD 3.6', 'USD 3.630', '−USD −3.63', '$5.00 ISA', 'Rent USD 3.63']) {
    assert.equal(readFigure(not), null, not);
  }
  /* And what is not read is not rewritten by the told path either. */
  assert.equal(bar('TOP 10', 'EGP'), 'TOP 10');
  assert.equal(exact('Top up £200 ISA', 'GBP'), null);
});

test('NOT TOLD THE HOME, A DRAWER KEEPS THE PATH IT HAD, which is why every host has to say it', () => {
  assert.equal(headlineFigure('$4,800.00 USD'), '$4,800');
  assert.equal(symbolFigure('USD 3.63'), '$3.63');
  /* The older path reads the writer's own code-first figure too, so a figure drawn once is not mangled by it. */
  assert.equal(barFigure(`EGP${S}700`), `EGP${S}700`);
  assert.equal(headlineFigure(`−EGP${S}73,615.27`), `−EGP${S}73,615`);
  assert.equal(headlineFigure(`EGP${S}58,185.00`), `EGP${S}58,185`);
  assert.equal(headlineFigure('EGP −73,615.27'), 'EGP −73,615', 'the stored form keeps this path, as before');
  assert.deepEqual(leadingCode(`−EGP${S}73,615.27`), { currency: 'EGP', rest: '73,615.27', sign: '−' });
});
