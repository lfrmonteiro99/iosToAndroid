import {
  validateSnapshot,
  InvalidBackupError,
  utf8ByteLength,
  MAX_KEY_BYTES,
  MAX_VALUE_BYTES,
} from '../BackupValidation';

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

// The ceilings are named *_BYTES and documented as rejecting "pathological
// multi-MB strings", but a UTF-16 `.length` check is not a byte count: one CJK
// character is a single code unit and three UTF-8 bytes, so a value of exactly
// MAX_VALUE_BYTES CJK characters is a 3 MB payload that slips straight through.
describe('validateSnapshot — ceilings measured in UTF-8 bytes, not UTF-16 code units', () => {
  it('rejects a multi-MB CJK value whose UTF-16 length sits at the ceiling', () => {
    // length === MAX_VALUE_BYTES (passes a `.length >` check) but 3 MB encoded.
    const value = '好'.repeat(MAX_VALUE_BYTES);
    expect(value.length).toBe(MAX_VALUE_BYTES);
    expect(() => validateSnapshot({ '@iostoandroid/settings': value })).toThrow(
      InvalidBackupError,
    );
  });

  it('rejects a multi-MB emoji value whose UTF-16 length is under the ceiling', () => {
    // 600k code units (under the ceiling) but 1.2 MB encoded — surrogate pairs
    // are 2 code units and 4 UTF-8 bytes.
    const value = '😀'.repeat(300_000);
    expect(value.length).toBeLessThan(MAX_VALUE_BYTES);
    expect(() => validateSnapshot({ '@iostoandroid/settings': value })).toThrow(
      InvalidBackupError,
    );
  });

  it('rejects a key whose UTF-8 size exceeds the ceiling although its length does not', () => {
    const key = '好'.repeat(200); // 200 code units, 600 bytes
    expect(key.length).toBeLessThan(MAX_KEY_BYTES);
    expect(() => validateSnapshot({ [key]: 'v' })).toThrow(InvalidBackupError);
  });

  it('reports the offending size in bytes, not code units', () => {
    let message = '';
    try {
      validateSnapshot({ '@iostoandroid/settings': '好'.repeat(MAX_VALUE_BYTES) });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/3000000 bytes/);
  });

  // Inverse of the fix: tightening the ceiling must not start rejecting
  // multi-byte payloads that are genuinely small.
  it('still accepts a multi-byte key that fits inside the byte ceiling', () => {
    const key = '好'.repeat(80); // 240 bytes, under 256
    expect(() => validateSnapshot({ [key]: 'v' })).not.toThrow();
  });

  it('still accepts a multi-byte value that fits inside the byte ceiling', () => {
    const value = '好'.repeat(1000); // 3000 bytes
    expect(() => validateSnapshot({ '@iostoandroid/settings': value })).not.toThrow();
  });

  it('accepts an ASCII key at exactly the byte ceiling and rejects one byte more', () => {
    expect(() => validateSnapshot({ ['k'.repeat(MAX_KEY_BYTES)]: 'v' })).not.toThrow();
    expect(() => validateSnapshot({ ['k'.repeat(MAX_KEY_BYTES + 1)]: 'v' })).toThrow(
      InvalidBackupError,
    );
  });

  it('accepts an ASCII value at exactly the byte ceiling and rejects one byte more', () => {
    expect(() =>
      validateSnapshot({ '@iostoandroid/settings': 'x'.repeat(MAX_VALUE_BYTES) }),
    ).not.toThrow();
    expect(() =>
      validateSnapshot({ '@iostoandroid/settings': 'x'.repeat(MAX_VALUE_BYTES + 1) }),
    ).toThrow(InvalidBackupError);
  });

  it('accepts a key sitting exactly on the byte ceiling with multi-byte characters', () => {
    const key = '好'.repeat(85) + 'x'; // 85*3 + 1 === 256 bytes
    expect(() => validateSnapshot({ [key]: 'v' })).not.toThrow();
    expect(() => validateSnapshot({ [key + 'x']: 'v' })).toThrow(InvalidBackupError);
  });
});

describe('utf8ByteLength', () => {
  it('returns 0 for the empty string', () => {
    expect(utf8ByteLength('')).toBe(0);
  });

  it('counts ASCII as one byte per character', () => {
    expect(utf8ByteLength('abc')).toBe(3);
  });

  it('counts two-byte characters (U+0080..U+07FF)', () => {
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('߿')).toBe(2);
  });

  it('counts three-byte characters (BMP above U+07FF)', () => {
    expect(utf8ByteLength('好')).toBe(3);
    expect(utf8ByteLength('ࠀ')).toBe(3);
  });

  it('counts a surrogate pair as a single four-byte character', () => {
    expect(utf8ByteLength('😀')).toBe(4);
  });

  it('counts a lone high surrogate as the three-byte replacement character', () => {
    expect(utf8ByteLength('\uD800')).toBe(3);
    expect(utf8ByteLength('\uD800a')).toBe(4);
  });

  it('counts a lone low surrogate as the three-byte replacement character', () => {
    expect(utf8ByteLength('\uDC00')).toBe(3);
  });

  it('matches the mixed-content total', () => {
    // a(1) + é(2) + 好(3) + 😀(4)
    expect(utf8ByteLength('aé好😀')).toBe(10);
  });

  it('never under-counts relative to UTF-16 length', () => {
    // Every code unit is at least one byte, so bytes >= length always holds —
    // the property that makes the byte ceiling strictly stricter than the old
    // `.length` ceiling rather than a different one.
    for (const s of ['', 'abc', 'é好😀', '\uD800', 'aé好😀x']) {
      expect(utf8ByteLength(s)).toBeGreaterThanOrEqual(s.length);
    }
  });

  it('agrees with the platform encoder on mixed content', () => {
    const sample = 'a é 好 😀 ÿ ߿ ࠀ tail';
    expect(utf8ByteLength(sample)).toBe(Buffer.byteLength(sample, 'utf8'));
  });
});
