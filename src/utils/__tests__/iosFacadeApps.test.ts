import {
  IOS_FACADE_APPS,
  IOS_FACADE_BY_PACKAGE,
  resolveFacadeTarget,
  resolveInstalledFacades,
  facadeHiddenPackages,
} from '../iosFacadeApps';

// Facades put an iOS name and icon on the home screen and launch the Android app
// behind it. The two properties that keep that honest are tested here: a facade
// with nothing installed must not appear at all, and the app it fronts must be
// the highest-preference one that IS installed — never a guess.

const pkg = (...names: string[]) => new Set(names);

describe('resolveFacadeTarget', () => {
  const music = IOS_FACADE_BY_PACKAGE['com.iostoandroid.music'];

  it('returns undefined when none of the candidates is installed', () => {
    expect(resolveFacadeTarget(music, pkg('com.example.unrelated'))).toBeUndefined();
  });

  it('returns the only installed candidate', () => {
    expect(resolveFacadeTarget(music, pkg('com.spotify.music'))).toBe('com.spotify.music');
  });

  it('prefers the earlier candidate when several are installed', () => {
    // Apple Music is first in the list precisely so a "Music" icon opens Apple
    // Music when it exists — anything else there would be misleading.
    expect(
      resolveFacadeTarget(music, pkg('com.spotify.music', 'com.apple.android.music')),
    ).toBe('com.apple.android.music');
  });

  it('ignores an empty install set', () => {
    expect(resolveFacadeTarget(music, pkg())).toBeUndefined();
  });
});

describe('resolveInstalledFacades', () => {
  it('omits every facade when nothing is installed — no dead icons', () => {
    expect(resolveInstalledFacades(pkg())).toEqual([]);
  });

  it('returns only the facades that resolve', () => {
    const result = resolveInstalledFacades(pkg('com.spotify.music'));
    const ids = result.map((r) => r.facade.packageName);
    expect(ids).toEqual(['com.iostoandroid.music']);
  });

  it('pairs each facade with its resolved target', () => {
    const result = resolveInstalledFacades(
      pkg('com.google.android.apps.magazines', 'com.netflix.mediaclient'),
    );
    const byId = Object.fromEntries(result.map((r) => [r.facade.packageName, r.target]));
    expect(byId['com.iostoandroid.news']).toBe('com.google.android.apps.magazines');
    expect(byId['com.iostoandroid.tv']).toBe('com.netflix.mediaclient');
  });

  it('keeps the declared facade order', () => {
    const all = new Set(IOS_FACADE_APPS.flatMap((f) => f.candidates));
    const ids = resolveInstalledFacades(all).map((r) => r.facade.packageName);
    expect(ids).toEqual(IOS_FACADE_APPS.map((f) => f.packageName));
  });
});

describe('facadeHiddenPackages', () => {
  it('hides the resolved target so the app appears once, under its iOS name', () => {
    expect(facadeHiddenPackages(pkg('com.google.android.apps.magazines'))).toEqual(
      new Set(['com.google.android.apps.magazines']),
    );
  });

  it('hides ONLY the resolved target, not every candidate', () => {
    // Both installed: Music opens Apple Music, so YouTube Music keeps its own
    // icon. Hiding all candidates would make an installed app vanish from the
    // home screen with no explanation.
    const hidden = facadeHiddenPackages(
      pkg('com.apple.android.music', 'com.google.android.apps.youtube.music'),
    );
    expect(hidden.has('com.apple.android.music')).toBe(true);
    expect(hidden.has('com.google.android.apps.youtube.music')).toBe(false);
  });

  it('hides nothing when no facade resolves', () => {
    expect(facadeHiddenPackages(pkg('com.example.unrelated')).size).toBe(0);
  });
});

describe('facade table shape', () => {
  it('namespaces every facade under com.iostoandroid so it cannot collide with a real package', () => {
    for (const f of IOS_FACADE_APPS) {
      expect(f.packageName.startsWith('com.iostoandroid.')).toBe(true);
    }
  });

  it('gives every facade at least one candidate', () => {
    for (const f of IOS_FACADE_APPS) {
      expect(f.candidates.length).toBeGreaterThan(0);
    }
  });

  it('never lists the same candidate twice within one facade', () => {
    for (const f of IOS_FACADE_APPS) {
      expect(new Set(f.candidates).size).toBe(f.candidates.length);
    }
  });

  it('never lists one package under two facades', () => {
    // A facade hides the app it fronts, so a shared candidate would steal that
    // app from the other facade: Spotify as a Podcasts candidate made an
    // installed Spotify disappear and come back as "Podcasts".
    const seen = new Map<string, string>();
    for (const f of IOS_FACADE_APPS) {
      for (const c of f.candidates) {
        expect(seen.has(c) ? `${c} also in ${seen.get(c)}` : c).toBe(c);
        seen.set(c, f.packageName);
      }
    }
  });

  it('IOS_FACADE_BY_PACKAGE indexes every facade', () => {
    for (const f of IOS_FACADE_APPS) {
      expect(IOS_FACADE_BY_PACKAGE[f.packageName]).toBe(f);
    }
  });
});
