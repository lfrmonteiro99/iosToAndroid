import fs from 'fs';
import path from 'path';

/**
 * Regression guard for the double-prefixed data URI bug.
 *
 * `LauncherModule.drawableToBase64` (Kotlin) returns a COMPLETE data URI —
 * `"data:image/png;base64," + Base64.encodeToString(...)`. Four call sites
 * prepended the prefix a second time, producing
 * `data:image/png;base64,data:image/png;base64,iVBOR...`, which React Native's
 * <Image> silently fails to decode: no icons in App Library, Spotlight search,
 * the Lock Screen notification stack, or Notification Center — with no error.
 *
 * Icons flowing from the native bridge must be passed through untouched.
 */

const SRC = path.join(__dirname, '..', '..');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === 'node_modules' ? [] : walk(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('app icons from the native bridge', () => {
  it('are never re-prefixed with a data: URI scheme', () => {
    const offenders = walk(SRC)
      .map((file) => ({ file, source: fs.readFileSync(file, 'utf8') }))
      .flatMap(({ file, source }) =>
        source
          .split('\n')
          .map((line, i) => ({ line, lineNo: i + 1 }))
          // Template literal that hardcodes the prefix and then interpolates.
          .filter(({ line }) => /data:image\/\w+;base64,\$\{/.test(line))
          .map(({ lineNo }) => `${path.relative(SRC, file)}:${lineNo}`)
      );

    expect(offenders).toEqual([]);
  });

  it('documents the full-data-URI contract on InstalledApp.icon', () => {
    const bridge = fs.readFileSync(
      path.join(SRC, '..', 'modules', 'launcher-module', 'src', 'index.ts'),
      'utf8'
    );
    // The comment is the only thing standing between the next reader and this bug.
    // getInstalledApps() moved to a cached file:// URI (issue #483) while getAppIcon()
    // still returns a data: URI — both are covered by the same "COMPLETE URI" contract.
    expect(bridge).toMatch(/COMPLETE URI/);
  });
});
