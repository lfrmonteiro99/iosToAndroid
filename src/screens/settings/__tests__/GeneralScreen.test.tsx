import React from 'react';
import { render, fireEvent } from '../../../test-utils';
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

  it('navigates to About when the About row is pressed', () => {
    const { getByText } = render(<GeneralScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('About'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('About');
  });

  it('navigates to DateTime when the Date & Time row is pressed', () => {
    const { getByText } = render(<GeneralScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('Date & Time'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('DateTime');
  });

  it('navigates to Keyboard when the Keyboard row is pressed', () => {
    const { getByText } = render(<GeneralScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('Keyboard'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Keyboard');
  });

  it('navigates to Language & Region when the Language & Region row is pressed', () => {
    const { getByText } = render(<GeneralScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('Language & Region'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('LanguageRegion');
  });

  it('navigates to Storage when the Device Storage row is pressed', () => {
    const { getByText } = render(<GeneralScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('Device Storage'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Storage');
  });

  it('navigates to Vpn when the VPN & Device Management row is pressed', () => {
    const { getByText } = render(<GeneralScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('VPN & Device Management'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Vpn');
  });

  it('navigates to BackupRestore when the Backup & Restore row is pressed', () => {
    const { getByText } = render(<GeneralScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('Backup & Restore'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('BackupRestore');
  });

  it('navigates to SoftwareUpdate when the Software Update row is pressed', () => {
    const { getByText } = render(<GeneralScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('Software Update'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('SoftwareUpdate');
  });

  it('goes back to Settings when the title-area back control is pressed', () => {
    const { getByText } = render(<GeneralScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByText('Settings'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });
});
