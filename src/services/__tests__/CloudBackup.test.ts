import { uploadBackup, listBackups, downloadBackup, CloudBackupError } from '../CloudBackup';
import type { EncryptedBackup } from '../BackupEncryption';

const ACCESS_TOKEN = 'fake-access-token-xyz';

const SAMPLE_ENCRYPTED: EncryptedBackup = {
  version: 1,
  salt: 'c2FsdC1iYXNlNjQtMTZieXRlcyEh',
  iv: 'aXYtYmFzZTY0LTE2Ynl0ZXMhISEh',
  ciphertext: 'Y2lwaGVydGV4dC1iYXNlNjQ=',
};

describe('CloudBackup', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  describe('uploadBackup', () => {
    it('POSTs to the Drive v3 upload endpoint with appDataFolder parent and bearer auth', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

      await uploadBackup(SAMPLE_ENCRYPTED, ACCESS_TOKEN);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];

      expect(url).toContain('www.googleapis.com/upload/drive/v3/files');
      expect(url).toContain('uploadType=multipart');
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
      expect(options.headers['Content-Type']).toContain('multipart/related');

      // The multipart body must declare appDataFolder as the parent and carry
      // the encrypted envelope as the media part.
      expect(options.body).toContain('"parents":["appDataFolder"]');
      expect(options.body).toContain(SAMPLE_ENCRYPTED.ciphertext);
    });

    it('never includes the access token in the request body', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

      await uploadBackup(SAMPLE_ENCRYPTED, ACCESS_TOKEN);

      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(String(options.body)).not.toContain(ACCESS_TOKEN);
    });

    it('throws CloudBackupError when the upload response is not ok', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

      await expect(uploadBackup(SAMPLE_ENCRYPTED, ACCESS_TOKEN)).rejects.toThrow(CloudBackupError);
    });

    it('propagates a network failure (fetch rejects) as a rejection, not a swallowed error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));

      await expect(uploadBackup(SAMPLE_ENCRYPTED, ACCESS_TOKEN)).rejects.toThrow();
    });
  });

  describe('listBackups', () => {
    it('GETs the Drive v3 files endpoint scoped to appDataFolder with bearer auth', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          files: [
            { id: 'file-1', name: 'iostoandroid-backup.json', createdTime: '2026-08-20T10:00:00.000Z' },
            { id: 'file-2', name: 'iostoandroid-backup.json', createdTime: '2026-08-22T10:00:00.000Z' },
          ],
        }),
      });

      const result = await listBackups(ACCESS_TOKEN);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('www.googleapis.com/drive/v3/files');
      expect(url).toContain('spaces=appDataFolder');
      expect(options.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);

      expect(result).toEqual([
        { id: 'file-1', name: 'iostoandroid-backup.json', createdTime: '2026-08-20T10:00:00.000Z' },
        { id: 'file-2', name: 'iostoandroid-backup.json', createdTime: '2026-08-22T10:00:00.000Z' },
      ]);
    });

    it('returns an empty array when Drive reports no backups', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({ files: [] }) });

      const result = await listBackups(ACCESS_TOKEN);
      expect(result).toEqual([]);
    });

    it('returns an empty array when the "files" field is missing entirely', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

      const result = await listBackups(ACCESS_TOKEN);
      expect(result).toEqual([]);
    });

    it('throws CloudBackupError when the list response is not ok', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });

      await expect(listBackups(ACCESS_TOKEN)).rejects.toThrow(CloudBackupError);
    });
  });

  describe('downloadBackup', () => {
    it('GETs the Drive v3 file content endpoint with alt=media and bearer auth', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => SAMPLE_ENCRYPTED,
      });

      const result = await downloadBackup('file-1', ACCESS_TOKEN);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('www.googleapis.com/drive/v3/files/file-1');
      expect(url).toContain('alt=media');
      expect(options.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);

      expect(result).toEqual(SAMPLE_ENCRYPTED);
    });

    it('throws CloudBackupError when the download response is not ok', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

      await expect(downloadBackup('missing-file', ACCESS_TOKEN)).rejects.toThrow(CloudBackupError);
    });
  });
});
