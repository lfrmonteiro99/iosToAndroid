import React from 'react';
import { render, act } from '../../test-utils';
import { PassScanScreen } from '../PassScanScreen';
import type { AppNavigationProp } from '../../navigation/types';
import * as CameraModule from 'expo-camera';

// Mirrors CameraScreen.mode.test.tsx: mock expo-camera with a string host
// 'CameraView' so we can find it in the rendered tree and invoke the props
// (onBarcodeScanned) the real native module would call.
jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: jest.fn(),
}));

type TestNode = {
  type?: string | unknown;
  props?: Record<string, unknown>;
  children?: TestNode[] | unknown;
};

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

const setPerm = (perm: { granted: boolean; canAskAgain: boolean } | null) => {
  (CameraModule.useCameraPermissions as jest.Mock).mockReturnValue([perm, jest.fn()]);
};

function scan(cam: TestNode, data: string) {
  const handler = cam.props?.onBarcodeScanned as (r: { type: string; data: string }) => void;
  act(() => {
    handler({ type: 'qr', data });
  });
}

describe('PassScanScreen — scan handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('navigates to PassEdit with the scanned value on a successful scan', () => {
    setPerm({ granted: true, canAskAgain: true });
    const navigation = { navigate: jest.fn(), goBack: jest.fn() } as unknown as AppNavigationProp;
    const { toJSON } = render(<PassScanScreen navigation={navigation} />);
    const cam = findCameraView(toJSON());
    expect(cam).not.toBeNull();

    scan(cam!, 'SCANNED-CODE-1');

    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('PassEdit', { prefillCode: 'SCANNED-CODE-1' });
  });

  it('does not navigate more than once for repeated scans in the same session (debounce)', () => {
    setPerm({ granted: true, canAskAgain: true });
    const navigation = { navigate: jest.fn(), goBack: jest.fn() } as unknown as AppNavigationProp;
    const { toJSON } = render(<PassScanScreen navigation={navigation} />);
    const cam = findCameraView(toJSON());
    expect(cam).not.toBeNull();

    scan(cam!, 'FIRST');
    scan(cam!, 'SECOND');

    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('PassEdit', { prefillCode: 'FIRST' });
  });

  it('renders the live CameraView (not a placeholder) when permission is granted', () => {
    setPerm({ granted: true, canAskAgain: true });
    const navigation = { navigate: jest.fn(), goBack: jest.fn() } as unknown as AppNavigationProp;
    const { queryByText, toJSON } = render(<PassScanScreen navigation={navigation} />);
    expect(queryByText(/unavailable|Requesting|denied/i)).toBeNull();
    expect(findCameraView(toJSON())).not.toBeNull();
  });
});
