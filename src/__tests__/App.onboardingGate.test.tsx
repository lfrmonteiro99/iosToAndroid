/**
 * Tests for the App.tsx onboarding gate's resilience to an AsyncStorage read
 * failure (issue #676 — App Library / launcher unreachable).
 *
 * Red step (before fix):
 *   App.tsx reads '@iostoandroid/onboarding_done' with NO .catch. When that
 *   AsyncStorage.getItem rejects (corrupted DB, permission error, concurrent
 *   write during launch — all real RN scenarios), `setShowOnboarding` is never
 *   called, `showOnboarding` stays `null`, and `AppContent` returns `null` at
 *   the `if (showOnboarding === null) return null;` guard — a PERMANENT blank
 *   screen that blocks the launcher AND the App Library. The launcher never
 *   mounts, so 'TAB_NAVIGATOR_MOUNTED' never appears.
 *
 * Green step (after fix):
 *   The read is guarded with .catch, defaulting `showOnboarding` to `false`
 *   (show the launcher) on error — the launcher becomes reachable instead of
 *   the app hanging on a blank screen.
 *
 * NOTE on the issue's stated root cause: the issue claimed onboarding "isn't
 * persisted". A separate end-to-end experiment proved persistence works
 * correctly (fresh install -> onboarding; completing it writes the flag; a
 * relaunch then skips onboarding and reaches the launcher). The ACTUAL defect
 * blocking the launcher/App Library is this unguarded read, which traps the app
 * on a blank screen whenever the storage read fails.
 */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';

const mockUseFonts = jest.fn();
jest.mock('expo-font', () => ({
  useFonts: (...args: unknown[]) => mockUseFonts(...args),
}));

jest.mock('../../modules/launcher-module/src', () => ({
  __esModule: true,
  addNotificationListener: jest.fn(() => jest.fn()),
  onBridgeError: jest.fn(() => jest.fn()),
  default: {
    isDefaultLauncher: jest.fn(() => Promise.resolve(false)),
    isNotificationAccessGranted: jest.fn(() => Promise.resolve(false)),
    getProcessStartAgeMs: jest.fn(() => Promise.resolve(-1)),
    getNotifications: jest.fn(() => Promise.resolve([])),
  },
}));

// Mutable: each test controls how the onboarding key read behaves. We reject
// ONLY that key so the SettingsStore read (a different key) still resolves and
// its 500ms gate clears — isolating the onboarding-gate behaviour we're fixing.
let mockOnboardingRead: () => Promise<string | null> = () => Promise.resolve(null);
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) =>
      key === '@iostoandroid/onboarding_done'
        ? mockOnboardingRead()
        : Promise.resolve(null),
    ),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../screens/LockScreen', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  return {
    LockScreen: ({ onUnlock }: { onUnlock: () => void }) => {
      R.useEffect(() => { onUnlock(); }, [onUnlock]);
      return null;
    },
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => false), getParent: () => ({ navigate: jest.fn() }) }),
  useRoute: () => ({ params: {} }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
  useNavigationContainerRef: () => ({ current: null, navigate: jest.fn(), isReady: () => true }),
}));

jest.mock('../navigation/TabNavigator', () => ({
  TabNavigator: () => {
    const R = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return R.createElement(Text, null, 'TAB_NAVIGATOR_MOUNTED');
  },
}));

jest.mock('../components/GestureHost', () => ({
  GestureHost: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
}));
jest.mock('../components/HomeIndicator', () => ({ HomeIndicator: () => null }));
jest.mock('../components/QuickSwitchHomeBar', () => ({ QuickSwitchHomeBar: () => null }));
jest.mock('../store/AssistiveTouchStore', () => ({
  AssistiveTouchProvider: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
  useAssistiveTouch: () => ({ reachabilityActive: false, setReachabilityActive: jest.fn() }),
}));
jest.mock('../components/AssistiveTouch', () => ({ AssistiveTouch: () => null }));

// Ionicons mock — without it, <Ionicons> throws "Font.isLoaded is not a
// function" and OnboardingScreen (which renders several <Ionicons>) never
// mounts, masking the real gate behaviour. This only stubs the icon glyph so
// the onboarding UI can render in tests.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: { name?: string }) => {
    const R = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return R.createElement(Text, { accessibilityLabel: props.name }, props.name ?? 'icon');
  },
  MaterialIcons: (props: { name?: string }) => {
    const R = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return R.createElement(Text, null, props.name ?? 'icon');
  },
}));
jest.mock('react-native-vector-icons/Ionicons', () => (props: { name?: string }) => {
  const R = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return R.createElement(Text, null, props.name ?? 'icon');
});

import App from '../../App';

async function settle(ms = 700) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

describe('App — onboarding gate survives a failed storage read (#676)', () => {
  beforeEach(() => {
    mockUseFonts.mockReset();
    mockUseFonts.mockReturnValue([true, null]);
    jest.clearAllMocks();
  });

  it('onboarding_done read REJECTS → launcher is still reachable (no permanent blank)', async () => {
    mockOnboardingRead = () => Promise.reject(new Error('AsyncStorage corrupt'));
    render(<App />);
    // Wait past the SettingsStore 500ms firstSyncDone gate.
    await waitFor(() => screen.getByText('TAB_NAVIGATOR_MOUNTED'), { timeout: 4000 });
    // eslint-disable-next-line no-console
    console.log('[676] reject → launcher mounted?', !!screen.queryByText('TAB_NAVIGATOR_MOUNTED'));
    expect(screen.queryByText('TAB_NAVIGATOR_MOUNTED')).not.toBeNull();
  });

  it('onboarding_done resolves null → OnboardingScreen IS shown (first run, unchanged)', async () => {
    mockOnboardingRead = () => Promise.resolve(null);
    render(<App />);
    await waitFor(() => screen.getByText(/Welcome to/i), { timeout: 4000 });
    // eslint-disable-next-line no-console
    console.log('[676] null → Welcome present?', !!screen.queryByText(/Welcome to/i));
    expect(screen.queryByText(/Welcome to/i)).not.toBeNull();
  });

  it('onboarding_done resolves "true" → OnboardingScreen skipped, launcher shown (persistence, unchanged)', async () => {
    mockOnboardingRead = () => Promise.resolve('true');
    render(<App />);
    await waitFor(() => screen.getByText('TAB_NAVIGATOR_MOUNTED'), { timeout: 4000 });
    // eslint-disable-next-line no-console
    console.log('[676] true → Welcome present?', !!screen.queryByText(/Welcome to/i));
    expect(screen.queryByText(/Welcome to/i)).toBeNull();
  });
});
