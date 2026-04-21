const { withGradleProperties } = require("expo/config-plugins");

/**
 * Raises Gradle JVM heap & metaspace so the Kotlin daemon doesn't run out of
 * Metaspace mid-build. The CI-reported defaults (2 GiB heap / 512 MiB metaspace)
 * aren't enough for this project's Kotlin compile + CMake workload.
 */
module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults;
    const jvmArgs =
      "-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8";

    const existing = props.find(
      (p) => p.type === "property" && p.key === "org.gradle.jvmargs",
    );
    if (existing) {
      existing.value = jvmArgs;
    } else {
      props.push({
        type: "property",
        key: "org.gradle.jvmargs",
        value: jvmArgs,
      });
    }
    return config;
  });
};
