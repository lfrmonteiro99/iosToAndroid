import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import { BUILT_IN_APPS } from '../screens/LauncherHomeScreen';

type Navigate = NavigationProp<ParamListBase>['navigate'];

/**
 * Launch an app by packageName from any surface (Spotlight, App Library, …).
 *
 * Built-in virtual apps (`com.iostoandroid.*`, see `BUILT_IN_APPS`) must open
 * the in-app iOS-style screen via `navigation.navigate`, exactly like the home
 * grid does (LauncherHomeScreen.handleAppPress, SiriScreen). Launching them
 * through the native `launchApp` bridge is wrong: those package names are not
 * installed Android apps, so the bridge either fails or — worse — resolves to
 * the real system launcher and the user lands on the Android home screen
 * instead of the Weather/Calculator/… content.
 *
 * Only genuine external (non-built-in) apps fall through to the native launch.
 */
export function launchBuiltInOrExternal(
  packageName: string,
  navigation: { navigate: Navigate },
  launchExternal: (packageName: string) => void | Promise<unknown>,
): void {
  const internalRoute = BUILT_IN_APPS[packageName];
  if (internalRoute) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- built-in routes are parameterless
    navigation.navigate(internalRoute as any);
    return;
  }
  void launchExternal(packageName);
}
