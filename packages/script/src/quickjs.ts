/**
 * `runInQuickJs`: one run of one script, in QuickJS compiled to WebAssembly, on the self-host.
 *
 * QuickJS was chosen over `node:vm` and `isolated-vm` for isolation. This file is
 * the half of that choice that has to hold: the script gets a fresh interpreter with no globals but the
 * language's own, `ctx` is the only door, and three budgets stop it from outside.
 *
 * THE THREE BUDGETS, AND WHICH MECHANISM HOLDS EACH.
 *
 *   wall_ms  a deadline, checked by the interrupt handler while the interpreter runs AND raced
 *            against the run's promise while it waits on a host call. The interrupt alone would
 *            let a script that awaits a fetch the host never answers wait forever, because nothing
 *            is being interpreted to interrupt.
 *   cpu_ms   the thread's CPU spent inside the interpreter, summed over every slice (the first evaluation,
 *            and each `executePendingJobs` after a host call settles; `threadCpu`). Time waiting on the host is
 *            not the script's CPU, and a Dynamic Worker's `cpuMs` does not count it either. A host
 *            function called from a slice is inside it: copying what the script handed across is
 *            work the script asked for.
 *            BOTH ARE ASKED BY `overBudget`, NOT ONLY BY THE HANDLER, because the handler runs on a
 *            count of instructions and never runs at all during a host function or a native call.
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
  NAMES,
  scriptMeta,
  WITH_CONFIG,
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
    Memory: new (descriptor: { initial: number; maximum: number }) => { grow(pages: number): number };
    RuntimeError: new () => Error;
  };
}).WebAssembly;

/**
 * THE THREAD'S OWN CPU, IN MILLISECONDS, which is what `cpu_ms` meters, or `null` where the runtime cannot say.
 *
 * A SLICE TIMED ON THE WALL CLOCK WAS THE MACHINE'S BUSYNESS AS MUCH AS THE SCRIPT'S. The interpreter runs on this
 * thread and nowhere else, so the thread's CPU across a slice is exactly the script's; a slice timed with
 * `performance.now()` also counted every moment the thread sat waiting for a core. On a loaded machine the cost script
 * of `fx-rate` was refused at `cpu_ms: 219` of 200 in a run whose wall was 297 ms, and the same run alone spends a few.
 * Node's `process.threadCpuUsage` (24) is user and system time in microseconds. Asked once here, since a runtime that
 * names it but does not carry it out throws, and then the wall clock meters as it did.
 */
const threadCpu = ((): (() => number) | null => {
  const proc = (globalThis as { process?: { threadCpuUsage?: () => { user: number; system: number } } }).process;
  const usage = proc?.threadCpuUsage;
  if (typeof usage !== 'function') return null;
  const read = (): number => {
    const u = usage.call(proc);
    return (u.user + u.system) / 1_000;
  };
  try {
    read();
    return read;
  } catch {
    return null;
  }
})();

export async function runInQuickJs(decl: ScriptDecl, host: CtxHost): Promise<ScriptAnswer> {
  /* EVERY READING OF TIME GOES THROUGH THE HOST'S CLOCK, the machine's when it names none (`CtxHost.clock`). */
  const clock = host.clock?.bind(host) ?? ((): number => performance.now());
  /* AND THE ONE `cpu_ms` READS: the thread's CPU, or the host's clock when it hands one, so a test holds both meters. */
  const cpuClock = host.clock === undefined ? (threadCpu ?? clock) : clock;
  const started = clock();
  const usage: ScriptUsage = { fetches: 0, bytes: 0, wall_ms: 0, cpu_ms: 0 };
  const writes: ScriptWrite[] = [];
  let log = '';
  let cpu = 0;
  let stop: ScriptRefusal | null = null;
  let done = false;
  /* THE ONE QUESTION A RUN MAY ASK (script-ask-47): `ask` on what its function returns, handed on unread. */
  let ask: unknown;
  /* AND WHAT IT ANSWERS ITS CALLER, `answer` on what its function returns, for a run an add-on's tool started. */
  let said: unknown;

  const answer = (refused: ScriptRefusal | null): ScriptAnswer => {
    done = true;
    usage.wall_ms = Math.round(clock() - started);
    usage.cpu_ms = Math.round(cpu);
    return refused === null ? { writes, log, usage, ...(ask === undefined || ask === null ? {} : { ask }), ...(said === undefined || said === null ? {} : { answer: said }) } : { refused, log, usage };
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
  const cpuRefusal: ScriptRefusal = {
    code: 'OUT_OF_BOUNDS',
    why: `${decl.id} spent more than its cpu_ms of ${limits.cpu_ms}.`,
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
  /* THE ONE WITNESS THAT THE HEAP RAN OUT. Many small objects fill the heap in pieces no single
     allocation of which is refused, and when the engine then cannot allocate even its "out of
     memory" error it throws a bare `null`, which is also what `throw null` in a script looks like.
     A probe saw 300,000 pushed objects answered as the script's own throw. The runtime's
     own usage is no help afterwards: the objects die with the frame that held them, and it read
     96,798 bytes. What does not die is the fact that emscripten asked this memory to grow past its
     maximum and was told no, and emscripten asks through the object it was handed, so the refusal
     can be seen here. */
  let heapFull = false;
  const grow = memory.grow.bind(memory);
  memory.grow = (pages: number): number => {
    try {
      return grow(pages);
    } catch (error) {
      heapFull = true;
      throw error;
    }
  };
  const module = await newQuickJSWASMModuleFromVariant(newVariant(variant, { wasmMemory: memory }));
  const runtime = module.newRuntime();
  runtime.setMemoryLimit(HEAP_BYTES);
  runtime.setMaxStackSize(STACK_BYTES);

  let slice: number | null = null;

  /**
   * THE TWO TIME BUDGETS, ASKED BY THE CLOCK RATHER THAN BY THE INTERPRETER. QuickJS calls the
   * interrupt handler after a count of interpreted instructions, so time that is not interpretation
   * (a 5 MB object copied across in `ctx.write`, a native `JSON.stringify` inside the engine) never
   * reaches it. A probe measured two hundred such writes answered clean at `cpu_ms: 6777`
   * against a limit of 200. So the handler, every host function, every settle after a host await
   * and the end of the run all ask this same question.
   */
  const overBudget = (): ScriptRefusal | null => {
    if (clock() > deadline) return wallRefusal;
    if (cpu + (slice === null ? 0 : cpuClock() - slice) > limits.cpu_ms) return cpuRefusal;
    return null;
  };

  /** At the top of a host function and again after it has decoded what it was handed. */
  const charge = (): void => {
    const over = stop ?? overBudget();
    if (over !== null) throw refuse(over);
  };

  runtime.setInterruptHandler(() => {
    stop ??= overBudget();
    if (stop !== null) wake();
    return stop !== null;
  });

  const vm = runtime.newContext();

  /** Every entry into the interpreter goes through here, so the CPU budget sees all of it. */
  const inVm = <T>(fn: () => T): T => {
    const outer = slice === null;
    if (outer) slice = cpuClock();
    try {
      return fn();
    } finally {
      if (outer && slice !== null) {
        cpu += cpuClock() - slice;
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
      /* A HOST THAT HELD THE THREAD PAST THE DEADLINE ANSWERS NOBODY. The race's timer cannot fire
         while the host is busy, and once its promise settles the script's continuation would run
         as microtasks ahead of the timer: a host that spun 400 ms after its first await had its
         answer taken and a write queued under a 300 ms wall_ms, and the run was answered clean. */
      const over = stop ?? overBudget();
      if (over !== null) {
        refuse(over);
        return;
      }
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
      charge();
      const asked = json(arg) as { url: string; init: Record<string, Json> | null };
      charge();
      const init = asked.init ?? {};
      /* AN ADDRESS HELD IN THE KEYS: the label is checked here, as a key's is, and everything about the URL is the
         host's, which opens it (`HostRequest.address`). Nothing else rides with it: no key, no body, a GET. */
      if (typeof init['address'] === 'string') {
        const address = init['address'];
        if (!decl.keys.includes(address))
          throw refuse({ code: 'FORBIDDEN', why: `${decl.id} asked for the address in the key ${JSON.stringify(address)}, which it does not declare.` });
        if (typeof init['key'] === 'string' || (typeof init['method'] === 'string' && init['method'].toUpperCase() !== 'GET'))
          throw refuse({ code: 'FORBIDDEN', why: `${decl.id} fetches an address from its keys with a plain GET and no other key.` });
        if (usage.fetches >= limits.fetches)
          throw refuse({ code: 'OUT_OF_BOUNDS', why: `${decl.id} made more than its ${limits.fetches} fetches.` });
        usage.fetches += 1;
        const request: HostRequest = { url: '', method: 'GET', headers: {}, body: null, key: null, address };
        return deferred(async () => {
          const res = await host.fetch(request);
          usage.bytes += utf8.encode(res.body).length;
          return JSON.stringify({ status: res.status, headers: res.headers, body: res.body });
        });
      }
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
      /* AND THE ORIGIN IS NOT THE WHOLE URL. A `blob:` URL's origin is the origin inside it, and user
         info is no part of an origin, so `blob:https://api.gold.example/abc` and
         `https://user:pw@api.gold.example/x` both compared equal above and reached the host as
         written. What the host is handed is a bare https request or nothing. The credentials are not
         repeated in the refusal, because the refusal is kept on the run's event. */
      if (url.protocol !== 'https:')
        throw refuse({ code: 'PULL_ORIGIN_REFUSED', why: `${decl.id} fetched a ${url.protocol} URL; a script fetches plain https:// URLs only.` });
      if (url.username !== '' || url.password !== '')
        throw refuse({ code: 'PULL_ORIGIN_REFUSED', why: `${decl.id} fetched ${url.origin} with a user name or password in the URL, which a script may not send.` });
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

    /* THE SECOND charge() IS THE ONE THAT MATTERS FOR A BIG WRITE. Decoding what crossed is most of
       the cost of a write, and it happens here, after the first check. */
    write: (register, fields) => {
      charge();
      const name = text(register);
      if (!decl.writes.includes(name))
        throw refuse({ code: 'FORBIDDEN', why: `${decl.id} wrote to ${name}, which is not in its writes.` });
      if (writes.length >= limits.writes)
        throw refuse({ code: 'OUT_OF_BOUNDS', why: `${decl.id} queued more than its ${limits.writes} writes.` });
      const decoded = json(fields);
      charge();
      writes.push({ op: 'create', register: name, fields: decoded });
      return undefined;
    },

    /* THE REGISTER OF AN UPDATE IS CHECKED WHEN IT IS APPLIED, NOT HERE. A spoken id names its
       register through a prefix only the record resolves, so what this can hold is the count. */
    update: (spoken, patch, version) => {
      charge();
      if (writes.length >= limits.writes)
        throw refuse({ code: 'OUT_OF_BOUNDS', why: `${decl.id} queued more than its ${limits.writes} writes.` });
      const write: ScriptWrite = { op: 'update', spoken: text(spoken), patch: json(patch), version: version === undefined ? 0 : vm.getNumber(version) };
      charge();
      writes.push(write);
      return undefined;
    },

    log: (words) => {
      charge();
      const line = `${text(words)}\n`;
      charge();
      const room = LOG_BYTES - utf8.encode(log).length;
      if (room > 0) log += new TextDecoder().decode(utf8.encode(line).slice(0, room)).replace(/�$/u, '');
      return undefined;
    },

    /* THE OPTIONS CROSS AS THE SCRIPT WROTE THEM, AND THE HOST READS THEM (`CtxHost.list`), as the Worker hands its own
       to the same reader. None handed at all, from a prelude that sends two arguments, is no options. */
    list: (register, where, options) => {
      charge();
      const name = text(register);
      if (!decl.reads.includes(name) || host.list === undefined)
        throw refuse({ code: 'FORBIDDEN', why: `${decl.id} read ${name}, which is not in its reads.` });
      const list = host.list.bind(host);
      const filter = json(where);
      const asked = options === undefined ? null : json(options);
      charge();
      return deferred(async () => JSON.stringify(await list(name, filter, asked)));
    },

    get: (spoken) => {
      charge();
      const id = text(spoken);
      charge();
      if (decl.reads.length === 0 || host.get === undefined)
        throw refuse({ code: 'FORBIDDEN', why: `${decl.id} read ${id} and declares no reads.` });
      const get = host.get.bind(host);
      return deferred(async () => JSON.stringify(await get(id, decl.reads)));
    },

    /* `ctx.fold`, ONLY FROM A HOST THAT HANDS ONE, so the prelude finds no function here and builds no `ctx.fold`
       otherwise. NO `reads` CHECK: it reads nothing of the record, a text in and a key out. Charged like every call,
       and how many a run may make is the host's to hold (`scriptFold`), since the work is done on its side. */
    ...(host.fold === undefined
      ? {}
      : {
          fold: (said: QuickJSHandle) => {
            charge();
            const words = text(said);
            charge();
            const fold = host.fold!.bind(host);
            return deferred(async () => JSON.stringify(await fold(words)));
          },
        }),

    /* `ctx.cycle`, ONLY FROM A HOST THAT HANDS ONE, as `fold`: no `reads` check, since it reads nothing of the record.
       The line crosses as the prelude wrote it and the host reads it (`scriptCycle`): one that does not parse here is
       no line, which the host answers with `null`, as it does a line it cannot read. */
    ...(host.cycle === undefined
      ? {}
      : {
          cycle: (day: QuickJSHandle, line: QuickJSHandle) => {
            charge();
            const on = text(day);
            let read: Json = null;
            try {
              read = json(line);
            } catch {
              read = null;
            }
            charge();
            const cycle = host.cycle!.bind(host);
            return deferred(async () => JSON.stringify(await cycle(on, read)));
          },
        }),

    /* `ctx.propose`, ONLY FROM A HOST THAT HANDS ONE, as `fold`. The host holds it to `writes:`, counts it and tries it
       against the record (`scriptProposals`), since the gate is the record's; a proposal that does not parse here
       crosses as `null`, which the host refuses in the record's words. */
    ...(host.propose === undefined
      ? {}
      : {
          propose: (proposal: QuickJSHandle) => {
            charge();
            let read: Json = null;
            try {
              read = json(proposal);
            } catch {
              read = null;
            }
            charge();
            const propose = host.propose!.bind(host);
            return deferred(async () => JSON.stringify(await propose(read)));
          },
        }),
  };

  /** Json into the interpreter, through the interpreter's own `JSON.parse`, read before the script runs. */
  const intoVm = (parse: QuickJSHandle, value: Json): QuickJSHandle => {
    const str = vm.newString(JSON.stringify(value));
    const out = vm.unwrapResult(vm.callFunction(parse, vm.undefined, str));
    str.dispose();
    return out;
  };

  /**
   * What was thrown, as words, or `null` when the thrown value was `null` itself (see `heapFull`).
   * `dump` calls the thrown object's getters, which is the script's code running, so every caller
   * reads it inside `inVm`.
   */
  const errorText = (ctx: QuickJSContext, error: QuickJSHandle): string | null => {
    const dumped: unknown = ctx.dump(error);
    error.dispose();
    if (dumped === null) return null;
    if (typeof dumped === 'object' && 'message' in dumped) return String(dumped.message);
    return String(dumped);
  };

  /** A script error, or a refusal the interpreter surfaced as one. */
  const fromError = (message: string | null): ScriptRefusal => {
    if (stop !== null) return stop;
    if (message === null ? heapFull : /out of memory/iu.test(message)) return memoryRefusal;
    return { code: null, why: `${decl.id} threw: ${String(message)}` };
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
      const meta = intoVm(parse, scriptMeta({ input: host.input, now: host.now(), tz: host.tz }));
      const built = vm.unwrapResult(vm.callFunction(build, vm.undefined, meta));
      /* `ctx.config`, PUT ON BY THE SAME TEXT THE CLOUD'S LOADED MODULE USES (`WITH_CONFIG`), frozen inside the VM. */
      const withConfig = vm.unwrapResult(vm.evalCode(WITH_CONFIG, 'config.js'));
      const config = intoVm(parse, host.config ?? {});
      const ctx = vm.unwrapResult(vm.callFunction(withConfig, vm.undefined, built, config));
      for (const h of [parse, prelude, hostObj, build, meta, built, withConfig, config]) h.dispose();
      /* `__name` FIRST, for the reason `NAMES` gives: a source taken from a bundle calls it. */
      vm.unwrapResult(vm.evalCode(NAMES, 'names.js')).dispose();

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
    if ('error' in entered) return answer(stop ?? overBudget() ?? fromError(entered.error));

    const settled = vm.resolvePromise(entered.value);
    entered.value.dispose();
    pump();

    /* THE TIMER ONLY WAKES THE RUN; THE CLOCK SAYS WHETHER wall_ms IS SPENT. On the machine's clock the two agree and
       this fires once. On a host's clock that stands still the run is never refused for wall time the machine spent,
       and on one the host has already moved past the deadline it is refused at once. */
    const timeout = new Promise<'timeout'>((resolve) => {
      const arm = (): void => {
        const left = deadline - clock();
        if (left < 0) resolve('timeout');
        else timer = setTimeout(arm, Math.max(1, left));
      };
      arm();
    });
    const outcome = await Promise.race([settled, timeout, stopped.then(() => 'stopped' as const)]);

    if (stop !== null) return answer(stop);
    if (outcome === 'timeout') return answer(wallRefusal);
    if (outcome === 'stopped') return answer(stop ?? wallRefusal);
    if ('error' in outcome && outcome.error !== undefined) {
      /* INSIDE inVm, BECAUSE READING THE ERROR RUNS THE SCRIPT. Read outside it, a thrown object
         whose `message` getter spun had no slice to be measured against, so the handler checked
         only the deadline: a probe spun its whole 3,000 ms wall_ms and was metered at
         `cpu_ms: 12` under a limit of 100. */
      const thrown = outcome.error;
      const message = inVm(() => errorText(vm, thrown));
      return answer(stop ?? overBudget() ?? fromError(message));
    }
    /* INSIDE inVm, BECAUSE DUMPING CAN RUN GETTERS; the overBudget check right after still covers what it costs. */
    const value: unknown = inVm(() => vm.dump(outcome.value));
    outcome.value.dispose();
    ask = value !== null && typeof value === 'object' ? (value as { ask?: unknown }).ask : undefined;
    said = value !== null && typeof value === 'object' ? (value as { answer?: unknown }).answer : undefined;
    /* THE LAST CHECK, FOR TIME NO OTHER CHECK FELL INSIDE. `JSON.stringify` of two 3 MB strings is
       one native call in the engine: no interrupt during it, no host function after it, and the
       run answered clean at `cpu_ms: 111` against a limit of 5. */
    const over = overBudget();
    if (over !== null) return answer(over);
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
