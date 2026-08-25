import React from 'react';
import { render, fireEvent, waitFor } from '../../../test-utils';
import { Platform } from 'react-native';
import { PrivacyScreen } from '../PrivacyScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

// The launcherModule mock is auto-applied via jest.config.js moduleNameMapper.
// Import the mock so we can assert on openSystemSettings.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const launcherMock = require('../../../__mocks__/launcherModule').default;

// useAlert is consumed by PrivacyScreen from '../../components' (re-exported from
// src/components/AlertProvider). Mock the hook so the fallback path is observable.
const mockAlert = jest.fn();
jest.mock('../../../components/AlertProvider', () => {
  const actual = jest.requireActual('../../../components/AlertProvider');
  return { ...actual, useAlert: () => mockAlert };
});

// Snapshot of the real Platform state so we restore it after each test.
const originalOS = Platform.OS;
// Platform.Version is a getter backed by native constants; redefining a plain
// property on the object overrides that getter (configurable:true), so we can
// drive the API level fixture. We restore by deleting our override.
const originalVersionDescriptor = Object.getOwnPropertyDescriptor(Platform, 'Version');

function setAndroid(apiLevel: number) {
  Platform.OS = 'android';
  Object.defineProperty(Platform, 'Version', { value: apiLevel, configurable: true, writable: true });
}

function setIos() {
  Platform.OS = 'ios';
  Object.defineProperty(Platform, 'Version', { value: 17, configurable: true, writable: true });
}

describe('PrivacyScreen — App Privacy Report (#624-S1)', () => {
  afterEach(() => {
    jest.clearAllMocks();
    Platform.OS = originalOS;
    if (originalVersionDescriptor) {
      Object.defineProperty(Platform, 'Version', originalVersionDescriptor);
    } else {
      delete (Platform as { Version?: unknown }).Version;
    }
  });

  it('renders an "App Privacy Report" row in the App Privacy section', () => {
    setAndroid(33);
    const { getByRole } = render(<PrivacyScreen navigation={mockNavigation as never} />);
    // CupertinoListTile exposes accessibilityLabel = title when there is no subtitle.
    expect(getByRole('button', { name: 'App Privacy Report' })).toBeTruthy();
  });

  // RED (see history): before the fix there is no tile and openSystemSettings is
  // never called with 'privacy_dashboard'. On Android 12+ the press must open the
  // native panel.
  it('pressing App Privacy Report on Android 12+ opens the native Privacy Dashboard', async () => {
    setAndroid(31);
    const { getByRole } = render(<PrivacyScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByRole('button', { name: 'App Privacy Report' }));

    await waitFor(() => {
      expect(launcherMock.openSystemSettings).toHaveBeenCalledWith('privacy_dashboard');
    });
  });

  // The inverse of the fix: on iOS the panel must NOT open — an explanatory alert
  // must be shown instead.
  it('does NOT open system settings on iOS and instead shows an alert', () => {
    setIos();
    const { getByRole } = render(<PrivacyScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByRole('button', { name: 'App Privacy Report' }));

    expect(mockAlert).toHaveBeenCalled();
    expect(launcherMock.openSystemSettings).not.toHaveBeenCalled();
  });

  // The inverse of the fix on Android: API < 31 is below the Android 12 floor,
  // so the same alert path applies and nothing is opened.
  it('does NOT open system settings on Android below API 31 and instead shows an alert', () => {
    setAndroid(30);
    const { getByRole } = render(<PrivacyScreen navigation={mockNavigation as never} />);

    fireEvent.press(getByRole('button', { name: 'App Privacy Report' }));

    expect(mockAlert).toHaveBeenCalled();
    expect(launcherMock.openSystemSettings).not.toHaveBeenCalled();
  });
});
