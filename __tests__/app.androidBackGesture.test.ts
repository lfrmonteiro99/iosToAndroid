import appConfig from '../app.json';

// Issue #437: the Android hardware/gesture back button never navigated back
// on any screen. Root cause: app.json set
// `expo.android.predictiveBackGestureEnabled: true`, which the Expo config
// plugin (@expo/config-plugins/build/android/PredictiveBackGesture.js) turns
// into `android:enableOnBackInvokedCallback="true"` on <application> in the
// generated AndroidManifest.xml. That opts the whole app into Android's
// predictive-back / OnBackInvokedCallback dispatch. React Native's own
// bridge from the legacy Activity.onBackPressed() (which is what
// @react-navigation/native's NavigationContainer listens to via
// BackHandler.addEventListener('hardwareBackPress', ...) to call
// navigation.goBack()) only re-registers itself for the new dispatcher when
// targetSdk >= 36 (see react-native/ReactAndroid .../ReactActivity.java,
// `AndroidVersion.isAtLeastTargetSdk36`). This project's targetSdk (Expo SDK
// 54 default) is 35, so with the flag on, no back-press event ever reached
// JS — react-navigation's already-correct automatic back handling never got
// a chance to run.
describe('Android predictive-back gesture config (issue #437)', () => {
  it('does not opt the app into predictive-back dispatch, so hardware back reaches React Native', () => {
    expect(appConfig.expo.android.predictiveBackGestureEnabled).not.toBe(true);
  });
});
