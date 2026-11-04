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
  /* THE DESIGN BOOK LEFT FOR `/design` (UI pass 20 Oct); Signing in is Identity, Recovery and Sessions, read each. */
  'appearance', 'keyboard', 'navigation', 'pages', 'people', 'recovery', 'sessions', 'identity', 'signingIn',
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

/** Every area's file, for the checks about a handler rather than one area's markup, now split one file per area. */
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
  /* THE INVITE FORM LEFT THIS LIST ON 2 NOV (183e1a019): `decide` invites too, so it has its own check below. */
  people: ['id="erase-person"'],
  /* THE KEY FORM (id="agent-label") IS THE CONNECT SHEET'S NOW, so the guard is that the sheet is drawn in the arm. */
  agents: ['id="user-code"', '<ConnectSheet'],
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
 * `{#if !anOwner}`, which sets the word before every control in the slice. Measured:
 * deleting the `{:else}` from the delete arm, so the red `Delete studio` button draws to a colleague
 * at `read`, left all six tests green. A gate test that passes against exactly the code it exists to
 * catch is worse than no gate test, on the screen that can destroy the record.
 *
 * SO THE BLOCKS ARE WALKED INSTEAD. Every `{#if}`, `{#each}`, `{#await}`, `{#key}` and `{#snippet}`
 * pushes a frame and a close pops one, so a `{:else}` belongs to the block it is really in. A frame
 * an `anOwner` condition opened is `yes` on the arm that needs one and `no` on the other, and the
 * two swap at `{:else}`. A control is gated when some frame around it is `yes` and none is `no`.
 *
 * A `{#snippet}`'S OWN BODY SITS IN NO ARM, because a snippet is a template, not a render: nothing inside
 * it draws until something `{@render}`s it, or hands it to a component as a prop, and `/settings/export`
 * and `/settings/backups` do the gating right there: `action={anOwner ? exportPack : undefined}` hands a
 * colleague `undefined` and `StateRow` draws no control at all. So a snippet whose only mention
 * anywhere else in the file is on the `anOwner` arm of exactly that shape is gated by proxy: read as though
 * its body sat inside `{#if anOwner}`. One that is ever rendered some other way is left as the walk found it,
 * which is `other`, same as before this existed, so nothing here can turn an ungated control gated by accident.
 */
function ownedAt(markup: string, gate = 'anOwner'): (at: number) => boolean {
  type Arm = 'yes' | 'no' | 'other';
  /** `owner` is this arm; `known` is what the arms already ruled out say about a later one. */
  type Frame = { owner: Arm; known: Arm };
  const marks: { at: number; frames: Frame[] }[] = [];
  const stack: Frame[] = [];
  const snippetStack: { name: string; start: number }[] = [];
  const snippets: { name: string; start: number; end: number }[] = [];
  /* THE NEGATION IS NOT ALWAYS AT THE FRONT: `{:else if mintsHere === true && !anOwner}` is the arm
     for somebody who is not an owner, and reading only the first token called it the owner's. */
  const armOf = (cond: string): Arm => (new RegExp(`!\\s*${gate}\\b`, 'u').test(cond) ? 'no' : new RegExp(`\\b${gate}\\b`, 'u').test(cond) ? 'yes' : 'other');
  const other = (arm: Arm): Arm => (arm === 'yes' ? 'no' : arm === 'no' ? 'yes' : 'other');
  const block = /\{#(if|each|await|key|snippet)\b([^}]*)\}|\{:else(\s+if\b([^}]*))?\}|\{\/(if|each|await|key|snippet)\}/gu;
  for (let m = block.exec(markup); m !== null; m = block.exec(markup)) {
    if (m[1] !== undefined) {
      const arm = m[1] === 'if' ? armOf(m[2] ?? '') : 'other';
      stack.push({ owner: arm, known: other(arm) });
      if (m[1] === 'snippet') {
        const name = /^\s*([A-Za-z_$][\w$]*)/u.exec(m[2] ?? '')?.[1];
        snippetStack.push({ name: name ?? '', start: block.lastIndex });
      }
    } else if (m[5] !== undefined) {
      stack.pop();
      if (m[5] === 'snippet') {
        const open = snippetStack.pop();
        if (open && open.name !== '') snippets.push({ name: open.name, start: open.start, end: m.index });
      }
    } else {
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
  /* A SNIPPET NAMED `name` IS GATED BY PROXY WHEN EVERY MENTION OF IT OUTSIDE ITS OWN `{#snippet}` LINE READS
     `anOwner ? name`: one ungated mention (another `{@render}`, a bare prop, the `!anOwner` arm) and the walk's
     own answer for its body is kept instead, so nothing here can hide a control the walk would otherwise catch.
     `(?<!\.)` SO `copy.exportPack` NEVER COUNTS AS A MENTION OF THE SNIPPET NAMED `exportPack`: a property read
     off another object that happens to share the word is not a reference to the snippet at all. */
  const gatedByProxy = new Set<string>();
  for (const { name } of snippets) {
    if (gatedByProxy.has(name)) continue;
    const mentions = [...markup.matchAll(new RegExp(`(?<!\\.)\\b${name}\\b`, 'gu'))];
    const ownGated = mentions.every((mm) => {
      const before = markup.slice(0, mm.index);
      return /\{#snippet\s*$/u.test(before) || /\banOwner\s*\?\s*$/u.test(before);
    });
    if (ownGated && mentions.some((mm) => /\banOwner\s*\?\s*$/u.test(markup.slice(0, mm.index)))) gatedByProxy.add(name);
  }
  const proxied = snippets.filter((s) => gatedByProxy.has(s.name));
  return (at: number) => {
    let frames: Frame[] = [];
    for (const mark of marks) {
      if (mark.at > at) break;
      frames = mark.frames;
    }
    if (frames.some((f) => f.owner === 'yes') && !frames.some((f) => f.owner === 'no')) return true;
    return proxied.some((s) => at >= s.start && at < s.end);
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

test('the invite form is an owner\'s and a decider\'s (183e1a019), never a lower level\'s, and only an owner may offer Owner', () => {
  const script = source('people');
  assert.match(script, /const anAdmin = \$derived\(!anOwner && me\.level === 'decide'\);/u);
  assert.match(script, /const mayInvite = \$derived\(anOwner \|\| anAdmin\);/u);
  assert.match(script, /const inviteRoles = \$derived\(ROLE_ORDER\.filter\(\(l\) => anOwner \|\| l !== 'owner'\)\);/u);
  const markup = slice('people');
  const at = markup.indexOf('id="invite-email"');
  assert.ok(at >= 0, '/settings/people no longer draws the invite form, so this guard is about nothing');
  assert.ok(ownedAt(markup, 'mayInvite')(at), '/settings/people draws the invite form outside the arm that asks mayInvite');
});

test('and no other area asks, because there is nothing on it to refuse', () => {
  for (const area of AREAS) {
    if (OWNER_CONTROLS.has(area)) continue;
    /* ONE WORD ON RECOVERY ASKS, AND IT IS NO CONTROL (50294479a): on a self-host only an owner holds the server key, so
       only an owner is told a lost passkey comes back through it. */
    const markup = slice(area).replace("shell.host === 'self-host' && s.anOwner ? copy.passkeyLostSelfHost", '');
    assert.doesNotMatch(
      markup,
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
  /* `makeInvite` and five presses beside it branched on `peopleFrom !== 'live'`, so a
     colleague the record had refused was handed `copy.notWritten`, the sample's "nothing was saved
     yet", which says the press did nothing because the product is a mock-up, and never says the one
     fact that matters. Measured: a `read` colleague pressing Invite a person read *"A single-use
     link would be made, bound to that one address and good for 24 hours, but nothing was saved
     yet."* The two cases are told apart by name now. */
  for (const m of PAGE.matchAll(/peopleFrom !== 'live'/gu))
    assert.doesNotMatch(PAGE.slice(m.index, m.index + 160), /notWritten/u, 'a refusal is answered with the sample\'s "nothing was saved yet"');
  /* AND NOW THERE IS ONE CASE, NOT TWO. The sample was the only arm allowed to say "yet", and it has been taken
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
