/**
 * Ageing a record: a person's week, or their three months, written as the entries they would have kept by then
 * (`loop/scope/area-usecases-a.md`, USE-A01 job 2).
 *
 * THROUGH THE RECORD'S OWN DOOR, WITH THE WALK'S KEY. Every entry is one `create`, the call any agent holding a key
 * makes, so the record checks each one as it checks anybody's, asks about it as it asks about anybody's, and counts
 * it as it counts anybody's. This file never
 * opens a database: an entry the record would refuse from an agent is refused here too, and the walk says so.
 *
 * FIFTY AT A TIME. A round goes together and the next waits for it, so a host is never handed three months at once.
 * Each entry carries a name of its own for the write (`op_id`), so a round sent again after an answer that never
 * arrived lands once.
 *
 * EACH ENTRY CARRIES ITS OWN DAY. The real clock cannot be moved on a host that is running, so a record is aged by
 * what it holds: a person's file says, for each list, how many entries, which field is the day, and how far back and
 * forward the days spread. `plan` is pure and answers the entries; `age` writes them.
 *
 * A person's file, under `walk.week` and `walk.quarter`:
 *   { "lists": [ { "list": "tasks", "count": 12, "title": "what", "titles": ["Renew the passport", ...],
 *                  "day": "by", "from": -6, "to": 7, "fields": { "state": "open" } } ] }
 * `from` and `to` are days from today, and the entries are spread evenly between them. `day` may name two fields that
 * take the same day. `quarter` holds what is added after the week, not the week again.
 */

/** How many entries go in one round. */
export const ROUND = 50;

const DAY_MS = 86_400_000;

/** The day `days` from `now`, as the record keeps a day: 2026-10-13. */
export const dayFrom = (now, days) => new Date(now + days * DAY_MS).toISOString().slice(0, 10);

/**
 * The entries of one stage (`week` or `quarter`) of `person`, as `{ register, fields, op_id }`, oldest first within
 * each list. A title used once is as written; used again, it says which time ("Water the plants, 2").
 */
export function plan(person, stage, now = Date.now()) {
  const out = [];
  for (const spec of person.walk?.[stage]?.lists ?? []) {
    const days = [spec.day].flat().filter((d) => typeof d === 'string');
    for (let i = 0; i < spec.count; i++) {
      const offset = spec.count === 1 ? spec.from : Math.round(spec.from + ((spec.to - spec.from) * i) / (spec.count - 1));
      const round = Math.floor(i / spec.titles.length) + 1;
      const title = `${spec.titles[i % spec.titles.length]}${round > 1 ? `, ${round}` : ''}`;
      const fields = { ...(spec.fields ?? {}), [spec.title]: title };
      for (const d of days) fields[d] = dayFrom(now, offset);
      out.push({ register: spec.list, fields, op_id: `walk-${stage}-${spec.list}-${out.length}` });
    }
  }
  return out;
}

/** What is wrong with a stage of a person's file, one sentence each; empty when nothing is. */
export function planFaults(person, stage) {
  const lists = person.walk?.[stage]?.lists;
  if (!Array.isArray(lists) || lists.length === 0) return [`walk.${stage}.lists names no list to write to`];
  const out = [];
  lists.forEach((s, i) => {
    const at = `walk.${stage}.lists[${i}]`;
    if (typeof s.list !== 'string' || s.list === '') out.push(`${at}.list is not a list's name`);
    if (!Number.isInteger(s.count) || s.count < 1) out.push(`${at}.count is not a whole number of entries`);
    if (typeof s.title !== 'string' || s.title === '') out.push(`${at}.title does not name the field that holds the words`);
    if (!Array.isArray(s.titles) || s.titles.length === 0 || s.titles.some((t) => typeof t !== 'string' || t.trim() === '')) out.push(`${at}.titles holds no words to write`);
    if ([s.day].flat().some((d) => typeof d !== 'string' || d === '')) out.push(`${at}.day does not name the field that holds the day`);
    if (!Number.isInteger(s.from) || !Number.isInteger(s.to) || s.from > s.to) out.push(`${at}.from and .to are not days from today, earliest first`);
  });
  return out;
}

const whyOf = (out) => out?.refusal?.fix ?? out?.refusal?.code ?? 'no answer';

/**
 * Write `entries` through `client` (a client made with the walk's key), a round of fifty at a time, and answer
 * `{ ok, written, asked, why? }`. It stops at the first round the record refuses any of, because a record that is full
 * or shut refuses the rest the same way, and says how many were kept and the record's own words for the first refusal.
 *
 * A RECORD ASKS BEFORE IT KEEPS WHAT AN AGENT WRITES, until enough of an agent's changes have been kept as they were:
 * the answer to a `create` is then a question on Decide ("Add Renew the passport to Tasks?") and nothing is in the
 * list yet. `decide(asked)` is the person saying yes to one, as they would on Decide, and answers `{ ok, why? }`.
 * Without it a question nobody answered is not an entry written, and the run says so. `asked` counts them.
 */
export async function age(client, entries, { size = ROUND, say = () => {}, decide = null } = {}) {
  let written = 0;
  let asked = 0;
  const kept = (extra = {}) => ({ written, asked, ...extra });
  for (let from = 0; from < entries.length; from += size) {
    const round = entries.slice(from, from + size);
    const answers = await Promise.all(round.map((e) => client.create(e).catch((err) => ({ ok: false, refusal: { fix: String(err?.message ?? err).split('\n')[0] } }))));
    for (const a of answers) {
      const question = a?.ok === true ? a.value?.asked : undefined;
      if (question === undefined || question === null) continue;
      asked++;
      const said = decide === null ? { ok: false, why: 'nobody was there to answer' } : await decide(question);
      if (said.ok !== true) return kept({ ok: false, why: `${written} of ${entries.length} entries were kept, then the record asked "${question.question}" and it was not kept: ${said.why ?? 'no answer'}` });
      written++;
    }
    written += answers.filter((a) => a?.ok === true && (a.value?.asked ?? null) === null).length;
    say({ round: from / size + 1, written, of: entries.length });
    const refused = answers.findIndex((a) => a?.ok !== true);
    if (refused !== -1) return kept({ ok: false, why: `${written} of ${entries.length} entries were kept, then the record refused one: ${whyOf(answers[refused])}` });
  }
  return entries.length === 0 ? kept({ ok: false, why: "the person's file names nothing to write" }) : kept({ ok: true });
}

/*
 * `node tools/usecase-walks/age.mjs <person> week|quarter --base https://<the host>`, with the key on standard input,
 * never on the command line, where it would be kept in the shell's history.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const [who, stage, flag, base] = process.argv.slice(2);
  if (!who || !['week', 'quarter'].includes(stage) || flag !== '--base' || !base) {
    console.error('age needs a person, week or quarter, and --base, with the key on standard input.');
    process.exit(2);
  }
  const person = JSON.parse(readFileSync(who.endsWith('.json') ? who : new URL(`../people/${who}.json`, import.meta.url).pathname, 'utf8'));
  const faults = planFaults(person, stage);
  if (faults.length > 0) {
    for (const f of faults) console.error(f);
    process.exit(2);
  }
  const key = readFileSync(0, 'utf8').trim();
  const { createClient } = await import('../../packages/client/src/index.ts');
  const done = await age(createClient({ base: base.replace(/\/+$/u, ''), token: key }), plan(person, stage), { say: (s) => console.log(`round ${s.round}: ${s.written} of ${s.of}`) });
  console.log(done.ok ? `${done.written} entries written` : done.why);
  process.exit(done.ok ? 0 : 1);
}
