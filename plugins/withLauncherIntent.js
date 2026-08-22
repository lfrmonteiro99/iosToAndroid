const { withAndroidManifest, withMainActivity } = require("expo/config-plugins");

/**
 * Adds CATEGORY_HOME and CATEGORY_DEFAULT intent filters to the main activity,
 * making this app eligible to be selected as the default home launcher, and
 * makes MainActivity react when Android re-delivers that intent.
 *
 * android:launchMode="singleTask" (Expo's default) means a second HOME press
 * while this Activity is already on top does NOT recreate it — Android calls
 * onNewIntent() on the existing instance instead. The bare template doesn't
 * override that method, so the intent was silently dropped and HOME did
 * nothing whenever the launcher was already in the foreground (#508).
 */
module.exports = function withLauncherIntent(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const mainActivity = manifest.manifest.application[0].activity?.find(
      (activity) => activity.$["android:name"] === ".MainActivity"
    );

    if (!mainActivity) return config;

    // Add stateNotNeeded and excludeFromRecents attributes per §6.1
    mainActivity.$["android:stateNotNeeded"] = "true";
    mainActivity.$["android:excludeFromRecents"] = "true";

    // Ensure intent-filter array exists
    if (!mainActivity["intent-filter"]) {
      mainActivity["intent-filter"] = [];
    }

    // Check if HOME category already exists
    const hasHomeFilter = mainActivity["intent-filter"].some((filter) =>
      filter.category?.some(
        (cat) => cat.$["android:name"] === "android.intent.category.HOME"
      )
    );

    if (!hasHomeFilter) {
      mainActivity["intent-filter"].push({
        action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
        category: [
          { $: { "android:name": "android.intent.category.HOME" } },
          { $: { "android:name": "android.intent.category.DEFAULT" } },
        ],
      });
    }

    return config;
  });

  config = withMainActivity(config, (config) => {
    const mod = config.modResults;
    // Kotlin only — the Java template variant isn't used by this project,
    // and the string patches below are Kotlin syntax.
    if (mod.language !== "kt") return config;

    let { contents } = mod;

    if (!contents.includes("override fun onNewIntent(")) {
      if (!contents.includes("import android.content.Intent")) {
        contents = contents.replace(
          /^package [\w.]+\n/m,
          (packageLine) => `${packageLine}\nimport android.content.Intent`
        );
      }
      if (!contents.includes("import com.iostoandroid.launcher.LauncherModule")) {
        contents = contents.replace(
          /^package [\w.]+\n/m,
          (packageLine) => `${packageLine}\nimport com.iostoandroid.launcher.LauncherModule`
        );
      }

      // Only CATEGORY_HOME reacts — singleTask re-delivers onNewIntent for
      // other reasons too (e.g. a launcher-picker relaunch), and resetting
      // the UI on every one of those would produce spurious jumps back to
      // the first page.
      const onNewIntentOverride = `
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    if (intent.hasCategory(Intent.CATEGORY_HOME)) {
      LauncherModule.emitEvent("onHomePressed", android.os.Bundle())
    }
  }
`;
      const lastBraceIndex = contents.lastIndexOf("}");
      contents =
        contents.slice(0, lastBraceIndex) +
        onNewIntentOverride +
        contents.slice(lastBraceIndex);
    }

    mod.contents = contents;
    return config;
  });

  return config;
};
