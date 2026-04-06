const { withProjectBuildGradle } = require("expo/config-plugins");

/**
 * Adds the AsyncStorage local Maven repository to the project-level build.gradle.
 * AsyncStorage v3+ ships a KMP artifact (storage-android) in a local_repo directory
 * that Gradle needs to resolve.
 */
module.exports = function withAsyncStorageRepo(config) {
  return withProjectBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    const repoLine =
      'maven { url(new File(["node", "--print", "require.resolve(\'@react-native-async-storage/async-storage/package.json\')"].execute(null, rootDir).text.trim(), "../android/local_repo")) }';

    if (!contents.includes("asyncstorage") && !contents.includes("shared_storage")) {
      config.modResults.contents = contents.replace(
        /allprojects\s*\{\s*repositories\s*\{/,
        `allprojects {\n    repositories {\n        ${repoLine}`
      );
    }
    return config;
  });
};
