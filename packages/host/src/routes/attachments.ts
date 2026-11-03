/**
 * The route rows for attachments (`packages/record/src/methods/attachments.ts`): DATA to put a file on a thing, rename
 * it, take it off and put it back; READ+ to list a thing's files and read one, as `log` and `get` are.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'attachFile', group: 'DATA', writes: true, what: 'Put a file on a task, a project, a row, a question or a decision, named by the hash the file door answered (or its words as text), or give one it carries a new version under the same name.' },
  { name: 'renameAttachment', group: 'DATA', writes: true, what: 'Give an attachment a new name.' },
  { name: 'removeAttachment', group: 'DATA', writes: true, what: 'Take an attachment off its thing. Its bytes stay, so it can be put back.' },
  { name: 'restoreAttachment', group: 'DATA', writes: true, what: 'Put an attachment back, at its newest version or the one named.' },
  { name: 'attachments', group: 'READ+', writes: false, what: 'The files one thing you can see carries, each by its name, kind, size and who put it.', takes: { on: 'text' } },
  { name: 'attachmentFiles', group: 'READ+', writes: false, what: 'Every file you can see attached anywhere, every version, by its hash, name and the thing it is on: what braindog attach --pull downloads.' },
  { name: 'mendAttachments', group: 'DATA', writes: true, what: 'After files were pushed back to a restored record, read the words of each again where they are missing, and say how many files are still not here.' },
  { name: 'attachmentRoom', group: 'READ+', writes: false, what: 'How much of its room for files the record has used: bytes used, the most, the plan whose room it is, and one sentence.' },
  { name: 'attachment', group: 'READ+', writes: false, what: 'One attachment: its version asked or the one it stands at, a slice of its words from `from`, and every version.', takes: { id: 'text', version: 'integer', from: 'integer' } },
];
