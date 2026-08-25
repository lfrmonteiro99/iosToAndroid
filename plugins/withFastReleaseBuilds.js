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
 *   builds skip those tasks. Debug builds are untouched.
 *
 *   This disables the tasks rather than setting `android.lint.checkReleaseBuilds`:
 *   AGP has already read that flag by the time a `plugins.withId` callback runs,
 *   so writing it fails the configuration phase outright with "It is too late to
 *   set checkReleaseBuilds". Task state has no such window — `configureEach` is
 *   lazy, so it applies whenever each task is realized.
 */

const LINT_MARKER = "// withFastReleaseBuilds: skip Android lint on release builds";

const LINT_BLOCK = `${LINT_MARKER}
subprojects { subproject ->
  subproject.tasks.matching { it.name.startsWith("lintVital") }.configureEach {
    it.enabled = false
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
