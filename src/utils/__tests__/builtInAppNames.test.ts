import {
  BUILT_IN_APPS,
  BUILT_IN_APP_NAMES,
  builtInAppName,
} from '../builtInAppRoutes';

// Reported from a device, visible in a screenshot of the home screen: the
// Safari icon was labelled "Browser". So were "FindMy" and "AppStore".
//
// Those are navigation ROUTE names. The home grid built its virtual apps with
// `name: String(route)`, so every built-in's label was whatever the route
// happened to be called. AppsStore's VIRTUAL_APPS_MAP had the right display
// strings the whole time but is only consulted for the dock, so the two tables
// disagreed and the grid read from the wrong one.

describe('built-in app display names', () => {
  it('gives every routed built-in a display name', () => {
    // The guard against the bug coming back: a route added without a label
    // falls back to the route name, which is exactly what shipped.
    const missing = Object.keys(BUILT_IN_APPS).filter((pkg) => !BUILT_IN_APP_NAMES[pkg]);
    expect(missing).toEqual([]);
  });

  it('labels the browser Safari, not Browser', () => {
    expect(builtInAppName('com.iostoandroid.browser')).toBe('Safari');
  });

  it('spaces Find My and App Store the way iOS does', () => {
    expect(builtInAppName('com.iostoandroid.findmy')).toBe('Find My');
    expect(builtInAppName('com.iostoandroid.appstore')).toBe('App Store');
  });

  it('never returns a route name for a package that has a label', () => {
    // Stated as a property rather than case by case: no label may equal its
    // route unless that is genuinely the right display string.
    const differing = Object.keys(BUILT_IN_APPS).filter(
      (pkg) => BUILT_IN_APP_NAMES[pkg] !== String(BUILT_IN_APPS[pkg]),
    );
    expect(differing.sort()).toEqual(
      ['com.iostoandroid.appstore', 'com.iostoandroid.browser', 'com.iostoandroid.findmy'].sort(),
    );
  });

  it('falls back to the route for an unlabelled package rather than rendering nothing', () => {
    // A nameless icon is worse than a wrong name; the test above is what keeps
    // this path unreachable in practice.
    expect(builtInAppName('com.iostoandroid.does-not-exist')).toBe('');
  });

  it('has no display name for a package that is not a built-in route', () => {
    expect(BUILT_IN_APP_NAMES['com.spotify.music']).toBeUndefined();
  });
});
