/**
 * The rules that read a forwarded mail: its kind, its total, its days and who it names. Nothing is guessed, so a figure
 * that could be read two ways comes back unclean and a day with no label comes back absent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { forwardedHead, mailboxes, maskMoneyText, minorOf, readMail } from './mail-read.ts';

const invoice = (extra = ''): string =>
  `Invoice INV-2041\nSubtotal: GBP 40.00\nVAT: GBP 8.00\nAmount due: GBP 48.00\nPayment due by 14 November 2026\n${extra}`;

test('AN INVOICE IS READ FOR ITS LABELLED TOTAL AND DUE DAY, not for its subtotal or tax', () => {
  const r = readMail({ from: 'Loomhouse Billing <billing@loomhouse.example>', subject: 'Your invoice', body: invoice() });
  assert.equal(r.kind, 'invoice');
  assert.deepEqual(r.amount, { amount: 4800, currency: 'GBP' });
  assert.equal(r.amountClean, true);
  assert.equal(r.due, '2026-11-14');
  assert.equal(r.ref, 'INV-2041');
  assert.equal(r.domain, 'loomhouse.example');
});

test('TWO DIFFERENT TOTALS AT THE SAME RANK ARE NOT READ', () => {
  const r = readMail({ from: 'a@b.example', subject: 'Invoice', body: 'Amount due: EUR 10.00\nAmount due: EUR 12.00\nDue 2026-12-01' });
  assert.equal(r.amount, undefined);
  assert.equal(r.amountClean, false);
});

test('A BARE DOLLAR SIGN IS READ BUT NEVER TRUSTED', () => {
  const r = readMail({ from: 'a@b.example', subject: 'Invoice', body: 'Total: $19.00\nDue 2026-12-01' });
  assert.deepEqual(r.amount, { amount: 1900, currency: 'USD' });
  assert.equal(r.amountClean, false);
});

test('SEPARATORS THAT COULD MEAN TWO THINGS ARE FLAGGED, and ones that cannot are not', () => {
  assert.deepEqual(minorOf('1,234.56', 2), { minor: 123456, clean: true });
  assert.deepEqual(minorOf('1.234,56', 2), { minor: 123456, clean: true });
  assert.deepEqual(minorOf('1,234', 2), { minor: 123400, clean: false });
  assert.deepEqual(minorOf('48', 2), { minor: 4800, clean: true });
  assert.equal(minorOf('12,34,56', 2), null);
});

test('A RENEWAL NOTICE GIVES THE RENEWAL DAY and not a due day', () => {
  const r = readMail({ from: 'Nordhaven <noreply@nordhaven.example>', subject: 'kiln.example renews soon', body: 'Your domain kiln.example will renew on 3 March 2027.\nRenewal price: GBP 14.00' });
  assert.equal(r.kind, 'renewal');
  assert.equal(r.renewsOn, '2027-03-03');
  assert.deepEqual(r.amount, { amount: 1400, currency: 'GBP' });
});

test('A SHIPPING CONFIRMATION GIVES ITS DELIVERY DAY AND READS NO MONEY', () => {
  const r = readMail({ from: 'shop@parcels.example', subject: 'Your order has shipped', body: 'Estimated delivery: 2026-11-02\nTotal: GBP 30.00' });
  assert.equal(r.kind, 'shipping');
  assert.equal(r.date, '2026-11-02');
  assert.equal(r.amount, undefined);
});

test('A FORWARD IS READ AS THE MAIL IT HOLDS, and the forwarder is not the sender', () => {
  const body = `see below\n\n---------- Forwarded message ---------\nFrom: Tallyard <ar@tallyard.example>\nTo: Sam <sam@mine.example>\nCc: Ola Reed <ola@reed.example>\nSubject: Invoice 7\n\n${invoice()}`;
  const r = readMail({ from: 'sam@mine.example', to: 'tok@in.example', subject: 'Fwd: Invoice 7', body });
  assert.equal(r.from?.email, 'ar@tallyard.example');
  assert.deepEqual(r.named.map((p) => p.email), ['sam@mine.example', 'ola@reed.example']);
  assert.equal(forwardedHead('no forward here'), null);
});

test('ONLY REAL ADDRESSES ARE NAMED: a bare name is dropped', () => {
  assert.deepEqual(mailboxes('Ola Reed, "Lee, Kim" <kim@x.example>').map((p) => p.email), ['kim@x.example']);
});

test('A MAIL THAT TALKS OF MONEY BUT FITS NO RULE IS MARKED FOR THE MODEL', () => {
  const r = readMail({ from: 'a@b.example', subject: 'About your payment', body: 'Thanks, we will be in touch about the statement.' });
  assert.equal(r.kind, 'none');
  assert.equal(r.looksFinancial, true);
});

test('AN AMOUNT WRITTEN IN TEXT IS TAKEN OUT, its currency kept, and a number with no currency or an id stays', () => {
  assert.equal(maskMoneyText('Paid £923.47 for clay, and £1,250 more.'), 'Paid £… for clay, and £… more.');
  assert.equal(maskMoneyText('Quote GBP 400, then 1.5k? £1.5k. Fee 90 EUR.'), 'Quote GBP …, then …? £…. Fee … EUR.');
  assert.equal(maskMoneyText('Room 42, 3 chairs, ABC 120, 2026-10-22'), 'Room 42, 3 chairs, ABC 120, 2026-10-22');
  assert.equal(maskMoneyText('01JZ8QK3F7R2M9V4XN6T9USD and e.Ab3GBP'), '01JZ8QK3F7R2M9V4XN6T9USD and e.Ab3GBP');
});

test('AN INVOICE WITH A REMITTANCE FOOTER IS STILL A BILL, and "we have paid the courier" is no remittance (RL3)', () => {
  const footer = readMail({
    from: 'Halden <accounts@halden.example>',
    subject: 'Invoice INV-204, amount due £1,200',
    body: 'Invoice INV-204\nAmount due: GBP 1,200.00\nPayment due by 14 November 2026\nPlease send remittance advice to accounts@halden.example\n',
  });
  assert.equal(footer.kind, 'invoice');
  const courier = readMail({ from: 'a@b.example', subject: 'Your order', body: 'We have paid the courier, so the order ships Monday.\nInvoice to follow.' });
  assert.notEqual(courier.kind, 'remittance');
  const paid = readMail({ from: 'Priya <priya@nair.example>', subject: 'Payment for invoice INV-2026-041', body: 'We have paid invoice INV-2026-041 today.' });
  assert.equal(paid.kind, 'remittance');
});
