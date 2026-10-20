/**
 * The leak matrix on a real record (sharing plan §4.5), run on a copy and never on the file itself.
 *
 *   node tools/drill/leak-on-copy.mjs <record.brain>
 *
 * 1. Copies the file (and its `-wal` beside it) into a fresh temporary folder and opens the copy in process.
 * 2. For each share template (`packages/kernel/src/share-templates.ts`) adds a throwaway grant for a fake person. Until
 *    Slice 5 wires shares, a grant is today's member rows: a level per list, a ceiling, and a row rule (`row_where`),
 *    made through `kernel.invite` exactly as the People screen makes them.
 * 3. Runs every READ+ and DATA route that changes nothing, through the host's own handler table, as each fake person.
 * 4. Asserts that no answer carries the id of a row out of that person's sight, and times `boot` and `list`.
 *
 * SIGHT IS WORKED OUT HERE, NOT ASKED OF THE RECORD: a row is in sight when its list is granted, the template's rule
 * admits it (read in plain code off the row's fields), it is not deleted, and nobody else kept it private. An id a
 * visible row's own fields hold is in sight with it.
 *
 * NOTHING IS WRITTEN BACK. The copy is deleted on the way out, whatever happened. A leak on a route a known gap holds
 * open (`KNOWN`) is listed and does not fail the run; any other leak does, with exit 1.
 */

import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { createRecordApi } from '../../packages/record/src/index.ts';
import { ROUTES, handlersFor } from '../../packages/host/src/index.ts';
import { sessionContext } from '../../packages/host/src/auth.ts';
import { openSqlite } from '../../packages/kernel/test/sqlite.ts';

/** The routes a known gap holds open (`packages/record/test/leak-matrix.test.ts`), and the gap. */
export const KNOWN = { backlinks: 'G3', context: 'G2', metric: 'G4' };

const ULID = /[0-9A-HJKMNP-TV-Z]{26}/gu;
const KEYS = 'credentials';
const SAMPLE = 6;

/** A list's declared fields. */
const fieldsOf = (decl) => (Array.isArray(decl?.fields) ? decl.fields : []);
const hasMoney = (decl) => fieldsOf(decl).some((f) => f.type === 'money' || f.of === 'money');

/**
 * Today's member rows for each template, read off this record's own lists, with the rule that admits a row in plain
 * code beside the `where` the record is handed. A template this record cannot fill (no project, no list with an enum)
 * is left out and said so.
 */
export function templates(sql, registers) {
  const lists = [...registers].filter(([id]) => !id.startsWith('_'));
  const rowsOf = (list) => sql.all('SELECT id, seq, fields FROM entry WHERE register = ? AND deleted_at IS NULL AND seq IS NOT NULL ORDER BY seq', list);
  const sized = lists.map(([id, decl]) => ({ id, decl, n: sql.one('SELECT COUNT(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL', id)?.n ?? 0 })).sort((a, b) => b.n - a.n);
  const out = [];
  const why = [];

  const money = lists.filter(([id, d]) => id !== KEYS && hasMoney(d)).map(([id]) => id);
  if (money.length) out.push({ id: 'accountant', registers: Object.fromEntries(money.map((l) => [l, 'read'])), admits: () => true });
  else why.push('accountant: no list holds money');

  const plain = lists.filter(([id, d]) => id !== KEYS && !hasMoney(d) && d.owner_only !== true).map(([id]) => id);
  if (plain.length) out.push({ id: 'assistant', registers: Object.fromEntries(plain.map((l) => [l, 'write'])), admits: () => true });

  /* THE CONTRACTOR: the biggest list with a scoped ref to the projects list, held to its first project. */
  const home = lists.find(([, d]) => d.scopes !== undefined)?.[0];
  const project = home ? rowsOf(home)[0] : undefined;
  const scoped = sized.find(({ decl }) => fieldsOf(decl).some((f) => f.type === 'ref' && f.to === home && f.scope !== undefined));
  if (project && scoped) {
    const field = fieldsOf(scoped.decl).find((f) => f.type === 'ref' && f.to === home && f.scope !== undefined).id;
    out.push({ id: 'contractor', registers: { [scoped.id]: 'write' }, wheres: { [scoped.id]: { field, is: project.id } }, admits: (list, row) => list !== scoped.id || row.fields[field] === project.id });
  } else why.push('contractor: no project, or no list on a project');

  /* THE REVIEWER: the biggest list with an enum, held to its first value. */
  const graded = sized.find(({ id, decl }) => id !== KEYS && fieldsOf(decl).some((f) => f.type === 'enum' && Array.isArray(f.values) && f.values.length > 0) && sized.length > 0);
  if (graded) {
    const f = fieldsOf(graded.decl).find((x) => x.type === 'enum' && Array.isArray(x.values) && x.values.length > 0);
    const value = f.values[0];
    out.push({ id: 'reviewer', registers: { [graded.id]: 'read' }, wheres: { [graded.id]: { field: f.id, is: value } }, admits: (list, row) => list !== graded.id || row.fields[f.id] === value });
  } else why.push('reviewer: no list with an enum');

  /* ONE ROW: the biggest list's first row. */
  const biggest = sized.find(({ id, n }) => id !== KEYS && n > 0);
  const first = biggest ? rowsOf(biggest.id)[0] : undefined;
  if (first) out.push({ id: 'one-row', registers: { [biggest.id]: 'read' }, wheres: { [biggest.id]: { field: 'seq', is: first.seq } }, admits: (list, row) => list !== biggest.id || row.seq === first.seq });
  else why.push('one-row: no row');
  return { out, why };
}

/** The arguments each route is asked with: every granted list and one more, a sample of rows in and out of sight, words. */
function argsFor(route, lists, sample, words, pages, figures) {
  const takes = Object.keys(route.takes ?? {});
  const rows = sample.map((r) => ({ register: r.register, seq: r.seq }));
  switch (route.name) {
    case 'list':
      return lists.flatMap((register) => [{ register }, { register, includeDeleted: true, limit: 500 }]);
    case 'get':
    case 'history':
    case 'backlinks':
      return rows;
    case 'countBy':
      return [];
    case 'search':
      return words.map((q) => ({ q }));
    case 'page':
      return pages.map((slug) => ({ slug }));
    case 'metric':
      return figures.map((metric) => ({ metric }));
    case 'comments':
      return sample.map((r) => ({ on: `${r.register}#${r.seq}` }));
    case 'recentHistory':
      return [{}, { everything: true, limit: 200 }];
    case 'whatsNew':
      return [{}, { everything: true }];
    case 'previewPage':
      return [];
    default:
      return takes.includes('register') ? [{}, ...lists.map((register) => ({ register }))] : [{}];
  }
}

/** Run the drill on one file. Answers the findings; writes nothing to `file`. */
export async function drill(file) {
  const source = resolve(file);
  if (!existsSync(source)) throw new Error(`There is no file at ${source}.`);
  const dir = mkdtempSync(join(tmpdir(), 'leak-on-copy-'));
  const copy = join(dir, basename(source));
  copyFileSync(source, copy);
  for (const side of ['-wal', '-shm']) if (existsSync(source + side)) copyFileSync(source + side, copy + side);
  const sql = openSqlite(copy);
  try {
    const api = await createRecordApi({ sql, clock: { now: () => Date.now() }, invitations: () => null });
    const owner = sql.one("SELECT person_id AS id FROM member m JOIN person p ON p.id = m.person_id WHERE m.register = '*' AND m.level = 'owner' AND p.suspended_at IS NULL LIMIT 1")?.id;
    if (!owner) throw new Error('This record has no owner on it, so no grant can be made on it.');
    const ownerCtx = { principal: { kind: 'person', id: owner, level: 'owner' }, credentialed: true };
    const registers = api.kernel.registers();
    const { out: grants, why } = templates(sql, registers);
    const handlers = handlersFor(api);
    const read = ROUTES.filter((r) => (r.group === 'READ+' || r.group === 'DATA') && !r.writes);
    const pages = (((await api.pages(ownerCtx))?.value ?? [])).map((p) => p.slug ?? p.page).filter(Boolean).slice(0, 8);
    const figures = (((await api.figures(ownerCtx))?.value ?? [])).map((m) => m.id).filter(Boolean).slice(0, 8);
    const privateRows = new Map(sql.all('SELECT entry_id, person_id FROM entry_private').map((r) => [r.entry_id, r.person_id]));
    const every = sql.all('SELECT id, register, seq, fields, deleted_at FROM entry').map((r) => ({ ...r, fields: safeJson(r.fields) }));

    const report = { file: source, grants: [], skipped: why };
    for (const grant of grants) {
      const person = `p_leak_${grant.id.replace(/-/gu, '_')}`;
      const made = api.kernel.invite(owner, { person, name: `Leak drill ${grant.id}`, registers: grant.registers, ...(grant.wheres ? { wheres: grant.wheres } : {}) });
      if (!made.ok) {
        report.skipped.push(`${grant.id}: ${made.refusal?.fix ?? 'refused'}`);
        continue;
      }
      const ctx = sessionContext({ person, provedAt: Date.now() }, api.kernel.access(person));
      const granted = Object.keys(grant.registers);
      const sees = (r) => granted.includes(r.register) && r.deleted_at === null && (!privateRows.has(r.id) || privateRows.get(r.id) === person) && grant.admits(r.register, r);
      const visible = every.filter(sees);
      const inSight = new Set([...visible.map((r) => r.id), ...visible.flatMap((r) => JSON.stringify(r.fields).match(ULID) ?? [])]);
      const out = new Set(every.filter((r) => !inSight.has(r.id)).map((r) => r.id));
      /* A SAMPLE OF ROWS IN AND OUT OF SIGHT, per granted list, and one list not granted. */
      const lists = [...granted, ...[...registers.keys()].filter((l) => !granted.includes(l)).slice(0, 1)];
      const sample = lists.flatMap((l) => [...every.filter((r) => r.register === l && r.seq !== null && sees(r)).slice(0, SAMPLE), ...every.filter((r) => r.register === l && r.seq !== null && !sees(r)).slice(0, SAMPLE)]);
      const words = [...new Set(every.filter((r) => out.has(r.id)).slice(0, SAMPLE * 2).flatMap((r) => Object.values(r.fields ?? {}).filter((v) => typeof v === 'string' && v.length > 4 && !ULID.test(v)).map((v) => v.split(/\s+/u)[0])).filter((w) => w && w.length > 3))].slice(0, SAMPLE * 2);
      ULID.lastIndex = 0;

      const found = [];
      const known = [];
      let asked = 0;
      for (const route of read)
        for (const args of argsFor(route, lists, sample, words, pages, figures)) {
          asked += 1;
          let answer;
          try {
            answer = await handlers[route.name](args, ctx);
          } catch (cause) {
            answer = { threw: String(cause?.message ?? cause) };
          }
          const ids = [...new Set(JSON.stringify(answer ?? null).match(ULID) ?? [])].filter((id) => out.has(id));
          if (ids.length === 0) continue;
          const line = `${route.name} ${JSON.stringify(args).slice(0, 80)}: ${ids.length} id(s) out of sight, such as ${ids[0]}`;
          (KNOWN[route.name] ? known : found).push(KNOWN[route.name] ? `${KNOWN[route.name]} ${line}` : line);
        }
      const timed = async (name, args) => {
        const t = performance.now();
        await handlers[name](args, ctx);
        return Math.round(performance.now() - t);
      };
      report.grants.push({
        template: grant.id,
        lists: granted,
        rule: grant.wheres ?? null,
        sees: visible.length,
        hidden: out.size,
        asked,
        boot_ms: await timed('boot', {}),
        list_ms: await timed('list', { register: granted[0] }),
        leaks: found,
        known,
      });
    }
    return report;
  } finally {
    sql.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

if (import.meta.main) {
  const file = process.argv[2];
  if (!file) {
    console.error('  leak-on-copy: name a record file, such as node tools/drill/leak-on-copy.mjs ~/braindog/record.brain');
    process.exitCode = 2;
  } else {
    const report = await drill(file);
    console.log(`  leak-on-copy: ${report.file}, read on a copy that is gone again`);
    for (const why of report.skipped) console.log(`  skipped ${why}`);
    for (const g of report.grants) {
      console.log(`  ${g.template}: ${g.lists.join(', ')}${g.rule ? ` held by ${JSON.stringify(g.rule)}` : ''}; sees ${g.sees} row(s), ${g.hidden} out of sight; ${g.asked} call(s); boot ${g.boot_ms} ms, list ${g.list_ms} ms`);
      for (const l of g.known) console.log(`    known: ${l}`);
      for (const l of g.leaks) console.log(`    LEAK: ${l}`);
    }
    const leaks = report.grants.reduce((n, g) => n + g.leaks.length, 0);
    console.log(`  leak-on-copy: ${report.grants.length} template(s), ${leaks} leak(s) outside the known gaps`);
    if (leaks > 0) process.exitCode = 1;
  }
}
