/**
 * A short, clean brief out of a row's note: what a person reads about a project must not show what an import left in
 * the note. The rules live in the kernel (`note-clean`) so the importer cleans with the same ones on the way in.
 */
export { briefFromNote, noteWithoutLeftovers } from '@braindog/kernel';
