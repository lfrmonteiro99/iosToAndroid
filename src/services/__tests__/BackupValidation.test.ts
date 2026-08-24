import { validateSnapshot, InvalidBackupError } from '../BackupValidation';

const MAX_KEY_BYTES = 256;
const MAX_VALUE_BYTES = 1_000_000;

describe('validateSnapshot', () => {
  it('accepts a well-formed non-empty Record<string,string>', () => {
    const data: unknown = {
      '@iostoandroid/settings': '{"vibration":true}',
      '@iostoandroid/theme_preference': 'dark',
    };
    expect(() => validateSnapshot(data)).not.toThrow();
  });

  it('accepts a record with a single entry', () => {
    expect(() => validateSnapshot({ '@iostoandroid/settings': 'x' })).not.toThrow();
  });

  it('rejects an array (line: typeof object passes but array.isArray does not)', () => {
    expect(() => validateSnapshot([1, 2, 3])).toThrow(InvalidBackupError);
  });

  it('rejects null', () => {
    expect(() => validateSnapshot(null)).toThrow(InvalidBackupError);
  });

  it('rejects a primitive (number)', () => {
    expect(() => validateSnapshot(42)).toThrow(InvalidBackupError);
  });

  it('rejects a primitive (string)', () => {
    expect(() => validateSnapshot('not-an-object')).toThrow(InvalidBackupError);
  });

  it('rejects a primitive (boolean)', () => {
    expect(() => validateSnapshot(true)).toThrow(InvalidBackupError);
  });

  it('rejects an empty object', () => {
    expect(() => validateSnapshot({})).toThrow(InvalidBackupError);
  });

  it('rejects an object containing a non-string value (number)', () => {
    expect(() => validateSnapshot({ '@iostoandroid/settings': 123 as unknown })).toThrow(
      InvalidBackupError,
    );
  });

  it('rejects an object containing a non-string value (nested object)', () => {
    expect(() =>
      validateSnapshot({ '@iostoandroid/settings': { a: 1 } as unknown }),
    ).toThrow(InvalidBackupError);
  });

  it('rejects an object containing a non-string value (null)', () => {
    expect(() =>
      validateSnapshot({ '@iostoandroid/settings': null as unknown }),
    ).toThrow(InvalidBackupError);
  });

  it('rejects a non-plain object (Date)', () => {
    expect(() => validateSnapshot(new Date())).toThrow(InvalidBackupError);
  });

  it('throws InvalidBackupError with a human-readable reason for a non-string value', () => {
    let err: unknown;
    try {
      validateSnapshot({ '@iostoandroid/settings': 123 as unknown });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(InvalidBackupError);
    expect((err as InvalidBackupError).message).toMatch(/@iostoandroid\/settings/);
    expect((err as InvalidBackupError).message.length).toBeGreaterThan(0);
  });

  it('rejects a key exceeding the length ceiling', () => {
    const longKey = '@iostoandroid/' + 'k'.repeat(MAX_KEY_BYTES);
    expect(() => validateSnapshot({ [longKey]: 'v' })).toThrow(InvalidBackupError);
  });

  it('rejects a value exceeding the size ceiling (pathological multi-MB string)', () => {
    const hugeValue = 'x'.repeat(MAX_VALUE_BYTES + 1);
    expect(() => validateSnapshot({ '@iostoandroid/settings': hugeValue })).toThrow(
      InvalidBackupError,
    );
  });

  it('accepts a value just under the size ceiling', () => {
    const value = 'x'.repeat(MAX_VALUE_BYTES - 10);
    expect(() => validateSnapshot({ '@iostoandroid/settings': value })).not.toThrow();
  });
});
