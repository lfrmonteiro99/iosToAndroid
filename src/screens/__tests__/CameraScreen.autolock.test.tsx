import React from 'react';
import { act } from '@testing-library/react-native';
import { render, fireEvent } from '../../test-utils';
import { CameraScreen } from '../CameraScreen';
import { suppressAutoLock } from '../../utils/permissions';
import type { AppNavigationProp } from '../../navigation/types';

// This suite exercises the REAL expo-camera permission hook (unlike
// CameraScreen.test.tsx, which relies on expo-camera being unavailable in
// the test env). It proves App.tsx's auto-lock suppression actually engages
// while the native camera-permission dialog is up — the M11 defect.
let resolveRequest: (value: { granted: boolean; canAskAgain: boolean }) => void;
const mockRequestPermission = jest.fn(
  () =>
    new Promise<{ granted: boolean; canAskAgain: boolean }>((resolve) => {
      resolveRequest = resolve;
    }),
);

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  saveToLibraryAsync: jest.fn(() => Promise.resolve()),
}));

// Stable object identity across re-renders (mirrors the real hook, which
// only produces a new permission object when the underlying value changes).
// A fresh literal every render would re-trigger the mount effect on every
// re-render via the [permission, requestPermission] dependency array.
const mockPermission = { granted: false, canAskAgain: true };

jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: () => [mockPermission, mockRequestPermission],
}));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;

describe('CameraScreen auto-lock suppression (M11)', () => {
  beforeEach(() => {
    mockRequestPermission.mockClear();
  });

  it('suppresses auto-lock while the camera permission dialog requested on mount is pending', async () => {
    render(<CameraScreen navigation={mockNavigation} />);

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    expect(suppressAutoLock()).toBe(true);

    await act(async () => {
      resolveRequest({ granted: true, canAskAgain: true });
    });

    expect(suppressAutoLock()).toBe(false);
  });

  it('suppresses auto-lock while the "Grant Permission" button retry is pending', async () => {
    // canAskAgain stays true so the mount effect also fires once; settle it
    // first so only the button press is under test.
    const { getByLabelText } = render(<CameraScreen navigation={mockNavigation} />);
    await act(async () => {
      resolveRequest({ granted: false, canAskAgain: true });
    });
    mockRequestPermission.mockClear();
    expect(suppressAutoLock()).toBe(false);

    fireEvent.press(getByLabelText('Grant camera permission'));

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    expect(suppressAutoLock()).toBe(true);

    await act(async () => {
      resolveRequest({ granted: true, canAskAgain: true });
    });

    expect(suppressAutoLock()).toBe(false);
  });
});
