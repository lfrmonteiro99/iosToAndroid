import { upsertApp, removeApp } from '../appsIndexReducer';
import type { InstalledApp } from '../AppsStore';

const app = (name: string, packageName: string, extra: Partial<InstalledApp> = {}): InstalledApp => ({
  name,
  packageName,
  icon: `file:///icons/${packageName}_1.png`,
  isSystem: false,
  ...extra,
});

const banana = app('Banana', 'com.example.banana');
const cherry = app('Cherry', 'com.example.cherry');

describe('appsIndexReducer — upsertApp', () => {
  it('inserts a new app in alphabetical position, not at the end', () => {
    const next = upsertApp([banana, cherry], app('Apple', 'com.example.apple'));
    expect(next.map(a => a.packageName)).toEqual([
      'com.example.apple',
      'com.example.banana',
      'com.example.cherry',
    ]);
  });

  it('inserts into an empty index', () => {
    expect(upsertApp([], banana)).toEqual([banana]);
  });

  it('replaces the existing entry instead of duplicating it (PACKAGE_REPLACED)', () => {
    const updated = app('Banana', 'com.example.banana', { icon: 'file:///icons/com.example.banana_2.png' });
    const next = upsertApp([banana, cherry], updated);
    expect(next).toHaveLength(2);
    expect(next.find(a => a.packageName === 'com.example.banana')?.icon)
      .toBe('file:///icons/com.example.banana_2.png');
  });

  it('re-sorts when an update renames the app', () => {
    const renamed = app('Zebra', 'com.example.banana');
    expect(upsertApp([banana, cherry], renamed).map(a => a.packageName))
      .toEqual(['com.example.cherry', 'com.example.banana']);
  });

  it('returns the same array reference when the upsert changes nothing (idempotent double event)', () => {
    const apps = [banana, cherry];
    expect(upsertApp(apps, app('Banana', 'com.example.banana'))).toBe(apps);
  });

  it('sorts case-insensitively', () => {
    const next = upsertApp([app('banana', 'com.example.banana')], app('Apple', 'com.example.apple'));
    expect(next.map(a => a.name)).toEqual(['Apple', 'banana']);
  });
});

describe('appsIndexReducer — removeApp', () => {
  it('drops the affected package and keeps the rest in order', () => {
    expect(removeApp([banana, cherry], 'com.example.banana').map(a => a.packageName))
      .toEqual(['com.example.cherry']);
  });

  it('returns the same array reference for an unknown package', () => {
    const apps = [banana, cherry];
    expect(removeApp(apps, 'com.example.nope')).toBe(apps);
  });

  it('is a no-op on an empty index', () => {
    const apps: InstalledApp[] = [];
    expect(removeApp(apps, 'com.example.banana')).toBe(apps);
  });

  it('removing twice leaves the index unchanged the second time (double event)', () => {
    const once = removeApp([banana, cherry], 'com.example.banana');
    expect(removeApp(once, 'com.example.banana')).toBe(once);
  });
});
