const {
  applyManifestMod,
  applyMainActivityMod,
} = require("../withLauncherIntent");

// This suite used to read android/app/src/main/AndroidManifest.xml. That file is
// an `expo prebuild` ARTEFACT and is gitignored (.gitignore:42), so the tests
// passed only on a machine that happened to have prebuilt and failed with ENOENT
// on every clean checkout — CI included. They also asserted the generated file
// rather than the plugin, which meant the intent-filter logic had no coverage at
// all. Now the plugin's two transforms are exercised directly against fixtures,
// the way plugins/__tests__/withFastReleaseBuilds.test.js already does.

/** A MainActivity entry as expo's manifest parser hands it over. */
function mainActivity(extra = {}) {
  return { $: { "android:name": ".MainActivity" }, ...extra };
}

function manifestWith(...activities) {
  return { manifest: { application: [{ activity: activities }] } };
}

function findMain(manifest) {
  return manifest.manifest.application[0].activity.find(
    (a) => a.$["android:name"] === ".MainActivity"
  );
}

function homeFilters(activity) {
  return (activity["intent-filter"] ?? []).filter((f) =>
    f.category?.some(
      (c) => c.$["android:name"] === "android.intent.category.HOME"
    )
  );
}

describe("applyManifestMod", () => {
  it("adds stateNotNeeded to MainActivity", () => {
    const result = applyManifestMod(manifestWith(mainActivity()));
    expect(findMain(result).$["android:stateNotNeeded"]).toBe("true");
  });

  it("adds excludeFromRecents to MainActivity", () => {
    const result = applyManifestMod(manifestWith(mainActivity()));
    expect(findMain(result).$["android:excludeFromRecents"]).toBe("true");
  });

  it("puts both attributes on the SAME activity element", () => {
    // The original intent of this assertion: the two attributes are useless if
    // they land on different activities.
    const result = applyManifestMod(
      manifestWith(mainActivity(), { $: { "android:name": ".OtherActivity" } })
    );
    const main = findMain(result);
    expect(main.$["android:stateNotNeeded"]).toBe("true");
    expect(main.$["android:excludeFromRecents"]).toBe("true");

    const other = result.manifest.application[0].activity.find(
      (a) => a.$["android:name"] === ".OtherActivity"
    );
    expect(other.$["android:stateNotNeeded"]).toBeUndefined();
  });

  it("adds the HOME + DEFAULT intent filter that makes the app selectable as a launcher", () => {
    // Never covered before: this is the whole point of the plugin.
    const result = applyManifestMod(manifestWith(mainActivity()));
    const filters = homeFilters(findMain(result));
    expect(filters).toHaveLength(1);

    const categories = filters[0].category.map((c) => c.$["android:name"]);
    expect(categories).toContain("android.intent.category.HOME");
    expect(categories).toContain("android.intent.category.DEFAULT");
    expect(filters[0].action[0].$["android:name"]).toBe(
      "android.intent.action.MAIN"
    );
  });

  it("does not add a second HOME filter when one is already present", () => {
    // `expo prebuild` without --clean re-applies plugins over the existing
    // manifest, so a non-idempotent mod would accumulate duplicate filters.
    const once = applyManifestMod(manifestWith(mainActivity()));
    const twice = applyManifestMod(once);
    expect(homeFilters(findMain(twice))).toHaveLength(1);
  });

  it("preserves an unrelated intent filter that was already there", () => {
    const existing = {
      action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
      category: [{ $: { "android:name": "android.intent.category.BROWSABLE" } }],
    };
    const result = applyManifestMod(
      manifestWith(mainActivity({ "intent-filter": [existing] }))
    );
    expect(findMain(result)["intent-filter"]).toContain(existing);
    expect(homeFilters(findMain(result))).toHaveLength(1);
  });

  it("is a no-op when there is no MainActivity, rather than throwing", () => {
    const manifest = manifestWith({ $: { "android:name": ".OtherActivity" } });
    expect(() => applyManifestMod(manifest)).not.toThrow();
    expect(manifest.manifest.application[0].activity[0].$["android:stateNotNeeded"]).toBeUndefined();
  });
});

describe("applyMainActivityMod", () => {
  const bareActivity = [
    "package com.iostoandroid.launcher",
    "",
    "import expo.modules.ReactActivityDelegateWrapper",
    "",
    "class MainActivity : ReactActivity() {",
    "  override fun getMainComponentName(): String = \"main\"",
    "}",
    "",
  ].join("\n");

  it("adds the onNewIntent override", () => {
    // Without this, a HOME press while the launcher is already foreground was
    // silently dropped (#508) — singleTask does not recreate the Activity.
    const result = applyMainActivityMod(bareActivity);
    expect(result).toContain("override fun onNewIntent(intent: Intent)");
    expect(result).toContain("setIntent(intent)");
  });

  it("only emits for CATEGORY_HOME, not every re-delivered intent", () => {
    const result = applyMainActivityMod(bareActivity);
    expect(result).toContain("intent.hasCategory(Intent.CATEGORY_HOME)");
    expect(result).toContain('LauncherModule.emitEvent("onHomePressed"');
  });

  it("adds the imports the override needs", () => {
    const result = applyMainActivityMod(bareActivity);
    expect(result).toContain("import android.content.Intent");
    expect(result).toContain("import com.iostoandroid.launcher.LauncherModule");
  });

  it("keeps the override inside the class body", () => {
    // Inserted at the LAST brace, so a bug here would put it after the class.
    const result = applyMainActivityMod(bareActivity);
    const classStart = result.indexOf("class MainActivity");
    const overrideAt = result.indexOf("override fun onNewIntent");
    expect(overrideAt).toBeGreaterThan(classStart);
    expect(result.trimEnd().endsWith("}")).toBe(true);
  });

  it("leaves the existing contents intact", () => {
    const result = applyMainActivityMod(bareActivity);
    expect(result).toContain("package com.iostoandroid.launcher");
    expect(result).toContain("import expo.modules.ReactActivityDelegateWrapper");
    expect(result).toContain('override fun getMainComponentName(): String = "main"');
  });

  it("is idempotent — a second run adds nothing", () => {
    const once = applyMainActivityMod(bareActivity);
    const twice = applyMainActivityMod(once);
    expect(twice).toBe(once);
    expect(twice.match(/override fun onNewIntent/g)).toHaveLength(1);
  });

  it("does not duplicate an import that is already present", () => {
    const withImport = bareActivity.replace(
      "package com.iostoandroid.launcher\n",
      "package com.iostoandroid.launcher\nimport android.content.Intent\n"
    );
    const result = applyMainActivityMod(withImport);
    expect(result.match(/import android\.content\.Intent/g)).toHaveLength(1);
  });
});
