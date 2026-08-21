---
name: jest-test-real-module-bypass-mapper
description: Bypass jest moduleNameMapper+setup mocks to test the real module: place test where relative import misses the regex; jest.unmock+isolateModules+requireActual.
metadata:
  created_by: agent
  scope: project
  source_session: 1149a8bb-0b15-4918-aa9a-1c10727c4067
  source_cwd: /home/luis-monteiro/Documentos/iosToAndroid/scripts/team
  source_repo: /home/luis-monteiro/Documentos/iosToAndroid
  created_at: 2026-08-18T23:08:23Z
---

# Testing a real module when jest mocks it globally

## When
A jest project mocks a module via `moduleNameMapper` and/or a global `jest.setup.js` mock, but you need to test the REAL module (e.g. a native bridge) — e.g. to satisfy an AC that requires a unit test of the actual implementation.

## Procedure

1. **Place the test where the relative import misses the mapper regex.**
   If the mapper is `'^modules/launcher-module/src.*$'`, a test at `modules/launcher-module/__tests__/bridgeErrors.test.ts` importing `'../src'` does NOT match the regex (the path is relative, not `modules/...`), so the mapper never fires. Verify empirically with a probe test before committing to the approach.

2. **Restore the real module** with `jest.unmock('../src')`. Note: `jest.requireActual` alone does NOT bypass `moduleNameMapper` — only `jest.unmock` + a non-matching relative path does.

3. **Mock only the native boundary** — e.g. `jest.mock('expo-modules-core', () => ({ requireNativeModule: jest.fn() }))` — so the module's native calls are controllable.

4. **Reload the module per test** so each test gets a fresh instance and fresh listener registrations:
   ```ts
   let onBridgeError: (m: string, e: unknown) => void;
   beforeEach(() => {
     jest.isolateModules(() => {
       const mod = jest.requireActual<typeof import('../src')>('../src');
       // capture the listener the module registers via requireNativeModule(...).onBridgeError
     });
   });
   ```

5. **Lint/tsc pitfalls:**
   - `require()` is banned by eslint → use `jest.requireActual` (which also bypasses the setup mock).
   - `jest.requireActual` returns `{}` in typings → use the explicit generic: `jest.requireActual<typeof import('../src')>('../src')`.

6. **Sanity-check (red step):** the fix may already be in the codebase (issue already merged). Revert the production line, confirm the test FAILS with the exact expected message, then restore. This proves the test is wired to behavior.

7. **Baseline discipline:** compare full-suite failures against the recorded baseline (`jq -r '.failed_tests[]' <baseline.json>`) — only NEW failures block. A `--json` run may include leftover probe files; delete probes before the final count.

## Pitfalls
- `jest.requireActual` does NOT bypass `moduleNameMapper` — only `jest.unmock` + a non-matching relative path does.
- A leftover probe test file inflates failure counts and pollutes the diff — delete it.
- Don't `-u` snapshots reflexively; confirm intentional changes.
