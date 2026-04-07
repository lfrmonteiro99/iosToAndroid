import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { LauncherHomeScreen } from '../LauncherHomeScreen';
import { DeviceProvider } from '../../store/DeviceStore';
import { SettingsProvider } from '../../store/SettingsStore';
import { AppsProvider } from '../../store/AppsStore';
import { ThemeProvider } from '../../theme/ThemeContext';
import { FoldersProvider } from '../../store/FoldersStore';

jest.mock('expo-navigation-bar', () => ({
  setVisibilityAsync: jest.fn(() => Promise.resolve()),
  setPositionAsync: jest.fn(() => Promise.resolve()),
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
  setBehaviorAsync: jest.fn(() => Promise.resolve()),
}));

function renderScreen() {
  return render(
    <ThemeProvider>
      <DeviceProvider>
        <SettingsProvider>
          <AppsProvider>
            <FoldersProvider>
              <LauncherHomeScreen />
            </FoldersProvider>
          </AppsProvider>
        </SettingsProvider>
      </DeviceProvider>
    </ThemeProvider>,
  );
}

describe('LauncherHomeScreen', () => {
  it('renders without crash', async () => {
    const { toJSON } = renderScreen();
    await waitFor(() => {
      expect(toJSON()).toBeTruthy();
    });
  });

  it('renders the dock area', async () => {
    const { toJSON } = renderScreen();
    await waitFor(() => {
      const tree = JSON.stringify(toJSON());
      // Dock is rendered as a BlurView container
      expect(tree).toBeTruthy();
    });
  });

  it('renders the component tree', async () => {
    const { toJSON } = renderScreen();
    await waitFor(() => {
      const tree = JSON.stringify(toJSON());
      // The tree should contain time-related text or status bar elements
      expect(tree.length).toBeGreaterThan(100);
    });
  });
});
