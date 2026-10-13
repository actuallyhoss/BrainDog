/**
 * `{{bad:words}}`: a phrase drawn in the danger colour, and the only colour that has a form (H.202).
 *
 * WHAT IS HELD HERE: the words are inline text, so a path, a typed value and a bold run inside all
 * read as they do outside; a form with no words is the author's text; no other colour word is a form;
 * one `bad` does not hold another, so no text can make the reader recurse; and the Svelte drawer and
 * `toHTML` draw one tree.
 *
 * THE SVELTE SIDE IS COMPILED FOR THE SERVER here, as `./icon-inline.test.ts` does it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { UNNAMED, cellNamesNothing, inline, text, type Inline } from './inline.ts';
import { toHTML } from './html.ts';
import { parse, type Block as BlockSegment } from './parse.ts';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

/* By URL, so the type checker, which has no Svelte compiler here, does not look for the file. */
const { default: Text } = (await import(new URL('../svelte/Text.svelte', import.meta.url).href)) as {
  default: Component<{ nodes: Inline[]; opts?: Record<string, unknown> }>;
};
const { default: Block } = (await import(new URL('../svelte/Block.svelte', import.meta.url).href)) as {
  default: Component<{ block: BlockSegment; opts?: Record<string, unknown> }>;
};

const record: Record<string, string> = { 'tasks.late': '3', 'invoice.owed': '120000 GBP' };
const opts = { resolve: (path: string) => (path in record ? record[path]! : path === 'nothing.here' ? UNNAMED : null) };

/**
 * The markup with the space between tags and the compiler's comments taken out, as a browser builds it. The two
 * drawers escape `>` and `"` in text differently and a browser reads both the same, so both are read here.
 */
const tree = (html: string): string =>
  html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/\s+/gu, ' ')
    .replace(/> </gu, '><')
    .trim();

test('A PHRASE IN THE BAD FORM IS A BAD NODE, and its words are inline text', () => {
  assert.deepEqual(inline('{{bad:overdue}}'), [{ type: 'bad', body: [{ type: 'text', text: 'overdue' }] }]);
  assert.deepEqual(inline('{{ bad : three days overdue }}'), [{ type: 'bad', body: [{ type: 'text', text: 'three days overdue' }] }]);
  assert.deepEqual(inline('Rent is {{bad:overdue}} today'), [
    { type: 'text', text: 'Rent is ' },
    { type: 'bad', body: [{ type: 'text', text: 'overdue' }] },
    { type: 'text', text: ' today' },
  ]);
  assert.deepEqual(inline('`{{bad:overdue}}`'), [{ type: 'code', text: '{{bad:overdue}}' }], 'a code span is text');
});

test('a path inside still resolves, and so does every other inline form', () => {
  assert.deepEqual(inline('{{bad:{{tasks.late}} overdue}}', opts), [
    {
      type: 'bad',
      body: [
        { type: 'path', path: 'tasks.late', resolved: '3' },
        { type: 'text', text: ' overdue' },
      ],
    },
  ]);
  assert.deepEqual(inline('{{bad:{{tasks.late}}}}', opts), [{ type: 'bad', body: [{ type: 'path', path: 'tasks.late', resolved: '3' }] }]);
  assert.deepEqual(inline('{{bad:**{{tasks.late}}** late}} and {{tasks.late}}', opts), [
    { type: 'bad', body: [{ type: 'strong', body: [{ type: 'path', path: 'tasks.late', resolved: '3' }] }, { type: 'text', text: ' late' }] },
    { type: 'text', text: ' and ' },
    { type: 'path', path: 'tasks.late', resolved: '3' },
  ]);
  const [owed] = inline('{{bad:{{money:invoice.owed}} owed}}', opts);
  assert.equal(owed?.type, 'bad');
  assert.equal(owed?.type === 'bad' && owed.body[0]?.type, 'typed', 'a typed value inside is formatted');
  /* A tag closes on one brace, right against the two that close the form. */
  assert.deepEqual(inline('{{bad:late {estimate}}}'), [
    { type: 'bad', body: [{ type: 'text', text: 'late ' }, { type: 'evidence', kind: 'estimate' }] },
  ]);
});

test('the projections read through it', () => {
  assert.equal(text(inline('Rent is {{bad:{{tasks.late}} days overdue}}', opts)), 'Rent is 3 days overdue');
  assert.equal(cellNamesNothing('{{bad:{{nothing.here}}}}', opts), true, 'a path that names nothing is found inside');
  assert.equal(cellNamesNothing('{{bad:{{tasks.late}}}}', opts), false);
});

test('A FORM WITH NO WORDS IS THE TEXT THE AUTHOR TYPED', () => {
  assert.deepEqual(inline('{{bad:}}'), [{ type: 'unresolved', text: 'bad:' }]);
  assert.deepEqual(inline('{{bad:   }}'), [{ type: 'unresolved', text: 'bad:' }]);
  assert.deepEqual(inline('{{bad}}', opts), [{ type: 'path', path: 'bad', resolved: null }], 'without a colon it is a path, as ever');
  assert.deepEqual(inline('{{bad:overdue'), [{ type: 'text', text: '{{bad:overdue' }], 'never closed, never a form');
});

test('NO OTHER COLOUR WORD IS A FORM', () => {
  for (const word of ['good', 'ok', 'warn', 'warning', 'danger', 'late', 'red', 'green', 'amber', 'blue', 'accent', 'muted', 'Bad', 'BAD'])
    assert.deepEqual(inline(`{{${word}:overdue}}`), [{ type: 'unresolved', text: `${word}:overdue` }], word);
});

test('ONE BAD DOES NOT HOLD ANOTHER, so the reader goes one level down whatever it is handed', () => {
  assert.deepEqual(inline('{{bad:a {{bad:b}} c}}'), [
    { type: 'bad', body: [{ type: 'text', text: 'a ' }, { type: 'unresolved', text: 'bad:b' }, { type: 'text', text: ' c' }] },
  ]);
  /* Two side by side are two, and the second is not read as the words of the first. */
  assert.deepEqual(inline('{{bad:late}} and {{bad:unpaid}}'), [
    { type: 'bad', body: [{ type: 'text', text: 'late' }] },
    { type: 'text', text: ' and ' },
    { type: 'bad', body: [{ type: 'text', text: 'unpaid' }] },
  ]);
  /* Text of nothing but openers, closers, or both: a tree comes back, and in time that is not the square of it. */
  const n = 40_000;
  const started = performance.now();
  for (const hostile of ['{{bad:'.repeat(n), `${'{{bad:'.repeat(n)}${'}}'.repeat(n)}`, '{{bad:{{a}}'.repeat(n), `${'{{bad:x'.repeat(n)}}}`, '}'.repeat(n)])
    assert.ok(Array.isArray(inline(hostile)));
  assert.ok(performance.now() - started < 2_000, `five hostile texts took ${Math.round(performance.now() - started)} ms`);
});

test('BOTH DRAWERS DRAW A SPAN OF CLASS BAD, around whatever the words draw', () => {
  const drawn = toHTML(parse('Rent is {{bad:{{tasks.late}} days overdue}} today'), opts);
  assert.ok(drawn.includes('<span class="bad"><span class="figure num">3</span> days overdue</span>'), drawn);

  for (const src of [
    '{{bad:overdue}}',
    'Rent is {{bad:{{tasks.late}} days overdue}} today',
    '{{bad:**{{money:invoice.owed}}** owed, [chase it](/r/invoices/1)}}',
    '{{bad:<b>&"quoted"</b>}}',
    '{{bad:{{no.value}} late}}',
    '{{bad:}} {{good:fine}}',
  ]) {
    const nodes = inline(src, opts);
    const html = toHTML(parse(src), opts);
    const svelte = tree(render(Text, { props: { nodes, opts } }).body);
    assert.ok(tree(html).includes(svelte), `${src}\n  html:   ${tree(html)}\n  svelte: ${svelte}`);
    assert.equal(svelte.includes('class="bad"'), nodes.some((n) => n.type === 'bad'), src);
  }
  assert.ok(!toHTML(parse('{{bad:<b>&"quoted"</b>}}')).includes('<b>'), 'the words are escaped, as all text is');
});

test('a chip takes the form in its figure, and the two drawers agree', () => {
  const [chips] = parse('```chips\nclock | {{bad:{{tasks.late}} late}} | tasks\n```', { page: true });
  assert.equal(chips?.type, 'block');
  const html = tree(toHTML([chips!], opts));
  const svelte = tree(render(Block, { props: { block: chips as BlockSegment, opts } }).body);
  const figure = '<span class="pill-figure num"><span class="bad"><span class="figure num">3</span> late</span></span>';
  assert.ok(html.includes(figure), html);
  assert.ok(svelte.includes(figure), svelte);
});
