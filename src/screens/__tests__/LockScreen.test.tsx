import React from 'react';
import { render } from '@testing-library/react-native';
import { LockScreen } from '../LockScreen';
import { DeviceProvider } from '../../store/DeviceStore';
import { SettingsProvider } from '../../store/SettingsStore';

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(() => Promise.resolve(false)),
  isEnrolledAsync: jest.fn(() => Promise.resolve(false)),
  authenticateAsync: jest.fn(() => Promise.resolve({ success: false })),
}));

function renderScreen(props: Record<string, unknown> = {}) {
  return render(
    <DeviceProvider>
      <SettingsProvider>
        <LockScreen navigation={{ goBack: jest.fn() }} {...props} />
      </SettingsProvider>
    </DeviceProvider>,
  );
}

describe('LockScreen', () => {
  it('renders without crash', () => {
    const { toJSON } = renderScreen();
    expect(toJSON()).toBeTruthy();
  });

  it('displays the current date', () => {
    const { getByText } = renderScreen();
    const today = new Date();
    const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
    // The full date string contains the weekday
    expect(getByText(new RegExp(dayName))).toBeTruthy();
  });

  it('displays the large clock', () => {
    const { getAllByText } = renderScreen();
    // Clock format is HH:MM — match any text with colon between digits
    const matches = getAllByText(/\d{1,2}:\d{2}/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('has a flashlight button', () => {
    const { getByLabelText } = renderScreen();
    expect(getByLabelText('Flashlight')).toBeTruthy();
  });

  it('has a camera button', () => {
    const { getByLabelText } = renderScreen();
    expect(getByLabelText('Camera')).toBeTruthy();
  });

  it('has a biometric unlock button', () => {
    const { getByLabelText } = renderScreen();
    expect(getByLabelText('Biometric unlock')).toBeTruthy();
  });

  it('has swipe up to unlock accessibility label', () => {
    const { getByLabelText } = renderScreen();
    expect(getByLabelText('Swipe up to unlock')).toBeTruthy();
  });
});
