import fs from 'fs';
import path from 'path';

// #442: Notes, Reminders and Mail were registered in TabNavigator and typed
// in RootStackParamList, but the only way in was a Spotlight result built by
// filtering *existing* notes/reminders by title — on a clean install there was
// nothing to match, so the screens could never be opened (see the issue's
// escalation comment).
//
// This is a static-analysis guard, not a rendering test: it parses the
// registered route names out of TabNavigator.tsx and greps the rest of src/
// for anything that looks like a real entry point (a literal
// `navigate('X')`/`navigateTo('X')` call, a route embedded in a dispatch
// table like `BUILT_IN_APPS`/the Settings screen list — `key: 'X'` — or an
// `initialRouteName`). It cannot prove a route is reachable in the way a
// rendered interaction test can (that's what
// LauncherHomeScreen.entryPoints.test.tsx does for the three routes this
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
  // Known gaps with the same shape as this issue, both explicitly out of
  // scope here. Documented rather than silently excluded so this allowlist
  // can't grow without a comment naming who owns each entry.
  //
  //  - 'Maps': MapsScreen is registered and typed but has no caller anywhere
  //    (confirmed by hand — the only "Maps" text in the app is a
  //    `title="Maps"` JSX prop and code comments, not a navigation call).
  //    Pre-existing, unrelated to #442, no owning issue yet.
  //  - 'TodayView': registered with a `slide_from_left` transition and never
  //    navigated to. Re-scoped out of #442 into #455, which owns the product
  //    decision (edge gesture vs. icon vs. removal). Remove from this list
  //    when #455 lands.
  //  - 'AppLibrary': became a gap on main, not here. #434/#458 turned the last
  //    home page into the App Library rendered *inline* via the shared
  //    `AppLibraryContent` (LauncherHomeScreen.tsx:1222), so nothing navigates
  //    to the `AppLibrary` stack route any more — only the screen registration
  //    in TabNavigator.tsx:137 and the type in types.ts:59 are left. Reproduced
  //    with this issue's fix both applied and reverted, so it is not caused by
  //    #442; unrelated and unowned, flagged here rather than silenced.
  const KNOWN_PRE_EXISTING_GAPS = ['AppLibrary', 'Maps', 'TodayView'];

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

  // There is deliberately NO `expect(hasEntryPoint(corpus, 'Notes')).toBe(true)`
  // case here. An earlier revision had one, and it was wrong twice over:
  //
  //  1. It was vacuous. It passed with the #442 fix fully reverted, because
  //     SpotlightSearchScreen.tsx already contains literal `navigate('Notes')`
  //     / `('Reminders')` / `('Mail')` calls — the corpus matched those, not
  //     the new BUILT_IN_APPS entries. A green tick there proved nothing about
  //     this issue's acceptance while reading as if it did.
  //  2. It was redundant. The assertion above already pins the unreachable set
  //     to exactly ['Maps', 'TodayView']; any route outside that list having no
  //     entry point fails there first, so the two could never fail apart.
  //
  // What actually proves the #442 acceptance is the rendered interaction test —
  // src/screens/__tests__/LauncherHomeScreen.entryPoints.test.tsx — which mounts
  // the real LauncherHomeScreen, finds the icons, and presses them.
});
