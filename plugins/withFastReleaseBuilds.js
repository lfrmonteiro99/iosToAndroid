const { withGradleProperties, withProjectBuildGradle } = require("expo/config-plugins");

/**
 * Trims the release APK build, which is the long pole of every CI run: on the
 * v1.114.0 job the whole thing took 18m03s, of which `./gradlew assembleRelease`
 * was 16m55s and reported "696 actionable tasks: 696 executed" — nothing reused.
 *
 * - `org.gradle.caching` lets Gradle reuse task outputs across runs. CI restores
 *   ~/.gradle between jobs, so the Kotlin/Java/resource/jar tasks (including the
 *   Expo included-build plugins) come back from the cache instead of being
 *   recompiled. CMake/externalNativeBuild is NOT cacheable by Gradle, so the C++
 *   work is unaffected — that one is cut by the ABI list the workflows pass via
 *   `-PreactNativeArchitectures`.
 * - AGP runs `lintVital*` for every module on a release build (~100s of that job:
 *   expo-constants 30s, gesture-handler 19s, expo-speech 11s, …). We lint JS/TS
 *   separately with eslint + tsc and never read Android lint's report, so release
 *   builds opt out of it. Debug builds are untouched.
 */

const LINT_MARKER = "// withFastReleaseBuilds: skip Android lint on release builds";

const LINT_BLOCK = `${LINT_MARKER}
subprojects { subproject ->
  ["com.android.application", "com.android.library"].each { pluginId ->
    subproject.plugins.withId(pluginId) {
      subproject.android {
        lint {
          checkReleaseBuilds = false
        }
      }
    }
  }
}
`;

/** Appends the lint opt-out to the root build.gradle, once. */
function addReleaseLintOptOut(contents) {
  if (contents.includes(LINT_MARKER)) {
    return contents;
  }
  return `${contents.trimEnd()}\n\n${LINT_BLOCK}`;
}

/** Sets `key` in a gradle.properties modResults array, replacing any existing entry. */
function upsertGradleProperty(properties, key, value) {
  const existing = properties.find((p) => p.type === "property" && p.key === key);
  if (existing) {
    existing.value = value;
  } else {
    properties.push({ type: "property", key, value });
  }
  return properties;
}

module.exports = function withFastReleaseBuilds(config) {
  config = withGradleProperties(config, (config) => {
    upsertGradleProperty(config.modResults, "org.gradle.caching", "true");
    return config;
  });

  return withProjectBuildGradle(config, (config) => {
    config.modResults.contents = addReleaseLintOptOut(config.modResults.contents);
    return config;
  });
};

module.exports.addReleaseLintOptOut = addReleaseLintOptOut;
module.exports.upsertGradleProperty = upsertGradleProperty;
module.exports.LINT_MARKER = LINT_MARKER;
