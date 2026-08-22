const { readFileSync } = require("fs");
const { join } = require("path");
const { parseStringPromise } = require("xml2js");

describe("withLauncherIntent plugin", () => {
  it("should add stateNotNeeded attribute to MainActivity", () => {
    const manifestPath = join(process.cwd(), "android/app/src/main/AndroidManifest.xml");
    const manifestContent = readFileSync(manifestPath, "utf-8");
    expect(manifestContent).toContain('android:stateNotNeeded="true"');
  });

  it("should add excludeFromRecents attribute to MainActivity", () => {
    const manifestPath = join(process.cwd(), "android/app/src/main/AndroidManifest.xml");
    const manifestContent = readFileSync(manifestPath, "utf-8");
    expect(manifestContent).toContain('android:excludeFromRecents="true"');
  });

  it("should have both attributes in the same activity element", async () => {
    const manifestPath = join(process.cwd(), "android/app/src/main/AndroidManifest.xml");
    const manifestContent = readFileSync(manifestPath, "utf-8");
    const { manifest } = await parseStringPromise(manifestContent);
    const mainActivity = manifest.application[0].activity.find(
      (activity) => activity.$["android:name"] === ".MainActivity"
    );

    expect(mainActivity).toBeDefined();
    expect(mainActivity.$["android:stateNotNeeded"]).toBe("true");
    expect(mainActivity.$["android:excludeFromRecents"]).toBe("true");
  });
});
