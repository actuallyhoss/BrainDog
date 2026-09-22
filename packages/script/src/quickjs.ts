/**
 * `runInQuickJs`: one run of one script, in QuickJS compiled to WebAssembly, on the self-host.
 *
 * Section 4 of the design is the argument for QuickJS over `node:vm` and `isolated-vm`. This file is
 * the half of it that has to hold: the script gets a fresh interpreter with no globals but the
 * language's own, `ctx` is the only door, and three budgets stop it from outside.
 *
 * THE THREE BUDGETS, AND WHICH MECHANISM HOLDS EACH.
 *
 *   wall_ms  a deadline, checked by the interrupt handler while the interpreter runs AND raced
 *            against the run's promise while it waits on a host call. The interrupt alone would
 *            let a script that awaits a fetch the host never answers wait forever, because nothing
 *            is being interpreted to interrupt.
 *   cpu_ms   the time spent inside the interpreter, summed over every slice (the first evaluation,
 *            and each `executePendingJobs` after a host call settles). Time waiting on the host is
 *            not the script's CPU, and a Dynamic Worker's `cpuMs` does not count it either.
 *   memory   a `WebAssembly.Memory` per run with a hard `maximum` (see `HEAP_BYTES` for why the
 *            QuickJS limit alone is not one). A new memory means a new module instance per run.
 *            Measured at about 2 ms on this machine, which a script run every 15 minutes can pay.
 *
 * EVERY REFUSAL IS STICKY. A host function that refuses throws into the script, and a script can
 * catch a throw. So the refusal is also recorded here, the interrupt handler stops the interpreter
 * at its next check once one is recorded, and the answer is `refused` with no writes whatever the
 * script did afterwards. A script that caught its own over-limit write and returned normally is the
 * case this exists for.
 */

import * as ngPackage from '@jitl/quickjs-ng-wasmfile-release-sync';
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSSyncVariant,
} from 'quickjs-emscripten-core';

import {
  checkDecl,
  HEAP_BYTES,
  isRefusal,
  LOG_BYTES,
  type CtxHost,
  type HostRequest,
  type Json,
  type ScriptAnswer,
  type ScriptDecl,
  type ScriptRefusal,
  type ScriptUsage,
  type ScriptWrite,
} from './index.ts';
import { PRELUDE } from './prelude.ts';

/** A WebAssembly page. */
const PAGE = 64 * 1024;

/**
 * THE BUILD'S OWN STARTING SIZE, 256 pages (16 MB), read off `getWasmMemory()` of a default
 * instance. A memory handed in with fewer initial pages than the binary declares fails to link.
 */
const INITIAL_PAGES = 256;

/**
 * 512 KB of interpreter stack. Unbounded recursion is then an ordinary `RangeError` inside the
 * script rather than the wasm stack running into the heap.
 */
const STACK_BYTES = 512 * 1024;

const utf8 = new TextEncoder();

/**
 * THE VARIANT, UNWRAPPED BY SHAPE BECAUSE THE TYPES AND THE RUNTIME DISAGREE ABOUT ITS DEFAULT.
 * The package's `exports` name one `.d.ts` for both conditions, so under `nodenext` TypeScript reads
 * it as CommonJS and puts the variant one `default` deeper than Node's ESM import does. A default
 * import therefore typechecked as the namespace and failed `newVariant`'s signature. Walking
 * `default` until something has a `type` is right under either reading.
 */
const variant = ((): QuickJSSyncVariant => {
  let at: unknown = ngPackage;
  while (at !== null && typeof at === 'object' && !('type' in at) && 'default' in at) at = at.default;
  return at as QuickJSSyncVariant;
})();

/**
 * `WebAssembly` IS NAMED THROUGH `globalThis` because this package's `lib` is `es2024` with no DOM,
 * and neither that nor `@types/node` 24.13 declares the namespace. The constructor is present in
 * Node, workerd and every browser; only its type is missing.
 */
const Wasm = (globalThis as unknown as {
  WebAssembly: {
    Memory: new (descriptor: { initial: number; maximum: number }) => object;
    RuntimeError: new () => Error;
  };
}).WebAssembly;

export async function runInQuickJs(decl: ScriptDecl, host: CtxHost): Promise<ScriptAnswer> {
  const started = performance.now();
  const usage: ScriptUsage = { fetches: 0, bytes: 0, wall_ms: 0, cpu_ms: 0 };
  const writes: ScriptWrite[] = [];
  let log = '';
  let cpu = 0;
  let stop: ScriptRefusal | null = null;
  let done = false;

  const answer = (refused: ScriptRefusal | null): ScriptAnswer => {
    done = true;
    usage.wall_ms = Math.round(performance.now() - started);
    usage.cpu_ms = Math.round(cpu);
    return refused === null ? { writes, log, usage } : { refused, log, usage };
  };

  const limits = checkDecl(decl);
  if (isRefusal(limits)) return answer(limits);
  const deadline = started + limits.wall_ms;

  const wallRefusal: ScriptRefusal = {
    code: 'OUT_OF_BOUNDS',
    why: `${decl.id} ran past its wall_ms of ${limits.wall_ms}.`,
  };
  const memoryRefusal: ScriptRefusal = {
    code: 'OUT_OF_BOUNDS',
    why: `${decl.id} ran out of its ${HEAP_BYTES / 1024 / 1024} MB of memory.`,
  };

  /* THE SIGNAL THAT ENDS A WAIT EARLY. A refusal recorded inside a host function, or by the
     interrupt handler during a pending job, may leave the run's promise pending for good, and the
     run must not then sit out the rest of wall_ms. */
  let wake: () => void = () => {};
  const stopped = new Promise<void>((resolve) => {
    wake = resolve;
  });
  const refuse = (refusal: ScriptRefusal): Error => {
    stop ??= refusal;
    wake();
    return new Error(refusal.why);
  };

  const memory = new Wasm.Memory({ initial: INITIAL_PAGES, maximum: HEAP_BYTES / PAGE });
  const module = await newQuickJSWASMModuleFromVariant(newVariant(variant, { wasmMemory: memory }));
  const runtime = module.newRuntime();
  runtime.setMemoryLimit(HEAP_BYTES);
  runtime.setMaxStackSize(STACK_BYTES);

  let slice: number | null = null;
  runtime.setInterruptHandler(() => {
    const now = performance.now();
    if (now > deadline) stop ??= wallRefusal;
    else if (slice !== null && cpu + (now - slice) > limits.cpu_ms)
      stop ??= { code: 'OUT_OF_BOUNDS', why: `${decl.id} spent more than its cpu_ms of ${limits.cpu_ms}.` };
    if (stop !== null) wake();
    return stop !== null;
  });

  const vm = runtime.newContext();

  /** Every entry into the interpreter goes through here, so the CPU budget sees all of it. */
  const inVm = <T>(fn: () => T): T => {
    const outer = slice === null;
    if (outer) slice = performance.now();
    try {
      return fn();
    } finally {
      if (outer && slice !== null) {
        cpu += performance.now() - slice;
        slice = null;
      }
    }
  };

  const pump = (): void => {
    if (done || !vm.alive) return;
    inVm(() => {
      const jobs = runtime.executePendingJobs();
      if ('error' in jobs && jobs.error !== undefined) jobs.error.dispose();
    });
    if (stop !== null) wake();
  };

  /**
   * A host call the script awaits. The refusal checks have already run, synchronously, in the
   * caller; this only carries the host's answer back as a string, or its failure as an ordinary
   * error the script may catch. A host that fails is not a rule the script broke.
   */
  const deferred = (work: () => Promise<string>): QuickJSHandle => {
    const promise = vm.newPromise();
    /* THE ENGINE CAN GIVE OUT HERE, AND HERE IS OUTSIDE THE RUN'S try. A 40 MB answer written into
       a 32 MB sandbox threw `RuntimeError: memory access out of bounds` from `newString`, and with
       nothing to catch it the rejection ended the whole Node process. So a throw on the way in is
       the run's refusal, recorded like any other, and the race below wakes on it. */
    const settle = (into: () => void): void => {
      if (done || !vm.alive) return;
      try {
        into();
        pump();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        refuse(error instanceof Wasm.RuntimeError || /memory/iu.test(message) ? memoryRefusal : { code: null, why: `${decl.id} stopped the engine: ${message}` });
      }
    };
    work().then(
      (text) =>
        settle(() => {
          const handle = vm.newString(text);
          promise.resolve(handle);
          handle.dispose();
        }),
      (error: unknown) =>
        settle(() => {
          const handle = vm.newError(error instanceof Error ? error.message : String(error));
          promise.reject(handle);
          handle.dispose();
        }),
    );
    return promise.handle;
  };

  const text = (h: QuickJSHandle | undefined): string => (h === undefined ? '' : vm.getString(h));
  const json = (h: QuickJSHandle | undefined): Json => JSON.parse(text(h)) as Json;

  const hostFns: Record<string, (...args: QuickJSHandle[]) => QuickJSHandle | undefined> = {
    fetch: (arg) => {
      const asked = json(arg) as { url: string; init: Record<string, Json> | null };
      const init = asked.init ?? {};
      let url: URL;
      try {
        url = new URL(asked.url);
      } catch {
        throw refuse({ code: 'PULL_ORIGIN_REFUSED', why: `${decl.id} fetched ${JSON.stringify(asked.url)}, which is not a URL.` });
      }
      /* THE ORIGIN, NOT THE STRING. `https://api.example.com@evil.example/` starts with a declared
         origin and parses to `evil.example`; a prefix test would have sent it. */
      if (!decl.egress.includes(url.origin))
        throw refuse({ code: 'PULL_ORIGIN_REFUSED', why: `${decl.id} fetched ${url.origin}, which is not in its egress.` });
      if (usage.fetches >= limits.fetches)
        throw refuse({ code: 'OUT_OF_BOUNDS', why: `${decl.id} made more than its ${limits.fetches} fetches.` });
      const key = typeof init['key'] === 'string' ? init['key'] : null;
      if (key !== null && !decl.keys.includes(key))
        throw refuse({ code: 'FORBIDDEN', why: `${decl.id} asked for the key ${JSON.stringify(key)}, which it does not declare.` });
      const headers: Record<string, string> = {};
      const given = init['headers'];
      if (given !== null && typeof given === 'object' && !Array.isArray(given))
        for (const [name, value] of Object.entries(given)) headers[name] = String(value);
      const request: HostRequest = {
        url: url.href,
        method: typeof init['method'] === 'string' ? init['method'].toUpperCase() : 'GET',
        headers,
        body: typeof init['body'] === 'string' ? init['body'] : null,
        key,
      };
      usage.fetches += 1;
      return deferred(async () => {
        const res = await host.fetch(request);
        usage.bytes += utf8.encode(res.body).length;
        return JSON.stringify({ status: res.status, headers: res.headers, body: res.body });
      });
    },

    write: (register, fields) => {
      const name = text(register);
      if (!decl.writes.includes(name))
        throw refuse({ code: 'FORBIDDEN', why: `${decl.id} wrote to ${name}, which is not in its writes.` });
      if (writes.length >= limits.writes)
        throw refuse({ code: 'OUT_OF_BOUNDS', why: `${decl.id} queued more than its ${limits.writes} writes.` });
      writes.push({ op: 'create', register: name, fields: json(fields) });
      return undefined;
    },

    /* THE REGISTER OF AN UPDATE IS CHECKED WHEN IT IS APPLIED, NOT HERE. A spoken id names its
       register through a prefix only the record resolves, so what this can hold is the count. */
    update: (spoken, patch, version) => {
      if (writes.length >= limits.writes)
        throw refuse({ code: 'OUT_OF_BOUNDS', why: `${decl.id} queued more than its ${limits.writes} writes.` });
      writes.push({ op: 'update', spoken: text(spoken), patch: json(patch), version: version === undefined ? 0 : vm.getNumber(version) });
      return undefined;
    },

    log: (words) => {
      const line = `${text(words)}\n`;
      const room = LOG_BYTES - utf8.encode(log).length;
      if (room > 0) log += new TextDecoder().decode(utf8.encode(line).slice(0, room)).replace(/�$/u, '');
      return undefined;
    },

    list: (register, where) => {
      const name = text(register);
      if (!decl.reads.includes(name) || host.list === undefined)
        throw refuse({ code: 'FORBIDDEN', why: `${decl.id} read ${name}, which is not in its reads.` });
      const list = host.list.bind(host);
      const filter = json(where);
      return deferred(async () => JSON.stringify(await list(name, filter)));
    },

    get: (spoken) => {
      const id = text(spoken);
      if (decl.reads.length === 0 || host.get === undefined)
        throw refuse({ code: 'FORBIDDEN', why: `${decl.id} read ${id} and declares no reads.` });
      const get = host.get.bind(host);
      return deferred(async () => JSON.stringify(await get(id, decl.reads)));
    },
  };

  /** Json into the interpreter, through the interpreter's own `JSON.parse`, read before the script runs. */
  const intoVm = (parse: QuickJSHandle, value: Json): QuickJSHandle => {
    const str = vm.newString(JSON.stringify(value));
    const out = vm.unwrapResult(vm.callFunction(parse, vm.undefined, str));
    str.dispose();
    return out;
  };

  const errorText = (ctx: QuickJSContext, error: QuickJSHandle): string => {
    const dumped: unknown = ctx.dump(error);
    error.dispose();
    if (dumped !== null && typeof dumped === 'object' && 'message' in dumped) return String(dumped.message);
    return String(dumped);
  };

  /** A script error, or a refusal the interpreter surfaced as one. */
  const fromError = (message: string): ScriptRefusal => {
    if (stop !== null) return stop;
    if (/out of memory/iu.test(message)) return memoryRefusal;
    return { code: null, why: `${decl.id} threw: ${message}` };
  };

  let clean = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const entered = inVm(() => {
      const parse = vm.unwrapResult(vm.evalCode('JSON.parse', 'parse.js'));
      const prelude = vm.unwrapResult(vm.evalCode(PRELUDE, 'prelude.js'));
      const hostObj = vm.newObject();
      for (const [name, fn] of Object.entries(hostFns)) {
        const handle = vm.newFunction(name, fn);
        vm.setProp(hostObj, name, handle);
        handle.dispose();
      }
      const build = vm.unwrapResult(vm.callFunction(prelude, vm.undefined, hostObj));
      const meta = intoVm(parse, { input: host.input, now: host.now(), tz: host.tz });
      const ctx = vm.unwrapResult(vm.callFunction(build, vm.undefined, meta));
      for (const h of [parse, prelude, hostObj, build, meta]) h.dispose();

      const evaluated = vm.evalCode(decl.source, 'script.js', { type: 'module' });
      if ('error' in evaluated && evaluated.error !== undefined) return { error: errorText(vm, evaluated.error) };
      const exports = evaluated.value;
      const run = vm.getProp(exports, 'default');
      exports.dispose();
      if (vm.typeof(run) !== 'function') {
        run.dispose();
        ctx.dispose();
        return { invalid: true as const };
      }
      const called = vm.callFunction(run, vm.undefined, ctx);
      run.dispose();
      ctx.dispose();
      if ('error' in called && called.error !== undefined) return { error: errorText(vm, called.error) };
      return { value: called.value };
    });

    if ('invalid' in entered)
      return answer(stop ?? { code: 'DECLARATION_INVALID', why: `${decl.id}'s source has no default export that is a function.` });
    if ('error' in entered) return answer(fromError(entered.error));

    const settled = vm.resolvePromise(entered.value);
    entered.value.dispose();
    pump();

    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), Math.max(0, deadline - performance.now()));
    });
    const outcome = await Promise.race([settled, timeout, stopped.then(() => 'stopped' as const)]);

    if (stop !== null) return answer(stop);
    if (outcome === 'timeout') return answer(wallRefusal);
    if (outcome === 'stopped') return answer(stop ?? wallRefusal);
    if ('error' in outcome && outcome.error !== undefined) return answer(fromError(errorText(vm, outcome.error)));
    outcome.value.dispose();
    clean = true;
    return answer(null);
  } catch (error) {
    /* THE ENGINE ITSELF GAVE OUT, rather than the script inside it. An emscripten abort (the memory
       at its maximum while QuickJS was allocating for itself) arrives here as a host exception, and
       the instance is unusable after it. It was this run's own instance, so nothing else is. */
    if (stop !== null) return answer(stop);
    const message = error instanceof Error ? error.message : String(error);
    return answer(error instanceof Wasm.RuntimeError || /memory/iu.test(message) ? memoryRefusal : fromError(message));
  } finally {
    done = true;
    if (timer !== undefined) clearTimeout(timer);
    /* A RUN THAT WAS STOPPED IS DROPPED, NOT DISPOSED. QuickJS asserts every object is freed when
       its runtime is, and a run interrupted mid-flight leaves some that were not: the first test run
       of this file printed an `Aborted(Assertion failed: list_empty(&rt->gc_obj_list))` line for
       refused runs that had got as far as the interpreter. The instance and its memory are
       this run's alone, so letting go of them frees the same bytes without asking QuickJS to agree. */
    if (stop === null && clean)
      try {
        vm.dispose();
        runtime.dispose();
      } catch {
        /* dropped with the instance */
      }
  }
}
