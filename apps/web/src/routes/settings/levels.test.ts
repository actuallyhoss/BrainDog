/**
 * What every settings area offers a colleague, held against the markup that draws it.
 *
 * WHAT WAS MEASURED, AND IT IS WHY THIS FILE EXISTS. A real self-host, the founder's studio seeded
 * into it, the owner in through the server key and a passkey, then a colleague at each of the five
 * levels the invitation form offers, each through their own `/invite#<token>` link in their own
 * browser context. Every settings area opened as each of them at 1440 by 900. A `read` colleague
 * was offered, in the area body alone: People 67 words and 3 controls with 1 off, Agents 31 and 4
 * with 1 off, Backups 118 and 1, Export 98 and 6, Delete 54 and 2 with 1 off. Sixteen controls that
 * cannot do anything for that person, one of which said so. `write` and `decide` were offered the
 * same sixteen, because none of these methods is reachable below `owner`.
 *
 * A TEXT TEST OVER MARKUP, AND THE REASON IS THAT THERE IS NO OTHER KIND. These are `{#if}` arms in
 * a `.svelte` file with no component test in this tree, and the alternative to reading the source is
 * reading nothing: `delete-costs.test.ts` in this directory makes the same argument about copy. The
 * browser drive is the other half and it is in the report rather than here, because it needs a
 * record, two ports and ten minutes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { OWNER_CONTROLS, ownsRecord, words } from './levels.ts';

/** Every area the rail offers, in the order the page draws them. */
const AREAS = [
  'appearance', 'keyboard', 'navigation', 'people', 'recovery', 'sessions', 'identity',
  'agents', 'ingest', 'notifications', 'backups', 'billing', 'delete', 'export',
];

/**
 * An area's file WITHOUT ITS COMMENTS, which is what every check below reads.
 *
 * AND IT IS NOT TIDINESS. This file's own subject is quoted at length in that page's comments, so a
 * check over the raw text matched the sentence describing the defect as readily as the defect: the
 * first version failed on a comment that quotes `peopleFrom !== 'live'` while saying why nothing
 * branches on it any more, and on one that names `/settings/export` while saying why the link to it
 * is drawn to an owner only. A test that a comment can fail is a test that punishes explaining.
 */
const source = (area: string): string =>
  readFileSync(new URL(`./[area]/areas/${area.charAt(0).toUpperCase()}${area.slice(1)}.svelte`, import.meta.url), 'utf8')
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '');

/** Every area's file, for the checks about a handler rather than one area's markup (ARC-7b split them). */
const PAGE = AREAS.map(source).join('\n');

/** One area's markup: its own file from `</script>` on, so a name in the script cannot stand in for a control. */
function slice(area: string): string {
  const text = source(area);
  const from = text.indexOf('</script>');
  assert.ok(from >= 0, `${area} has no markup`);
  return text.slice(from);
}

/** One control per owner's area that a colleague was offered and cannot use. */
const OFFERED: Record<string, string[]> = {
  people: ['id="invite-email"', 'id="erase-person"'],
  agents: ['id="user-code"', 'id="agent-label"'],
  ingest: ['mailWords.mint'],
  backups: ['copy.snapshotNow'],
  billing: ['href="/settings/export"'],
  export: ['copy.exportPack'],
  delete: ['id="delete-slug"'],
};

test('an owner is an owner by either half of what the record said', () => {
  assert.equal(ownsRecord({ level: 'owner', owner: true }), true);
  /* EITHER HALF IS ENOUGH: a host that names the level and not the flag still has an owner reading it. */
  assert.equal(ownsRecord({ level: 'owner', owner: false }), true);
  for (const level of ['read', 'append', 'write', 'decide'])
    assert.equal(ownsRecord({ level, owner: false }), false, `${level} is not an owner`);
  /* A REFUSED `boot` HANDS THE SHELL `read`, WHICH IS A FALLBACK AND NOT AN ANSWER. Not an owner is
     still the truth about that reader, which is the only thing this predicate claims. */
  assert.equal(ownsRecord({ level: 'read', owner: false }), false);
});

/**
 * WHETHER A POSITION IN THE MARKUP IS INSIDE THE ARM THAT ONLY AN OWNER SEES.
 *
 * THE FIRST WRITING OF THIS GUARD ASKED WHETHER THE CONTROL CAME AFTER THE WORD `anOwner`, and that
 * is vacuous wherever an area opens with the NEGATIVE arm: `delete`, `export` and `ingest` all start
 * `{#if !anOwner}`, which sets the word before every control in the slice. Measured by its checker:
 * deleting the `{:else}` from the delete arm, so the red `Delete studio` button draws to a colleague
 * at `read`, left all six tests green. A gate test that passes against exactly the code it exists to
 * catch is worse than no gate test, on the screen that can destroy the record.
 *
 * SO THE BLOCKS ARE WALKED INSTEAD. Every `{#if}`, `{#each}`, `{#await}`, `{#key}` and `{#snippet}`
 * pushes a frame and a close pops one, so a `{:else}` belongs to the block it is really in. A frame
 * an `anOwner` condition opened is `yes` on the arm that needs one and `no` on the other, and the
 * two swap at `{:else}`. A control is gated when some frame around it is `yes` and none is `no`.
 */
function ownedAt(markup: string): (at: number) => boolean {
  type Arm = 'yes' | 'no' | 'other';
  /** `owner` is this arm; `known` is what the arms already ruled out say about a later one. */
  type Frame = { owner: Arm; known: Arm };
  const marks: { at: number; frames: Frame[] }[] = [];
  const stack: Frame[] = [];
  /* THE NEGATION IS NOT ALWAYS AT THE FRONT: `{:else if mintsHere === true && !anOwner}` is the arm
     for somebody who is not an owner, and reading only the first token called it the owner's. */
  const armOf = (cond: string): Arm => (/!\s*anOwner\b/u.test(cond) ? 'no' : /\banOwner\b/u.test(cond) ? 'yes' : 'other');
  const other = (arm: Arm): Arm => (arm === 'yes' ? 'no' : arm === 'no' ? 'yes' : 'other');
  const block = /\{#(if|each|await|key|snippet)\b([^}]*)\}|\{:else(\s+if\b([^}]*))?\}|\{\/(if|each|await|key|snippet)\}/gu;
  for (let m = block.exec(markup); m !== null; m = block.exec(markup)) {
    if (m[1] !== undefined) {
      const arm = m[1] === 'if' ? armOf(m[2] ?? '') : 'other';
      stack.push({ owner: arm, known: other(arm) });
    } else if (m[5] !== undefined) stack.pop();
    else {
      const top = stack[stack.length - 1];
      /**
       * A LATER ARM OF A CHAIN INHERITS WHAT THE ARMS BEFORE IT RULED OUT, which is the whole reason
       * this is a walk and not a search. `/settings/ingest` reads `{#if mintsHere === false} ...
       * {:else if mintsHere === true && !anOwner} ... {:else if mintsHere === true}`, and the third
       * arm names no level at all: what makes it the owner's arm is that the second one was false.
       */
      if (top !== undefined) {
        const arm = m[3] === undefined ? 'other' : armOf(m[4] ?? '');
        top.owner = arm === 'other' ? top.known : arm;
        if (arm !== 'other') top.known = other(arm);
      }
    }
    marks.push({ at: m.index, frames: stack.map((f) => ({ ...f })) });
  }
  return (at: number) => {
    let frames: Frame[] = [];
    for (const mark of marks) {
      if (mark.at > at) break;
      frames = mark.frames;
    }
    return frames.some((f) => f.owner === 'yes') && !frames.some((f) => f.owner === 'no');
  };
}

test('every area with an owner-only control gates it inside the arm only an owner sees', () => {
  for (const area of OWNER_CONTROLS) {
    const markup = slice(area);
    assert.ok(markup.search(/\banOwner\b/u) >= 0, `/settings/${area} draws the owner's controls to everybody`);
    const owned = ownedAt(markup);
    for (const offered of OFFERED[area] ?? []) {
      const at = markup.indexOf(offered);
      assert.ok(at >= 0, `/settings/${area} no longer draws ${offered}, so this guard is about nothing`);
      assert.ok(owned(at), `/settings/${area} draws ${offered} outside the arm that asks whether this person is an owner`);
    }
  }
});

test('and no other area asks, because there is nothing on it to refuse', () => {
  for (const area of AREAS) {
    if (OWNER_CONTROLS.has(area)) continue;
    assert.doesNotMatch(
      slice(area),
      /\banOwner\b/u,
      `/settings/${area} is about the device or the person, so a level has nothing to say there`,
    );
  }
});

test('the sentence names the ceiling and the remedy, and claims nothing about the reader', () => {
  assert.match(words.ownersOnly, /owner/iu);
  assert.match(words.ownersOnly, /ask an owner/iu, 'a refusal that names no remedy is half a sentence');
  /* THE SHELL'S LEVEL AFTER A REFUSED `boot` IS THE FALLBACK `read`, so a screen that said "you have
     read access" would be telling an appender something the record never said. */
  assert.doesNotMatch(words.ownersOnly, /you have (read|append|write|decide)/iu);
  assert.doesNotMatch(words.ownersOnly, /—|!|sorry|simply|just |isn't/u, 'not the house voice');
});

test('the invitation form no longer tells a refused colleague that nothing was saved YET', () => {
  /* FINDING 4. `makeInvite` and five presses beside it branched on `peopleFrom !== 'live'`, so a
     colleague the record had refused was handed `copy.notWritten` — the sample's "nothing was saved
     yet" — which says the press did nothing because the product is a mock-up, and never says the one
     fact that matters. Measured: a `read` colleague pressing Invite a person read *"A single-use
     link would be made, bound to that one address and good for 24 hours, but nothing was saved
     yet."* The two cases are told apart by name now. */
  for (const m of PAGE.matchAll(/peopleFrom !== 'live'/gu))
    assert.doesNotMatch(PAGE.slice(m.index, m.index + 160), /notWritten/u, 'a refusal is answered with the sample\'s "nothing was saved yet"');
  /* AND NOW THERE IS ONE CASE, NOT TWO. The sample was the only arm allowed to say "yet", and DIRECTION 26 took it
     away: a press the People area cannot send is always a record, or a host, that answered no, so what is said is
     the record's own sentence, which `readPeople` has already put in hand, or that the record was not reached. */
  assert.match(PAGE, /function cannotWrite\(\): void \{\s*toasts\.push\(peopleRefusal \|\| copy\.recordNotReached/u, 'a press that cannot be sent says something other than the refusal');
  assert.doesNotMatch(PAGE, /peopleFrom === 'sample'/u, 'the People area still has a sample to fall back on');
});

test('the mail door is asked once, out of the effect that would otherwise ask again', () => {
  /* MEASURED ON A REAL SELF-HOST: `/settings/ingest` asked `GET /api/inbound/mint` five times in the
     first five seconds and the page threw `effect_update_depth_exceeded` each time, because
     `askMailDoor()` calls `opened()` synchronously inside the `$effect`, and `opened()` both reads
     and writes `screen.svelte.ts`'s `$state`. The effect therefore depended on what it wrote. The
     section drew 36 words and no sentence about this host: neither the two controls nor the
     explanation that replaces them. Every other read on this screen is already called through
     `untrack` for this reason. */
  assert.ok(PAGE.includes('askMailDoor()'), 'the host is no longer asked at all');
  /* THE CALL INSIDE THE CALLBACK, AND NOT ONLY THE READ OF `mintsHere` BESIDE IT, which is what the
     line used to be: `if (untrack(() => mintsHere) === null) void askMailDoor();` untracks the
     condition and then makes the call in the effect's own scope, where `opened()` runs. `[^}]`
     is what holds the call inside the callback rather than after it. */
  assert.match(
    PAGE,
    /untrack\(\(\) => \{[^}]*askMailDoor\(\)/u,
    'opened() reads and writes the same state, so an effect that calls it tracked loops for ever',
  );
});
