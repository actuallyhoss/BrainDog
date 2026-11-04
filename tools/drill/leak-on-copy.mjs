/**
 * The leak matrix on a real record (§6 step 4), run on a copy and never on the file itself.
 *
 *   node tools/drill/leak-on-copy.mjs <record.brain | export.brainl>
 *
 * ON HIS RECORD: `braindog export -o ~/Desktop/record.brainl` (he approves the export in the browser, the one
 * step only he can take), then `node tools/drill/leak-on-copy.mjs ~/Desktop/record.brainl`. A `.brainl` is restored
 * first by this checkout's own `braindog init --from` into a throwaway data folder (`restoreCopy`), with none of his
 * shell's BRAINDOG_ variables, so it opens no root key of his and reaches no host. Nothing is sent anywhere, and the
 * export and the restored folder are the only copies. A file inside this repository is refused, so a copy of a real
 * record never sits where a commit could take it.
 *
 * 1. Copies the file (and its `-wal` beside it) into a fresh temporary folder and opens the copy in process.
 * 2. For each share template (`packages/kernel/src/share-templates.ts`) makes a real share for a fake guest, through the
 *    record's own `share` as the owner makes one on the Share sheet: the template's rows, its allows and its denies, with
 *    the `$` words filled from this record's own lists, and lasting the template's days. And one more, a project shared
 *    with its amounts hidden, as the Share sheet shares one with anybody outside his team.
 * 3. Runs every READ+ and DATA route that changes nothing, through the host's own handler table, as each guest, a page
 *    with the feed of what happened and the questions waiting among them.
 * 4. Asserts that no answer carries the id of a row out of that guest's sight, that `boot` counts no agent working for
 *    a guest who may not open the runs, and that a guest amounts are hidden from is never answered an amount: neither a
 *    money field's nor one written in the text of a row in sight. And it times `boot` and `list`.
 *
 * SIGHT IS WORKED OUT HERE, NOT ASKED OF THE RECORD: a row is in sight when an allow of the guest's reaches it and no
 * deny does, each read in plain code off the row's list and fields (`reaches`), it is not deleted, its list is not the
 * owner's own (personal, owner-only, the kernel's, Keys and People, which no broad share reaches), and nobody kept it
 * private. An id a visible row's own fields hold is in sight with it.
 *
 * NOTHING IS WRITTEN BACK. The copy is deleted on the way out, whatever happened. Every leak fails the run, with exit 1:
 * `KNOWN` lists the routes a known gap holds open, and the matrix closed every one (`leak-matrix.test.ts`).
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRecordApi } from '../../packages/record/src/index.ts';
import { ROUTES, handlersFor } from '../../packages/host/src/index.ts';
import { sessionContext } from '../../packages/host/src/auth.ts';
import { SHARE_TEMPLATES } from '../../packages/kernel/src/share-templates.ts';
import { openSqlite } from '../../packages/kernel/test/sqlite.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELFHOST = join(ROOT, 'apps', 'selfhost', 'src', 'main.ts');

/** Whether a path is inside this repository, where a copy of a real record must never be kept. */
export const inRepository = (path) => {
  const rel = relative(ROOT, resolve(path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/**
 * An export (`.brainl`) restored into a throwaway data folder by this checkout's `braindog init --from`, as a host
 * restores one: `{ data, file }`, the folder to remove and the `record.brain` in it. HIS SHELL'S BRAINDOG_ VARIABLES ARE
 * LEFT OUT, so the restore makes a root key of its own in the folder and never reads his, never starts another
 * self-host and never names an owner. Throws with the restore's own last lines when it refuses the file.
 */
export function restoreCopy(file) {
  const data = mkdtempSync(join(tmpdir(), 'leak-on-copy-restore-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.toUpperCase().startsWith('BRAINDOG_')));
  env.BRAINDOG_DATA = data;
  const run = spawnSync(process.execPath, [SELFHOST, 'init', 'leak-drill', '--from', resolve(file)], { encoding: 'utf8', env });
  const made = join(data, 'leak-drill', 'record.brain');
  if (run.status !== 0 || !existsSync(made)) {
    rmSync(data, { recursive: true, force: true });
    const said = `${run.stderr ?? ''}`.trim().split('\n').slice(-3).join(' ');
    throw new Error(`braindog init --from refused ${basename(file)} (exit ${String(run.status)})${said ? `: ${said}` : ''}`);
  }
  return { data, file: made };
}

/** The routes a known gap holds open, and the gap. None: the matrix closed G1 to G8. */
export const KNOWN = {};

const ULID = /[0-9A-HJKMNP-TV-Z]{26}/gu;
const KEYS = 'credentials';
const SAMPLE = 6;
const DAY_MS = 86_400_000;

/** An amount written in text, symbol first, as "Paid £923.47" holds one. */
const WRITTEN = /[£€$] ?\d[\d.,]*\d|[£€$] ?\d/gu;

/** The feed of what happened and the questions waiting, as Activity and Decide draw them. */
export const FEED_PROBE = {
  body: {
    page: 'probe-leak-drill',
    title: 'Probe',
    blocks: [
      { kind: 'feed', key: 'feed', heading: 'What happened', source: 'activity', empty: 'Nothing yet.' },
      { kind: 'queue', key: 'open', heading: 'Needs you', source: 'governance.open', empty: 'Nothing waits.' },
    ],
  },
};

/** A list's declared fields, the retired ones left out. */
const fieldsOf = (decl) => (Array.isArray(decl?.fields) ? decl.fields.filter((f) => f.retired !== true) : []);
const hasMoney = (decl) => fieldsOf(decl).some((f) => f.type === 'money');
const moneyFields = (decl) => fieldsOf(decl).filter((f) => f.type === 'money').map((f) => f.id);
const scopeField = (decl) => fieldsOf(decl).find((f) => f.scope !== undefined);

/**
 * The record's lists as sight reads them, from the declarations: the owner's own lists (personal, owner-only, the
 * kernel's, Keys and the People list `meet` writes), and the lists whose rows are projects.
 */
export function listsOf(sql, registers) {
  const kernel = new Set(sql.all("SELECT id FROM declaration WHERE kind = 'register' AND pack_id = 'kernel' AND superseded_at IS NULL AND retired = 0").map((r) => String(r.id).replace(/^register\./u, '')));
  const all = [...registers];
  const declaring = all.filter(([, d]) => d.meets !== undefined);
  const people = declaring.length === 1 ? declaring[0][0] : declaring.length === 0 && registers.has('people') ? 'people' : null;
  const gated = new Set(all.filter(([id, d]) => d.personal === true || d.owner_only === true || kernel.has(id) || id === KEYS || id === people).map(([id]) => id));
  const personal = new Set(all.filter(([, d]) => d.personal === true).map(([id]) => id));
  const projects = new Set(all.filter(([, d]) => d.scopes !== undefined).map(([id]) => id));
  return { registers, gated, personal, projects, people };
}

/** Whether one target of a share reaches one row, in plain code off the row's list and fields. */
export function reaches(what, row, lists) {
  const decl = lists.registers.get(row.register);
  if (!decl || lists.personal.has(row.register)) return false;
  const gated = lists.gated.has(row.register);
  if (what.record === true) return !gated;
  if (what.project !== undefined) {
    if (lists.projects.has(row.register)) return row.id === what.project;
    if (what.lists ? !what.lists.includes(row.register) : gated) return false;
    const sf = scopeField(decl);
    if (!sf) return false;
    const v = row.fields?.[sf.id];
    return sf.scope?.links === true ? Array.isArray(v) && v.includes(what.project) : v === what.project;
  }
  if (what.lists !== undefined) {
    if (Array.isArray(what.lists)) return what.lists.includes(row.register);
    if (what.lists.has === 'money') return hasMoney(decl) && !gated;
    return what.lists.role === 'keys' ? row.register === KEYS : what.lists.role === 'meets' ? row.register === lists.people : false;
  }
  if (what.list !== row.register) return false;
  if (Array.isArray(what.rows)) return what.rows.includes(row.id);
  const w = what.where;
  if (w && typeof w.field === 'string' && 'is' in w) return (w.field === 'seq' ? row.seq : row.fields?.[w.field]) === w.is;
  /* A CONDITION THIS DRILL CANNOT READ IN PLAIN CODE IS NOT IN SIGHT, so anything it answers counts against it. */
  return false;
}

/**
 * What a guest amounts are hidden from must never be answered, on the rows in their sight: each money field's amount as
 * an answer carries one (`"amount":92347`), and each amount written in a text field ("£923.47"). An amount under 100 in
 * minor units is left out, as a number too short to tell from any other.
 */
export function hiddenAmounts(visible, registers) {
  return [
    ...new Set(
      visible.flatMap((r) => [
        ...moneyFields(registers.get(r.register))
          .map((f) => r.fields?.[f]?.amount)
          .filter((a) => Number.isInteger(a) && Math.abs(a) >= 100)
          .map((a) => `"amount":${a}`),
        ...Object.values(r.fields ?? {})
          .filter((v) => typeof v === 'string')
          .flatMap((v) => v.match(WRITTEN) ?? []),
      ]),
    ),
  ];
}

/**
 * The line `boot` fails with when it counts an agent working for a guest who may not open the runs (the bar's
 * Agents count reads `waits.working`), or `null`.
 */
export function countsWorking(booted, held) {
  if (!booted?.ok || held?.grant?.agents === true) return null;
  const n = Number(booted.value?.waits?.working ?? 0);
  const listed = Array.isArray(booted.value?.working) ? booted.value.working.length : 0;
  return n > 0 || listed > 0 ? `boot: counts ${Math.max(n, listed)} agent(s) working for a guest who may not open the runs` : null;
}

/** Fill a template's `$` words. */
const filled = (what, words) => JSON.parse(JSON.stringify(what), (_k, v) => (typeof v === 'string' && v.startsWith('$') && v in words ? words[v] : v));

/**
 * The grants to make: each template's rows with its `$` words filled from this record, and the Share sheet's project
 * with amounts hidden. A template this record cannot fill (no project, no list with an enum, no row) is left out and
 * said so.
 */
export function templates(sql, lists) {
  const own = [...lists.registers].filter(([id]) => !lists.gated.has(id));
  const rowsOf = (list) => sql.all('SELECT id, seq, fields FROM entry WHERE register = ? AND deleted_at IS NULL AND seq IS NOT NULL ORDER BY seq', list);
  const sized = own
    .map(([id, decl]) => ({ id, decl, n: sql.one('SELECT COUNT(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL AND seq IS NOT NULL', id)?.n ?? 0 }))
    .sort((a, b) => b.n - a.n);
  const home = [...lists.projects].find((id) => !lists.gated.has(id));
  const project = home ? rowsOf(home)[0] : undefined;
  const graded = sized.find(({ decl, n }) => n > 0 && fieldsOf(decl).some((f) => f.type === 'enum' && Array.isArray(f.values) && f.values.length > 0));
  const enumOf = graded ? fieldsOf(graded.decl).find((f) => f.type === 'enum' && Array.isArray(f.values) && f.values.length > 0) : undefined;
  /* THE VALUE MOST ROWS HOLD, so the reviewer sees some rows and not all. */
  const value = enumOf
    ? (sql.one(`SELECT json_extract(fields, '$.' || ?) AS v, COUNT(*) AS n FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, '$.' || ?) IS NOT NULL GROUP BY v ORDER BY n DESC LIMIT 1`, enumOf.id, graded.id, enumOf.id)?.v ?? enumOf.values[0])
    : undefined;
  const biggest = sized.find(({ n }) => n > 0);
  const first = biggest ? rowsOf(biggest.id)[0] : undefined;

  const out = [];
  const why = [];
  for (const t of SHARE_TEMPLATES) {
    const words = {};
    const missing = [];
    for (const ask of t.asks) {
      if (ask === 'project') project ? (words.$project = project.id) : missing.push('no project');
      if (ask === 'list') {
        const list = t.asks.includes('row') ? biggest?.id : graded?.id;
        list ? (words.$list = list) : missing.push(t.asks.includes('row') ? 'no row' : 'no list with an enum');
      }
      if (ask === 'where') graded ? (words.$where = { field: enumOf.id, is: value }) : missing.push('no list with an enum');
      if (ask === 'row') first ? (words.$row = first.id) : missing.push('no row');
    }
    if (missing.length) {
      why.push(`${t.id}: ${[...new Set(missing)].join(', ')}`);
      continue;
    }
    out.push({ id: t.id, days: t.days, rows: t.rows.map((r) => ({ effect: r.effect, what: filled(r.what, words), can: r.can, ...(r.caps ? { caps: r.caps } : {}) })) });
  }
  /* THE SHARE SHEET'S DEFAULT FOR ANYBODY OUTSIDE HIS TEAM: a project, every amount hidden. */
  if (project) out.push({ id: 'project-no-amounts', days: 30, hidesMoney: true, rows: [{ effect: 'allow', what: { project: project.id }, can: 'view', hide: { types: ['money'] } }] });
  else why.push('project-no-amounts: no project');
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
      return [FEED_PROBE];
    default:
      return takes.includes('register') ? [{}, ...lists.map((register) => ({ register }))] : [{}];
  }
}

/** Run the drill on one file. Answers the findings; writes nothing to `file`. */
export async function drill(file) {
  const source = resolve(file);
  if (!existsSync(source)) throw new Error(`There is no file at ${source}.`);
  if (inRepository(source)) throw new Error(`${source} is inside this repository. Keep a copy of a record outside it, such as on the Desktop, and name it there.`);
  /* AN EXPORT IS RESTORED FIRST, and the drill reads the record that restore wrote, on a copy of its own as ever. */
  if (source.endsWith('.brainl')) {
    const restored = restoreCopy(source);
    try {
      return { ...(await drill(restored.file)), file: source };
    } finally {
      rmSync(restored.data, { recursive: true, force: true });
    }
  }
  const dir = mkdtempSync(join(tmpdir(), 'leak-on-copy-'));
  const copy = join(dir, basename(source));
  copyFileSync(source, copy);
  for (const side of ['-wal', '-shm']) if (existsSync(source + side)) copyFileSync(source + side, copy + side);
  const sql = openSqlite(copy);
  try {
    const api = await createRecordApi({ sql, clock: { now: () => Date.now() }, invitations: () => null });
    const owner = sql.one("SELECT person_id AS id FROM member m JOIN person p ON p.id = m.person_id WHERE m.register = '*' AND m.level = 'owner' AND p.suspended_at IS NULL LIMIT 1")?.id;
    if (!owner) throw new Error('This record has no owner on it, so no share can be made on it.');
    const ownerCtx = { principal: { kind: 'person', id: owner, level: 'owner' }, credentialed: true };
    const registers = api.kernel.registers();
    const lists = listsOf(sql, registers);
    const { out: grants, why } = templates(sql, lists);
    const handlers = handlersFor(api);
    const read = ROUTES.filter((r) => (r.group === 'READ+' || r.group === 'DATA') && !r.writes);
    const pages = ((await api.pages(ownerCtx))?.value ?? []).map((p) => p.slug ?? p.page).filter(Boolean).slice(0, 8);
    const figures = ((await api.figures(ownerCtx))?.value ?? []).map((m) => m.id).filter(Boolean).slice(0, 8);
    const privateRows = new Map(sql.all('SELECT entry_id, person_id FROM entry_private').map((r) => [r.entry_id, r.person_id]));
    const every = sql.all('SELECT id, register, seq, fields, deleted_at FROM entry').map((r) => ({ ...r, fields: safeJson(r.fields) }));

    const report = { file: source, grants: [], skipped: why };
    for (const grant of grants) {
      const person = `p_leak_${grant.id.replace(/-/gu, '_')}`;
      /* A GUEST WITH NOTHING ELSE ON THE RECORD, as a share by email binds one. */
      sql.exec('INSERT OR IGNORE INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)', person, `${person}@leak-drill.invalid`, `Leak drill ${grant.id}`);
      const until = grant.days === null ? undefined : new Date(Date.now() + grant.days * DAY_MS).toISOString();
      let refused = null;
      for (const row of grant.rows) {
        const made = await api.share({ share: { ...row, who: { kind: 'person', id: person }, ...(until ? { when: { until } } : {}) }, template: grant.id.startsWith('project-') ? undefined : grant.id }, ownerCtx);
        if (!made.ok) refused = made.refusal?.fix ?? 'refused';
      }
      if (refused) {
        report.skipped.push(`${grant.id}: ${refused}`);
        continue;
      }
      api.kernel.accessChanged?.();
      const held = api.kernel.access(person);
      if (!held) {
        report.skipped.push(`${grant.id}: the record holds nothing for the guest`);
        continue;
      }
      const ctx = sessionContext({ person, provedAt: Date.now() }, held);
      const allows = grant.rows.filter((r) => r.effect === 'allow');
      const denies = grant.rows.filter((r) => r.effect === 'deny');
      /* "NO MONEY" ON THE PROJECTS LIST HIDES ITS AMOUNTS AND NEVER THE PROJECT (`lens.ts`, since fcf3c811d): the row stays
         in sight, and its amounts are held below as a hidden grant's are. */
      const moneyDeny = (d) => d.what.lists !== undefined && !Array.isArray(d.what.lists) && d.what.lists.has === 'money';
      const noMoney = denies.some(moneyDeny);
      const sees = (r) =>
        r.deleted_at === null &&
        (!privateRows.has(r.id) || privateRows.get(r.id) === person) &&
        allows.some((a) => reaches(a.what, r, lists)) &&
        !denies.some((d) => !(moneyDeny(d) && lists.projects.has(r.register)) && reaches(d.what, r, lists));
      const visible = every.filter(sees);
      const inSight = new Set([...visible.map((r) => r.id), ...visible.flatMap((r) => JSON.stringify(r.fields).match(ULID) ?? [])]);
      const out = new Set(every.filter((r) => !inSight.has(r.id)).map((r) => r.id));
      const granted = [...new Set(visible.map((r) => r.register))];
      /* WHAT A GUEST AMOUNTS ARE HIDDEN FROM MUST NEVER BE ANSWERED: each money field's amount, and each written in text. */
      const amounts = grant.hidesMoney ? hiddenAmounts(visible, registers) : noMoney ? hiddenAmounts(visible.filter((r) => lists.projects.has(r.register)), registers) : [];
      /* A SAMPLE OF ROWS IN AND OUT OF SIGHT, per list in sight, and one list not in sight. */
      const asked_lists = [...granted, ...[...registers.keys()].filter((l) => !granted.includes(l)).slice(0, 1)];
      const sample = asked_lists.flatMap((l) => [
        ...every.filter((r) => r.register === l && r.seq !== null && sees(r)).slice(0, SAMPLE),
        ...every.filter((r) => r.register === l && r.seq !== null && !sees(r)).slice(0, SAMPLE),
      ]);
      const words = [
        ...new Set(
          every
            .filter((r) => out.has(r.id))
            .slice(0, SAMPLE * 2)
            .flatMap((r) => Object.values(r.fields ?? {}).filter((v) => typeof v === 'string' && v.length > 4 && !/[0-9A-HJKMNP-TV-Z]{26}/u.test(v)).map((v) => v.split(/\s+/u)[0]))
            .filter((w) => w && w.length > 3),
        ),
      ].slice(0, SAMPLE * 2);

      const found = [];
      const known = [];
      let asked = 0;
      for (const route of read)
        for (const args of argsFor(route, asked_lists, sample, words, pages, figures)) {
          asked += 1;
          let answer;
          try {
            answer = await handlers[route.name](args, ctx);
          } catch (cause) {
            answer = { threw: String(cause?.message ?? cause) };
          }
          const text = JSON.stringify(answer ?? null);
          const ids = [...new Set(text.match(ULID) ?? [])].filter((id) => out.has(id));
          const said = amounts.filter((a) => text.includes(a));
          const lines = [];
          if (ids.length) lines.push(`${route.name} ${JSON.stringify(args).slice(0, 80)}: ${ids.length} id(s) out of sight, such as ${ids[0]}`);
          if (said.length) lines.push(`${route.name} ${JSON.stringify(args).slice(0, 80)}: ${said.length} hidden amount(s), such as ${said[0]}`);
          for (const line of lines) (KNOWN[route.name] ? known : found).push(KNOWN[route.name] ? `${KNOWN[route.name]} ${line}` : line);
        }
      /* NOBODY WHO MAY NOT OPEN THE RUNS IS COUNTED ONE: a guest's bar says no agent is working. */
      const counted = countsWorking(await handlers.boot({}, ctx), held);
      if (counted) found.push(counted);
      const timed = async (name, args) => {
        const t = performance.now();
        await handlers[name](args, ctx);
        return Math.round(performance.now() - t);
      };
      report.grants.push({
        template: grant.id,
        lists: granted,
        rows: grant.rows,
        sees: visible.length,
        hidden: out.size,
        amounts: amounts.length,
        asked,
        boot_ms: await timed('boot', {}),
        list_ms: await timed('list', { register: granted[0] ?? [...registers.keys()][0] }),
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
    console.error('  leak-on-copy: name a record file or an export, such as node tools/drill/leak-on-copy.mjs ~/Desktop/record.brainl');
    process.exitCode = 2;
  } else {
    const report = await drill(file);
    console.log(`  leak-on-copy: ${report.file}, read on a copy that is gone again`);
    for (const why of report.skipped) console.log(`  skipped ${why}`);
    for (const g of report.grants) {
      const said = g.rows.map((r) => `${r.effect} ${JSON.stringify(r.what)}${r.hide ? ` hiding ${JSON.stringify(r.hide)}` : ''}`).join('; ');
      console.log(`  ${g.template} (${said}): sees ${g.sees} row(s) on ${g.lists.join(', ') || 'no list'}, ${g.hidden} out of sight${g.amounts ? `, ${g.amounts} amount(s) hidden` : ''}; ${g.asked} call(s); boot ${g.boot_ms} ms, list ${g.list_ms} ms`);
      for (const l of g.known) console.log(`    known: ${l}`);
      for (const l of g.leaks) console.log(`    LEAK: ${l}`);
    }
    const leaks = report.grants.reduce((n, g) => n + g.leaks.length, 0);
    console.log(`  leak-on-copy: ${report.grants.length} share(s), ${leaks} leak(s)`);
    if (leaks > 0 || report.grants.length === 0) process.exitCode = 1;
  }
}
