const {
  addReleaseLintOptOut,
  upsertGradleProperty,
  LINT_MARKER,
} = require("../withFastReleaseBuilds");

describe("withFastReleaseBuilds plugin", () => {
  describe("addReleaseLintOptOut", () => {
    const rootBuildGradle = [
      "buildscript {",
      "  repositories { google() }",
      "}",
      "",
      'apply plugin: "expo-root-project"',
      "",
    ].join("\n");

    it("appends the lint opt-out to the root build.gradle", () => {
      const result = addReleaseLintOptOut(rootBuildGradle);

      expect(result).toContain(LINT_MARKER);
      expect(result).toContain("it.enabled = false");
      // The original contents survive.
      expect(result).toContain('apply plugin: "expo-root-project"');
    });

    it("disables the tasks instead of writing the AGP lint DSL", () => {
      const result = addReleaseLintOptOut(rootBuildGradle);

      // Setting android.lint.checkReleaseBuilds from a plugin callback fails the
      // configuration phase — AGP has already read the flag by then.
      expect(result).not.toContain("checkReleaseBuilds");
      expect(result).toContain('it.name.startsWith("lintVital")');
      expect(result).toContain("configureEach");
    });

    it("is idempotent when prebuild runs without --clean", () => {
      const once = addReleaseLintOptOut(rootBuildGradle);
      const twice = addReleaseLintOptOut(once);

      expect(twice).toBe(once);
      expect(twice.split("lintVital").length - 1).toBe(1);
    });
  });

  describe("upsertGradleProperty", () => {
    it("adds the property when it is missing", () => {
      const properties = [{ type: "property", key: "android.useAndroidX", value: "true" }];

      upsertGradleProperty(properties, "org.gradle.caching", "true");

      expect(properties).toContainEqual({
        type: "property",
        key: "org.gradle.caching",
        value: "true",
      });
    });

    it("replaces an existing value instead of duplicating the key", () => {
      const properties = [{ type: "property", key: "org.gradle.caching", value: "false" }];

      upsertGradleProperty(properties, "org.gradle.caching", "true");

      expect(properties).toHaveLength(1);
      expect(properties[0].value).toBe("true");
    });

    it("ignores comment entries that happen to carry the same key", () => {
      const properties = [
        { type: "comment", value: "org.gradle.caching=false" },
        { type: "property", key: "org.gradle.caching", value: "false" },
      ];

      upsertGradleProperty(properties, "org.gradle.caching", "true");

      expect(properties).toHaveLength(2);
      expect(properties[1].value).toBe("true");
    });
  });
});
