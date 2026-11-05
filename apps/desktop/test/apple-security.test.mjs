/* `apps/apple` is not a workspace package (no package.json of its own), so `pnpm test` reaches its security test from here. */
import '../../apple/test/security.test.mjs';
