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

/**
 * UTF-8 byte length of `str`.
 *
 * `str.length` counts UTF-16 code units, not bytes. One CJK character is a
 * single code unit and three UTF-8 bytes, so a `.length` ceiling of 1_000_000
 * waves through a 3 MB payload — exactly the pathological entry these ceilings
 * exist to reject. Lone surrogates are counted as the 3-byte replacement
 * character, matching what an encoder emits for them.
 *
 * Implemented by hand rather than via TextEncoder: Hermes does not guarantee
 * TextEncoder, and Buffer is a Node built-in that is not available on device.
 */
export function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4; // well-formed surrogate pair
        i += 1;
      } else {
        bytes += 3; // lone high surrogate
      }
    } else {
      bytes += 3; // BMP character, or a lone surrogate
    }
  }
  return bytes;
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
    const keyBytes = utf8ByteLength(key);
    if (keyBytes > MAX_KEY_BYTES) {
      throw new InvalidBackupError(
        `key exceeds ${MAX_KEY_BYTES} bytes (${keyBytes} bytes): ${key.slice(0, 32)}…`,
      );
    }
    if (typeof value !== 'string') {
      throw new InvalidBackupError(
        `value for "${key}" is not a string (received ${typeof value})`,
      );
    }
    const valueBytes = utf8ByteLength(value);
    if (valueBytes > MAX_VALUE_BYTES) {
      throw new InvalidBackupError(
        `value for "${key}" exceeds ${MAX_VALUE_BYTES} bytes (${valueBytes} bytes)`,
      );
    }
  }
}
