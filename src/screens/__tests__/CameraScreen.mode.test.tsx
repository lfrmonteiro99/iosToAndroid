import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { CameraScreen } from '../CameraScreen';
import type { AppNavigationProp } from '../../navigation/types';
import * as CameraModule from 'expo-camera';

// NOTE: we mock expo-camera here with a string host 'CameraView' so we can
// assert on the props the CameraScreen passes down to it (mode, facing, flash).
// The real expo-camera v17 contract is: CameraView.mode accepts only
// 'picture' | 'video' — there is NO 'portrait' mode.
jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: jest.fn(),
}));

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  push: jest.fn(),
} as unknown as AppNavigationProp;

const setPerm = (perm: {
  granted: boolean;
  canAskAgain: boolean;
} | null) => {
  (CameraModule.useCameraPermissions as jest.Mock).mockReturnValue([
    perm,
    jest.fn(),
  ]);
};

// Minimal structural type for a rendered test node (host component JSON from
// @testing-library/react-native's toJSON()). We only read `type`, `props` and
// `children`, so a narrow structural type avoids `any`.
type TestNode = {
  type?: string | unknown;
  props?: Record<string, unknown>;
  children?: TestNode[] | unknown;
};

// Walk the rendered JSON tree looking for a host node whose type === 'CameraView'.
const findCameraView = (node: TestNode | null): TestNode | null => {
  if (!node) return null;
  if (node.type === 'CameraView') return node;
  const children = node.children;
  if (Array.isArray(children)) {
    for (const c of children) {
      const found = findCameraView(c as TestNode | null);
      if (found) return found;
    }
  }
  return null;
};

describe('CameraScreen — expo-camera v17 mode contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does NOT offer a PORTRAIT mode (expo-camera v17 has no PORTRAIT mode)', () => {
    setPerm({ granted: true, canAskAgain: true });
    const { queryByText } = render(<CameraScreen navigation={mockNavigation} />);
    // RED: today the screen renders a 'PORTRAIT' button; the real API has no
    // such mode, so offering it is a dead/lying control. After the fix the
    // button must be gone.
    expect(queryByText('PORTRAIT')).toBeNull();
  });

  it('selecting VIDEO maps to the expo-camera mode prop "video"', () => {
    setPerm({ granted: true, canAskAgain: true });
    const { getByText, toJSON } = render(
      <CameraScreen navigation={mockNavigation} />,
    );
    fireEvent.press(getByText('VIDEO'));
    const cam = findCameraView(toJSON());
    expect(cam).not.toBeNull();
    expect(cam?.props?.mode).toBe('video');
  });

  it('selecting PHOTO maps to the expo-camera mode prop "picture"', () => {
    setPerm({ granted: true, canAskAgain: true });
    const { getByText, toJSON } = render(
      <CameraScreen navigation={mockNavigation} />,
    );
    fireEvent.press(getByText('PHOTO'));
    const cam = findCameraView(toJSON());
    expect(cam).not.toBeNull();
    expect(cam?.props?.mode).toBe('picture');
  });

  it('renders the live CameraView (not a placeholder) when permission is granted', () => {
    setPerm({ granted: true, canAskAgain: true });
    const { queryByText, toJSON } = render(
      <CameraScreen navigation={mockNavigation} />,
    );
    expect(queryByText(/unavailable|Requesting|denied/i)).toBeNull();
    expect(findCameraView(toJSON())).not.toBeNull();
  });

  it('shows the denied placeholder + Grant button when permission denied but re-askable', () => {
    setPerm({ granted: false, canAskAgain: true });
    const { getByText, getByLabelText } = render(
      <CameraScreen navigation={mockNavigation} />,
    );
    expect(getByText(/Camera permission denied/i)).toBeTruthy();
    expect(getByLabelText('Grant camera permission')).toBeTruthy();
  });

});
