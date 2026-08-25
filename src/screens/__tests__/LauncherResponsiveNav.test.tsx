import React from 'react';
import { Dimensions, Text } from 'react-native';
import {
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { render, fireEvent } from '../../test-utils';
import { LauncherHomeScreen } from '../LauncherHomeScreen';
import * as AppsStore from '../../store/AppsStore';

// jest.setup.js mocks @react-navigation/native and @react-navigation/native-stack
// project-wide as dumb passthroughs (`Screen: ({ children }) => children`, no
// real routing) — see src/navigation/__tests__/hardwareBack.test.tsx for the
// established precedent. This test needs the REAL stack navigator to prove the
// responsive nav shell (#633/#651) actually switches routes through a real
// NavigationContainer, so it un-mocks both locally.
jest.unmock('@react-navigation/native');
jest.unmock('@react-navigation/native-stack');

// The real NavigationContainer (via @react-navigation/elements'
// SafeAreaProviderCompat) reads react-native-safe-area-context's real
// SafeAreaInsetsContext. jest.setup.js's project-wide mock is a bare object
// with no context at all, which crashes SafeAreaProviderCompat's
// `useContext(SafeAreaInsetsContext)` — swap in the library's own jest mock,
// which provides a real (test-safe) context.
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mock = require('react-native-safe-area-context/jest/mock');
  // The mock file is transformed from `export default {...}` — a bare
  // require() surfaces it under `.default` instead of as named exports.
  return mock.default ?? mock;
});

type TestParamList = {
  HomeMain: undefined;
  Phone: undefined;
};

const Stack = createNativeStackNavigator<TestParamList>();

function PhonePlaceholderScreen() {
  return <Text testID="phone-screen">Phone</Text>;
}

let capturedNavRef: ReturnType<typeof useNavigationContainerRef<TestParamList>> | null = null;

function TestApp() {
  const navRef = useNavigationContainerRef<TestParamList>();
  React.useEffect(() => {
    capturedNavRef = navRef;
  }, [navRef]);
  return (
    <NavigationContainer ref={navRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="HomeMain" component={LauncherHomeScreen} />
        <Stack.Screen name="Phone" component={PhonePlaceholderScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function setWidth(width: number) {
  const dim = { width, height: 800, scale: 2, fontScale: 1 };
  Dimensions.set({ window: dim, screen: dim });
}

// The real AppsProvider starts with isLoading: true until its async load
// effect resolves; render() here is synchronous, so without this override
// LauncherHomeScreen would be stuck on the loading spinner and neither the
// dock nor the sidebar would ever appear (same pattern as the existing
// LauncherHomeScreen.*.test.tsx suites).
function mockApps() {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps: [],
    homeApps: [],
    dockApps: [],
    nonDockApps: [],
    recentPackages: [],
    recentApps: [],
    isLoading: false,
    compactHomeLayout: jest.fn(),
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
    hiddenApps: [],
    visibleApps: [],
    hideApp: jest.fn(),
    unhideApp: jest.fn(),
    iconCacheSizeBytes: 0,
    isRebuildingIconCache: false,
    iconCacheRebuildProgress: null,
    rebuildIconCache: jest.fn(() => Promise.resolve()),
  } as ReturnType<typeof AppsStore.useApps>);
}

describe('LauncherResponsiveNav integration (#651-C)', () => {
  beforeEach(() => {
    mockApps();
  });

  afterEach(() => {
    capturedNavRef = null;
    jest.restoreAllMocks();
  });

  it('tablet width: shows the sidebar and the dock, and picking a sidebar item switches the current route', () => {
    setWidth(1024);
    const { getByTestId } = render(<TestApp />);

    expect(getByTestId('cupertino-sidebar')).toBeTruthy();
    expect(getByTestId('launcher-dock')).toBeTruthy();

    fireEvent.press(getByTestId('side-bar-item-Phone'));

    expect(capturedNavRef?.current?.getCurrentRoute()?.name).toBe('Phone');
  });

  it('phone width: no sidebar — the launcher dock is the only navigation', () => {
    setWidth(390);
    const { getByTestId, queryByTestId } = render(<TestApp />);

    expect(queryByTestId('cupertino-sidebar')).toBeNull();
    expect(getByTestId('launcher-dock')).toBeTruthy();
  });
});
