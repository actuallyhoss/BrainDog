/**
 * `graph`: the edge table of `31 §2`, in its order, and acyclicity.
 *
 *   node tools/gates/graph.mjs
 *
 * `52 §5`'s row for this gate, verbatim:
 *
 *   | `graph` | every `package.json`; every `src/**` import specifier | acyclic; every workspace
 *   edge points down 31 §2's order; no undeclared or cross-package relative import; `packages/**`
 *   free of `node:` `cloudflare:` `process` `Buffer` `__dirname` bare `fetch` |
 *   `import points up the order` · `undeclared import` · `runtime import under packages/` | 300 |
 *
 * THE LAST CLAUSE OF THAT ROW IS `stack.mjs` AND IS NOT REPEATED HERE. `31 §3` calls the banned
 * runtime surface enforcement layer 4 and this table's order layer 5; they were specified as one
 * script and built as two, and duplicating layer 4 here would mean two regexes, two exemption lists
 * for `packages/ports/src/node-sqlite.ts`, and a day when they disagree about what `fetch(` means.
 * `stack` owns layer 4. This owns layers 3 and 5, and `run.mjs` runs both.
 *
 * WHY IT EXISTS AT ALL, AND WHAT IT COSTS TO ADD LATE. `31 §4` names three repositories where
 * permissive code came to import copyleft code in one tree. The third is the argument:
 *
 *   > **Grafana Loki #13019**: Apache code imports AGPL code. Staff reproduced it and said they
 *   > would add CI validation *once false positives could be reduced.* **Two years on there is no
 *   > check and the issue is open.**
 *   >
 *   > That last row is the whole argument for building the gate in commit one. It is thirty lines
 *   > on day one and an archaeology project at day 400.
 *
 * `render` sits at rank 1 in the table below and depends on nothing, and that is the row that has to
 * hold: it is what keeps `braindog-render` a package somebody can embed. A library that drags eight
 * workspace packages behind it is not embeddable whatever its licence says, and the tarball on npm
 * is the only artefact where that is visible. Rank 1 is how this gate holds it: every edge out of
 * `render` points up the order, so there is no dependency it can acquire that check (b) does not go
 * red on. Every other row is the same mechanism protecting something cheaper.
 * WHAT IT DOES NOT CHECK, SAID OUT LOUD. `31 §2` carries a second table, *"Each boundary, by what
 * it prevents"*, naming edges that must be ABSENT even though the order permits them:
 * `declare ⇏ kernel`, `record ⇏ render`, `where ⇏ kernel`, `declare ⇎ theme`. An absence is not a
 * direction, and `52 §5.2`'s algorithm for this gate is the order and nothing else. So an edge
 * from that table is green here. Two of them exist in the tree today. Adding the list is four lines
 * and a decision somebody has to take; until then this gate must not be read as having asked.
 *
 * WHAT IT CHECKS, and each is one of `31 §3`'s enforcement layers that pnpm cannot see:
 *
 *   a · ACYCLIC. `31 §2`: *"Acyclicity is proved by exhibiting a total order in which every
 *       package's dependencies have strictly lower indices: a cycle would require an edge that
 *       increases the index."* `tsc -b` fails on a cycle too (the free sixth layer), but only once
 *       `references` mirror the graph, and only for the packages it is pointed at. A cycle is
 *       reported here with the path, because "there is a cycle" is not a repair and
 *       `a → b → c → a` is.
 *
 *   b · DIRECTION. Every workspace edge points DOWN the order. This is layer 5, and the reason it
 *       cannot be left to the type checker is that half the edges in this repository are type-only:
 *       `31 §2` is explicit that *"because a type import is still an edge, it sits above `record`
 *       in the order, not below it."* A `import type { … }` is erased at build under
 *       `verbatimModuleSyntax` and is still an edge here.
 *
 *   c · NO UNDECLARED OR CROSS-PACKAGE RELATIVE IMPORT. This is layer 3, and `31 §3` names it
 *       *"the hole layer 1 cannot see"*:
 *
 *         > `import '../../where/src/index.js'` from inside `packages/render/src/` **works fine**
 *         > under pnpm. It is exactly the import that would break the MIT boundary.
 *         > *The dangerous form is the one nothing blocks by default.*
 *
 *       pnpm's isolated layout turns an undeclared BARE import into `ERR_MODULE_NOT_FOUND` at
 *       runtime, which is late but loud. It has nothing at all to say about a relative path that
 *       climbs out of the package, because that path resolves.
 *
 * `31 §3` also names what this refuses to become: *"Refused: dependency-cruiser. Good tool. It
 * needs a second resolver config kept in sync with tsconfig, and **the thing that enforces a
 * seventeen-row table should be as small as the table.**"*
 *
 * `52 §5` budgets 300 ms. The measured time is printed on the summary line rather than asserted,
 * because `budgets.json` has no `graph` section to hold the number and `52 §4` is clear that a gate
 * does not hold its own.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { skipDir } from './lib.mjs';

/**
 * THE CHECK IS A FUNCTION, imported by `run.mjs` rather than spawned: `52 §5.1` step 3, argued in
 * the runner's `IMPORTED OR SPAWNED` header. Nothing in this file happens on import.
 *
 * THE ROOT IS AN ARGUMENT, defaulting to the environment and then to the repository this file sits
 * in. `self-test.mjs` points a gate at a seeded tree with that variable, and a gate that read only
 * `import.meta.url` would scan the real repository from inside its own negative fixture and pass
 * it: that is the defect that audit found in `stack.mjs` on the first run. `run.mjs` passes the root
 * it derived from its own location, because an imported gate shares the runner's working directory.
 *
 * IT RETURNS 1 OR 3 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass`
 * grep rests on: a pass is the end of the function and never a statement inside it.
 */
export default function graph(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const started = performance.now();

  /**
   * `31 §2`'s order, READ OUT OF `31 §2`, not transcribed into this file.
   *
   * IT WAS TRANSCRIBED, and the transcription was wrong within a day. Seventeen names were copied
   * here with a paragraph arguing that only the ORDER needs encoding and not the `Depends on` column;
   * that argument is right and it is not the one that mattered. The table had seventeen rows, the
   * tree had twenty-one workspaces, and `skin`, `seed`, `client` and `site` were in neither list.
   * So this gate reported four packages it could not rank, somebody added four rows to the document,
   * and the gate went on reporting them. Two copies of one list is one list and a memory of it
   * (`30 §2`), and a gate that holds the memory rather than the list is the worse half of the pair.
   *
   * The table is three columns of Markdown in a file this gate already has to read the section number
   * of. A row is `| <rank> | `<name>` | …`; anything else in the section is prose. If the shape ever
   * changes this goes red on the next run and says the table could not be read, which is the correct
   * failure. A silent fallback to a remembered order is how the drift happened the first time.
   *
   * A ROW MARKED *(unbuilt)* KEEPS ITS RANK. `fixtures` is specified and absent from the tree, so
   * nothing ever resolves to it; reserving the rank is what stops every package renumbering on the
   * day one arrives. `connect`, `cli`, `extract` and `slash` were in that list and have each since
   * arrived at the rank it held for them, which is the mechanism working rather than a note going
   * stale.
   */
  const ORDER_DOC = join(root, 'docs/31-STACK.md');

  const readOrder = () => {
    let text;
    try {
      text = readFileSync(ORDER_DOC, 'utf8');
    } catch {
      return [];
    }
    const rows = [...text.matchAll(/^\|\s*(\d+)\s*\|\s*`([a-z-]+)`\s*\|/gmu)];
    /* IN THE ORDER THE TABLE NUMBERS THEM, not in the order they appear. A row moved without its
       number renumbered is a table that says two different things, and sorting is how that shows up
       as a duplicate rather than as a silently different order. */
    const byRank = rows.map((m) => [Number(m[1]), m[2]]).sort((a, b) => a[0] - b[0]);
    return byRank.map(([, name]) => name);
  };

  const ORDER = readOrder();

  /** 1-based, so it reads as the table's `#` column. `0` means "not in the order at all". */
  const rankOf = (short) => ORDER.indexOf(short) + 1;

  /**
   * `31 §2`'s L3 row: `apps/worker`, `apps/selfhost`, `apps/web`, `apps/cli`. *"apps import packages
   * and never each other"*. The rank check alone cannot say so, because `worker` (16) importing
   * `web` (14) points DOWN the order and is still the thing §2 refuses: `web`'s `build/` is an asset
   * directory to both runtimes, never an import.
   */
  const APPS = new Set(['worker', 'selfhost', 'web', 'cli']);

  /**
   * `linkWorkspacePackages: false` (`31 §3`) is load-bearing: *"every internal dep must say
   * `workspace:*`, so a typo'd internal name goes to the registry and **fails loudly** instead of
   * silently linking."* A `@braindog/*` range that is not this one is the case where it does not.
   */
  const WORKSPACE = 'workspace:*';

  /** `@braindog/record/directory` is `@braindog/record`; `braindog-render/svelte` is the tarball. */
  const basePackage = (spec) =>
    spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];

  /**
   * WHAT COUNTS AS ONE OF OURS, and it is two spellings rather than one. `31 §2`'s compromise ships
   * the renderer as `braindog-render` (unscoped, MIT, the only distribution instrument in the plan),
   * so a gate that recognised `@braindog/*` alone would have nothing to say about in-degree 0 on row
   * 1, which is the one row with a legal consequence.
   */
  const isInternal = (base) => base.startsWith('@braindog/') || base.startsWith('braindog-');

  /** `@braindog/kernel` and `braindog-render` are both directories named for their table row. */
  const shortOf = (base) => base.replace(/^@braindog\//, '').replace(/^braindog-/, '');

  const posix = (p) => p.replace(/\\/g, '/');
  const lineAt = (text, at) => text.slice(0, at).split('\n').length;

  /** The line a manifest names a dependency on, so `where` is `path:line` and not `path`. */
  const keyLine = (text, name) => {
    const at = text.indexOf(`"${name}":`);
    return at === -1 ? 1 : lineAt(text, at);
  };

  const findings = [];
  const add = (where, what, why) => findings.push({ where, what, why });

  /* ── The workspaces ─────────────────────────────────────────────────────────────────────────── */

  /**
   * `pnpm-workspace.yaml` says `packages/*` and `apps/*`, and the directory name is the table's name.
   *
   * THE DIRECTORY IS THE IDENTITY, NOT THE `name` FIELD, because `packages/render` publishes as
   * `braindog-render` and `31 §2` calls it `render`. Deriving the short name from the manifest would
   * mean the one package whose boundary has a legal consequence is the one the order cannot find.
   *
   * AND `packs/*`, THE THIRD LINE OF THAT FILE, which this list did not read for the day the four
   * packs arrived. So nothing could see the core come to import a pack, which is the core knowing a
   * use case by name, the one thing the core refuses to do. A PACK
   * IS NAMED BY ITS MANIFEST, NOT ITS DIRECTORY: it has no row in `31 §2` for the directory to match,
   * and `packs/mercury` is `@braindog/pack-mercury`, so the name an import spells is the only one an
   * edge can be resolved by.
   */
  function readWorkspaces() {
    const out = [];
    for (const group of ['packages', 'apps', 'packs']) {
      let names;
      try {
        names = readdirSync(join(root, group));
      } catch {
        continue;
      }
      for (const folder of names.sort()) {
        if (skipDir(folder)) continue;
        const dir = join(root, group, folder);
        const home = `${group}/${folder}`;
        const manifest = `${home}/package.json`;
        let text;
        try {
          if (!statSync(dir).isDirectory()) continue;
          text = readFileSync(join(dir, 'package.json'), 'utf8');
        } catch {
          continue;
        }
        let json;
        try {
          json = JSON.parse(text);
        } catch (e) {
          /* A MANIFEST THAT DOES NOT PARSE IS NOT AN ABSENT MANIFEST. Skipping it quietly would drop
             a whole package's edges out of the graph and leave the gate green over a smaller tree. */
          add(`${manifest}:1`, 'unreadable manifest', `does not parse as JSON: ${e.message}`);
          continue;
        }
        const short = group === 'packs' ? shortOf(json.name ?? `pack-${folder}`) : folder;
        out.push({ short, group, home, dir, manifest, text, json, npm: json.name ?? short });
      }
    }
    return out;
  }

  const ws = readWorkspaces();
  const byShort = new Map(ws.map((w) => [w.short, w]));

  /**
   * A name in the tree knows where it lives; one only the order knows is placed by the order. A
   * name spelt `@braindog/pack-*` and absent from the tree is still a pack, so the core importing a
   * pack that has since been deleted is refused for what it is and not as an unranked package.
   */
  const groupOf = (short) =>
    byShort.get(short)?.group ?? (APPS.has(short) ? 'apps' : short.startsWith('pack-') ? 'packs' : 'packages');

  /* ── The edges ──────────────────────────────────────────────────────────────────────────────── */

  /**
   * One edge per ordered pair, with the first place it was seen.
   *
   * DECLARED EDGES AND IMPORTED ONES GO IN THE SAME SET. `52 §5.2` derives the graph from the
   * manifests and checks imports against it separately, which is right for "is this declared" and
   * wrong for "is this acyclic": an import that closes a cycle closes it whether or not anybody
   * remembered to write the dependency down, and the undeclared finding beside it does not say so.
   * The union is the graph the code actually has.
   */
  const edges = new Map();
  const addEdge = (from, to, where, via) => {
    const key = `${from} ${to}`;
    if (!edges.has(key)) edges.set(key, { from, to, where, via });
  };

  /**
   * How the edge is known, on the finding.
   *
   * `where` NAMES ONE PLACE AND AN EDGE USUALLY HAS TWO. `packages/record/package.json:12` and
   * `packages/record/src/index.ts:19` are different repairs: the first is a line to delete, the
   * second is code. A finding that gives the manifest line for an edge the source also makes sends
   * the reader to fix the half that is not the problem.
   */
  const evidence = (e) => (e.via === 'import' ? 'imported' : `declared in ${e.via}`);

  /** Every internal name a manifest declares, in any of the three fields, whatever its range. */
  const declared = new Map(ws.map((w) => [w.short, new Set()]));

  /**
   * `52 §5.2` step 1 names `dependencies` and `devDependencies`. `peerDependencies` is read too, and
   * the reason is `packages/render`: it is the one manifest here that uses the field at all, for an
   * OPTIONAL peer on `svelte`. The day an internal package appears there (a plugin taking its host
   * as a peer is the ordinary shape), an edge collected from two fields would miss it, and the
   * direction rule would be silently unenforced on exactly the package whose in-degree is the licence
   * boundary. Reading three fields costs one array element.
   */
  const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];

  for (const w of ws) {
    for (const field of DEP_FIELDS) {
      const table = w.json[field];
      if (!table || typeof table !== 'object') continue;
      for (const [name, range] of Object.entries(table)) {
        const base = basePackage(name);
        if (!isInternal(base)) continue;
        const at = `${w.manifest}:${keyLine(w.text, name)}`;
        declared.get(w.short).add(base);

        if (range !== WORKSPACE) {
          add(
            at,
            'internal dependency without workspace:*',
            `${w.npm} declares ${name} as "${range}". 31 §3 keeps linkWorkspacePackages: false so an internal name that is not "${WORKSPACE}" resolves against the registry.`,
          );
        }

        const to = shortOf(base);
        if (to === w.short) {
          add(at, 'self-dependency', `${w.npm} declares itself in ${field}.`);
          continue;
        }

        /* `31 §2`: *"`fixtures` is a devDependency everywhere"*. It prevents *"402 lines of one
           person's seed data shipping in a bundle, the exact defect the clean room exists to
           avoid."* A runtime dependency on it is that bundle. */
        if (to === 'fixtures' && field === 'dependencies') {
          add(
            at,
            'fixtures is a devDependency everywhere',
            `${w.npm} takes ${name} as a runtime dependency, and 31 §2 ships it to nobody.`,
          );
        }

        addEdge(w.short, to, at, field);
      }
    }
  }

  /* ── The import specifiers ──────────────────────────────────────────────────────────────────── */

  /** Comments blanked rather than removed, so a line number still means the line it names. */
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  const decomment = (text) =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, blank)
      .replace(/<!--[\s\S]*?-->/g, blank)
      .replace(/(^|[^:])(\/\/.*)$/gm, (_, a, c) => a + blank(c));

  /**
   * Every form that makes an edge.
   *
   * A TYPE IMPORT IS AN EDGE AND IS NOT SPELT DIFFERENTLY HERE. `import type { RecordApi } from
   * '@braindog/record'` is erased at build under `verbatimModuleSyntax` and `31 §2` still ranks `mcp`
   * ABOVE `record` for it: *"because a type import is still an edge, it sits above `record` in the
   * order, not below it."* The `from` clause catches both spellings and must keep doing so.
   *
   * THE SIDE-EFFECT FORM IS THE ONE A `from` PATTERN MISSES, and this repository uses it: both apps
   * pull the token layer in with `import '@braindog/skin/tokens.css'` in `+layout.svelte`, which has
   * no `from` and no binding. A gate that knew only the `from` clause would have reported those two
   * apps as importing nothing of `skin` at all.
   */
  const IMPORTS = [
    /\bfrom\s*['"]([^'"\n]+)['"]/g, // import … from 'x' · import type … from 'x' · export … from 'x'
    /(?<![\w$.])import\s+['"]([^'"\n]+)['"]/g, // import 'x'
    /(?<![\w$.])import\s*\(\s*['"]([^'"\n]+)['"]/g, // import('x')
  ];

  /**
   * `52 §5.2` step 3 says `src/**\/*.{ts,svelte}`.
   *
   * `.test.ts` IS NOT EXEMPT HERE, AND IT IS IN `stack.mjs`. The two exemptions are about different
   * things: `stack` exempts `test/` because that is where the adapter binding the kernel to
   * `node:sqlite` deliberately lives, *"on the other side of the line"*. There is no other side of
   * this line. A test file sitting in `src/` beside the module it tests is inside the package, and an
   * undeclared import from it fails at `pnpm test` exactly as it would anywhere else. Twenty-nine
   * files in this repository are that shape.
   */
  function walk(dir, out = []) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const name of entries) {
      if (skipDir(name)) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|svelte)$/.test(name) && !name.endsWith('.d.ts')) out.push(full);
    }
    return out;
  }

  /**
   * A PACK HAS NO `src`, so its files are its root: `fill.ts`, a script such as `bands.js`, and the
   * test. THE TEST IS LEFT OUT, and that is the same line as a package's rather than an exemption: a
   * package's tests live in `test/`, outside the `src` this gate walks, and a pack's sit beside the
   * files it ships. They are also where every relative climb in `packs/` is today. All four open
   * `../../packages/record/src/index.ts` or its like to build a record and install the pack file
   * through its own door, which is a test driving the core, not the pack depending on it.
   *
   * `.js` IS READ HERE AND NOT FOR A PACKAGE, because a pack's script is written in it
   * (`packs/README.md`) and an import in the script is an edge like any other.
   */
  function walkPack(dir, out = []) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const name of entries) {
      if (skipDir(name) || name === 'test') continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walkPack(full, out);
      else if (/\.(ts|js|svelte)$/.test(name) && !name.endsWith('.d.ts') && !/\.test\.[jt]s$/.test(name)) out.push(full);
    }
    return out;
  }

  /** Inside the package, or out of it. `''` is the package root itself. */
  const within = (target, dir) => {
    const r = relative(dir, target);
    return r === '' || (!r.startsWith('..') && !isAbsolute(r));
  };

  let scanned = 0;

  for (const w of ws) {
    for (const file of w.group === 'packs' ? walkPack(w.dir) : walk(join(w.dir, 'src'))) {
      scanned++;
      const text = decomment(readFileSync(file, 'utf8'));
      const at = (index) => `${posix(relative(root, file))}:${lineAt(text, index)}`;

      for (const re of IMPORTS) {
        re.lastIndex = 0;
        for (const hit of text.matchAll(re)) {
          const spec = hit[1];

          /* c · A RELATIVE IMPORT MUST STAY UNDER ITS OWN PACKAGE ROOT (the package, not `src/`).
             `packages/render/svelte/p/Grid.svelte` reaching `../../src/index.ts` is one package
             talking to itself across two published subpaths, which is the shape `31 §2`'s "two
             subpath exports, one package" compromise is made of. Climbing past the package root is
             the other thing entirely, and it is the import pnpm resolves happily. */
          if (spec.startsWith('.')) {
            const target = resolve(dirname(file), spec);
            if (!within(target, w.dir))
              add(
                at(hit.index),
                'cross-package relative import',
                `'${spec}' resolves to ${posix(relative(root, target))}, outside ${w.home}. 31 §3 layer 3: this one works fine under pnpm, which is why nothing but a gate can see it.`,
              );
            continue;
          }

          /* Everything that is not ours is somebody else's problem: the registry's, and layer 1's.
             Narrowing to internal names is also what keeps the `from` pattern honest: it fires inside
             a string literal or a stretch of Svelte markup as readily as in an import, and no such
             accident spells `@braindog/`. */
          const base = basePackage(spec);
          if (!isInternal(base)) continue;
          if (base === w.npm) continue; // a package reaching its own exports map

          const to = shortOf(base);
          if (!declared.get(w.short).has(base))
            add(
              at(hit.index),
              'undeclared import',
              `${w.npm} imports ${spec} and its package.json does not declare ${base}.`,
            );

          addEdge(w.short, to, at(hit.index), 'import');
        }
      }
    }
  }

  /* ── a · Acyclic ────────────────────────────────────────────────────────────────────────────── */

  const nodes = new Set([...byShort.keys(), ...[...edges.values()].flatMap((e) => [e.from, e.to])]);
  const out = new Map([...nodes].map((n) => [n, []]));
  for (const e of edges.values()) out.get(e.from).push(e);

  /**
   * Depth-first, white/grey/black, and the grey stack IS the cycle path.
   *
   * THE PATH, NOT THE VERDICT. "there is a cycle" over seventeen packages is a search; `record →
   * declare → kernel → record` is the edge somebody deletes. Each cycle is reported once, keyed on
   * its rotation-invariant form, so a three-node cycle found from three entry points is one finding
   * and not three.
   */
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map();
  const stack = [];
  const cyclesSeen = new Set();
  const cycles = [];

  const canonical = (ring) => {
    const at = ring.indexOf([...ring].sort()[0]);
    return [...ring.slice(at), ...ring.slice(0, at)].join(' → ');
  };

  function visit(node) {
    colour.set(node, GREY);
    stack.push(node);
    for (const edge of out.get(node) ?? []) {
      if (colour.get(edge.to) === GREY) {
        const ring = stack.slice(stack.indexOf(edge.to));
        const key = canonical(ring);
        if (!cyclesSeen.has(key)) {
          cyclesSeen.add(key);
          cycles.push({ ring, edge });
        }
      } else if (colour.get(edge.to) !== BLACK && out.has(edge.to)) {
        visit(edge.to);
      }
    }
    stack.pop();
    colour.set(node, BLACK);
  }

  for (const node of [...nodes].sort()) if (!colour.has(node)) visit(node);

  for (const { ring, edge } of cycles)
    add(
      edge.where,
      'cycle',
      `${[...ring, ring[0]].join(' → ')}. ${edge.from} → ${edge.to} closes it, ${evidence(edge)}. 31 §2 proves acyclicity by exhibiting a total order, and no order can hold a ring.`,
    );

  /* ── b · Direction ──────────────────────────────────────────────────────────────────────────── */

  /**
   * A name outside the order once, not once per edge.
   *
   * THE REPAIR IS ONE ROW IN `31 §2`, so eleven lines saying so is eleven copies of one sentence. It
   * is still red: a package with no rank is a package whose direction nothing can check, and going
   * green over it would be the gate reporting on a graph smaller than the one that exists.
   */
  const unranked = new Map();
  const noteUnranked = (short, where) => {
    if (!unranked.has(short)) unranked.set(short, { where, edges: 0 });
    unranked.get(short).edges++;
  };

  const name = (short) => byShort.get(short)?.npm ?? `@braindog/${short}`;

  /**
   * AN EDGE INTO A PACK THIS TREE HOLDS, NAMED, WITH WHY AND UNTIL WHEN. `from to`, by short name.
   *
   * Measured the first time this gate read `packs/`, on 24 September: one finding in the whole tree,
   * `apps/web` declaring and importing `@braindog/pack-rates-poll`, and it was being written that
   * morning. It is the move `272e5681` announced: the rates form had built its poll with
   * `ratesPollPack`, a function in `packages/seed`, which is the shell carrying a use case as code,
   * and it now reads the pack's own file as data and fills it with the pack's `fillRates`. That is
   * nearer the rule than what it replaced and still not the rule, because the web knows one pack by
   * name. It leaves when a pack's form is drawn from its `fill` marks rather than written for it.
   *
   * AN ENTRY WHOSE EDGE IS GONE IS A FINDING, for `shell-words`' reason: an exemption that exempts
   * nothing is the hole the next edge walks through. Only while both ends are in the tree, so a seeded
   * fixture without them has nothing to say about it.
   */
  /* BACK SINCE the rates form became a preset of the new-action sheet (`apps/web/src/lib/record/action-draft.ts`), which
     reached the pack by a relative path the edge check could not see: a declared dependency it can. */
  const PACK_EDGES_HELD = {
    'web pack-rates-poll':
      "the new-action sheet's rates preset fills `packs/rates-poll/rates-poll.pack.json` with the pack's `fillRates`, as the rates form did (M3 B7).",
    'cli pack-live-feed':
      "`braindog feed propose` builds each feed in a person's setup file with the add-on's own `fillFeed` over `packs/live-feed/live-feed.pack.json` (REC-C01).",
  };
  const held = new Set();

  for (const e of [...edges.values()].sort((a, b) => `${a.from}${a.to}`.localeCompare(`${b.from}${b.to}`))) {
    const from = rankOf(e.from);
    const to = rankOf(e.to);

    /* THE APP CHECK IS BEFORE THE RANKS, AND IT WAS BELOW THEM FOR ONE RUN. `31 §2`: *"apps import
       packages and never each other"*, and rows 16 and 17 both say `web`'s `build/` is *"the asset
       directory, never an import"*. So `worker` (16) → `web` (14) points DOWN the order and is still
       refused, which is why the ranks cannot answer it. Written after the unranked `continue` it also
       could not answer `packages/client` → `@braindog/selfhost`, the single most inverted edge in the
       tree (a package depending on a runtime), because `client` has no rank to get past the guard.
       A check reachable only for the cases that were already fine is `52 §9`'s whole subject. */
    if (groupOf(e.to) === 'apps') {
      const kind =
        groupOf(e.from) === 'apps'
          ? "31 §2: apps import packages and never each other; web's build/ is an asset directory, never an import."
          : groupOf(e.from) === 'packs'
            ? 'A pack is data on the record and runs in whichever host installs it, so it names none of them.'
            : '31 §1: packages/* may name a capability, only apps/* may name a runtime. This package now names one.';
      add(e.where, 'edge into an app', `${name(e.from)} → ${name(e.to)}, ${evidence(e)}. ${kind}`);
    }

    /* THE CORE NEVER DEPENDS ON A PACK. The code ships primitives and
       never a use case, and a use case lives in a record or a shared pack. An edge from a package or an
       app into `packs/` is a use case the core cannot run without, which makes uninstalling it a
       release. A pack on a pack is left to the cycle check: that is one use case built on another,
       which `requires.packs` says in data already. */
    if (groupOf(e.to) === 'packs' && groupOf(e.from) !== 'packs' && PACK_EDGES_HELD[`${e.from} ${e.to}`]) held.add(`${e.from} ${e.to}`);
    else if (groupOf(e.to) === 'packs' && groupOf(e.from) !== 'packs')
      add(
        e.where,
        'edge into a pack',
        `${name(e.from)} → ${name(e.to)}, ${evidence(e)}. The core ships primitives and never a use case, so a pack reaches the core as a file it installs, never as an import.`,
      );

    /* AND A PACK HAS NO RANK TO CHECK. It sits above the whole order, as a record's own content does,
       so an edge with a pack at either end is answered by the two checks above and the cycle check,
       and asking `31 §2` for a row would be a finding per pack with nothing to repair it but a row that
       means nothing. */
    if (groupOf(e.from) === 'packs' || groupOf(e.to) === 'packs') continue;

    if (from === 0) noteUnranked(e.from, byShort.get(e.from) ? `${byShort.get(e.from).manifest}:1` : e.where);
    if (to === 0) noteUnranked(e.to, byShort.get(e.to) ? `${byShort.get(e.to).manifest}:1` : e.where);
    if (from === 0 || to === 0) continue;

    if (to >= from)
      add(
        e.where,
        'import points up the order',
        `${name(e.from)} → ${name(e.to)} (${e.from} is at rank ${from}, ${e.to} is at rank ${to}), ${evidence(e)}. 31 §2's order is the proof of acyclicity, and every dependency must have a strictly lower index.`,
      );
  }

  for (const [short, { where, edges: count }] of [...unranked].sort())
    add(
      where,
      'unknown package',
      `${byShort.get(short)?.npm ?? short} is not a row of 31 §2's order, so the direction of its ${count} edge(s) cannot be checked. Give it a rank in the table or delete it.`,
    );

  /* A WORKSPACE WITH NO EDGES AT ALL IS STILL DRIFT, and the loop above cannot see it. `31 §2` is
     the total order the build order is read from, so a directory absent from it is a package
     `pnpm -r run build` sequences by luck. */
  for (const key of Object.keys(PACK_EDGES_HELD)) {
    const [from, to] = key.split(' ');
    if (!held.has(key) && byShort.has(from) && byShort.has(to))
      add(
        `${byShort.get(from).manifest}:1`,
        'held edge not seen',
        `${name(from)} → ${name(to)} is held in PACK_EDGES_HELD and the tree no longer has it. Take it out, so the next edge into a pack is seen.`,
      );
  }

  for (const w of ws)
    if (w.group !== 'packs' && rankOf(w.short) === 0 && !unranked.has(w.short))
      add(
        `${w.manifest}:1`,
        'unknown package',
        `${w.npm} is a workspace and not a row of 31 §2's order. The order is also the build order.`,
      );

  /* ── The line ───────────────────────────────────────────────────────────────────────────────── */

  const ms = Math.round(performance.now() - started);
  const missing = ORDER.filter((short) => !byShort.has(short));

  /**
   * Exit 3 is a SKIP and not a pass (`run.mjs`), and the order matters: a fixture tree that seeds a
   * violation in a manifest and carries no `src/` must go RED for it, not amber for the half of the
   * gate that had nothing to read.
   *
   * AND THE SKIP NAMES THE ROOT IT LOOKED UNDER. It said only "no packages/*, apps/* or packs/* to
   * read", so a mistyped `BRAINDOG_GATE_ROOT` was a skip with nothing in it pointing at the mistake;
   * `em-dash` and `secret-grep` name theirs, and `self-test`'s
   * `graph-empty` holds all three to it.
   */
  if (ws.length === 0) {
    console.log(`  graph: no packages/*, apps/* or packs/* under ${resolve(root)}, so nothing was checked.`);
    return 3;
  }

  /**
   * What was read, on both lines.
   *
   * THE CENSUS IS NOT DECORATION ON THE RED PATH. "5 finding(s)" over a corpus the line does not name
   * is the same sentence whether the gate walked 177 files or 3, and a walk that quietly collapsed
   * (a renamed directory, a `skipDir` that grew a name) would look exactly like a clean bill of
   * health with five known problems on it. `ms` for the same reason `52 §4`'s own worked red line
   * carries it (`{"gate":"closed-lists","ok":false,"ms":118,…}`).
   */
  const census = `${ws.length} workspaces, ${edges.size} workspace edges, ${scanned} source files`;

  if (findings.length) {
    console.error(`\n  graph: ${findings.length} finding(s) over ${census} in ${ms}ms, against 31 §2 and 31 §3 layers 3 and 5\n`);
    for (const f of findings) console.error(`    ${f.where}\n        ${f.what}: ${f.why}\n`);
    console.error(
      '  The order in 31 §2 IS the proof of acyclicity, and render having in-degree 0 is the row that\n' +
        '  keeps the published package embeddable. Grafana Loki #13019 is what an unchecked package\n' +
        '  boundary looks like at day 400: reproduced by staff, and still open two years on.\n',
    );
    return 1;
  } else if (scanned === 0) {
    /* AND A RUN THAT READ NO SOURCE IS A SKIP. The manifests alone cannot answer layer 3. A relative
       path that climbs out of a package is invisible in a `dependencies` block, by construction. */
    console.log(
      `  graph: ${ws.length} workspaces and ${edges.size} edges, but no src/**/*.{ts,svelte} to read. The import half checked nothing.`,
    );
    return 3;
  } else {
    const aside = missing.length === 0 ? '' : `; ${missing.length} of 31 §2's rows are unbuilt (${missing.join(', ')})`;
    console.log(`  graph: ${census}, acyclic and in order${aside}, ${ms}ms`);
  }
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns it at four seeded trees with
   `BRAINDOG_GATE_ROOT`, and the header documents the command line. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = graph() ?? 0;
