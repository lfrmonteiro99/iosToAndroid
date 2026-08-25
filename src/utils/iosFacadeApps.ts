/**
 * iOS facades over installed Android apps.
 *
 * Music, News, TV and Podcasts are iOS stock apps this launcher does not
 * implement — but the Android equivalents are already on the device. Rather
 * than write four media apps (or ship four icons that open nothing), a facade
 * puts the iOS name and the iOS icon on the home screen and launches the real
 * Android app behind it.
 *
 * This is the INVERSE of BUILT_IN_APP_ANDROID_ALIASES (builtInAppRoutes.ts).
 * There, a built-in screen exists and the Android duplicate is HIDDEN from the
 * grid so you don't get two "Phone" icons. Here there is no built-in screen, so
 * the Android app is what actually runs and its own icon is hidden instead —
 * same goal (one icon per function, wearing the iOS look), opposite direction.
 *
 * Two rules keep this honest:
 *
 *  - A facade only appears when one of its candidate packages is actually
 *    installed. An icon that opens nothing is worse than no icon.
 *  - `candidates` is an explicit, ordered preference list, never a heuristic.
 *    Guessing from package names would eventually put the wrong app behind an
 *    Apple label, and the user cannot tell from the home screen that it
 *    happened.
 *  - No package appears under two facades. Spotify was briefly listed as a
 *    last-resort Podcasts candidate, which meant installing Spotify alone made
 *    it vanish from the grid and come back as "Podcasts" — the facade hides the
 *    app it fronts, so a shared candidate steals it from the other facade. The
 *    `facade table shape` test enforces this.
 */

/** A single iOS-branded facade over whichever candidate is installed. */
export interface IosFacadeApp {
  /**
   * Our own virtual package id. Namespaced under com.iostoandroid.* like the
   * built-ins so it can never collide with a real installed package, and so
   * VIRTUAL_APP_PACKAGE_NAMES keeps it out of "real installed apps" views.
   */
  packageName: string;
  /** The iOS name shown under the icon. */
  name: string;
  /**
   * Android packages that can serve this facade, best first. The first one
   * installed wins; if none is installed the facade is not shown at all.
   */
  candidates: readonly string[];
}

export const IOS_FACADE_APPS: readonly IosFacadeApp[] = [
  {
    packageName: 'com.iostoandroid.music',
    name: 'Music',
    candidates: [
      // Apple Music first: when it is installed, an "Music" icon that opens
      // anything else would be actively misleading.
      'com.apple.android.music',
      'com.google.android.apps.youtube.music',
      'com.spotify.music',
      'deezer.android.app',
      'com.aspiro.tidal',
      'com.amazon.mp3',
    ],
  },
  {
    packageName: 'com.iostoandroid.news',
    name: 'News',
    candidates: [
      'com.google.android.apps.magazines', // Google News
      'flipboard.app',
      'com.microsoft.amp.apps.bingnews',
      'com.particlenews.newsbreak',
    ],
  },
  {
    packageName: 'com.iostoandroid.tv',
    name: 'TV',
    candidates: [
      'com.apple.atve.androidtv.appletv', // Apple TV
      'com.apple.atve.android.appletv',
      'com.google.android.videos', // Google TV / Play Movies
      'com.netflix.mediaclient',
      'com.amazon.avod.thirdpartyclient',
      'com.disney.disneyplus',
    ],
  },
  {
    packageName: 'com.iostoandroid.podcasts',
    name: 'Podcasts',
    candidates: [
      'com.google.android.apps.podcasts', // Google Podcasts
      'au.com.shiftyjelly.pocketcasts',
      'fm.player',
      'de.danoeh.antennapod',
      'com.podcast.podcasts',
    ],
  },
];

/** Facade id -> facade, for O(1) lookup from a press handler. */
export const IOS_FACADE_BY_PACKAGE: Record<string, IosFacadeApp> = Object.fromEntries(
  IOS_FACADE_APPS.map((f) => [f.packageName, f]),
);

/**
 * The Android package a facade should launch, or `undefined` when none of its
 * candidates is installed.
 *
 * `installed` is the set of package names from the native scan (AppsStore's
 * `apps`). Passing a Set rather than the app array keeps this a pure function
 * with no knowledge of InstalledApp, so it is testable on its own.
 */
export function resolveFacadeTarget(
  facade: IosFacadeApp,
  installed: ReadonlySet<string>,
): string | undefined {
  return facade.candidates.find((pkg) => installed.has(pkg));
}

/**
 * Every facade that has an installed target, paired with that target.
 *
 * The home grid renders exactly this list: a facade whose candidates are all
 * missing is omitted rather than shown as a dead icon.
 */
export function resolveInstalledFacades(
  installed: ReadonlySet<string>,
): { facade: IosFacadeApp; target: string }[] {
  const out: { facade: IosFacadeApp; target: string }[] = [];
  for (const facade of IOS_FACADE_APPS) {
    const target = resolveFacadeTarget(facade, installed);
    if (target) out.push({ facade, target });
  }
  return out;
}

/**
 * Android packages to hide from the grid because a facade is already showing
 * them under an iOS name.
 *
 * Only the RESOLVED target is hidden, not every candidate: if both Spotify and
 * YouTube Music are installed, Music launches one of them and the other is
 * still a real app the user may want its own icon for. Hiding all candidates
 * would silently make apps disappear.
 */
export function facadeHiddenPackages(installed: ReadonlySet<string>): Set<string> {
  return new Set(resolveInstalledFacades(installed).map((r) => r.target));
}
