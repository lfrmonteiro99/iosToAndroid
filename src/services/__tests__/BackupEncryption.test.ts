import {
  encryptSnapshot,
  decryptSnapshot,
  BackupDecryptError,
  type EncryptedBackup,
  type BackupSnapshot,
} from '../BackupEncryption';

const snapshot: BackupSnapshot = {
  '@iostoandroid/settings': JSON.stringify({ darkMode: true, volume: 7 }),
  '@iostoandroid/accent_color': 'blue',
};

describe('BackupEncryption', () => {
  it('round-trips a snapshot with the correct passphrase', () => {
    const blob = encryptSnapshot(snapshot, 'correct horse');
    expect(decryptSnapshot(blob, 'correct horse')).toEqual(snapshot);
  });

  it('round-trips an empty snapshot', () => {
    const blob = encryptSnapshot({}, 'pw');
    expect(decryptSnapshot(blob, 'pw')).toEqual({});
  });

  it('round-trips unicode and empty-string values', () => {
    const s: BackupSnapshot = { 'k/ç': 'ação — 日本語 🎉', empty: '' };
    expect(decryptSnapshot(encryptSnapshot(s, 'pw'), 'pw')).toEqual(s);
  });

  it('uses a fresh random salt and IV on every call', () => {
    const a = encryptSnapshot(snapshot, 'pw');
    const b = encryptSnapshot(snapshot, 'pw');
    expect(a.salt).not.toEqual(b.salt);
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
    // both still decrypt to the same plaintext
    expect(decryptSnapshot(a, 'pw')).toEqual(snapshot);
    expect(decryptSnapshot(b, 'pw')).toEqual(snapshot);
  });

  it('never embeds the passphrase in the encrypted blob', () => {
    const pass = 'super-secret-passphrase';
    const blob = encryptSnapshot(snapshot, pass);
    expect(JSON.stringify(blob)).not.toContain(pass);
    expect(Object.keys(blob).sort()).toEqual(['ciphertext', 'iv', 'salt', 'version']);
  });

  it('throws BackupDecryptError on a wrong passphrase', () => {
    const blob = encryptSnapshot(snapshot, 'right-pw');
    expect(() => decryptSnapshot(blob, 'wrong-pw')).toThrow(BackupDecryptError);
  });

  it('throws BackupDecryptError on an empty passphrase mismatch', () => {
    const blob = encryptSnapshot(snapshot, 'pw');
    expect(() => decryptSnapshot(blob, '')).toThrow(BackupDecryptError);
  });

  it.each(['salt', 'iv', 'ciphertext'] as const)(
    'throws BackupDecryptError when %s is missing',
    (field) => {
      const blob = encryptSnapshot(snapshot, 'pw') as unknown as Record<string, unknown>;
      delete blob[field];
      expect(() => decryptSnapshot(blob as unknown as EncryptedBackup, 'pw')).toThrow(
        BackupDecryptError
      );
    }
  );

  it.each([null, undefined, 'string', 42, []])('throws on non-object blob %p', (bad) => {
    expect(() => decryptSnapshot(bad as unknown as EncryptedBackup, 'pw')).toThrow(
      BackupDecryptError
    );
  });

  it('throws BackupDecryptError on an unsupported version', () => {
    const blob = { ...encryptSnapshot(snapshot, 'pw'), version: 2 as unknown as 1 };
    expect(() => decryptSnapshot(blob, 'pw')).toThrow(BackupDecryptError);
  });

  it('throws BackupDecryptError on non-base64 garbage ciphertext', () => {
    const blob = { ...encryptSnapshot(snapshot, 'pw'), ciphertext: '!!!not base64!!!' };
    expect(() => decryptSnapshot(blob, 'pw')).toThrow(BackupDecryptError);
  });

  it('throws BackupDecryptError when the ciphertext was tampered with', () => {
    const blob = encryptSnapshot(snapshot, 'pw');
    const raw = Buffer.from(blob.ciphertext, 'base64');
    raw[0] ^= 0xff;
    const tampered: EncryptedBackup = { ...blob, ciphertext: raw.toString('base64') };
    expect(() => decryptSnapshot(tampered, 'pw')).toThrow(BackupDecryptError);
  });

  it('throws BackupDecryptError when the salt does not match the one used', () => {
    const blob = encryptSnapshot(snapshot, 'pw');
    const other = encryptSnapshot(snapshot, 'pw');
    expect(() => decryptSnapshot({ ...blob, salt: other.salt }, 'pw')).toThrow(BackupDecryptError);
  });

  it('is idempotent: encrypting twice in a row leaves the source snapshot untouched', () => {
    const copy = { ...snapshot };
    encryptSnapshot(snapshot, 'pw');
    encryptSnapshot(snapshot, 'pw');
    expect(snapshot).toEqual(copy);
  });
});
