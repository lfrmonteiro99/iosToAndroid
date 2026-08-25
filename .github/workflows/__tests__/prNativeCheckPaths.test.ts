import * as fs from 'fs';
import * as path from 'path';

/**
 * Guards the path filter on pr-native-check.yml.
 *
 * That filter is the whole reason the workflow is affordable, and it is also the
 * thing most likely to silently rot: a pattern that stops matching turns the
 * gate off for exactly the files it exists to catch, and nothing fails — the
 * job just quietly does not run. #738 broke dev three times through Gradle
 * (lockfile, Kotlin coroutine, manifest minSdk), and every one of those has to
 * keep triggering this workflow.
 *
 * The reverse direction matters too: `modules/**` was the first version of the
 * filter and it also matched every module's TypeScript, so the expensive
 * release build ran on PRs with no native change at all.
 *
 * The patterns are read from the YAML rather than duplicated here, so editing
 * the workflow is what this test checks.
 */

const WORKFLOW = path.resolve(__dirname, '../pr-native-check.yml');

/**
 * GitHub Actions path-filter globbing: `**` matches any characters INCLUDING
 * `/`; a single `*` matches any characters EXCEPT `/`. Everything else is
 * literal. Node has no built-in for this, and pulling a glob library in for one
 * test would be heavier than the six lines it takes.
 */
function toRegExp(pattern: string): RegExp {
  let out = '';
  let i = 0;
  while (i < pattern.length) {
    if (pattern.startsWith('**', i)) {
      out += '.*';
      i += 2;
    } else if (pattern[i] === '*') {
      out += '[^/]*';
      i += 1;
    } else {
      out += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i += 1;
    }
  }
  return new RegExp(`^${out}$`);
}

/**
 * The `paths:` list of the `pull_request` trigger, read straight out of the
 * workflow. Parsed by hand rather than with a YAML dependency: the block is a
 * flat list of quoted strings and the repo has no yaml parser in its deps.
 */
function readPathFilters(): string[] {
  const yaml = fs.readFileSync(WORKFLOW, 'utf8');
  const lines = yaml.split('\n');
  const start = lines.findIndex((l) => /^\s*paths:\s*$/.test(l));
  expect(start).toBeGreaterThan(-1);

  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const m = /^\s*-\s*'([^']+)'\s*$/.exec(line) ?? /^\s*-\s*"([^"]+)"\s*$/.exec(line);
    if (!m) {
      // A non-item, non-comment, non-blank line ends the list.
      if (/^\s*(#.*)?$/.test(line)) continue;
      break;
    }
    out.push(m[1]);
  }
  return out;
}

const filters = readPathFilters();
const regexes = filters.map(toRegExp);

function triggers(file: string): boolean {
  return regexes.some((rx) => rx.test(file));
}

describe('pr-native-check.yml path filter', () => {
  it('reads a non-empty filter list from the workflow', () => {
    expect(filters.length).toBeGreaterThan(0);
  });

  // ── Must trigger: every way a native build can break ─────────────────────
  it.each([
    ['a desynced lockfile (#887)', 'package-lock.json'],
    ['a dependency change', 'package.json'],
    ['module Kotlin (#889)', 'modules/health-connect-module/android/src/main/java/com/iostoandroid/health/HealthConnectModule.kt'],
    ['a module manifest (#890)', 'modules/health-connect-module/android/src/main/AndroidManifest.xml'],
    ['a module build.gradle', 'modules/health-connect-module/android/build.gradle'],
    ['module native registration', 'modules/health-connect-module/expo-module.config.json'],
    ["a module's own deps", 'modules/launcher-module/package.json'],
    ['Expo config (permissions, plugins, SDK)', 'app.json'],
    ['a config plugin', 'plugins/withFastReleaseBuilds.js'],
    ['the gate itself, so changes self-test', '.github/workflows/pr-native-check.yml'],
  ])('runs the native build for %s', (_label, file) => {
    expect(triggers(file)).toBe(true);
  });

  // ── Must NOT trigger: a release build cannot be broken from here ─────────
  it.each([
    ["a module's TypeScript surface", 'modules/launcher-module/src/index.ts'],
    ["a module's tests", 'modules/launcher-module/src/__tests__/index.test.ts'],
    ['an app screen', 'src/screens/SiriScreen.tsx'],
    ['a component', 'src/components/appIcons/index.tsx'],
    ['a store', 'src/store/AppsStore.tsx'],
    ['the JS gate', '.github/workflows/pr-checks.yml'],
    ['docs', 'AGENTS.md'],
  ])('skips the native build for %s', (_label, file) => {
    expect(triggers(file)).toBe(false);
  });

  it('does not use a bare modules/** pattern', () => {
    // The over-triggering version. Kept as its own assertion because the
    // "skips a module's TypeScript" case above would also catch it, and this
    // names the reason.
    expect(filters).not.toContain('modules/**');
  });
});
