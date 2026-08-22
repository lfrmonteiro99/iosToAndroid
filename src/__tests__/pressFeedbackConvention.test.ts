import fs from 'fs';
import path from 'path';

// Issue #496 / epic #468 — one touch-feedback convention in the app.
//
// The audit found four concurrent press-feedback conventions. Convention 3
// (`style={({ pressed }) => [..., { opacity: pressed ? N : 1 }]}` with six
// different Ns) is migrated to the useCupertinoPress primitive, via
// CupertinoPressable. Convention 4 (a pressed backgroundColor swap on
// full-width list rows) stays — it is the correct iOS behaviour for rows — but
// the colour must come from a single theme token.
//
// These are source-level assertions on purpose: the property under test is
// "no site anywhere in src/ reintroduces an ad hoc value", which is a property
// of the whole tree and cannot be observed by mounting one component.

const SRC = path.resolve(__dirname, '..');

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === '__snapshots__') continue;
      collect(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const FILES = collect(SRC);

function lines(file: string): Array<{ n: number; text: string }> {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((text, i) => ({ n: i + 1, text }));
}

/** Comment lines are excluded: the migration notes legitimately quote the old
 *  pattern to explain what was replaced. */
function isComment(text: string): boolean {
  return /^\s*(\/\/|\*|\/\*)/.test(text);
}

function hits(predicate: (text: string) => boolean): string[] {
  const found: string[] = [];
  for (const file of FILES) {
    for (const { n, text } of lines(file)) {
      if (isComment(text)) continue;
      if (predicate(text)) found.push(`${path.relative(SRC, file)}:${n}: ${text.trim()}`);
    }
  }
  return found;
}

describe('press feedback convention — no ad hoc opacity (§3.2)', () => {
  it('has zero `opacity: pressed ? N : 1` sites in src/', () => {
    const offenders = hits((t) => /opacity:\s*pressed\s*\?/.test(t));
    expect(offenders).toEqual([]);
  });

  it('has zero inline `pressed ?` opacity inside a style callback array in src/', () => {
    const offenders = hits((t) => /\{\s*opacity:\s*pressed\s*\?/.test(t));
    expect(offenders).toEqual([]);
  });
});

describe('press feedback convention — list rows keep a single colour token', () => {
  it('every remaining `backgroundColor: pressed ? X` uses colors.pressedRowBackground', () => {
    const offenders = hits(
      (t) =>
        /backgroundColor:\s*pressed\s*\?/.test(t) &&
        !/pressed\s*\?\s*colors\.pressedRowBackground/.test(t),
    );
    expect(offenders).toEqual([]);
  });

  it('the theme actually defines the token for both schemes', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SystemColors } = require('../theme/CupertinoTheme') as {
      SystemColors: { light: Record<string, string>; dark: Record<string, string> };
    };
    expect(typeof SystemColors.light.pressedRowBackground).toBe('string');
    expect(typeof SystemColors.dark.pressedRowBackground).toBe('string');
    // The two schemes must differ, otherwise the pressed row is invisible in one of them.
    expect(SystemColors.light.pressedRowBackground).not.toBe(
      SystemColors.dark.pressedRowBackground,
    );
  });
});

describe('press feedback convention — launcher icon scale', () => {
  const launcher = fs.readFileSync(path.join(SRC, 'screens/LauncherHomeScreen.tsx'), 'utf8');

  it('no longer springs the app icon to the ad hoc 0.85 scale', () => {
    expect(launcher).not.toMatch(/withSpring\(\s*0\.85\s*,/);
  });

  it('uses the shared §3.2 press scale constant for the app icon press-in', () => {
    expect(launcher).toMatch(/withSpring\(\s*CUPERTINO_PRESS_SCALE\s*,/);
  });

  it('the shared constants are the §3.2 numbers', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../hooks/useCupertinoPress') as {
      CUPERTINO_PRESS_SCALE: number;
      CUPERTINO_PRESS_OPACITY: number;
    };
    expect(mod.CUPERTINO_PRESS_SCALE).toBeCloseTo(0.96, 5);
    expect(mod.CUPERTINO_PRESS_OPACITY).toBeCloseTo(0.4, 5);
  });
});
