const { withAndroidManifest } = require("expo/config-plugins");

/**
 * Adds CATEGORY_HOME and CATEGORY_DEFAULT intent filters to the main activity,
 * making this app eligible to be selected as the default home launcher.
 */
module.exports = function withLauncherIntent(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const mainActivity = manifest.manifest.application[0].activity?.find(
      (activity) => activity.$["android:name"] === ".MainActivity"
    );

    if (!mainActivity) return config;

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
};
