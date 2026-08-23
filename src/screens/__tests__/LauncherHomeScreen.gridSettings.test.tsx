import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, waitFor, within } from '../../test-utils';
import * as AppsStore from '../../store/AppsStore';
import { LauncherHomeScreen, BUILT_IN_APPS } from '../LauncherHomeScreen';
import { computeLauncherGridGeometry } from '../../utils/launcherGridGeometry';

// issue #503: gridColumns / gridRows / iconSizeScale / showIconLabels must
// reshape the home-screen grid live, from SettingsStore — before this issue
// the pager always used a fixed 4x6 = 24 apps/page regardless of settings.
//
// useApps is mocked the same way LauncherHomeScreen.perf.test.tsx does it
// (isLoading: false, empty app lists): AppsStore's real Android loading path
// resolves isLoading asynchronously, and letting that transition actually
// complete under `waitFor` re-exposes a pre-existing hook-count mismatch in
// LauncherHomeScreen (hooks after the isLoading early-return are only called
// once isLoading flips to false — see the `eslint-disable react-hooks/rules-of-hooks`
// above `gridItems`). That's out of scope for #503; mocking useApps to a
// stable isLoading:false, like the existing perf test already does, avoids
// ever crossing that boundary. Settings still load through the real
// SettingsProvider (via test-utils), seeded through AsyncStorage.
function mockApps(overrides: Record<string, unknown> = {}) {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps: [],
    homeApps: [],
    dockApps: [],
    nonDockApps: [],
    recentPackages: [],
    recentApps: [],
    isLoading: false,
    refreshApps: jest.fn(() => Promise.resolve()),
    launchApp: jest.fn(() => Promise.resolve(true)),
    addToHome: jest.fn(),
    removeFromHome: jest.fn(),
    addToDock: jest.fn(),
    removeFromDock: jest.fn(),
    removeFromRecents: jest.fn(),
    clearRecents: jest.fn(),
    isDefaultLauncher: true,
    openLauncherSettings: jest.fn(() => Promise.resolve()),
    iconCacheSizeBytes: 0,
    isRebuildingIconCache: false,
    iconCacheRebuildProgress: null,
    rebuildIconCache: jest.fn(() => Promise.resolve()),
    ...overrides,
  } as ReturnType<typeof AppsStore.useApps>);
}

function seedSettings(partial: Record<string, unknown>) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    key === '@iostoandroid/settings'
      ? Promise.resolve(JSON.stringify(partial))
      : Promise.resolve(null),
  );
}

const BUILT_IN_COUNT = Object.keys(BUILT_IN_APPS).length; // 14 virtual apps, no real device apps mocked

/** Achata um style (array de objectos) com precedência da última entrada. */
function flattenStyle(element: { props: { style: unknown } }): Record<string, number> {
  const style = element.props.style;
  const flat = (Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean) as Record<string, number>[];
  return flat.reduce((acc, s) => ({ ...acc, ...s }), {});
}

beforeEach(() => {
  mockApps();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LauncherHomeScreen grid density settings (#503)', () => {
  it('paginates using gridColumns x gridRows from settings, not a fixed 24/page', async () => {
    // 3 cols x 2 rows = 6 apps/page; 14 built-in apps need 3 pages (6+6+2).
    seedSettings({ gridColumns: 3, gridRows: 2 });
    const { getByTestId, queryByTestId } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByTestId('launcher-page-grid-2')).toBeTruthy(), { timeout: 3000 });
    expect(queryByTestId('launcher-page-grid-1')).toBeTruthy();
  });

  it('uses a single app page at the default 4x6 density for the same app set', async () => {
    seedSettings({});
    const { getByTestId, queryByTestId } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByTestId('launcher-page-grid-0')).toBeTruthy(), { timeout: 3000 });
    // 14 built-in apps < 24/page: only one app page (plus the App Library
    // page, which isn't a launcher-page-grid-* testID).
    await waitFor(() => expect(queryByTestId('launcher-page-grid-1')).toBeNull(), { timeout: 3000 });
  });

  it('re-packs pages without reordering apps when density changes', async () => {
    seedSettings({ gridColumns: 4, gridRows: 6 });
    const wide = render(<LauncherHomeScreen />);
    await waitFor(() => expect(wide.getByTestId('launcher-page-grid-0')).toBeTruthy(), { timeout: 3000 });
    const wideOrder = within(wide.getByTestId('launcher-page-grid-0'))
      .getAllByRole('button')
      .map((n) => n.props.accessibilityLabel)
      .filter((l: string) => l?.startsWith('Open '));
    wide.unmount();

    seedSettings({ gridColumns: 3, gridRows: 2 });
    const narrow = render(<LauncherHomeScreen />);
    await waitFor(() => expect(narrow.getByTestId('launcher-page-grid-2')).toBeTruthy(), { timeout: 3000 });
    const narrowOrder = [0, 1, 2].flatMap((i) =>
      within(narrow.getByTestId(`launcher-page-grid-${i}`))
        .getAllByRole('button')
        .map((n) => n.props.accessibilityLabel)
        .filter((l: string) => l?.startsWith('Open ')),
    );
    narrow.unmount();

    expect(narrowOrder).toHaveLength(BUILT_IN_COUNT);
    expect(narrowOrder).toEqual(wideOrder);
  });

  it('showIconLabels: false hides app names in the grid but keeps icons tappable', async () => {
    seedSettings({ showIconLabels: false });
    const { queryByText, getByLabelText } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByLabelText('Open Phone')).toBeTruthy(), { timeout: 3000 });
    expect(queryByText('Phone')).toBeNull();
  });

  it('showIconLabels: true (default) shows app names in the grid', async () => {
    seedSettings({});
    const { queryByText } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(queryByText('Phone')).toBeTruthy(), { timeout: 3000 });
  });

  it('iconSizeScale resizes the rendered icon box and keeps it within the cell', async () => {
    seedSettings({ iconSizeScale: 1.2, gridColumns: 6 });
    const { getByTestId } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByTestId('app-icon-box-com.iostoandroid.phone')).toBeTruthy(), { timeout: 3000 });
    const box = getByTestId('app-icon-box-com.iostoandroid.phone');
    const style = box.props.style;
    const flat = (Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean) as Record<string, number>[];
    const width = flat.reduce((acc, s) => (s.width != null ? s.width : acc), undefined as number | undefined);

    const expected = computeLauncherGridGeometry(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('react-native').Dimensions.get('window').width,
      6,
      1.2,
    );
    expect(width).toBe(expected.iconSize);
    expect(width).toBeLessThanOrEqual(expected.cellWidth);
  });

  it('showIconLabels: false + iconSizeScale 1.2 keeps the cell taller than the icon (no vertical overlap)', async () => {
    // Review follow-up: a combinação labels-off × escala 1.2 não estava
    // coberta — o teste de labels-off corria só a escala 1.0, onde o defeito
    // não aparece. Antes do fix, `appIconWrapperCompact` (height: ICON_SIZE
    // estático) vinha depois do wrapperHeight dinâmico no array de estilos e
    // sobrepunha-o: com o ícone escalado a 1.2 a célula ficava mais baixa que
    // o ícone e este sobrepunha a linha seguinte da grelha.
    seedSettings({ showIconLabels: false, iconSizeScale: 1.2 });
    const { getByLabelText } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByLabelText('Open Phone')).toBeTruthy(), { timeout: 3000 });
    const height = flattenStyle(getByLabelText('Open Phone')).height as number;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const width = require('react-native').Dimensions.get('window').width;
    const expected = computeLauncherGridGeometry(width, 4, 1.2);

    // Invariante vertical: a célula tem de ter altura >= ícone, senão o ícone
    // transborda para a linha seguinte.
    expect(height).toBeGreaterThanOrEqual(expected.iconSize);
    // E a célula é exactamente o paddingTop (5) + o ícone, sem label.
    expect(height).toBe(5 + expected.iconSize);
  });

  it('showIconLabels: false + iconSizeScale 0.8 shrinks the cell with the icon', async () => {
    // O inverso do fix: quando o ícone encolhe, a célula tem de encolher com
    // ele (5 + iconSize), não ficar presa no ICON_SIZE de escala 1.0.
    seedSettings({ showIconLabels: false, iconSizeScale: 0.8 });
    const { getByLabelText } = render(<LauncherHomeScreen />);

    await waitFor(() => expect(getByLabelText('Open Phone')).toBeTruthy(), { timeout: 3000 });
    const height = flattenStyle(getByLabelText('Open Phone')).height as number;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const width = require('react-native').Dimensions.get('window').width;
    const expected = computeLauncherGridGeometry(width, 4, 0.8);

    expect(height).toBe(5 + expected.iconSize);
    expect(height).toBeLessThan(computeLauncherGridGeometry(width, 4, 1).iconSize);
  });

  it('does not throw "Rendered more hooks" when isLoading flips true→false (reviewer regression)', async () => {
    // Reviewer follow-up (#599 / #503): gridItems / pages / clamp useEffect
    // used to sit BELOW the isLoading early return, gated by
    // `eslint-disable-next-line react-hooks/rules-of-hooks`. On any render that
    // took the loading path those hooks were skipped, so the isLoading:true →
    // false transition called a different number of hooks than the previous
    // render and React threw "Rendered more hooks than during the previous
    // render". Hoisting those three hooks above the early returns must keep the
    // hook count identical across the transition.
    mockApps({ isLoading: true });
    const { rerender, getByLabelText } = render(<LauncherHomeScreen />);

    // Flip the mock to the loaded state with at least one real app present.
    mockApps({
      isLoading: false,
      nonDockApps: [{ name: 'SomeApp', packageName: 'com.example.someapp', icon: '', isSystem: false }],
    });
    // Must NOT throw the rules-of-hooks crash on re-render after the flip.
    expect(() => rerender(<LauncherHomeScreen />)).not.toThrow();

    // And the loaded grid must now be present (built-in Phone app always shows).
    await waitFor(() => expect(getByLabelText('Open Phone')).toBeTruthy(), { timeout: 3000 });
  });
});
