import CryptoJS from 'crypto-js';

/**
 * A backup payload as produced by the settings export path: a flat map of
 * AsyncStorage key -> serialised value.
 */
export type BackupSnapshot = Record<string, string>;

/**
 * Envelope produced by {@link encryptSnapshot}. Contains only public material:
 * the salt and IV needed to re-derive the key, and the ciphertext. The
 * passphrase is never part of this object and is never persisted anywhere.
 */
export interface EncryptedBackup {
  version: 1;
  /** base64, 16 random bytes, fresh on every encryption call */
  salt: string;
  /** base64, 16 random bytes, fresh on every encryption call */
  iv: string;
  /** base64 AES-256-CBC ciphertext */
  ciphertext: string;
}

/** Thrown for a wrong passphrase or a structurally invalid envelope. */
export class BackupDecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupDecryptError';
  }
}

const CURRENT_VERSION = 1;
const SALT_BYTES = 16;
const IV_BYTES = 16;
const KEY_SIZE_WORDS = 256 / 32;
/**
 * PBKDF2 rounds. crypto-js is pure JS and roughly 100x slower than a native
 * implementation, so this is a deliberate compromise between a usable UI
 * (~70ms per derivation on a laptop) and brute-force cost. It is recorded here
 * rather than in the envelope because v1 pins it; a future version bump would
 * carry its own iteration count.
 */
const PBKDF2_ITERATIONS = 10000;

/**
 * Magic marker wrapped into the plaintext before encryption. AES-CBC gives no
 * authentication, so a wrong passphrase would otherwise decrypt to garbage
 * that may accidentally parse. Checking this marker after decryption makes a
 * wrong passphrase a deterministic, detectable failure instead of silent
 * corruption.
 */
const PLAINTEXT_MAGIC = 'iostoandroid-backup-v1';

interface Envelope {
  magic: string;
  data: BackupSnapshot;
}

function deriveKey(passphrase: string, salt: CryptoJS.lib.WordArray): CryptoJS.lib.WordArray {
  return CryptoJS.PBKDF2(passphrase, salt, {
    keySize: KEY_SIZE_WORDS,
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });
}

export function encryptSnapshot(snapshot: BackupSnapshot, passphrase: string): EncryptedBackup {
  const salt = CryptoJS.lib.WordArray.random(SALT_BYTES);
  const iv = CryptoJS.lib.WordArray.random(IV_BYTES);
  const key = deriveKey(passphrase, salt);

  const envelope: Envelope = { magic: PLAINTEXT_MAGIC, data: snapshot };
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(envelope), key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    version: CURRENT_VERSION,
    salt: CryptoJS.enc.Base64.stringify(salt),
    iv: CryptoJS.enc.Base64.stringify(iv),
    ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
  };
}

function parseBase64 (value: string, expectedBytes: number | null, field: string): CryptoJS.lib.WordArray {
  let parsed: CryptoJS.lib.WordArray;
  try {
    parsed = CryptoJS.enc.Base64.parse(value);
  } catch {
    throw new BackupDecryptError(`Malformed backup: ${field} is not valid base64`);
  }
  if (parsed.sigBytes <= 0) {
    throw new BackupDecryptError(`Malformed backup: ${field} is empty`);
  }
  if (expectedBytes !== null && parsed.sigBytes !== expectedBytes) {
    throw new BackupDecryptError(
      `Malformed backup: ${field} must be ${expectedBytes} bytes, got ${parsed.sigBytes}`
    );
  }
  return parsed;
}

function isStringMap(value: unknown): value is BackupSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === 'string');
}

export function decryptSnapshot(blob: EncryptedBackup, passphrase: string): BackupSnapshot {
  // Structural validation happens before any crypto work, so a malformed
  // envelope fails fast instead of being fed to the cipher.
  if (typeof blob !== 'object' || blob === null || Array.isArray(blob)) {
    throw new BackupDecryptError('Malformed backup: expected an object');
  }
  const candidate = blob as unknown as Record<string, unknown>;
  if (candidate.version !== CURRENT_VERSION) {
    throw new BackupDecryptError(`Unsupported backup version: ${String(candidate.version)}`);
  }
  for (const field of ['salt', 'iv', 'ciphertext'] as const) {
    if (typeof candidate[field] !== 'string' || candidate[field] === '') {
      throw new BackupDecryptError(`Malformed backup: missing or invalid "${field}"`);
    }
  }

  const salt = parseBase64(candidate.salt as string, SALT_BYTES, 'salt');
  const iv = parseBase64(candidate.iv as string, IV_BYTES, 'iv');
  const ciphertext = parseBase64(candidate.ciphertext as string, null, 'ciphertext');
  if (ciphertext.sigBytes % IV_BYTES !== 0) {
    throw new BackupDecryptError('Malformed backup: ciphertext length is not a block multiple');
  }

  const key = deriveKey(passphrase, salt);

  let plaintext: string;
  try {
    const decrypted = CryptoJS.AES.decrypt(
      CryptoJS.lib.CipherParams.create({ ciphertext }),
      key,
      { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
    );
    plaintext = decrypted.toString(CryptoJS.enc.Utf8);
  } catch {
    // A wrong key almost always yields invalid padding or invalid UTF-8 here.
    throw new BackupDecryptError('Could not decrypt backup: wrong passphrase or corrupt data');
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(plaintext);
  } catch {
    throw new BackupDecryptError('Could not decrypt backup: wrong passphrase or corrupt data');
  }

  if (
    typeof envelope !== 'object' ||
    envelope === null ||
    (envelope as Envelope).magic !== PLAINTEXT_MAGIC
  ) {
    throw new BackupDecryptError('Could not decrypt backup: wrong passphrase or corrupt data');
  }

  const data = (envelope as Envelope).data;
  if (!isStringMap(data)) {
    throw new BackupDecryptError('Malformed backup: payload is not a string map');
  }
  return data;
}
