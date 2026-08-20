import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppsProvider, useApps } from '../AppsStore';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppsProvider>{children}</AppsProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
});

describe('AppsStore — dock resolution of virtual built-in apps', () => {
  it.each([
    ['com.iostoandroid.notes', 'Notes'],
    ['com.iostoandroid.reminders', 'Reminders'],
    ['com.iostoandroid.mail', 'Mail'],
  ])('addToDock(%s) resolves to a dock entry, not an empty slot', async (packageName, name) => {
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});

    // Dock starts full (4 built-ins) — free a slot before adding, since addToDock
    // no-ops past the max of 4.
    await act(async () => {
      result.current.removeFromDock('com.iostoandroid.settings');
    });
    await act(async () => {
      result.current.addToDock(packageName);
    });

    expect(result.current.dockApps.every(Boolean)).toBe(true);
    const dockEntry = result.current.dockApps.find((a) => a.packageName === packageName);
    expect(dockEntry).toBeDefined();
    expect(dockEntry?.name).toBe(name);
  });
});
