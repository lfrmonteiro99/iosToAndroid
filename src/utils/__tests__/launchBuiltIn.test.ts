import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { launchBuiltInOrExternal } from '../launchBuiltIn';
import { BUILT_IN_APPS } from '../../screens/LauncherHomeScreen';

type Navigate = NavigationProp<ParamListBase>['navigate'];

// A real navigation stub — tracks which route navigate() was called with so we
// can assert a built-in app opened the in-app screen, not the native bridge.
function makeNavigation() {
  const navigated: string[] = [];
  const navigate = ((route: string) => {
    navigated.push(route);
  }) as Navigate;
  return { navigated, navigation: { navigate } };
}

describe('launchBuiltInOrExternal', () => {
  it('routes a built-in app (Weather) to the in-app screen, not the native bridge', () => {
    const { navigated, navigation } = makeNavigation();
    const launchExternal = jest.fn();

    launchBuiltInOrExternal('com.iostoandroid.weather', navigation, launchExternal);

    // The internal Weather screen must have opened.
    expect(navigated).toContain('Weather');
    // And the native launcher bridge must NOT have been used — that is what
    // made the user land on the Android home screen instead of weather content.
    expect(launchExternal).not.toHaveBeenCalled();
  });

  it('routes every built-in app to its internal route via navigate', () => {
    const { navigated, navigation } = makeNavigation();
    const launchExternal = jest.fn();

    Object.keys(BUILT_IN_APPS).forEach((pkg) => {
      launchBuiltInOrExternal(pkg, navigation, launchExternal);
    });

    // Every built-in must have been routed internally.
    Object.values(BUILT_IN_APPS).forEach((route) => {
      expect(navigated).toContain(route);
    });
    expect(launchExternal).not.toHaveBeenCalled();
  });

  it('falls through to the native bridge for a real external app', () => {
    const { navigated, navigation } = makeNavigation();
    const launchExternal = jest.fn();

    launchBuiltInOrExternal('com.google.android.gm', navigation, launchExternal);

    // No internal route exists for an external app…
    expect(navigated).toHaveLength(0);
    // …so it must be handed to the native launcher.
    expect(launchExternal).toHaveBeenCalledWith('com.google.android.gm');
  });

  it('does NOT route an unknown built-in-like package to an internal screen', () => {
    const { navigated, navigation } = makeNavigation();
    const launchExternal = jest.fn();

    // A package that looks like ours but is NOT in BUILT_IN_APPS.
    launchBuiltInOrExternal('com.iostoandroid.unknown', navigation, launchExternal);

    expect(navigated).toHaveLength(0);
    expect(launchExternal).toHaveBeenCalledWith('com.iostoandroid.unknown');
  });
});
