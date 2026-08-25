import React from 'react';
import { render, waitFor, within } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { LauncherSettingsScreen } from '../LauncherSettingsScreen';
import { CupertinoSegmentedControl, CupertinoSlider, CupertinoSwitch } from '../../components';

// issue #503: gridColumns, gridRows, iconSizeScale and showIconLabels must be
// exposed and editable from Launcher Settings, with immediate persistence —
// before this issue "App Icon Size" was a static "Default" label with no
// control, and there was no grid-density or label-visibility UI at all.

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

function setupMemoryAsyncStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
    store.has(key) ? store.get(key) : null,
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
    store.delete(key);
  });
  return store;
}

beforeEach(() => {
  jest.clearAllMocks();
  setupMemoryAsyncStorage();
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
});

// Polls until the persisted settings blob satisfies `predicate`, not merely
// "a write happened" — SettingsProvider persists on every mount (with
// defaults) before the test's own update, so checking key-presence alone
// would resolve on that first, stale write instead of the one under test.
async function waitForPersisted(
  store: Map<string, string>,
  predicate: (settings: Record<string, unknown>) => boolean,
) {
  await waitFor(() => {
    const raw = store.get('@iostoandroid/settings');
    expect(raw).toBeTruthy();
    expect(predicate(JSON.parse(raw as string))).toBe(true);
  }, { timeout: 3000 });
  return JSON.parse(store.get('@iostoandroid/settings') as string);
}

describe('LauncherSettingsScreen grid density controls (#503)', () => {
  it('shows Columns and Rows segmented controls, defaulting to 4 and 6', async () => {
    const { UNSAFE_getAllByType } = render(<LauncherSettingsScreen />);

    let controls: ReturnType<typeof UNSAFE_getAllByType> = [];
    await waitFor(() => {
      controls = UNSAFE_getAllByType(CupertinoSegmentedControl);
      expect(controls.length).toBeGreaterThanOrEqual(2);
    }, { timeout: 3000 });

    const [columnsControl, rowsControl] = controls;
    expect(columnsControl.props.values).toEqual(['3', '4', '5', '6']);
    expect(columnsControl.props.selectedIndex).toBe(1); // 4 is index 1
    expect(rowsControl.props.values).toEqual(['4', '5', '6', '7']);
    expect(rowsControl.props.selectedIndex).toBe(2); // 6 is index 2
  });

  it('changing the Columns control persists gridColumns', async () => {
    const store = setupMemoryAsyncStorage();
    const { UNSAFE_getAllByType } = render(<LauncherSettingsScreen />);

    let columnsControl: ReturnType<typeof UNSAFE_getAllByType>[number];
    await waitFor(() => {
      [columnsControl] = UNSAFE_getAllByType(CupertinoSegmentedControl);
      expect(columnsControl).toBeTruthy();
    }, { timeout: 3000 });

    columnsControl!.props.onChange(3); // index 3 -> value 6

    const persisted = await waitForPersisted(store, (s) => s.gridColumns === 6);
    expect(persisted.gridColumns).toBe(6);
  });

  it('changing the Rows control persists gridRows', async () => {
    const store = setupMemoryAsyncStorage();
    const { UNSAFE_getAllByType } = render(<LauncherSettingsScreen />);

    let rowsControl: ReturnType<typeof UNSAFE_getAllByType>[number];
    await waitFor(() => {
      const controls = UNSAFE_getAllByType(CupertinoSegmentedControl);
      rowsControl = controls[1];
      expect(rowsControl).toBeTruthy();
    }, { timeout: 3000 });

    rowsControl!.props.onChange(0); // index 0 -> value 4

    const persisted = await waitForPersisted(store, (s) => s.gridRows === 4);
    expect(persisted.gridRows).toBe(4);
  });

  it('moving the App Icon Size slider persists iconSizeScale', async () => {
    const store = setupMemoryAsyncStorage();
    const { UNSAFE_getAllByType } = render(<LauncherSettingsScreen />);

    let slider: ReturnType<typeof UNSAFE_getAllByType>[number];
    await waitFor(() => {
      [slider] = UNSAFE_getAllByType(CupertinoSlider);
      expect(slider).toBeTruthy();
    }, { timeout: 3000 });

    expect(slider!.props.minimumValue).toBe(0.8);
    expect(slider!.props.maximumValue).toBe(1.2);

    slider!.props.onValueChange(1.2);

    const persisted = await waitForPersisted(store, (s) => s.iconSizeScale === 1.2);
    expect(persisted.iconSizeScale).toBe(1.2);
  });

  // issue #621: no iOS, "Grande" é um preset que também esconde os nomes das
  // apps (visual minimalista) — os dois bits já existiam separados (#503) mas
  // sem o preset que os combina.
  it('moving the App Icon Size slider to Large (max) also hides app name labels', async () => {
    const store = setupMemoryAsyncStorage();
    const { UNSAFE_getAllByType } = render(<LauncherSettingsScreen />);

    let slider: ReturnType<typeof UNSAFE_getAllByType>[number];
    await waitFor(() => {
      [slider] = UNSAFE_getAllByType(CupertinoSlider);
      expect(slider).toBeTruthy();
    }, { timeout: 3000 });

    slider!.props.onValueChange(1.2);

    const persisted = await waitForPersisted(
      store,
      (s) => s.iconSizeScale === 1.2 && s.showIconLabels === false,
    );
    expect(persisted.iconSizeScale).toBe(1.2);
    expect(persisted.showIconLabels).toBe(false);
  });

  it('moving the App Icon Size slider to a non-Large value does not force-hide labels', async () => {
    const store = setupMemoryAsyncStorage();
    const { UNSAFE_getAllByType } = render(<LauncherSettingsScreen />);

    let slider: ReturnType<typeof UNSAFE_getAllByType>[number];
    await waitFor(() => {
      [slider] = UNSAFE_getAllByType(CupertinoSlider);
      expect(slider).toBeTruthy();
    }, { timeout: 3000 });

    slider!.props.onValueChange(1.0);

    const persisted = await waitForPersisted(store, (s) => s.iconSizeScale === 1.0);
    expect(persisted.iconSizeScale).toBe(1.0);
    expect(persisted.showIconLabels).toBe(true); // default preserved, unaffected
  });

  it('toggling Show App Names persists showIconLabels', async () => {
    const store = setupMemoryAsyncStorage();
    const { getByText } = render(<LauncherSettingsScreen />);

    let label: ReturnType<typeof getByText>;
    await waitFor(() => {
      label = getByText('Show App Names');
      expect(label).toBeTruthy();
    }, { timeout: 3000 });

    // Walk up from the tile's title text to the nearest ancestor that also
    // contains the trailing CupertinoSwitch — avoids guessing a fixed switch
    // index, which is fragile across every other tile on this screen.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let node: any = label!;
    while (node && within(node).UNSAFE_queryAllByType(CupertinoSwitch).length !== 1) {
      node = node.parent;
    }
    expect(node).toBeTruthy();
    const showAppNamesSwitch = within(node).UNSAFE_getByType(CupertinoSwitch);
    expect(showAppNamesSwitch.props.value).toBe(true); // default showIconLabels

    showAppNamesSwitch.props.onValueChange(false);

    const persisted = await waitForPersisted(store, (s) => s.showIconLabels === false);
    expect(persisted.showIconLabels).toBe(false);
  });
});
