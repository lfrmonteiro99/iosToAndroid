import React from 'react';
import { Text } from 'react-native';
import * as RN from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, waitFor, act } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { SettingsProvider } from '../../store/SettingsStore';

const THEME_KEY = '@iostoandroid/theme_preference';

function ThemeProbe() {
  const { isDark, isReady, mode } = useTheme();
  return <Text>{`isDark=${isDark} isReady=${isReady} mode=${mode}`}</Text>;
}

/**
 * Renders ThemeProvider with the settings gate off (settings are not what we are
 * testing) and the theme gate on by default. The theme gate is the behaviour
 * under test: it must hold back the first render until the saved theme has
 * hydrated, so the app never paints a wrong-theme frame on launch.
 */
function renderTheme(ui: React.ReactNode, themeGateFirstRender?: boolean) {
  return render(
    <SettingsProvider gateFirstRender={false}>
      <ThemeProvider gateFirstRender={themeGateFirstRender}>{ui}</ThemeProvider>
    </SettingsProvider>,
  );
}

beforeEach(() => {
  (AsyncStorage.getItem as jest.Mock).mockReset();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  jest.spyOn(RN, 'useColorScheme').mockReturnValue('light');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ThemeProvider launch gate (C4: no wrong-theme flash)', () => {
  it('renders nothing until the saved theme has hydrated', async () => {
    const { queryByText } = renderTheme(<ThemeProbe />);

    // Gate on: before AsyncStorage resolves, the provider returns null, so the
    // first frame can never be a time-based guess at the theme.
    expect(queryByText(/isDark=/)).toBeNull();

    await waitFor(() => expect(queryByText(/isDark=/)).toBeTruthy());
  });

  it('hydrates a saved dark override before first paint', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === THEME_KEY ? Promise.resolve('dark') : Promise.resolve(null),
    );

    const { getByText } = renderTheme(<ThemeProbe />);

    await waitFor(() => expect(getByText(/isDark=true/)).toBeTruthy());
    expect(getByText(/mode=dark/)).toBeTruthy();
  });

  it('hydrates a saved light override before first paint', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === THEME_KEY ? Promise.resolve('light') : Promise.resolve(null),
    );

    const { getByText } = renderTheme(<ThemeProbe />);

    await waitFor(() => expect(getByText(/isDark=false/)).toBeTruthy());
    expect(getByText(/mode=light/)).toBeTruthy();
  });

  it('defers to the system scheme when no preference is saved', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (RN.useColorScheme as jest.Mock).mockReturnValue('dark');

    const { getByText } = renderTheme(<ThemeProbe />);

    await waitFor(() => expect(getByText(/isDark=true/)).toBeTruthy());
    expect(getByText(/mode=system/)).toBeTruthy();
  });

  it('stays light on a light system scheme when no preference is saved', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (RN.useColorScheme as jest.Mock).mockReturnValue('light');

    const { getByText } = renderTheme(<ThemeProbe />);

    await waitFor(() => expect(getByText(/isDark=false/)).toBeTruthy());
    expect(getByText(/mode=system/)).toBeTruthy();
  });

  it('does not seed isDark from the clock before hydration', async () => {
    // The old code computed the initial isDark from new Date().getHours()
    // (dark 19:00–07:00). Pin the clock to 20:00 and a light system scheme:
    // the pre-hydration render must be light, never a time-of-day guess.
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date(2026, 0, 1, 20, 0, 0));
      (RN.useColorScheme as jest.Mock).mockReturnValue('light');

      const { getByText } = renderTheme(<ThemeProbe />, false);

      expect(getByText(/isDark=false/)).toBeTruthy();

      // Flush the async hydration + settings sync inside act so no state
      // update lands outside act after the test ends.
      await act(async () => {});
    } finally {
      jest.useRealTimers();
    }
  });

  it('a saved dark override wins over a light system scheme', async () => {
    // The exact scenario from the issue: user opens the app at 10:00 (light
    // system scheme) with a saved dark override — the first painted theme must
    // be dark, never a light flash.
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === THEME_KEY ? Promise.resolve('dark') : Promise.resolve(null),
    );
    (RN.useColorScheme as jest.Mock).mockReturnValue('light');

    const { getByText } = renderTheme(<ThemeProbe />);

    await waitFor(() => expect(getByText(/isDark=true/)).toBeTruthy());
  });

  it('renders children immediately when the gate is off (test harness contract)', async () => {
    const { getByText } = renderTheme(<ThemeProbe />, false);

    // gateFirstRender={false} is what src/test-utils.tsx passes so synchronous
    // screen tests see the subtree instead of null.
    expect(getByText(/isDark=/)).toBeTruthy();

    // Flush the async hydration + settings sync so no state update lands
    // outside act after the test ends.
    await act(async () => {});
  });
});
