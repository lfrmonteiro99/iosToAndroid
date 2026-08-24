// Shared validator for backup snapshots, used by the clipboard-import path in
// BackupRestoreScreen and any future cloud-restore path. A snapshot is the parsed
// shape of a settings backup: a plain object whose every value is a string.
//
// Rejecting coercion (String(value)) matters: the old inline check coerced numbers,
// booleans, null, etc. into strings and wrote them straight to AsyncStorage. A
// decrypted-but-wrong-passphrase blob can deserialize into arbitrary JSON that
// happens to parse — without this check it would partially overwrite storage.

export const MAX_KEY_BYTES = 256;
export const MAX_VALUE_BYTES = 1_000_000; // ~1 MB per entry; rejects pathological multi-MB strings

export class InvalidBackupError extends Error {
  constructor(reason: string) {
    super(`Invalid backup data: ${reason}`);
    this.name = 'InvalidBackupError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  // Reject class instances / host objects (Date, RegExp, class instances) by
  // requiring the prototype chain to be exactly Object.prototype.
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

export function validateSnapshot(data: unknown): asserts data is Record<string, string> {
  if (!isPlainObject(data)) {
    if (data === null) {
      throw new InvalidBackupError('backup is null');
    }
    if (Array.isArray(data)) {
      throw new InvalidBackupError('backup is an array, expected an object');
    }
    throw new InvalidBackupError(
      `backup must be a JSON object, received ${typeof data}`,
    );
  }

  if (Object.keys(data).length === 0) {
    throw new InvalidBackupError('backup is empty');
  }

  for (const [key, value] of Object.entries(data)) {
    if (typeof key !== 'string') {
      throw new InvalidBackupError(`key is not a string: ${String(key)}`);
    }
    if (key.length > MAX_KEY_BYTES) {
      throw new InvalidBackupError(
        `key exceeds ${MAX_KEY_BYTES} bytes: ${key.slice(0, 32)}…`,
      );
    }
    if (typeof value !== 'string') {
      throw new InvalidBackupError(
        `value for "${key}" is not a string (received ${typeof value})`,
      );
    }
    if (value.length > MAX_VALUE_BYTES) {
      throw new InvalidBackupError(
        `value for "${key}" exceeds ${MAX_VALUE_BYTES} bytes (${value.length} bytes)`,
      );
    }
  }
}
