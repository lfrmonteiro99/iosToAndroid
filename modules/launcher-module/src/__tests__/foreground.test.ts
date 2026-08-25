import { isForegroundAppProtected } from '../foreground';

describe('isForegroundAppProtected (#627 foreground monitor gate)', () => {
  const OWN = 'com.iostoandroid.launcher';

  it('gates a protected package', () => {
    expect(isForegroundAppProtected('com.example.banking', ['com.example.banking'], OWN)).toBe(true);
  });

  it('does NOT gate a package that is not protected (nominal path)', () => {
    expect(isForegroundAppProtected('com.example.notes', ['com.example.banking'], OWN)).toBe(false);
  });

  it('does NOT gate when the foreground package is empty', () => {
    expect(isForegroundAppProtected('', ['com.example.banking'], OWN)).toBe(false);
  });

  it('does NOT gate when the foreground package is null', () => {
    expect(isForegroundAppProtected(null, ['com.example.banking'], OWN)).toBe(false);
  });

  it('does NOT gate when the foreground package is undefined', () => {
    expect(isForegroundAppProtected(undefined, ['com.example.banking'], OWN)).toBe(false);
  });

  it('does NOT gate the launcher’s own package (no self-lock)', () => {
    expect(isForegroundAppProtected(OWN, ['com.example.banking', OWN], OWN)).toBe(false);
  });

  it('does NOT gate when the protected set is null', () => {
    expect(isForegroundAppProtected('com.example.banking', null, OWN)).toBe(false);
  });

  it('does NOT gate when the protected set is undefined', () => {
    expect(isForegroundAppProtected('com.example.banking', undefined, OWN)).toBe(false);
  });

  it('does NOT gate when the protected set is not an array (malformed payload)', () => {
    // A malformed payload must never become a blanket "gate everything".
    expect(isForegroundAppProtected('com.example.banking', 'nonsense' as unknown as string[], OWN)).toBe(false);
  });

  it('treats a missing ownPackageName as no self-lock (defensive default)', () => {
    expect(isForegroundAppProtected(OWN, [OWN])).toBe(true);
  });

  it('distinguishes by exact package string (no substring match)', () => {
    expect(isForegroundAppProtected('com.example.banking.free', ['com.example.banking'], OWN)).toBe(false);
  });

  it('gates when the protected set has several entries and this one matches', () => {
    expect(isForegroundAppProtected('com.example.gallery', ['com.example.banking', 'com.example.gallery'], OWN)).toBe(true);
  });
});
