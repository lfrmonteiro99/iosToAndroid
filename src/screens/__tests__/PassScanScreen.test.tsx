import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { PassScanScreen } from '../PassScanScreen';
import type { AppNavigationProp } from '../../navigation/types';

// No jest.mock('expo-camera') here — in this jest-expo/android environment
// `require('expo-camera')` fails to resolve a working native module (same as
// CameraScreen.test.tsx), so this exercises the real "camera unavailable"
// fallback path used on a Jest/CI machine with no native camera.

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as unknown as AppNavigationProp;

describe('PassScanScreen', () => {
  it('renders without crashing when expo-camera is unavailable', () => {
    const { toJSON, getByText } = render(<PassScanScreen navigation={mockNavigation} />);
    expect(toJSON()).toBeTruthy();
    expect(
      getByText(/Camera preview unavailable|Requesting camera permission|Camera permission/),
    ).toBeTruthy();
  });

  it('pressing close calls navigation.goBack', () => {
    const nav = { navigate: jest.fn(), goBack: jest.fn() } as unknown as AppNavigationProp;
    const { getByLabelText } = render(<PassScanScreen navigation={nav} />);
    fireEvent.press(getByLabelText('Close scanner'));
    expect(nav.goBack).toHaveBeenCalledTimes(1);
  });
});
