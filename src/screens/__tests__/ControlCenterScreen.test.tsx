import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { ControlCenterScreen } from '../ControlCenterScreen';
import { DeviceProvider } from '../../store/DeviceStore';
import { SettingsProvider } from '../../store/SettingsStore';
import { ThemeProvider } from '../../theme/ThemeContext';

function renderScreen() {
  return render(
    <ThemeProvider>
      <DeviceProvider>
        <SettingsProvider>
          <ControlCenterScreen
            navigation={{ goBack: jest.fn() }}
            route={{ params: {} }}
          />
        </SettingsProvider>
      </DeviceProvider>
    </ThemeProvider>,
  );
}

describe('ControlCenterScreen', () => {
  it('renders without crash', async () => {
    const { toJSON } = renderScreen();
    await waitFor(() => {
      expect(toJSON()).toBeTruthy();
    });
  });

  it('renders Wi-Fi toggle', async () => {
    const { getByLabelText } = renderScreen();
    await waitFor(() => {
      expect(getByLabelText(/Wi-Fi/i)).toBeTruthy();
    });
  });

  it('renders Bluetooth toggle', async () => {
    const { getByLabelText } = renderScreen();
    await waitFor(() => {
      expect(getByLabelText(/Bluetooth/i)).toBeTruthy();
    });
  });

  it('renders Airplane toggle', async () => {
    const { getByLabelText } = renderScreen();
    await waitFor(() => {
      expect(getByLabelText(/Airplane/i)).toBeTruthy();
    });
  });

  it('renders Focus toggle', async () => {
    const { getByLabelText } = renderScreen();
    await waitFor(() => {
      expect(getByLabelText(/Focus/i)).toBeTruthy();
    });
  });

  it('renders brightness control', async () => {
    const { getByLabelText } = renderScreen();
    await waitFor(() => {
      expect(getByLabelText('Brightness control')).toBeTruthy();
    });
  });

  it('renders volume control', async () => {
    const { getByLabelText } = renderScreen();
    await waitFor(() => {
      expect(getByLabelText('Volume control')).toBeTruthy();
    });
  });

  it('renders Torch shortcut', async () => {
    const { getByLabelText } = renderScreen();
    await waitFor(() => {
      expect(getByLabelText('Torch')).toBeTruthy();
    });
  });

  it('renders Calculator shortcut', async () => {
    const { getByLabelText } = renderScreen();
    await waitFor(() => {
      expect(getByLabelText('Calculator')).toBeTruthy();
    });
  });
});
