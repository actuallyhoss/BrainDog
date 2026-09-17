import { test } from 'node:test';
import assert from 'node:assert/strict';

import { listFromDraft, listLine, shownTags } from './tags.ts';
import { display } from './api.ts';

test("a formed row's tags are the record's own: nothing of them is shown, and an edit keeps them", () => {
  assert.deepEqual(shownTags(['formed', 'example']), []);
  assert.equal(listLine(['formed', 'example']), null);
  assert.equal(listLine(['formed', 'example', 'audio']), 'audio');
  /* A plain example keeps its mark, and a list reads with a space after each comma. */
  assert.equal(listLine(['example', 'urgent']), 'example, urgent');
  assert.deepEqual(listFromDraft('audio, , gear', ['formed', 'example']), ['audio', 'gear', 'formed', 'example']);
  assert.deepEqual(listFromDraft('', ['urgent']), []);
});

test("display says a list without the record's own tags, with a space after each comma", () => {
  assert.equal(display('no_such_list', 'tags', ['formed', 'example']), null);
  assert.equal(display('no_such_list', 'tags', ['audio', 'gear']), 'audio, gear');
});
