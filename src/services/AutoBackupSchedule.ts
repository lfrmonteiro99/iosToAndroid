import AsyncStorage from '@react-native-async-storage/async-storage';

// Auto Backup scheduling for the Backup & Restore screen (issue #283, part of #126).
//
// Design constraint (per #270): the encryption passphrase must NEVER be
// persisted, and there is no way to prompt for it during a true silent/background
// trigger. Auto Backup is therefore implemented as a *foreground-triggered
// reminder*, not a silent background upload:
//   - We persist ONLY the toggle (`enabled`), the `frequency`, and
//     `lastBackupAt` (all non-secret).
//   - On app foreground (AppState -> 'active') the screen calls `isBackupDue()`;
//     if it is due, the screen surfaces a one-tap prompt that runs the EXISTING
//     manual backup flow (the user is present and re-enters any secret fresh —
//     identical to tapping "Back Up Now"). This module never performs an upload
//     or write that requires a passphrase, so the passphrase constraint is
//     satisfied structurally: there is nothing secret here to leak.

export const AUTO_BACKUP_STORAGE_KEY = '@iostoandroid/auto_backup_prefs';

export type BackupFrequency = 'daily' | 'weekly';

export interface AutoBackupPrefs {
  enabled: boolean;
  frequency: BackupFrequency;
  /** ISO timestamp of the last successful backup, or null if never backed up. */
  lastBackupAt: string | null;
}

export const DEFAULT_AUTO_BACKUP_PREFS: AutoBackupPrefs = {
  enabled: false,
  frequency: 'daily',
  lastBackupAt: null,
};

const INTERVAL_MS: Record<BackupFrequency, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Pure predicate: is a backup due right now?
 *
 * Rules:
 *  - Disabled auto-backup is never "due".
 *  - No prior backup (lastBackupAt === null) is always due.
 *  - A corrupt/unparseable timestamp is treated as "never backed up" -> due.
 *  - Otherwise due when (now - lastBackupAt) >= the chosen interval,
 *    i.e. the boundary is inclusive (exactly at the interval is due).
 */
export function isBackupDue(prefs: AutoBackupPrefs, now: Date): boolean {
  if (!prefs.enabled) return false;
  if (prefs.lastBackupAt === null) return true;

  const last = new Date(prefs.lastBackupAt);
  // Invalid Date -> treat as never backed up.
  if (Number.isNaN(last.getTime())) return true;

  const elapsed = now.getTime() - last.getTime();
  return elapsed >= INTERVAL_MS[prefs.frequency];
}

/** Returns a NEW prefs object stamped with the given backup instant (no mutation). */
export function withBackupTimestamp(prefs: AutoBackupPrefs, when: Date): AutoBackupPrefs {
  return { ...prefs, lastBackupAt: when.toISOString() };
}

function normalize(raw: unknown): AutoBackupPrefs {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_AUTO_BACKUP_PREFS };
  const r = raw as Record<string, unknown>;
  const frequency: BackupFrequency = r.frequency === 'weekly' ? 'weekly' : 'daily';
  return {
    enabled: Boolean(r.enabled),
    frequency,
    lastBackupAt: typeof r.lastBackupAt === 'string' ? r.lastBackupAt : null,
  };
}

/** Reads the persisted prefs, falling back to defaults on absence/corruption/error. */
export async function loadAutoBackupPrefs(): Promise<AutoBackupPrefs> {
  try {
    const json = await AsyncStorage.getItem(AUTO_BACKUP_STORAGE_KEY);
    if (json === null) return { ...DEFAULT_AUTO_BACKUP_PREFS };
    return normalize(JSON.parse(json));
  } catch {
    return { ...DEFAULT_AUTO_BACKUP_PREFS };
  }
}

/** Persists the prefs. The shape contains only non-secret fields (no passphrase). */
export async function saveAutoBackupPrefs(prefs: AutoBackupPrefs): Promise<void> {
  const payload: AutoBackupPrefs = {
    enabled: Boolean(prefs.enabled),
    frequency: prefs.frequency === 'weekly' ? 'weekly' : 'daily',
    lastBackupAt: typeof prefs.lastBackupAt === 'string' ? prefs.lastBackupAt : null,
  };
  await AsyncStorage.setItem(AUTO_BACKUP_STORAGE_KEY, JSON.stringify(payload));
}
