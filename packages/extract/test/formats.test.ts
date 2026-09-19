import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRows, UNPARSEABLE } from '../src/formats.ts';

const doc = {
  data: [
    { id: 1, amount: '10.00', tags: ['a', 'b'] },
    { id: 2, amount: '20.00', tags: [] },
  ],
  page: { next: 'tok', empty: null },
};

/* ── json ────────────────────────────────────────────────────────────────── */

test('json: a path at one array is that array’s rows', () => {
  const rows = readRows(JSON.stringify(doc), 'json', { rows: 'data' });
  assert.deepEqual(rows, doc.data);
});

test('json: data and data[] read the same', () => {
  const body = JSON.stringify(doc);
  assert.deepEqual(readRows(body, 'json', { rows: 'data' }), readRows(body, 'json', { rows: 'data[]' }));
});

test('json: a bare array body with no path', () => {
  assert.deepEqual(readRows('[{"a":1}]', 'json'), [{ a: 1 }]);
});

test('json: an object body with no path is one row', () => {
  assert.deepEqual(readRows('{"a":1}', 'json'), [{ a: 1 }]);
});

test('json: a path reaching nothing is no rows, not a failure', () => {
  assert.deepEqual(readRows('{"data":[]}', 'json', { rows: 'nope' }), []);
});

test('json: a malformed body is UNPARSEABLE', () => {
  assert.equal(readRows('{oops', 'json'), UNPARSEABLE);
  assert.equal(readRows('', 'json'), UNPARSEABLE);
});

test('json: a null body is a value and not a failure', () => {
  assert.deepEqual(readRows('null', 'json'), [null]);
});

/* ── csv ─────────────────────────────────────────────────────────────────── */

test('csv: a header and two rows', () => {
  assert.deepEqual(readRows('a,b\n1,2\n3,4\n', 'csv'), [
    { a: '1', b: '2' },
    { a: '3', b: '4' },
  ]);
});

test('csv: CRLF and a trailing newline', () => {
  assert.deepEqual(readRows('a,b\r\n1,2\r\n', 'csv'), [{ a: '1', b: '2' }]);
});

test('csv: a quoted delimiter is data', () => {
  assert.deepEqual(readRows('a,b\n"x,y",2\n', 'csv'), [{ a: 'x,y', b: '2' }]);
});

test('csv: a doubled quote is one quote', () => {
  assert.deepEqual(readRows('a\n"she said ""no"""\n', 'csv'), [{ a: 'she said "no"' }]);
});

test('csv: a newline inside quotes is data', () => {
  assert.deepEqual(readRows('a,b\n"one\ntwo",2\n', 'csv'), [{ a: 'one\ntwo', b: '2' }]);
});

test('csv: a semicolon or tab delimiter when the declaration says so', () => {
  assert.deepEqual(readRows('a;b\n1;2\n', 'csv', { delimiter: ';' }), [{ a: '1', b: '2' }]);
  assert.deepEqual(readRows('a\tb\n1\t2\n', 'csv', { delimiter: '\t' }), [{ a: '1', b: '2' }]);
});

test('csv: a BOM is dropped and does not join the first header', () => {
  assert.deepEqual(readRows('﻿a,b\n1,2\n', 'csv'), [{ a: '1', b: '2' }]);
});

test('csv: fewer cells than headers leaves keys absent', () => {
  assert.deepEqual(readRows('a,b,c\n1,2\n', 'csv'), [{ a: '1', b: '2' }]);
});

test('csv: extra cells are dropped', () => {
  assert.deepEqual(readRows('a,b\n1,2,3\n', 'csv'), [{ a: '1', b: '2' }]);
});

test('csv: the last duplicate header wins', () => {
  assert.deepEqual(readRows('a,a\n1,2\n', 'csv'), [{ a: '2' }]);
});

test('csv: a header alone is no rows, not a failure', () => {
  assert.deepEqual(readRows('a,b\n', 'csv'), []);
});

test('csv: an empty body is UNPARSEABLE', () => {
  assert.equal(readRows('', 'csv'), UNPARSEABLE);
  assert.equal(readRows('\n', 'csv'), UNPARSEABLE);
});

test('csv: an empty cell is an empty string and not an absence', () => {
  assert.deepEqual(readRows('a,b\n,2\n', 'csv'), [{ a: '', b: '2' }]);
});

/* ── xml ─────────────────────────────────────────────────────────────────── */

test('xml: repeated children become a list', () => {
  const body = '<feed><entry><id>1</id></entry><entry><id>2</id></entry></feed>';
  assert.deepEqual(readRows(body, 'xml', { rows: 'feed.entry[]' }), [{ id: '1' }, { id: '2' }]);
});

test('xml: one child is not a list, so a path reads it either way', () => {
  const body = '<feed><entry><id>1</id></entry></feed>';
  assert.deepEqual(readRows(body, 'xml', { rows: 'feed.entry' }), [{ id: '1' }]);
});

test('xml: a text-only element is its string', () => {
  assert.deepEqual(readRows('<a><b>hi</b></a>', 'xml', { rows: 'a.b' }), ['hi']);
});

test('xml: attributes arrive under @', () => {
  assert.deepEqual(readRows('<a><b id="7">hi</b></a>', 'xml', { rows: 'a.b' }), [{ '@id': '7', '#text': 'hi' }]);
});

test('xml: a prolog, a comment and a self-closing element', () => {
  const body = '<?xml version="1.0"?><!-- note --><a><b/><c>2</c></a>';
  assert.deepEqual(readRows(body, 'xml', { rows: 'a.c' }), ['2']);
});

test('xml: CDATA is text and its markup is not parsed', () => {
  assert.deepEqual(readRows('<a><b><![CDATA[<x> & y]]></b></a>', 'xml', { rows: 'a.b' }), ['<x> & y']);
});

test('xml: the five predefined entities and numeric references', () => {
  const body = '<a><b>&lt;&amp;&gt;&quot;&apos;&#65;&#x42;</b></a>';
  assert.deepEqual(readRows(body, 'xml', { rows: 'a.b' }), ['<&>"\'AB']);
});

test('xml: an unknown entity stays the characters it was written as', () => {
  assert.deepEqual(readRows('<a><b>&nbsp;x</b></a>', 'xml', { rows: 'a.b' }), ['&nbsp;x']);
});

test('xml: a DOCTYPE makes the whole body UNPARSEABLE', () => {
  assert.equal(readRows('<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>', 'xml'), UNPARSEABLE);
});

test('xml: mismatched, unclosed or two-rooted is UNPARSEABLE', () => {
  assert.equal(readRows('<a><b></c></a>', 'xml'), UNPARSEABLE);
  assert.equal(readRows('<a><b></a>', 'xml'), UNPARSEABLE);
  assert.equal(readRows('<a/><b/>', 'xml'), UNPARSEABLE);
  assert.equal(readRows('not xml at all', 'xml'), UNPARSEABLE);
});

/* ── an html table ───────────────────────────────────────────────────────── */

const page = `<html><body>
<table><tr><th>Date</th><th>Amount</th></tr>
<tr><td>2026-01-02</td><td>EGP&nbsp;1,250</td></tr></table>
<table><tr><th>Other</th></tr><tr><td>z</td></tr></table>
</body></html>`;

test('html_table: the first table by default', () => {
  assert.deepEqual(readRows(page, 'html_table'), [{ Date: '2026-01-02', Amount: 'EGP 1,250' }]);
});

test('html_table: the nth table when the declaration asks', () => {
  assert.deepEqual(readRows(page, 'html_table', { table: 2 }), [{ Other: 'z' }]);
});

test('html_table: a table that is not there is UNPARSEABLE', () => {
  assert.equal(readRows(page, 'html_table', { table: 9 }), UNPARSEABLE);
  assert.equal(readRows('<p>no tables</p>', 'html_table'), UNPARSEABLE);
});

test('html_table: thead and tbody are tolerated', () => {
  const body = '<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';
  assert.deepEqual(readRows(body, 'html_table'), [{ a: '1' }]);
});

test('html_table: tags inside a cell are stripped and whitespace collapses', () => {
  const body = '<table><tr><th>a</th></tr><tr><td> <b>one</b>\n  two </td></tr></table>';
  assert.deepEqual(readRows(body, 'html_table'), [{ a: 'one two' }]);
});

test('html_table: a script between rows is skipped whole', () => {
  const body = '<table><tr><th>a</th></tr><script>var x = "<td>lies</td>";</script><tr><td>1</td></tr></table>';
  assert.deepEqual(readRows(body, 'html_table'), [{ a: '1' }]);
});

test('html_table: a header alone is no rows', () => {
  assert.deepEqual(readRows('<table><tr><th>a</th></tr></table>', 'html_table'), []);
});

/* ── text ────────────────────────────────────────────────────────────────── */

test('text: the body is the one row, untouched', () => {
  assert.deepEqual(readRows('  anything <at> all  ', 'text'), ['  anything <at> all  ']);
  assert.deepEqual(readRows('', 'text'), ['']);
});

test('html_table: a nested table does not end the read of the one asked for', () => {
  const body =
    '<table><tr><th>a</th></tr><tr><td>1</td></tr>' +
    '<tr><td><table><tr><td>inner</td></tr></table></td></tr>' +
    '<tr><td>3</td></tr></table>';
  const rows = readRows(body, 'html_table');
  assert.equal(Array.isArray(rows) ? rows.length : -1, 3);
  assert.deepEqual(Array.isArray(rows) ? rows[2] : null, { a: '3' });
});

test('xml: a namespace prefix is literal, in the element and in the path', () => {
  const body = '<atom:feed><atom:entry><id>1</id></atom:entry></atom:feed>';
  assert.deepEqual(readRows(body, 'xml', { rows: 'atom:feed.atom:entry' }), [{ id: '1' }]);
});

test('html_table: tag names are case-insensitive', () => {
  const body = '<TABLE><TR><TH>a</TH></TR><Tr><Td>1</Td></Tr></TABLE>';
  assert.deepEqual(readRows(body, 'html_table'), [{ a: '1' }]);
});
