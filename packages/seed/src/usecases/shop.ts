/**
 * Shop: the orders a small shop takes and the things it sells.
 *
 * WRITTEN FOR USE CASE 6 OF THE VISION (9 October): a person who says "I run a small
 * candle shop" sees her words mapped to Orders and Products, and neither existed anywhere. Small business carried no
 * list, so a shop was proposed a page of every list the record held and nowhere to write an order down.
 *
 * IT LEANS ON PEOPLE AND NOTHING ELSE. An order is somebody's, so `who` links to People, which onboarding installs for
 * the person's own entry anyway. Nothing here points at a project, an account or an invoice: what was paid is on the
 * order, in its own currency, and Money is offered when a shop asks for its books.
 *
 * NO EXAMPLES. A shop's record holds only the orders and products she wrote, or formed from what she said,
 * and the Orders page draws a tile only while something is in it.
 */

import { counted } from './counted.ts';

/** An order not yet made or sent, which Due this week and Late read. */
const TO_SEND = 'state is new or ready';

/* THIS WEEK IS TODAY AND THE SEVEN DAYS AFTER, AND LATE IS ITS OWN COUNT (shop-sentence-52): "6 to ship this week" counted
   the two already past their day, beside a page offer that said four. An order past its day is late, never this week's.
   IT IS THE HOUSE'S WEEK AND STAYS SO (shop-owed-53-54): every Due this week in every use case is `due before +8d`, and
   a shop that read Monday to Sunday would say nought to ship on a Sunday with three due on the Monday. The pen is what
   counted another week, Monday to Sunday in every state, and offered a second page by the week beside this one. It
   reads this `due before +8d` as a page already by the week (`byWeek` in the record's `emergent.ts`) and offers none,
   so the clause is written in those words and no others. */
const THIS_WEEK = `${TO_SEND}, due after -1d, due before +8d`;
const LATE = `${TO_SEND}, due before today`;

/** An order not paid in full, which Still to come in reads: not marked paid, with a total to owe. A deposit does not settle it. */
const OWED = 'state is not paid, total is set';
const NOT_PAID = [{ field: 'state', not: 'paid' }, { field: 'total', present: true }];

/* WHO THE LINE CAN NAME: an order nothing was paid on, so its total is what is owed, with a person and a day on it. The
   day is what orders them, oldest first, so the line names the one the Still to come in tile opens on.
   IT NAMES ONE AND COUNTS THE REST (shop-owed-53-54): Salma owed 1,350 and 600 and Dalia 400, and the line said "Salma
   still owes EGP 1,350" with the other thousand nowhere in it. `.more` is every order here but the one named. */
const OWED_NAMED = { all: [...NOT_PAID, { field: 'paid', empty: true }, { field: 'who', present: true }, { field: 'due', present: true }] };

/* AND EVERY ORDER NOT PAID IN FULL THAT IS NOT ONE OF THOSE, counted where it cannot be named: part paid, nobody's, or
   with no day. The two split the owed orders between them, so named, more and other add up to Still to come in. */
const OWED_OTHER = { all: [...NOT_PAID, { any: [{ field: 'paid', present: true }, { field: 'who', empty: true }, { field: 'due', empty: true }] }] };

export const SHOP = {
  usecase: 'shop',
  /* 1.0.0: the first version, with Orders and Products and the Orders page.
     1.1.0: this week starts today and late is its own clause and tile; a part-paid order is owed; the line names the
     oldest order nothing was paid on, and counts the ones it cannot name.
     1.2.0: the line counts every other order nothing was paid on beside the one it names, where it said only the
     oldest and left the rest out.
     FOLDED INTO THE UNRELEASED 1.2.0 (owed-words-70-71): the tile of what is not paid in full is
     headed Still to come in, the words Today's money tile opens it with, where it said Owed to you. Commit 63423720,
     the deployed build, holds 1.0.0, so no version is cut for it.
     1.3.0: the Orders page says its place on the rail, second after Work (places-and-computed-101). 1.2.0 IS IN
     THE CATALOGUE (published by batch 99), so this is a version of its own.
     1.4.0: the Orders page opens on a box to add an order, where a new shop's first tab said
     "Nothing here yet" over nothing to press. A block added to a page that is already there, so a minor step. 1.3.0 is
     master's.
     1.4.1: the card's summary is one short line. Words only, so a patch step.
     1.5.0 (audit 31 Oct h, AH4): Products has a page of its own, on the rail from the first minute beside Orders, opening
     on a box to add a product. The first screen promised Products, and `/p/products` said there was no such page. A
     page added and nothing taken away, so a minor step; 1.4.1 is published.
     1.6.0 (no briefs, 3 Nov): Products no longer opens on how many products there are and how many run low, which its table
     shows with how many are left. Orders keeps its line, since it names who still owes and what is late. A block
     taken away and none added, so a minor step; 1.5.0 is published. */
  version: '1.6.0',
  title: 'Shop',
  summary: 'Your orders, products and what is paid.',
  author: 'BrainDog',
  license: 'MIT',
  audience: 'individual',
  tone: 'plain, the house voice',
  signals: [
    'shop', 'store', 'sell', 'selling', 'orders', 'products', 'stock', 'handmade', 'market stall', 'stall', 'my shop',
    'online shop',
  ],
  modules: ['people'],
  /* THE HOUSE VOICE BUT FOR THE LINES ABOUT WHAT FALLS DUE: a shop's week is orders to make and send.
     MONEY STILL ON ITS WAY, never a debt held over somebody: `fills_with` says it as Today's tile does. */
  voice: {
    coming_up: 'Due soon',
    nothing_due: 'No order is due in the next two weeks.',
    fills_with: 'The orders due this week and the money still to come in show up here as you add your orders.',
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
      counted('orders-due-7d', 'Orders due this week', 'register.orders', THIS_WEEK),
      counted('orders-late', 'Orders late', 'register.orders', LATE),
      counted('orders-owed', 'Orders not paid in full', 'register.orders', OWED),
      counted('products-held', 'Products', 'register.products'),
      counted('products-low', 'Products with three or fewer left', 'register.products', 'left at most 3'),
      /* TREES, because the second ORs three fields and the two must split the owed orders between them. */
      { ...counted('orders-owed-named', 'Orders nothing was paid on, with a name and a day', 'register.orders'), where: OWED_NAMED },
      { ...counted('orders-owed-other', 'Other orders not paid in full', 'register.orders'), where: OWED_OTHER },
      {
        page: 'orders',
        title: 'Orders',
        /* ITS PLACE ON THE RAIL, SINCE 1.3.0 (places-and-computed-101): second, after Work. */
        nav: { section: 'Orders', order: 10, place: 20 },
        icon: 'board',
        requires: ['register.orders'],
        blocks: [
          {
            /* THE PAGE'S ONE LINE, as the vision says it: "3 orders this month, 2 to ship this week, and Salma still owes
               EGP 1,350". A clause whose figure is nought is left out, so a new shop reads no line. The clauses are cut
               at commas (`leadOf`), so each goes on its own when it has nothing to say.
               THE OWED CLAUSE NAMES THE OLDEST ORDER NOTHING WAS PAID ON, its person and its total, one order's both.
               EVERY OTHER ORDER NOTHING WAS PAID ON IS COUNTED IN THE CLAUSE AFTER IT, "with 2 more orders not paid at
               all", hers or anybody's, and nought more is left out. An order that cannot be named that way (part paid,
               nobody's, no day) is counted in the clause before, which needs no name. Named, more and not paid in full
               are every order in Still to come in, each once. The amounts are never added: two orders may be in two
               currencies. */
            kind: 'note',
            lead: true,
            span: 12,
            body: '{{orders-30d}} order(s) this month, {{orders-due-7d}} to ship this week, {{orders-late}} late, {{orders-owed-other}} not paid in full, and {{orders-owed-named.first_who}} still owes {{orders-owed-named.first_total}}, with {{orders-owed-named.more}} more order(s) not paid at all',
          },
          {
            /* ONE BOX TO ADD AN ORDER, SINCE 1.4.0: a new shop's first tab said "Nothing here
               yet" with no way to write an order down. Under the line, as Work's box is under its own. */
            kind: 'capture',
            heading: 'Add an order',
            icon: 'plus',
            span: 12,
            register: 'orders',
          },
          {
            /* WHAT IS PAST ITS DAY AND NOT SENT, the longest late first, drawn only while something is. */
            kind: 'table',
            heading: 'Late',
            icon: 'calendar-clock',
            span: 12,
            source: 'register.orders',
            where: LATE,
            when: { metric: 'orders-late', gt: 0 },
            columns: [
              { field: 'what', label: 'Order', width: 'minmax(18ch,1fr)' },
              { field: 'who', label: 'Who', width: 'minmax(10ch,18ch)' },
              { field: 'how_many', label: 'How many', width: '10ch', align: 'end' },
              { field: 'due', label: 'Due', width: '14ch', align: 'end' },
            ],
            order: [{ field: 'due', dir: 'asc' }],
            limit: 8,
            empty: 'No order is late.',
          },
          {
            /* WHAT TO MAKE OR SEND TODAY AND IN THE SEVEN DAYS AFTER, the soonest first. */
            kind: 'table',
            heading: 'Due this week',
            icon: 'calendar-clock',
            span: 12,
            source: 'register.orders',
            where: THIS_WEEK,
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
            /* WHO HAS NOT PAID IN FULL, the oldest due first, with what came in beside what it comes to.
               HEADED AS TODAY'S MONEY TILE SAYS IT (`OWED_TO_YOU` in the web's `default-home.ts`):
               she taps Still to come in and lands on a tile of the same name. The two are held equal by hand, a
               seed file cannot read the web's constant. */
            kind: 'table',
            heading: 'Still to come in',
            icon: 'wallet',
            span: 12,
            source: 'register.orders',
            where: OWED,
            when: { metric: 'orders-owed', gt: 0 },
            columns: [
              { field: 'who', label: 'Who', width: 'minmax(10ch,18ch)' },
              { field: 'what', label: 'Order', width: 'minmax(18ch,1fr)' },
              { field: 'total', label: 'Total', width: '14ch', align: 'end' },
              { field: 'paid', label: 'Paid', width: '14ch', align: 'end' },
              { field: 'due', label: 'Due', width: '14ch', align: 'end' },
            ],
            order: [{ field: 'due', dir: 'asc' }],
            limit: 8,
            empty: 'Every order is paid in full.',
          },
        ],
      },
      {
        /* THE THINGS SHE SELLS, SINCE 1.5.0 (audit 31 Oct h, AH4): its own place on the rail, after Orders, from the first
           minute, and a box to add the first product, where Products was a list on no rail and no page. */
        page: 'products',
        title: 'Products',
        nav: { section: 'Products', order: 10, place: 25 },
        icon: 'doc',
        requires: ['register.products'],
        blocks: [
          { kind: 'capture', heading: 'Add a product', icon: 'plus', span: 12, register: 'products' },
          {
            kind: 'table',
            heading: 'Products',
            icon: 'doc',
            span: 12,
            source: 'register.products',
            when: { metric: 'products-held', gt: 0 },
            columns: [
              { field: 'name', label: 'Product', width: 'minmax(18ch,1fr)' },
              { field: 'price', label: 'Price', width: '14ch', align: 'end' },
              { field: 'left', label: 'How many left', width: '14ch', align: 'end' },
            ],
            order: [{ field: 'name', dir: 'asc' }],
            limit: 50,
            empty: 'No products yet.',
          },
        ],
      },
    ],
    /* NO `seeds`: a shop's record holds only what she wrote. */
  },
};
