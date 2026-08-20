import fs from 'fs';
import path from 'path';

// Static-analysis guard against a recurring bug shape in this repo: a screen
// added to the navigator with no textual trace of any code ever trying to
// reach it.
//
// #442 was one instance (Notes, Reminders and Mail were registered and typed
// but the only door was a Spotlight result built by filtering *existing*
// notes/reminders by title — on a clean install there was nothing to match).
// #455 is another: TodayViewScreen was registered with a `slide_from_left`
// transition clearly meant for a swipe gesture, but nothing ever called
// `navigate('TodayView')`, and there is no deep link either (app.json defines
// no `scheme`). #455 wires the right-swipe-on-the-first-home-page gesture that
// reaches it; the gesture lives in LauncherHomeScreen.tsx and calls
// `navigateTo('TodayView')` from the gesture's onEnd worklet.
//
// This file parses the registered route names out of TabNavigator.tsx and
// greps the rest of src/ for anything that looks like a real entry point (a
// literal `navigate('X')`/`navigateTo('X')` call — including
// `runOnJS(navigateTo)('X')` — a route embedded in a dispatch table like
// `BUILT_IN_APPS`/the Settings screen list — `key: 'X'` — or an
// `initialRouteName`). It cannot prove a route is reachable the way a
// rendered interaction test can; that is what
// LauncherHomeScreen.entryPoints.test.tsx (#442 icons) and
// LauncherHomeScreen.todayViewGesture.test.tsx (#455 gesture) do.
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

describe('every registered route has a discoverable entry point (#455)', () => {
  // Known gaps with the same shape, both explicitly out of scope here.
  // Documented rather than silently excluded so this allowlist can't grow
  // without a comment naming who owns each entry.
  //
  //  - 'Maps': MapsScreen is registered and typed but has no caller anywhere
  //    (confirmed by hand — the only "Maps" text in the app is a
  //    `title="Maps"` JSX prop and code comments, not a navigation call).
  //    Pre-existing, unrelated to #455, no owning issue yet.
  //  - 'AppLibrary': became a gap on main, not here. #434/#458 turned the last
  //    home page into the App Library rendered *inline* via the shared
  //    `AppLibraryContent`, so nothing navigates to the `AppLibrary` stack
  //    route any more — only the screen registration in TabNavigator.tsx and
  //    the type in types.ts are left. Reproduced with this issue's fix both
  //    applied and reverted, so it is not caused by #455; unrelated and
  //    unowned, flagged here rather than silenced.
  //
  // 'TodayView' used to be on this list (added by #442 when the work was
  // re-scoped out of it). #455 is that owning issue, and it has now landed —
  // hence its removal from the allowlist and the dedicated case below.
  const KNOWN_PRE_EXISTING_GAPS = ['AppLibrary', 'Maps'];

  const registeredRoutes = readRegisteredRoutes();
  const corpus = buildUsageCorpus();

  it('registers a sane, non-empty set of routes to check (sanity check on the parser itself)', () => {
    expect(registeredRoutes.length).toBeGreaterThan(40);
    expect(registeredRoutes).toContain('HomeMain');
  });

  it('has no unreachable routes beyond the documented pre-existing gaps', () => {
    const unreachable = registeredRoutes.filter((r) => !hasEntryPoint(corpus, r));
    expect(unreachable.slice().sort()).toEqual(KNOWN_PRE_EXISTING_GAPS.slice().sort());
  });

  it('TodayView (this issue) has an entry point and is not parked on the allowlist', () => {
    // Not redundant with the assertion above, and deliberately shaped to fail
    // apart from it: the set assertion compares against KNOWN_PRE_EXISTING_GAPS,
    // so re-adding 'TodayView' to that array would make it pass again while
    // this issue silently regressed. That is exactly what happened once already
    // (#442 parked TodayView on the allowlist when the work was re-scoped out).
    // These two assertions pin the regression from both sides.
    expect(hasEntryPoint(corpus, 'TodayView')).toBe(true);
    expect(KNOWN_PRE_EXISTING_GAPS).not.toContain('TodayView');
  });

  // There is deliberately NO `expect(hasEntryPoint(corpus, 'Notes')).toBe(true)`
  // case for the #442 routes. An earlier revision had one, and it was wrong
  // twice over:
  //
  //  1. It was vacuous. It passed with the #442 fix fully reverted, because
  //     SpotlightSearchScreen.tsx already contains literal `navigate('Notes')`
  //     / `('Reminders')` / `('Mail')` calls — the corpus matched those, not
  //     the BUILT_IN_APPS entries. A green tick there proved nothing while
  //     reading as if it did.
  //  2. It was redundant. The set assertion above already pins the unreachable
  //     set, so the two could never fail apart.
  //
  // The TodayView case above avoids both traps: before this issue's fix there
  // was no `navigate('TodayView')` anywhere in src/ (verified by reverting the
  // fix — see the PR's red step), and its second assertion guards the
  // allowlist itself, which the set assertion cannot.
});
