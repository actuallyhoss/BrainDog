/**
 * The days a deleted record's last copy is kept are one number everywhere it is said (LCH-A16 job 1, "privacy text
 * says so", HD.394).
 *
 * THE NUMBER IS `FINAL_KEPT_DAYS` (`apps/worker/src/destroy.ts`), the one the night's expiry runs on. The app's delete
 * screen is held to it by `apps/web/src/routes/settings/delete-costs.test.ts`; this holds the docs page and every legal
 * text that speaks of deletion. Each must say the final copy and the number with "days" in the same sentence, and no
 * sentence about the final copy may say another number of days.
 *
 * READ BY ITS RUNTIME URL, as `copy-currency.test.ts` reads the record's table of plans: the site declares no Worker.
 * A planted page saying 14 is checked beside the real ones, so the check is seen to fail by itself.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const REPO = new URL('../../../', import.meta.url);

const { FINAL_KEPT_DAYS } = (await import(new URL('apps/worker/src/destroy.ts', REPO).href)) as { FINAL_KEPT_DAYS: number };

/** The docs page a person reads before deleting, and the folder of the owner's legal texts. */
const DOCS = new URL('apps/site/src/docs/02-use/11-export-and-delete.md', REPO);
const LEGAL = new URL('apps/site/legal/', REPO);

/** The sentences of a Markdown text, one bullet or paragraph line split at its full stops. */
const sentencesOf = (text: string): string[] =>
  text
    .split('\n')
    .flatMap((line) => line.split(/(?<=[.!?])\s+/u))
    .map((s) => s.trim())
    .filter(Boolean);

/** A sentence about a deleted record's last copy: "final copy", "final sealed copy". */
const FINAL_COPY = /\bfinal\b(?:\s+\w+)?\s+copy\b/iu;

/** A sentence that says when nothing of a deleted record is left: "nothing of it remains", "nothing of the record remains". */
const NOTHING_REMAINS = /\bnothing of (?:it|the record|your record) remains\b/iu;

/**
 * What is wrong with one text, as sentences a person reads: nothing said of the final copy, a final-copy sentence with
 * no number of days, or one with a number that is not `days`.
 */
function wrongIn(text: string, days: number): string[] {
  const sentences = sentencesOf(text);
  const finals = sentences.filter((s) => FINAL_COPY.test(s));
  if (finals.length === 0) return ['it says nothing of the final copy'];
  const wrong: string[] = [];
  const daysIn = (s: string): number[] => [...s.matchAll(/\b(\d+)\s+days?\b/gu)].map((m) => Number(m[1]));
  for (const s of finals) {
    const said = daysIn(s);
    if (said.length === 0) wrong.push(`“${s}” says no number of days`);
    for (const n of said) if (n !== days) wrong.push(`“${s}” says ${String(n)} days, where the record keeps it ${String(days)}`);
  }
  /* THE SAME PROMISE WITHOUT THE WORDS: "nothing of it remains 30 days later" (`processing.md`'s summary) is the final
     copy's end, so a number of days beside it must be the same one. A sentence with no number is the copy's end said
     after the number, and passes. */
  for (const s of sentences.filter((x) => !FINAL_COPY.test(x) && NOTHING_REMAINS.test(x)))
    for (const n of daysIn(s)) if (n !== days) wrong.push(`“${s}” says ${String(n)} days, where the record keeps it ${String(days)}`);
  return wrong;
}


/** Every legal text that speaks of deletion, by its file name. */
const legalTexts = (): string[] =>
  readdirSync(LEGAL)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => /\bdelet/iu.test(readFileSync(new URL(f, LEGAL), 'utf8')))
    .sort();

test('THE DOCS PAGE SAYS THE FINAL COPY IS KEPT AS MANY DAYS AS THE RECORD KEEPS IT', () => {
  assert.equal(typeof FINAL_KEPT_DAYS, 'number');
  assert.deepEqual(wrongIn(readFileSync(DOCS, 'utf8'), FINAL_KEPT_DAYS), []);
});

test('EVERY LEGAL TEXT THAT SPEAKS OF DELETION SAYS THE SAME NUMBER OF DAYS', () => {
  const texts = legalTexts();
  /* THE THREE THAT SAY IT TODAY, so a text dropped from the folder, or one that stops speaking of deletion, is seen. */
  for (const name of ['privacy.md', 'processing.md', 'terms.md']) assert.ok(texts.includes(name), `${name} no longer speaks of deletion`);
  for (const name of texts) assert.deepEqual(wrongIn(readFileSync(new URL(name, LEGAL), 'utf8'), FINAL_KEPT_DAYS), [], name);
});

test('A PLANTED PAGE SAYING 14 FAILS, and so does one that names the final copy and no days', () => {
  const docs = readFileSync(DOCS, 'utf8');
  const planted = docs.replace(new RegExp(`(final copy[^.]*?)\\b${String(FINAL_KEPT_DAYS)} days`, 'iu'), (_, before: string) => `${before}14 days`);
  assert.notEqual(planted, docs, 'the plant found no sentence to change');
  assert.match(wrongIn(planted, FINAL_KEPT_DAYS).join('\n'), /says 14 days/u);
  assert.match(wrongIn('A final copy is kept for a while.', FINAL_KEPT_DAYS).join('\n'), /says no number of days/u);
  assert.deepEqual(wrongIn('Deleting a record cannot be undone.', FINAL_KEPT_DAYS), ['it says nothing of the final copy']);
  /* AND A TERMS TEXT CHANGED TO 14 IN ITS FINAL-COPY SENTENCE ONLY, while "30 days" stays elsewhere on the page. */
  const terms = readFileSync(new URL('terms.md', LEGAL), 'utf8');
  const fourteen = terms.replace(/(final copy, which we keep for )\d+ days/u, (_, before: string) => `${before}14 days`);
  assert.notEqual(fourteen, terms);
  assert.ok(fourteen.includes(`${String(FINAL_KEPT_DAYS)} days`), 'the plant should leave the number elsewhere on the page');
  assert.notDeepEqual(wrongIn(fourteen, FINAL_KEPT_DAYS), []);
  /* AND THE PROCESSING SUMMARY'S "nothing of it remains 30 days later", which names no final copy and is the same promise. */
  const processing = readFileSync(new URL('processing.md', LEGAL), 'utf8');
  const summary = processing.replace(new RegExp(`(nothing of it remains )${String(FINAL_KEPT_DAYS)} days`, 'u'), (_, before: string) => `${before}14 days`);
  assert.notEqual(summary, processing, 'the plant found no summary to change');
  assert.match(wrongIn(summary, FINAL_KEPT_DAYS).join('\n'), /remains 14 days later.*says 14 days/u);
});
