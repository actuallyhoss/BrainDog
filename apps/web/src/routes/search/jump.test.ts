/**
 * Where `/search` offers to jump before anything is typed: a section's things in their colours, the lists by what they
 * hold, and the people a list declares `meets:` for, read by role and never by a list's name.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { listsOf, readDeclared, readPeople, thingsOf } from './jump.ts';

test('a section of things is the pages about one thing, in the rail order, capped', () => {
  const nav = [
    { title: 'Portfolio', href: '/p/portfolio', section: 'Projects' },
    { title: 'Kiln', href: '/p/kiln', section: 'Projects', row: true, hue: 180 },
    { title: 'Marlow & Co', href: '/p/marlow-co', section: 'Projects', row: true, hue: 20 },
    { title: 'Work', href: '/p/work', section: 'Work' },
    { title: 'Board', href: '/p/work-board', section: 'Work' },
  ];
  assert.deepEqual(thingsOf(nav), [
    {
      section: 'Projects',
      items: [
        { title: 'Kiln', href: '/p/kiln', hue: 180 },
        { title: 'Marlow & Co', href: '/p/marlow-co', hue: 20 },
      ],
    },
  ]);
  assert.equal(thingsOf(nav, 1)[0]?.items.length, 1);
});

test('the lists that hold something, most first, wearing the glyph each declares', () => {
  const registers = [
    { id: 'tasks', name: 'Tasks', count: 12, icon: 'rows' as const },
    { id: 'empty', name: 'Nothing yet', count: 0, icon: 'rows' as const },
    { id: 'obligations', name: 'Bills and invoices', count: 38, icon: 'rows' as const },
  ];
  const out = listsOf(registers, new Map([['obligations', 'obligation' as const]]));
  assert.deepEqual(out.map((l) => [l.title, l.icon, l.count, l.href]), [
    ['Bills and invoices', 'obligation', 38, '/r/obligations'],
    ['Tasks', 'rows', 12, '/r/tasks'],
  ]);
});

const glyph = (n: string): n is 'people' | 'obligation' => n === 'people' || n === 'obligation';

test('the people are whichever list plays the role, newest in touch first, without the record\'s own person', async () => {
  const asked: unknown[] = [];
  const client = {
    schema: async (register: string) =>
      register === 'contacts'
        ? { ok: true, value: { icon: 'people', title: 'full_name', meets: { name: 'full_name', self: 'me', in_touch: 'seen' } } }
        : register === 'broken'
          ? { ok: false }
          : { ok: true, value: { icon: 'not-a-glyph' } },
    list: async (args: unknown) => {
      asked.push(args);
      return {
        ok: true,
        value: {
          rows: [
            { seq: 1, fields: { full_name: 'Mara Lindqvist', me: false } },
            { seq: 2, fields: { full_name: 'The owner', me: true } },
            { seq: 3, fields: { full_name: '  ' } },
          ],
        },
      };
    },
  };
  const declared = await readDeclared(client, [{ id: 'tasks' }, { id: 'broken' }, { id: 'contacts' }], glyph);
  assert.deepEqual([...declared.icons], [['contacts', 'people']], 'a glyph the build does not know is left to the shell');
  assert.equal(declared.people?.register, 'contacts');
  const people = await readPeople(client, declared.people!);
  assert.deepEqual(people, [{ title: 'Mara Lindqvist', href: '/r/contacts/1' }]);
  assert.deepEqual((asked[0] as { order?: unknown }).order, [{ field: 'seen', dir: 'desc' }]);
});

test('a record that will not order by the last day in touch is asked plainly', async () => {
  const asked: unknown[] = [];
  const client = {
    schema: async () => ({ ok: false }),
    list: async (args: { order?: unknown }) => {
      asked.push(args);
      return args.order ? { ok: false } : { ok: true, value: { rows: [{ seq: 4, fields: { name: 'Ada Vine' } }] } };
    },
  };
  const people = await readPeople(client, { register: 'people', meets: { name: 'name', in_touch: 'in_touch' }, title: 'name' });
  assert.deepEqual(people, [{ title: 'Ada Vine', href: '/r/people/4' }]);
  assert.equal(asked.length, 2);
});
