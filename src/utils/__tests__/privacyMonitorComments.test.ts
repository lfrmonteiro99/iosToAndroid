/**
 * Comment-hygiene guard for #635-SI5.
 *
 * The unit under test is the *comment text* of the two Privacy Monitor source
 * files: this sub-issue is explicitly copy-only, so there is no runtime
 * behaviour to assert (behaviour stays covered by privacyMonitor.test.tsx and
 * PrivacyMonitorScreen.test.tsx, which must remain green and untouched).
 *
 * The files are read from disk, exactly like the issue's acceptance `grep`, so
 * the red step is real: with the old wording still in place these assertions
 * fail against the actual production files.
 *
 * NOTE on the issue's acceptance greps: the file uses `Instagram 12×` with a
 * MULTIPLICATION SIGN (U+00D7), so the issue's `grep 'Instagram 12x'` (ASCII
 * `x`) never matches and is vacuously "green" even before any edit. The
 * assertions below use patterns that actually match the file content.
 */
import * as fs from 'fs';
import * as path from 'path';

const SCREEN_PATH = path.resolve(__dirname, '../../screens/settings/PrivacyMonitorScreen.tsx');
const UTIL_PATH = path.resolve(__dirname, '../privacyMonitor.ts');

const screenSrc = fs.readFileSync(SCREEN_PATH, 'utf8');
const utilSrc = fs.readFileSync(UTIL_PATH, 'utf8');

// Keep only lines that are part of a comment (line comments and block-comment bodies).
function commentLines(src: string): string {
  return src
    .split('\n')
    .filter((line) => /^\s*(\/\/|\/\*|\*)/.test(line))
    .join('\n');
}

/**
 * Comment text with the `//` / `*` markers stripped and wrapping collapsed, so
 * assertions describe the prose a reader sees rather than where the 100-column
 * wrap happens to fall.
 */
function commentProse(src: string): string {
  return commentLines(src)
    .replace(/^\s*(\/\*+|\*+\/|\/\/|\*)/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('Privacy Monitor comments describe the current access model (#635-SI5)', () => {
  describe('PrivacyMonitorScreen.tsx', () => {
    it('drops the per-app usage-tally example from the abandoned model', () => {
      // "…a ranked, per-app breakdown with bars (Instagram 12×, WhatsApp 4×)".
      expect(screenSrc).not.toContain('Instagram');
      expect(screenSrc).not.toContain('WhatsApp');
    });

    it('drops the "total access count" framing', () => {
      expect(screenSrc).not.toContain('total access count');
    });

    it('describes the manifest/set-membership model instead', () => {
      expect(commentProse(screenSrc)).toContain('declare that permission in their manifest');
      expect(commentProse(screenSrc)).toContain('set-membership, not usage tallies');
    });

    it('keeps the new wording inside a comment, never as code or a UI string', () => {
      // Guards the cheap way of satisfying the grep: pasting the wording into a
      // string literal that ships to the user instead of rewriting the comment.
      const outsideComments = screenSrc
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
        .join('\n');
      // (`manifestos` legitimately appears in the PT-PT footer copy on screen —
      // only the English comment wording must stay out of the rendered tree.)
      expect(commentProse(screenSrc)).toContain('set-membership');
      expect(outsideComments).not.toContain('set-membership');
      expect(outsideComments).not.toContain('usage tallies');
    });
  });

  describe('privacyMonitor.ts', () => {
    it('drops the "hit 4 or 400 times" tally wording', () => {
      expect(utilSrc).not.toContain('hit 4 or 400 times');
      expect(utilSrc).not.toContain('4 or 400');
    });

    it('drops every reference to the abandoned AppOps source', () => {
      expect(utilSrc).not.toContain('AppOps');
      expect(utilSrc).not.toContain('zero-length op entry');
    });

    it('describes the membership flag and max-per-sensor normalization', () => {
      expect(commentProse(utilSrc)).toContain('count is the membership flag (always 1)');
      expect(commentProse(utilSrc)).toContain('normalization is by max-per-sensor only');
    });

    it('describes the count<=0 drop as a defensive guard against partial native entries', () => {
      expect(commentProse(utilSrc)).toContain('dropped defensively (native can emit partial entries)');
    });

    it('keeps the new wording inside a comment, never as code', () => {
      const outsideComments = utilSrc
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
        .join('\n');
      expect(outsideComments).not.toContain('max-per-sensor');
      expect(outsideComments).not.toContain('membership flag');
    });
  });

  describe('copy-only guarantee', () => {
    it('leaves the behaviour-bearing exports of privacyMonitor.ts in place', () => {
      // The inverse of the fix: rewording comments must not remove or rename the
      // API the (untouched) behaviour tests exercise.
      expect(utilSrc).toContain('export function sensorBreakdown(');
      expect(utilSrc).toContain('export interface PrivacyAppBreakdownRow');
      expect(utilSrc).toContain('export interface PrivacySensorView');
    });
  });
});
