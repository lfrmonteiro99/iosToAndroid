import React from 'react';
import { render, waitFor } from '../../../test-utils';
import { VpnScreen } from '../VpnScreen';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    getMany: jest.fn(() => Promise.resolve({})),
  },
}));

const mockOpenSystemPanel = jest.fn();

jest.mock('../../../store/DeviceStore', () => ({
  useDevice: () => ({
    openSystemPanel: mockOpenSystemPanel,
    settings: {},
  }),
  DeviceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DeviceContext: null,
}));

// useFocusEffect not in global setup — call callback on mount for tests
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: (cb: () => void) => { cb(); },
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => false) }),
  useRoute: () => ({ params: {} }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
}));

// The global moduleNameMapper stubs launcher-module; get a reference to spy on getNetworkInfo
// eslint-disable-next-line @typescript-eslint/no-require-imports
const launcherStub = require('../../../__mocks__/launcherModule');

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

describe('VpnScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing when getNetworkInfo rejects', async () => {
    launcherStub.default.getNetworkInfo.mockRejectedValue(new Error('unavailable'));
    const { toJSON } = render(<VpnScreen navigation={mockNavigation as never} />);
    await waitFor(() => {}); // flush async
    expect(toJSON()).toBeTruthy();
  });

  // RED: before fix, status is hardcoded 'Not Configured' regardless of isVpn
  it('shows "Connected" when isVpn is true', async () => {
    launcherStub.default.getNetworkInfo.mockResolvedValue({
      isConnected: true, isWifi: false, isCellular: false, isVpn: true,
    });

    const { findByText, queryByText } = render(<VpnScreen navigation={mockNavigation as never} />);

    await findByText('Connected');
    expect(queryByText('Not Configured')).toBeNull();
    expect(queryByText('Not Connected')).toBeNull();
  });

  // RED: before fix, 'Not Configured' appears; after fix, 'Not Connected' when isVpn=false
  it('shows "Not Connected" when isVpn is false', async () => {
    launcherStub.default.getNetworkInfo.mockResolvedValue({
      isConnected: true, isWifi: true, isCellular: false, isVpn: false,
    });

    const { findByText, queryByText } = render(<VpnScreen navigation={mockNavigation as never} />);

    await findByText('Not Connected');
    expect(queryByText('Not Configured')).toBeNull();
  });

  // Only one VPN settings button should exist (duplicate "Open VPN Settings" was removed)
  it('renders exactly one "Add VPN Configuration" button and no duplicate', () => {
    launcherStub.default.getNetworkInfo.mockResolvedValue({
      isConnected: false, isWifi: false, isCellular: false, isVpn: false,
    });

    const { getAllByText, queryByText } = render(<VpnScreen navigation={mockNavigation as never} />);
    expect(getAllByText('Add VPN Configuration...')).toHaveLength(1);
    expect(queryByText('Open VPN Settings')).toBeNull();
  });
});
