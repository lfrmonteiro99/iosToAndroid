import React from 'react';
import { render } from '../../../test-utils';
import { GeneralScreen } from '../GeneralScreen';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => false) }),
  useRoute: () => ({ params: {} }),
}));

jest.mock('../../../components/BackEdgeSwipe', () => ({
  BackEdgeSwipe: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../../store/DeviceStore', () => ({
  useDevice: () => ({ openSystemPanel: jest.fn(), settings: {} }),
  DeviceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DeviceContext: null,
}));

const mockSettingsValue = {
  airdrop: 'contactsOnly',
  backgroundAppRefresh: 'wifi',
  updateAvailable: false,
  automaticUpdates: true,
};

jest.mock('../../../store/SettingsStore', () => ({
  useSettings: jest.fn(() => ({ settings: mockSettingsValue, update: jest.fn() })),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockSettingsValue.updateAvailable = false;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useSettings } = require('../../../store/SettingsStore');
  (useSettings as jest.Mock).mockReturnValue({ settings: mockSettingsValue, update: jest.fn() });
});

describe('GeneralScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<GeneralScreen navigation={mockNavigation as never} />);
    expect(toJSON()).toBeTruthy();
  });

  // RED: before fix, badge '1' was hardcoded and always rendered.
  // After fix, badge only appears when settings.updateAvailable is true.
  it('does NOT show badge when updateAvailable=false', () => {
    mockSettingsValue.updateAvailable = false;
    const { queryByText } = render(<GeneralScreen navigation={mockNavigation as never} />);
    // The badge text '1' should not be in the tree when no update is pending
    expect(queryByText('1')).toBeNull();
  });

  it('shows badge when updateAvailable=true', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useSettings } = require('../../../store/SettingsStore');
    (useSettings as jest.Mock).mockReturnValue({
      settings: { ...mockSettingsValue, updateAvailable: true },
      update: jest.fn(),
    });
    const { getByText } = render(<GeneralScreen navigation={mockNavigation as never} />);
    expect(getByText('1')).toBeTruthy();
  });

  it('has no hardcoded literal badge count in rendered tree when updateAvailable=false', () => {
    const { queryByText } = render(<GeneralScreen navigation={mockNavigation as never} />);
    // Acceptance criterion: grep -n ">1<" must not show hardcoded badge
    expect(queryByText('1')).toBeNull();
  });
});
