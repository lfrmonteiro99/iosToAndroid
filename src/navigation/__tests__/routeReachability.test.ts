import fs from 'fs';
import path from 'path';

// #442: TodayViewScreen was registered in TabNavigator and typed in
// RootStackParamList, but nothing in the app ever navigated to it — it was
// dead code, reachable only by a deep link the app doesn't even configure
// (no `scheme` in app.json). Notes/Reminders/Mail had the opposite problem:
// they *were* reachable, but only through Spotlight search results that
// require pre-existing data to exist (see the issue's escalation comment).
//
// This is a static-analysis guard, not a rendering test: it parses the
// registered route names out of TabNavigator.tsx and greps the rest of src/
// for anything that looks like a real entry point (a literal
// `navigate('X')`/`navigateTo('X')` call, a route embedded in a dispatch
// table like `BUILT_IN_APPS`/the Settings screen list — `key: 'X'` — or an
// `initialRouteName`). It cannot prove a route is reachable in the way a
// rendered interaction test can (that's what
// LauncherHomeScreen.entryPoints.test.tsx does for the four routes this
// issue is actually about) — it can only catch the specific shape of this
// bug again: a screen added to the navigator with no textual trace of any
// code ever trying to reach it.
const SRC_ROOT = path.join(__dirname, '..', '..');
const TAB_NAVIGATOR_PATH = path.join(__dirname, '..', 'TabNavigator.tsx');
const TYPES_PATH = path.join(__dirname, '..', 'types.ts');

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.(tsx|ts)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function readRegisteredRoutes(): string[] {
  const source = fs.readFileSync(TAB_NAVIGATOR_PATH, 'utf8');
  const matches = [...source.matchAll(/<Stack\.Screen\s+name="([A-Za-z]+)"/g)];
  return matches.map((m) => m[1]);
}

function buildUsageCorpus(): string {
  // Excludes TabNavigator.tsx (the registration itself — every route name
  // trivially appears there) and types.ts (the type declaration — same
  // reason). Everything else in src/ counts as a potential entry point.
  const excluded = new Set([TAB_NAVIGATOR_PATH, TYPES_PATH]);
  return collectSourceFiles(SRC_ROOT)
    .filter((f) => !excluded.has(f))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
}

function hasEntryPoint(corpus: string, route: string): boolean {
  const patterns = [
    // navigation.navigate('X') / navigateTo('X') / runOnJS(navigateTo)('X')
    new RegExp(`navigate(?:To)?\\)?\\(\\s*['"]${route}['"]`),
    // dispatch-table entries: BUILT_IN_APPS values, Settings screen `route: 'X'`
    new RegExp(`:\\s*['"]${route}['"]\\s*[,}]`),
    new RegExp(`initialRouteName=['"]${route}['"]`),
  ];
  return patterns.some((p) => p.test(corpus));
}

describe('every registered route has a discoverable entry point (#442)', () => {
  // Pre-existing, unrelated to #442: MapsScreen is registered and typed but
  // has no caller anywhere (confirmed by hand — the only "Maps" text in the
  // app is a `title="Maps"` JSX prop and code comments, not a navigation
  // call). It is a separate bug with the same shape as this issue; fixing it
  // is out of scope here (see PR description). Documented explicitly instead
  // of silently excluded so this allowlist can't grow without a comment.
  const KNOWN_PRE_EXISTING_GAPS = ['Maps'];

  const registeredRoutes = readRegisteredRoutes();
  const corpus = buildUsageCorpus();

  it('registers a sane, non-empty set of routes to check (sanity check on the parser itself)', () => {
    expect(registeredRoutes.length).toBeGreaterThan(40);
    expect(registeredRoutes).toContain('HomeMain');
  });

  it('has no unreachable routes beyond the documented pre-existing gap', () => {
    const unreachable = registeredRoutes.filter((r) => !hasEntryPoint(corpus, r));
    expect(unreachable.slice().sort()).toEqual(KNOWN_PRE_EXISTING_GAPS.slice().sort());
  });

  it('Notes, Reminders, Mail and TodayView (this issue) each have an entry point now', () => {
    for (const route of ['Notes', 'Reminders', 'Mail', 'TodayView']) {
      expect(hasEntryPoint(corpus, route)).toBe(true);
    }
  });
});
