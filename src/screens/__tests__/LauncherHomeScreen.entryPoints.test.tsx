import React from 'react';
import { render, fireEvent, within, act } from '../../test-utils';
import { Ionicons } from '@expo/vector-icons';
import * as AppsStore from '../../store/AppsStore';
import { LauncherHomeScreen } from '../LauncherHomeScreen';

// #442: Notes, Reminders and Mail were fully implemented screens with no
// home-screen icon — the only door was a Spotlight result built by filtering
// *existing* notes/reminders by title, so on a clean install there was
// nothing to match and nothing to tap (see the issue's escalation comment).
// These tests exercise the real fix: the actual `BUILT_IN_APPS` /
// `VIRTUAL_ICON_CONFIG` entries wired into LauncherHomeScreen, not a
// reimplementation of the routing logic.
//
// TodayView is deliberately NOT covered here — it was re-scoped out of #442
// into #455, which owns the product decision about how it should be reached.

const mockNavigate = jest.fn();
const mockLaunchApp = jest.fn(() => Promise.resolve());

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
    canGoBack: jest.fn(() => false),
    getParent: () => ({ navigate: jest.fn() }),
  }),
  useRoute: () => ({ params: {} }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// AppsStore starts with isLoading: true until the native app list resolves
// (AppsStore.tsx:89), and the screen renders only a spinner while loading —
// every test here needs the loaded state to see the grid at all.
function mockLoadedApps(overrides: Partial<ReturnType<typeof AppsStore.useApps>> = {}) {
  jest.spyOn(AppsStore, 'useApps').mockReturnValue({
    apps: [],
    homeApps: [],
    dockApps: [],
    nonDockApps: [],
    recentPackages: [],
    recentApps: [],
    isLoading: false,
    refreshApps: jest.fn(() => Promise.resolve()),
    launchApp: mockLaunchApp,
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
    ...overrides,
  } as ReturnType<typeof AppsStore.useApps>);
}

beforeEach(() => {
  mockNavigate.mockClear();
  mockLaunchApp.mockClear();
  mockLoadedApps();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LauncherHomeScreen built-in icons for Notes, Reminders, Mail (#442)', () => {
  it('renders a home-screen icon for Notes, Reminders and Mail', () => {
    const { getByLabelText } = render(<LauncherHomeScreen />);
    expect(getByLabelText('Open Notes')).toBeTruthy();
    expect(getByLabelText('Open Reminders')).toBeTruthy();
    expect(getByLabelText('Open Mail')).toBeTruthy();
  });

  it('uses a themed icon for each, not the generic fallback glyph ("apps")', () => {
    const { getByLabelText } = render(<LauncherHomeScreen />);
    for (const label of ['Open Notes', 'Open Reminders', 'Open Mail']) {
      const icon = within(getByLabelText(label)).UNSAFE_getByType(Ionicons);
      expect(icon.props.name).not.toBe('apps');
    }
  });

  it('pressing the Notes icon navigates to the internal Notes screen', () => {
    const { getByLabelText } = render(<LauncherHomeScreen />);
    fireEvent.press(getByLabelText('Open Notes'));
    expect(mockNavigate).toHaveBeenCalledWith('Notes');
  });

  it('pressing the Reminders icon navigates to the internal Reminders screen', () => {
    const { getByLabelText } = render(<LauncherHomeScreen />);
    fireEvent.press(getByLabelText('Open Reminders'));
    expect(mockNavigate).toHaveBeenCalledWith('Reminders');
  });

  it('pressing the Mail icon navigates to the internal Mail screen', () => {
    const { getByLabelText } = render(<LauncherHomeScreen />);
    fireEvent.press(getByLabelText('Open Mail'));
    expect(mockNavigate).toHaveBeenCalledWith('Mail');
  });

  it('reaching Notes does not depend on any note already existing (clean-install case from the escalation comment)', () => {
    // No notes/reminders/contacts data is mocked anywhere in this render —
    // this is the clean-install scenario the escalation comment described as
    // a deadlock (no note exists → Spotlight has nothing to match → no way
    // to open Notes to create the first one). The icon must still be there.
    const { getByLabelText } = render(<LauncherHomeScreen />);
    fireEvent.press(getByLabelText('Open Notes'));
    expect(mockNavigate).toHaveBeenCalledWith('Notes');
  });

  it('routes to the internal screen twice on a double tap, never to a different route', () => {
    // Double-tapping an icon is a recurring defect shape in this repo: the
    // second press must resolve through the same BUILT_IN_APPS entry, not
    // fall through to launchApp (which would try to start a nonexistent
    // Android package called com.iostoandroid.notes).
    const { getByLabelText } = render(<LauncherHomeScreen />);
    const icon = getByLabelText('Open Notes');
    fireEvent.press(icon);
    fireEvent.press(icon);
    expect(mockNavigate).toHaveBeenCalledTimes(2);
    expect(mockNavigate).toHaveBeenNthCalledWith(1, 'Notes');
    expect(mockNavigate).toHaveBeenNthCalledWith(2, 'Notes');
    expect(mockLaunchApp).not.toHaveBeenCalled();
  });

  it('still launches real Android apps externally — adding the 3 entries did not internalise everything', async () => {
    // The inverse of the fix: a package that is NOT in BUILT_IN_APPS must
    // keep going through launchApp, so widening the table cannot have
    // silently swallowed every third-party icon into navigate().
    //
    // #509 made this path asynchronous: pressing a non-built-in icon now
    // measures its on-screen bounds before deciding to launch (so it can show
    // the icon-expand transition), and this suite mocks neither
    // measureInWindow nor the reanimated spring — so the icon falls through
    // AppIcon's real ~50ms measurement-fallback timer before launchApp fires.
    mockLoadedApps({
      nonDockApps: [{ name: 'YT Music', packageName: 'com.google.android.apps.youtube.music', icon: '', isSystem: false }],
    });
    const { getByLabelText } = render(<LauncherHomeScreen />);
    fireEvent.press(getByLabelText('Open YT Music'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 75));
    });

    expect(mockLaunchApp).toHaveBeenCalledWith('com.google.android.apps.youtube.music');
    expect(mockNavigate).not.toHaveBeenCalledWith('Notes');
  });

  it('shows Notes only once when it already sits in the dock (no duplicate grid icon — #438)', () => {
    // The grid builds its virtual icons from BUILT_IN_APPS and skips anything
    // already in the dock. Adding Notes to that table must not produce two
    // "Open Notes" targets for a user who docked it.
    mockLoadedApps({
      dockApps: [{ name: 'Notes', packageName: 'com.iostoandroid.notes', icon: '', isSystem: false }],
    });
    const { getAllByLabelText } = render(<LauncherHomeScreen />);
    expect(getAllByLabelText('Open Notes')).toHaveLength(1);
  });
});
