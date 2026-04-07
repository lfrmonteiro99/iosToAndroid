import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { NotificationCenterScreen } from '../NotificationCenterScreen';
import { ThemeProvider } from '../../theme/ThemeContext';
import { AppsProvider } from '../../store/AppsStore';

// The component uses dynamic import() for the launcher module, which doesn't work
// in Jest without --experimental-vm-modules. The component falls back gracefully
// when getLauncher() returns null, showing the "no access" UI by default.

function renderScreen() {
  return render(
    <ThemeProvider>
      <AppsProvider>
        <NotificationCenterScreen />
      </AppsProvider>
    </ThemeProvider>,
  );
}

describe('NotificationCenterScreen', () => {
  it('renders without crash', async () => {
    const { toJSON } = renderScreen();
    await waitFor(() => {
      expect(toJSON()).toBeTruthy();
    });
  });

  it('shows the date header', async () => {
    const { getByText } = renderScreen();
    const today = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[today.getDay()];
    await waitFor(() => {
      expect(getByText(new RegExp(dayName))).toBeTruthy();
    });
  });

  it('shows notification access required card by default (no launcher module)', async () => {
    const { getByText } = renderScreen();
    await waitFor(() => {
      expect(getByText('Notification Access Required')).toBeTruthy();
    });
  });

  it('shows Enable Notification Access button', async () => {
    const { getByText } = renderScreen();
    await waitFor(() => {
      expect(getByText('Enable Notification Access')).toBeTruthy();
    });
  });
});
