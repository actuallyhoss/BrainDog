/**
 * Shop: the orders a small shop takes and the things it sells.
 *
 * WRITTEN FOR USE CASE 6 OF THE VISION (his word of 9 October, `loop/STATUS.md`): a person who says "I run a small
 * candle shop" sees her words mapped to Orders and Products, and neither existed anywhere. Small business carried no
 * list, so a shop was proposed a page of every list the record held and nowhere to write an order down.
 *
 * IT LEANS ON PEOPLE AND NOTHING ELSE. An order is somebody's, so `who` links to People, which onboarding installs for
 * the person's own entry anyway. Nothing here points at a project, an account or an invoice: what was paid is on the
 * order, in its own currency, and Money is offered when a shop asks for its books.
 *
 * NO EXAMPLES. A shop's record holds only the orders and products she wrote, or formed from what she said (USE-B07),
 * and the Orders page draws a tile only while something is in it.
 */

import { counted } from './counted.ts';

/** An order not yet made or sent, which Due this week reads. */
const TO_SEND = 'state is new or ready';

/** An order nobody has paid for yet, which Owed to you reads: not marked paid, no amount written as paid, and a total to owe. */
const OWED = 'state is not paid, paid is empty, total is set';

export const SHOP = {
  usecase: 'shop',
  /* 1.0.0: the first version, with Orders and Products and the Orders page. */
  version: '1.0.0',
  title: 'Shop',
  summary: 'The orders you take, who they are for and when they are due, what has been paid, and the things you sell.',
  author: 'BrainDog',
  license: 'MIT',
  audience: 'individual',
  tone: 'plain, the house voice',
  signals: [
    'shop', 'store', 'sell', 'selling', 'orders', 'products', 'stock', 'handmade', 'market stall', 'stall', 'my shop',
    'online shop',
  ],
  modules: ['people'],
  /* THE HOUSE VOICE BUT FOR THE LINES ABOUT WHAT FALLS DUE: a shop's week is orders to make and send. */
  voice: {
    coming_up: 'Due soon',
    nothing_due: 'No order is due in the next two weeks.',
    fills_with: 'The orders due this week and what you are owed show up here as you add your orders.',
  },
  /* THE LISTS' OWN WORDS, so a shop can call them what it does: Commissions, Stock. */
  labels: {
    orders: 'Orders',
    'orders:one': 'order',
    products: 'Products',
    'products:one': 'product',
  },
  skills: [],
  pack: {
    pack: 'usecase-shop',
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [
      {
        register: 'orders',
        name: 'Orders',
        one: 'order',
        icon: 'task',
        holds: 'every order with who it is for, what and how many, the day it is due, what it comes to and what was paid',
        title: 'what',
        mobile: ['what', 'who', 'due'],
        state: 'state',
        done: ['paid'],
        fields: [
          /* WHO MAKES AN ORDER READABLE: "3 vanilla jars" is nobody's until it says whose, so the list shows it. */
          { id: 'who', label: 'Who', type: 'ref', to: 'people', index: true, qualifies: 'what' },
          { id: 'what', label: 'What', type: 'text', required: true, search: true },
          { id: 'how_many', label: 'How many', type: 'int' },
          { id: 'due', label: 'Due', type: 'day', index: true, deadline: true, remind: ['-1d', '0d'] },
          /* WHAT THE ORDER COMES TO, so the page can say what is still owed: "Salma still owes EGP 1,350". */
          { id: 'total', label: 'Total', type: 'money' },
          /* AN AMOUNT WITH ITS CURRENCY, integer minor units: "paid 900 on InstaPay" is 900 in the currency she pays in. */
          { id: 'paid', label: 'Paid', type: 'money' },
          {
            id: 'state',
            label: 'Status',
            type: 'enum',
            values: ['new', 'ready', 'sent', 'paid'],
            labels: { new: 'New', ready: 'Ready', sent: 'Sent', paid: 'Paid' },
            default: 'new',
            required: true,
            index: true,
          },
          { id: 'note', label: 'Notes', type: 'document' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      {
        register: 'products',
        name: 'Products',
        one: 'product',
        icon: 'doc',
        holds: 'the things you sell, their price and how many are left',
        title: 'name',
        mobile: ['name', 'price', 'left'],
        fields: [
          { id: 'name', label: 'Product', type: 'text', required: true, search: true },
          { id: 'price', label: 'Price', type: 'money' },
          { id: 'left', label: 'How many left', type: 'int' },
          { id: 'note', label: 'Notes', type: 'document' },
          { id: 'tags', type: 'list', of: 'text' },
        ],
      },
      /* WHAT THE ORDERS PAGE IS DRAWN ON, each over its tile's own clauses, so a tile is never drawn over nothing. The
         month's orders are the ones written in the last 30 days, by the day the record wrote them: an order has no day
         of its own but the one it is due. */
      counted('orders-30d', 'Orders in the last 30 days', 'register.orders', 'created_at after -30d'),
      counted('orders-due-7d', 'Orders due this week', 'register.orders', `${TO_SEND}, due before +8d`),
      counted('orders-owed', 'Orders not paid yet', 'register.orders', OWED),
      {
        page: 'orders',
        title: 'Orders',
        nav: { section: 'Orders', order: 10 },
        icon: 'board',
        requires: ['register.orders'],
        blocks: [
          {
            /* THE PAGE'S ONE LINE, as the vision says it: "3 orders this month, 2 to ship this week, and Salma still owes
               EGP 1,350". A clause whose figure is nought is left out, so a new shop reads no line, and the owed clause
               names the first order nobody has paid and its total, one order's both. The clauses are cut at commas
               (`leadOf`), so each goes on its own when it has nothing to say. */
            kind: 'note',
            lead: true,
            span: 12,
            body: '{{orders-30d}} order(s) this month, {{orders-due-7d}} to ship this week, and {{orders-owed.first_who}} still owes {{orders-owed.first_total}}',
          },
          {
            /* WHAT TO MAKE OR SEND IN SEVEN DAYS, the late ones first. */
            kind: 'table',
            heading: 'Due this week',
            icon: 'calendar-clock',
            span: 12,
            source: 'register.orders',
            where: `${TO_SEND}, due before +8d`,
            when: { metric: 'orders-due-7d', gt: 0 },
            columns: [
              { field: 'what', label: 'Order', width: 'minmax(18ch,1fr)' },
              { field: 'who', label: 'Who', width: 'minmax(10ch,18ch)' },
              { field: 'how_many', label: 'How many', width: '10ch', align: 'end' },
              { field: 'due', label: 'Due', width: '14ch', align: 'end' },
            ],
            order: [{ field: 'due', dir: 'asc' }],
            limit: 8,
            empty: 'No order is due this week.',
          },
          {
            /* WHO HAS NOT PAID YET, the oldest due first. */
            kind: 'table',
            heading: 'Owed to you',
            icon: 'wallet',
            span: 12,
            source: 'register.orders',
            where: OWED,
            when: { metric: 'orders-owed', gt: 0 },
            columns: [
              { field: 'who', label: 'Who', width: 'minmax(10ch,18ch)' },
              { field: 'what', label: 'Order', width: 'minmax(18ch,1fr)' },
              { field: 'total', label: 'Total', width: '14ch', align: 'end' },
              { field: 'due', label: 'Due', width: '14ch', align: 'end' },
            ],
            order: [{ field: 'due', dir: 'asc' }],
            limit: 8,
            empty: 'Nobody owes you for an order.',
          },
        ],
      },
    ],
    /* NO `seeds`: a shop's record holds only what she wrote. */
  },
};
