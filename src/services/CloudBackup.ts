import type { EncryptedBackup } from './BackupEncryption';

// Drive v3 REST calls scoped to `appDataFolder` — a hidden, per-app storage area
// that never shows up in the user's visible Drive UI. Requires the
// `drive.appdata` scope already requested by GoogleAuth.ts (#278).
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const BACKUP_FILE_NAME = 'iostoandroid-backup.json';
const MULTIPART_BOUNDARY = 'iostoandroid-backup-boundary';

export interface CloudBackupEntry {
  id: string;
  name: string;
  createdTime: string;
}

/** Thrown when a Drive REST call returns a non-2xx response. */
export class CloudBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudBackupError';
  }
}

interface DriveFilesListResponse {
  files?: Array<{ id: string; name: string; createdTime: string }>;
}

export async function uploadBackup(encrypted: EncryptedBackup, accessToken: string): Promise<void> {
  const metadata = { name: BACKUP_FILE_NAME, parents: ['appDataFolder'] };
  const body =
    `--${MULTIPART_BOUNDARY}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${MULTIPART_BOUNDARY}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(encrypted)}\r\n` +
    `--${MULTIPART_BOUNDARY}--`;

  const response = await fetch(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${MULTIPART_BOUNDARY}`,
    },
    body,
  });

  if (!response.ok) {
    throw new CloudBackupError(`Drive upload failed: HTTP ${response.status}`);
  }
}

export async function listBackups(accessToken: string): Promise<CloudBackupEntry[]> {
  const url = `${DRIVE_FILES_URL}?spaces=appDataFolder&fields=${encodeURIComponent('files(id,name,createdTime)')}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new CloudBackupError(`Drive list failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as DriveFilesListResponse;
  const files = data.files ?? [];
  return files.map((f) => ({ id: f.id, name: f.name, createdTime: f.createdTime }));
}

export async function downloadBackup(fileId: string, accessToken: string): Promise<EncryptedBackup> {
  const url = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new CloudBackupError(`Drive download failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as unknown;
  return data as EncryptedBackup;
}
