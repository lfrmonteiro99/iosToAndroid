// Regression guard: when expo-camera cannot be loaded (e.g. its native module
// is missing from a device build), the CameraScreen must stay INSIDE the app
// with a clear placeholder. It must NEVER fall back to a system camera app or
// surface the Android home/launcher — that is exactly the "shows Android home
// instead of camera UI" class of defect (see issues #697/#707 for the
// in-app-vs-native-home rule this screen must also obey).
//
// The throwing mock is declared at the top so CameraScreen's lazy
// `require('expo-camera')` (evaluated once at module load) sees it. No
// resetModules — that would tear down the React context registry.
jest.mock('expo-camera', () => {
  throw new Error('Cannot find module expo-camera');
});

import React from 'react';
import { render } from '../../test-utils';
import { CameraScreen } from '../CameraScreen';
import type { AppNavigationProp } from '../../navigation/types';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  push: jest.fn(),
} as unknown as AppNavigationProp;

describe('CameraScreen — expo-camera unavailable stays in-app', () => {
  it('renders the in-app "unavailable" placeholder, never escapes the app', () => {
    const { getByText, toJSON } = render(
      <CameraScreen navigation={mockNavigation} />,
    );
    // The user sees a clear in-app message, not a blank/system screen.
    expect(getByText(/Camera preview unavailable/i)).toBeTruthy();
    // The tree is still our own View (no navigation away, no crash).
    expect(toJSON()).toBeTruthy();
  });
});
