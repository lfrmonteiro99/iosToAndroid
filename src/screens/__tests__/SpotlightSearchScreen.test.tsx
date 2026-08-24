import React from 'react';
import { render, fireEvent, act } from '../../test-utils';
import { SpotlightSearchScreen } from '../SpotlightSearchScreen';
import type { AppNavigationProp } from '../../navigation/types';
import { useApps } from '../../store/AppsStore';

jest.mock('../../store/AppsStore', () => {
  const actual = jest.requireActual('../../store/AppsStore');
  return {
    ...actual,
    useApps: jest.fn(),
  };
});

const mockLaunchApp = jest.fn();

function renderWithApps(apps: Array<{ name: string; packageName: string }>) {
  (useApps as unknown as jest.Mock).mockReturnValue({
    apps,
    launchApp: mockLaunchApp,
  });
  const nav = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;
  return { nav, ...render(<SpotlightSearchScreen navigation={nav} />) };
}

const WEATHER_APP = { name: 'Weather', packageName: 'com.iostoandroid.weather' };

describe('SpotlightSearchScreen', () => {
  beforeEach(() => {
    mockLaunchApp.mockClear();
  });

  it('renders without crashing', () => {
    const { toJSON } = renderWithApps([WEATHER_APP]);
    expect(toJSON()).toBeTruthy();
  });

  it('renders Search title', () => {
    const { getByText } = renderWithApps([WEATHER_APP]);
    expect(getByText('Search')).toBeTruthy();
  });

  it('renders search bar', () => {
    const { getByPlaceholderText } = renderWithApps([WEATHER_APP]);
    expect(getByPlaceholderText('Search')).toBeTruthy();
  });

  it('renders Back button', () => {
    const { getByText } = renderWithApps([WEATHER_APP]);
    expect(getByText('Back')).toBeTruthy();
  });

  it('pressing Back calls navigation.goBack', () => {
    const { nav, getByLabelText } = renderWithApps([WEATHER_APP]);
    fireEvent.press(getByLabelText('Back'));
    expect(nav.goBack).toHaveBeenCalled();
  });

  // --- issue #710 regression: built-in apps must open the in-app screen ---
  it('tapping a built-in app (Weather) navigates internally, not via native launch', async () => {
    const { nav, getByPlaceholderText, getByText } = renderWithApps([WEATHER_APP]);
    fireEvent.changeText(getByPlaceholderText('Search'), 'weather');
    const result = getByText('Weather');
    await act(async () => {
      fireEvent.press(result);
      // handleResultPress awaits addToHistory before routing — let it settle.
      await Promise.resolve();
    });
    // Must open the internal Weather screen…
    expect(nav.navigate).toHaveBeenCalledWith('Weather');
    // …and must NOT hand the built-in packageName to the native launcher
    // bridge (that is what dumped the user onto the Android home screen).
    expect(mockLaunchApp).not.toHaveBeenCalledWith('com.iostoandroid.weather');
  });
});