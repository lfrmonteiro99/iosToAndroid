import type { InstalledApp } from './AppsStore';

/**
 * Pure reducers for the installed-apps index.
 *
 * The launcher keeps `allApps` sorted the same way the native scan sorts it
 * (`getInstalledApps` in LauncherModule.kt sorts by lowercased label), so an
 * incremental insert has to land in that same position instead of appending —
 * otherwise a newly installed app shows up at the end of the App Library until
 * the next full scan.
 *
 * Both helpers return the SAME array reference when nothing changed, so the
 * caller can skip a state update (and the re-render) for a no-op event.
 */

function byName(a: InstalledApp, b: InstalledApp): number {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

/** Insert `app`, or replace the existing entry with the same packageName. */
export function upsertApp(apps: InstalledApp[], app: InstalledApp): InstalledApp[] {
  const index = apps.findIndex(a => a.packageName === app.packageName);
  if (index === -1) {
    return [...apps, app].sort(byName);
  }
  const existing = apps[index];
  if (
    existing.name === app.name &&
    existing.icon === app.icon &&
    existing.isSystem === app.isSystem
  ) {
    return apps; // nothing to update — same reference, no re-render
  }
  const next = [...apps];
  next[index] = app;
  return next.sort(byName);
}

/** Drop the entry for `packageName`. Returns the same array when absent. */
export function removeApp(apps: InstalledApp[], packageName: string): InstalledApp[] {
  const next = apps.filter(a => a.packageName !== packageName);
  return next.length === apps.length ? apps : next;
}
